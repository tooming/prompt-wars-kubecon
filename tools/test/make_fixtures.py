#!/usr/bin/env python3
"""Rebuild the recorded day-2 files the offline tests load, from the archive that tools/archive.py writes.

Usage: make_fixtures.py        (reads archive/, writes tools/test/fixtures/day2_1900 and day2_2035)

The tests of loop/day3_bundle.js start a fake game from two snapshots of day 2 (2026-11-11), taken at 19:00 and at
20:35 UTC. The original snapshot files were never committed and are lost. This script rebuilds them.

Exact, from the public record:
  - which bots existed at each moment, their ids, house flags and badges;
  - who followed whom (every move of the day replayed up to the moment), tree sizes, direct members;
  - the five feed files (conversion, schism, coup, bounty.claimed, trivia.posted), newest first;
  - the rules (twist "tuesday": pledge 10, break pledge 250, 8 direct members, 500 gift cap), the tick, the
    schedule, bounty claims and live contracts;
  - pitches refused per bot, championship points after day 1.

Stand-ins, because the public record does not hold them:
  - coins: the last balance a bot's own reflection prompt quoted before the moment, plus base income since; a bot
    with no reflection that day gets its start balance plus base income;
  - a leader's cut: the cut quoted in the last reflection on one of its pitches before the moment, else the final
    profile's cut; the Greedy dial is set to match;
  - streak, wake counts and the other dials: computed roughly or taken from the final profile.

Left out on purpose: pitch texts, reasoning quotes, taglines and recent-event lists of other players' bots. The loop
reads none of them.
"""
import collections
import datetime
import glob
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, '..', 'retro'))
from pwlib import ARCH, ROOT, mover, new_leader, placements, read  # noqa: E402

ME = 'sullen_nyquist'
OPEN = '2026-11-11T15:00:09.411807Z'
MOMENTS = {'day2_1900': '2026-11-11T19:00:00Z', 'day2_2035': '2026-11-11T20:35:00Z'}
FEEDS = ('conversion', 'schism', 'coup', 'bounty.claimed', 'trivia.posted')
ROW_KEYS = ['rank', 'bot_id', 'name', 'tagline', 'coins', 'streak', 'tree_size', 'allegiance', 'is_house', 'origin',
            'inert', 'avatar', 'status', 'exhausted', 'model_choice', 'rejected_today', 'points', 'scores']


def ts(s):
    return datetime.datetime.fromisoformat(s[:19])


def ticks_between(a, b):
    return max(0, int((ts(b) - ts(a)).total_seconds() // 60))


final = {}
for f in glob.glob(os.path.join(ARCH, 'bots', '*.json')):
    p = json.load(open(f))
    final[p['name']] = p
final_rows = {r['name']: r for r in json.load(open(os.path.join(ARCH, 'snapshot', 'leaderboard.json')))['rows']}
E1, E2 = read(1), read(2)
points_day1 = {r['bot']: r['points'] for r in placements(E1)}
created2 = {e['payload']['bot']: e for e in E2 if e['type'] == 'bot.created'}
world_base = json.load(open(os.path.join(ROOT, 'data', 'world_day2.json')))      # 14:53 UTC, before the day-2 open


def forest(until):
    lead = {}
    for e in E2:
        if e['ts'] > until:
            break
        t = e['type']
        if t in ('conversion', 'schism'):
            lead[mover(e)] = new_leader(e) or None
        elif t in ('independent', 'deprogram'):
            lead[e['payload']['bot']] = None
        elif t == 'coup':
            us, dep = e['payload']['bot'], e['payload']['leader']
            up = lead.get(dep)
            for b in [b for b, x in lead.items() if x == dep]:
                if b != us:
                    lead[b] = us
            lead[us] = up
            lead[dep] = us
    return {b: x for b, x in lead.items() if x}


def descendants(lead):
    kids = collections.defaultdict(list)
    for b, x in lead.items():
        kids[x].append(b)

    def count(n, depth=0):
        return 0 if depth > 100 else sum(1 + count(k, depth + 1) for k in kids.get(n, []))
    return kids, count


def balances(until):
    """Coins per bot: last balance quoted to the bot in a reflection before the moment, plus base income since."""
    seen = {}
    for e in E2:
        if e['ts'] > until:
            break
        if e['type'] != 'reflection':
            continue
        m = re.search(r'\(you have (\d+)\)', e['payload']['steps'][0]['prompt'])
        if m:
            seen[e['payload']['bot']] = (e['ts'], int(m.group(1)))
    return seen


def cuts(until, lead_now):
    """A leader's cut as last quoted by the engine before the moment."""
    out = {}
    for e in E2:
        if e['ts'] > until:
            break
        if e['type'] != 'reflection':
            continue
        p = e['payload']
        prompt = p['steps'][0]['prompt']
        m = re.search(r'Joining (\S+) makes a tree of \d+, paying x[\d.]+ on base income less their (\d+)% cut', prompt)
        if m:
            out[m.group(1)] = int(m.group(2))
    return out


def build(moment):
    names = sorted(n for n, p in final.items() if p['created_at'][:19] <= moment[:19])
    lead = forest(moment)
    kids, count = descendants(lead)
    seen = balances(moment)
    quoted = cuts(moment, lead)
    refused = collections.Counter(e['payload']['bot'] for e in E2 if e['type'] == 'allegiance.rejected' and e['ts'] <= moment)
    joined = collections.Counter(new_leader(e) for e in E2 if e['type'] in ('conversion', 'coup') and e['ts'] <= moment)
    last_change = {}
    for e in E2:
        if e['ts'] > moment:
            break
        if e['type'] in ('conversion', 'schism', 'coup', 'independent', 'deprogram'):
            for b in (e['payload'].get('bot'), e['payload'].get('leader'), e['payload'].get('new_leader'), e['payload'].get('old_leader')):
                if b:
                    last_change[b] = e['ts']
    tick = 1 + ticks_between(OPEN, moment)

    def coins(n):
        start = created2[n]['ts'] if n in created2 else OPEN
        if n in seen:
            return seen[n][1] + 8 * ticks_between(seen[n][0], moment)
        base = created2[n]['payload']['coins'] if n in created2 else 500
        return base + 8 * ticks_between(start, moment)

    def streak(n):
        if lead.get(n) or kids.get(n):
            return 0
        since = max(last_change.get(n, OPEN), created2[n]['ts'] if n in created2 else OPEN)
        return ticks_between(since, moment)

    rows = []
    for n in names:
        f = final_rows[n]
        rows.append({
            'rank': 0, 'bot_id': f['bot_id'], 'name': n, 'tagline': '', 'coins': coins(n), 'streak': streak(n),
            'tree_size': count(n), 'allegiance': lead.get(n, ''), 'is_house': f['is_house'], 'origin': f['origin'],
            'inert': False, 'avatar': f['avatar'], 'status': 'active', 'exhausted': False, 'model_choice': 'openai',
            'rejected_today': refused[n], 'points': points_day1.get(n, 0), 'scores': f['scores'],
        })
    rows.sort(key=lambda r: (-r['coins'], r['name']))
    for i, r in enumerate(rows):
        r['rank'] = i + 1
    rows = [{k: r[k] for k in ROW_KEYS} for r in rows]
    by_name = {r['name']: r for r in rows}

    def root(n):
        hops = 0
        while lead.get(n) and hops < 100:
            n, hops = lead[n], hops + 1
        return n

    tree_total = collections.Counter(root(n) for n in names)

    def profile(n):
        f, r = final[n], by_name[n]
        cut = quoted.get(n, f['cut_pct'])
        if n == ME:
            cut = quoted.get(n, 40)
        sliders = dict(f['sliders'], greedy=round((cut - 10) / 30 * 100))
        size = tree_total[root(n)]
        return {
            'allegiance': r['allegiance'], 'avatar': f['avatar'], 'coins': r['coins'], 'converted_today': joined[n],
            'core_public': False, 'created_at': f['created_at'], 'cut_pct': cut, 'events': [], 'exhausted': False,
            'history': [h for h in (f.get('history') or []) if h['day'] == 1] or None, 'id': f['id'],
            'income_mult': 1 + min(1.0, 0.25 * (size - 1)), 'inert': False, 'is_house': f['is_house'],
            'last_action_at': moment, 'members': [{'id': final[k]['id'], 'name': k} for k in sorted(kids.get(n, []))],
            'model': 'openai', 'model_label': 'OpenAI', 'muted': False, 'name': n, 'origin': f['origin'],
            'rank': r['rank'], 'rejected_today': r['rejected_today'], 'reputation': f['reputation'], 'sliders': sliders,
            'spawned_day': f['spawned_day'], 'stamina_pct': 100, 'status': 'active', 'streak': r['streak'],
            'tagline': '', 'total': len(rows), 'tree_size': r['tree_size'], 'tree_total': size,
            'wake_count': tick * 60 // 136, 'wakes_today': tick * 60 // 136,
        }

    leaders = sorted(set(kids) & set(names) | {ME, 'Andrew_slice'} & set(names))
    profiles = {n: profile(n) for n in leaders}

    # /api/world as it stood: the pre-open snapshot with the day-2 rule change applied
    w = json.loads(json.dumps(world_base))
    w['twist'] = 'tuesday'
    w['costs'].update(pledge=10, break_pledge=250)
    w['now'] = moment[:19] + '.000000000Z'
    w['world'] = {'day': 2, 'tick': tick, 'phase': 'open', 'opened_at': OPEN, 'day_date': '2026-11-11T00:00:00Z',
                  'updated_at': moment[:19] + '.000000Z'}
    elapsed = int((ts(moment) - ts(OPEN)).total_seconds())
    golden, freeze = '2026-11-12T02:00:00Z', '2026-11-12T03:00:00Z'
    w['day_window'] = {'elapsed_s': elapsed, 'freeze_at': '2026-11-11T20:00:00-07:00',
                       'freeze_in_s': int((ts(freeze) - ts(moment)).total_seconds()),
                       'golden_at': '2026-11-11T19:00:00-07:00',
                       'golden_in_s': int((ts(golden) - ts(moment)).total_seconds()), 'source': 'schedule'}
    house = sum(1 for r in rows if r['is_house'])
    w['counts'] = {'active': len(rows), 'paused': 0, 'killed': 0, 'exhausted': 0, 'house': house, 'players': len(rows) - house}
    claims = collections.Counter()
    ids = {}
    for e in E2:
        if e['type'] == 'bounty.claimed':
            ids[e['payload']['title']] = e['payload']['bounty_id']
            if e['ts'] <= moment:
                claims[e['payload']['title']] += 1
    template = {b['title']: b for b in world_base['bounties']}
    template['Hold the line'] = dict(template['Recruiter'], key='holdout', title='Hold the line', reward=200, kind='independent_at',
                                     description='Be independent at 15:00 with streak ≥200 having rejected ≥3 persuade attempts today.',
                                     params={'min_rejected': 3, 'min_streak': 200, 'time': '15:00'})
    bounties = []
    for title in ('Poach the giant', 'Hold the line', 'Regicide', 'Recruiter'):
        bounties.append(dict(template[title], id=ids.get(title, 0), day=2, claims=claims[title], active=True, created_at=OPEN))
    expired = {(e['payload']['poster'], e['payload']['target'], e['ts']) for e in E2 if e['type'] == 'bounty.expired'}
    for e in E2:
        p = e['payload']
        if e['type'] != 'bounty.posted' or not p.get('contract') or e['ts'] > moment:
            continue
        ends = (ts(e['ts']) + datetime.timedelta(minutes=60)).isoformat() + 'Z'
        if ends <= moment or any(x[0] == p['poster'] and x[1] == p['target'] and e['ts'] < x[2] <= moment for x in expired):
            continue
        bounties.append({'id': p['id'], 'day': 2, 'key': 'contract-%s-%d' % (final[p['poster']]['id'][:8], p['id']),
                         'title': p['title'], 'description': p['description'], 'reward': p['reward'], 'kind': 'contract',
                         'params': {}, 'once_per_bot': False, 'max_claims': 1, 'active': True, 'claims': 0,
                         'created_at': e['ts'], 'poster_id': final[p['poster']]['id'], 'poster': p['poster'],
                         'target_id': final[p['target']]['id'], 'target': p['target'], 'stake': p['reward'], 'expires_at': ends})
    w['bounties'] = bounties

    feeds = {}
    for t in FEEDS:
        evs = []
        for e in E2:
            if e['type'] == t and e['ts'] <= moment:
                e = json.loads(json.dumps(e))
                for k in ('argument', 'quote'):
                    if k in e['payload']:
                        e['payload'][k] = ''
                evs.append(e)
        feeds[t] = evs[::-1]
    return w, rows, profiles, feeds


def dump(path, obj):
    with open(path, 'w') as f:
        json.dump(obj, f, ensure_ascii=False, indent=None, separators=(',', ':'))
        f.write('\n')


if __name__ == '__main__':
    out = os.path.join(HERE, 'fixtures')
    for name, moment in MOMENTS.items():
        d = os.path.join(out, name)
        os.makedirs(d, exist_ok=True)
        w, rows, profiles, feeds = build(moment)
        dump(os.path.join(d, 'world.json'), w)
        dump(os.path.join(d, 'leaderboard.json'), {'rows': rows})
        if name == 'day2_1900':
            dump(os.path.join(d, 'leader_profiles.json'), profiles)
        else:
            for t, evs in feeds.items():
                dump(os.path.join(d, 'feed_%s.json' % t), evs)
        mine = [r['name'] for r in rows if r['allegiance'] == ME]
        me = next(r for r in rows if r['name'] == ME)
        print('%s: %d bots, %d with a leader, %d leader profiles, %s rank %d coins %d, direct members %d %s, bounties %s' % (
            name, len(rows), sum(1 for r in rows if r['allegiance']), len(profiles), ME, me['rank'], me['coins'], len(mine), mine,
            [(b['title'], b['claims']) for b in w['bounties']]))
        if name == 'day2_2035':
            print('   feeds:', {t: len(v) for t, v in feeds.items()})
