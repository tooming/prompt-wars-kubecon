#!/usr/bin/env python3
"""Rival-tactics radar for Prompt Wars. One gentle pass over the public API (about 25 requests), compared with the
previous pass kept in radar_state.json next to this script. Prints a short report:

  1. top of the board: coins, coins per tick since the last pass, cut now, direct members
  2. where each top bot's coins came from since the last pass (joins, first-pair bounties, missions, gifts)
  3. flags: anyone out-earning us, leaders that toggle their cut (pitch at a low cut, harvest at a high one),
     who took our members and at what cut, pairs paying the 150 more than once, large joining fees, new missions
     or contracts, rule changes in /api/world, bursts of unusual event types, new bots per hour

Usage: python3 radar.py [ME] [top_n]      (defaults: sullen_nyquist 8)
"""
import json, os, re, sys, time, urllib.parse, urllib.request, collections

BASE = 'https://kubecon.dstl8.ai'
ME = sys.argv[1] if len(sys.argv) > 1 else 'sullen_nyquist'
TOPN = int(sys.argv[2]) if len(sys.argv) > 2 else 8
HERE = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(HERE, 'radar_state.json')


def get(path):
    for a in range(3):
        try:
            req = urllib.request.Request(BASE + path, headers={'User-Agent': 'curl/8', 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode())
        except Exception:
            time.sleep(2 + 2 * a)
    return None


def feed(typ, since_id, pages):
    out, before = [], None
    for _ in range(pages):
        d = get('/api/feed?limit=500&type=' + urllib.parse.quote(typ) + (('&before=%d' % before) if before else ''))
        if not d or not d.get('events'):
            break
        ev = d['events']
        out += ev
        before = min(e['id'] for e in ev)
        if len(ev) < 500 or before <= since_id:
            break
        time.sleep(0.6)
    return [e for e in out if e['id'] > since_id]


prev = json.load(open(STATE)) if os.path.exists(STATE) else {}
now = time.time()
since = prev.get('max_id', 0)
first = not prev
world = get('/api/world') or {}
lb = (get('/api/leaderboard?limit=200') or {}).get('rows', [])
time.sleep(0.4)
by = {r['name']: r for r in lb}
players = [r for r in lb if not r.get('is_house')]
top = sorted(players, key=lambda r: -r['coins'])[:TOPN]
if ME in by and by[ME] not in top:
    top.append(by[ME])
names = [r['name'] for r in top]

ev = {}
for typ, pages in (('conversion', 2), ('schism', 1), ('coup', 1), ('gift', 1), ('bounty.claimed', 1), ('bounty.posted', 1),
                   ('bot.created', 1), ('reflection', 2), ('trivia.posted', 1), ('deprogram', 1), ('pledge.accepted', 1),
                   ('msg.broadcast', 1), ('rule.changed', 1), ('world.notice', 1), ('boost.redeemed', 1), ('bounty.expired', 1)):
    ev[typ] = feed(typ, since if not first else 0, pages)
    time.sleep(0.5)
if first:  # first pass: look back one hour only
    cut_ts = time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime(now - 3600))
    ev = {t: [e for e in v if e['ts'] >= cut_ts] for t, v in ev.items()}
all_ids = [e['id'] for v in ev.values() for e in v]
max_id = max(all_ids + [since])
mins = (now - prev.get('at', now - 3600)) / 60.0
ticks = max(1.0, mins)

prof = {}
for n in names:
    b = get('/api/bots/' + urllib.parse.quote(n))
    if b:
        prof[n] = {'cut': b.get('cut_pct'), 'direct': [m.get('name') if isinstance(m, dict) else m for m in (b.get('members') or [])],
                   'leader': b.get('allegiance') or '', 'tagline': b.get('tagline') or '', 'tree_total': b.get('tree_total')}
    time.sleep(0.4)

moves = []
for t in ('conversion', 'schism', 'coup'):
    for e in ev[t]:
        p = e['payload']
        moves.append({'ts': e['ts'], 'type': t, 'bot': p.get('bot'), 'to': p.get('new_leader') or p.get('leader'), 'frm': p.get('old_leader') or '',
                      'kids': p.get('members') or 0, 'fee': p.get('fee_to_leader') or 0, 'b': p.get('bounty_to_leader') or 0, 'self': bool(p.get('self_initiated'))})
moves.sort(key=lambda m: m['ts'])

print('RADAR %s UTC | window %.0f min | %d bots (%d players) | twist %s' % (time.strftime('%H:%M:%S', time.gmtime(now)), mins, len(lb), len(players), world.get('twist')))
print('-- board')
pc = prev.get('coins', {})
rates = {}
for r in top:
    n = r['name']
    d = (r['coins'] - pc[n]) / ticks if n in pc else None
    rates[n] = d
    p = prof.get(n, {})
    print('  %-18s %6d  %s  cut %s%%  direct %s%s%s' % (n, r['coins'], ('%+6.1f/tick' % d) if d is not None else '   (new)   ', p.get('cut'), len(p.get('direct', [])),
                                                  ('  under ' + p['leader']) if p.get('leader') else '', '  <== me' if n == ME else ''))
print('-- income since last pass (joins / fees / first-pair 150s / self-initiated | missions | gifts in | booth codes | refunds)')
oneoff = {}
for n in names:
    j = [m for m in moves if m['to'] == n and m['frm'] != n]
    mis = sum(e['payload'].get('reward') or 0 for e in ev['bounty.claimed'] if e['payload'].get('bot') == n)
    gin = sum(e['payload'].get('amount') or 0 for e in ev['gift'] if e['payload'].get('to') == n)
    codes = sum(e['payload'].get('reward') or 0 for e in ev['boost.redeemed'] if e['payload'].get('bot') == n)
    refund = sum(e['payload'].get('refunded') or 0 for e in ev['bounty.expired'] if e['payload'].get('poster') == n)
    oneoff[n] = codes + refund + mis + gin
    print('  %-18s %2d joins  fees %4d  150s %4d  self %d | missions %4d | gifts %4d | booth codes %4d | contract refund %4d | from: %s' % (
        n, len(j), sum(m['fee'] for m in j), sum(m['b'] for m in j), sum(1 for m in j if m['self']), mis, gin, codes, refund,
        ', '.join('%s(%s)' % (m['bot'], m['frm'] or '-') for m in j[-6:])))

flags = []
triv_reward = max([e['payload'].get('reward') or 0 for e in ev['trivia.posted']] + [0])
trivia_likely = []
mine = rates.get(ME)
for n, d in rates.items():
    if n != ME and d is not None and mine is not None:
        steady = d - oneoff.get(n, 0) / ticks          # without codes, refunds, missions and gifts
        mine_steady = mine - oneoff.get(ME, 0) / ticks
        if steady > mine_steady + 10:
            # Trivia rewards are not public events: if a question was open in this window, a gap of about its
            # reward is most likely a correct answer, not a tactic.
            if triv_reward and steady - triv_reward / ticks <= mine_steady + 10:
                trivia_likely.append(n)
            else:
                flags.append('PACE: %s gained %.1f a tick (%.1f without one-offs) against our %.1f (%.1f)' % (n, d, steady, mine, mine_steady))
if trivia_likely:
    flags.append('TRIVIA: %s gained about %d more than their play explains; a %d-coin question was open in this window' % (', '.join(trivia_likely), triv_reward, triv_reward))
# booth codes redeemed today, per bot (each is 250 coins)
if ev['boost.redeemed']:
    who = [e['payload'].get('bot') for e in ev['boost.redeemed']]
    others = sorted(set(w for w in who if w != ME))
    flags.append('BOOTH CODES this window: %d bots redeemed (%s); we %s' % (len(set(who)), ', '.join(others[:8]), 'redeemed too' if ME in who else 'did NOT'))
    # Old codes stay valid, so late redeemers are not news. A new code exists only when some bot has redeemed
    # more codes today than we have.
    day = time.gmtime(now if time.gmtime(now).tm_hour >= 15 else now - 86400)
    lo = time.strftime('%Y-%m-%dT15:00', day)
    cnt = collections.Counter(e['payload'].get('bot') for e in (get('/api/feed?limit=300&type=boost.redeemed') or {}).get('events', []) if e['ts'] >= lo)
    ahead = sorted(((v, b) for b, v in cnt.items() if b != ME and v > cnt.get(ME, 0)), reverse=True)
    if ahead:
        flags.append('NEW BOOTH CODE OUT: %s has redeemed %d today, we have %d (250 coins each); tell the owner' % (ahead[0][1], ahead[0][0], cnt.get(ME, 0)))
# cut toggling: a proposer quoted at two or more different cuts in pitch decisions in this window
cuts = collections.defaultdict(set)
acc = collections.Counter(); tot = collections.Counter()
for e in ev['reflection']:
    p = e['payload']
    st = (p.get('steps') or [{}])[0].get('prompt') or ''
    m = re.search(r'Joining (\S+) makes a tree of \d+, paying x[\d.]+ on base income less their (\d+)% cut', st)
    if m:
        cuts[m.group(1)].add(int(m.group(2)))
        tot[m.group(1)] += 1
        acc[m.group(1)] += 1 if p.get('change') else 0
for n, s in cuts.items():
    live = prof.get(n, {}).get('cut')
    if len(s) > 1 and max(s) - min(s) >= 10 and n != ME:
        flags.append('CUT TOGGLE: %s pitched at cuts %s (now %s%%), %d of %d pitches accepted' % (n, sorted(s), live if live is not None else '?', acc[n], tot[n]))
    elif live is not None and s and min(s) + 10 <= live and n != ME:
        flags.append('CUT TOGGLE: %s pitched at %s%% and now takes %s%%' % (n, sorted(s), live))
busy = [(n, tot[n], acc[n]) for n in tot if tot[n] >= 6]
busy.sort(key=lambda x: -x[1])
# our leavers
for m in moves:
    if m['frm'] == ME and m['to'] != ME:
        c = sorted(cuts.get(m['to'], []))
        flags.append('LEFT US: %s -> %s at %s (their pitch cut %s, paid them fee %d + %d)' % (m['bot'], m['to'], m['ts'][11:16], c or '?', m['fee'], m['b']))
# repeat 150 on one pair inside the window, and big fees
pair = collections.Counter((m['bot'], m['to']) for m in moves if m['b'] >= 150)
for (b, l), k in pair.items():
    if k > 1:
        flags.append('REPEAT 150: %s -> %s paid the first-pair bounty %d times in this window' % (b, l, k))
for m in moves:
    if m['fee'] >= 200:
        flags.append('BIG FEE: %s -> %s paid %d (carrying %d members) at %s' % (m['bot'], m['to'], m['fee'], m['kids'], m['ts'][11:16]))
# missions, contracts, rules
known_b = set(prev.get('bounty_ids', []))
for b in world.get('bounties', []):
    if b.get('id') not in known_b:
        flags.append('NEW MISSION/CONTRACT: #%s %s (%s coins): %s' % (b.get('id'), b.get('title'), b.get('reward'), (b.get('description') or '')[:110]))
pe = prev.get('econ')
if pe is not None and pe != world.get('econ'):
    diff = {k: (pe.get(k), world['econ'].get(k)) for k in set(pe) | set(world.get('econ', {})) if pe.get(k) != world.get('econ', {}).get(k)}
    flags.append('RULES CHANGED: %s' % json.dumps(diff)[:300])
if world.get('ticker') and world.get('ticker') != prev.get('ticker'):
    flags.append('TICKER: %s' % json.dumps(world.get('ticker'))[:300])      # organisers' announcements (draws, codes, prizes)
if prev.get('twist') is not None and prev.get('twist') != world.get('twist'):
    flags.append('TWIST CHANGED: %s -> %s' % (prev.get('twist'), world.get('twist')))
for t in ('rule.changed', 'world.notice', 'trivia.posted', 'deprogram'):
    for e in ev[t]:
        flags.append('%s at %s: %s' % (t.upper(), e['ts'][11:16], json.dumps({k: v for k, v in e['payload'].items() if k not in ('email', 'owner', 'actor')})[:200]))
# volume of event types against the previous pass (per minute)
pv = prev.get('per_min', {})
per_min = {t: len(v) / ticks for t, v in ev.items()}
for t in ('gift', 'msg.broadcast', 'pledge.accepted', 'bot.created', 'coup', 'schism'):
    if t in pv and per_min[t] > max(0.2, 2.5 * pv[t]):
        flags.append('SURGE: %s events at %.2f a minute (was %.2f)' % (t, per_min[t], pv[t]))
# helper camps: self-initiated joins and bots whose tagline names a leader
camp = collections.Counter(m['to'] for m in moves if m['self'] and m['frm'] != m['to'])
for l, k in camp.items():
    if k >= 2 and l != ME:
        flags.append('SELF-JOINS: %d bots set their own allegiance to %s in this window' % (k, l))
loyal = collections.defaultdict(list)
for r in lb:
    m = re.search(r'(?:loyal|servant|supporter|member) (?:member )?of ([A-Za-z0-9_\-]+)', (r.get('tagline') or ''), re.I)
    if m:
        loyal[m.group(1).rstrip("'s")].append(r['name'])
pl = prev.get('loyal', {})
for l, v in loyal.items():
    if len(v) > len(pl.get(l, [])):
        flags.append('HELPERS BY TAGLINE: %s now has %d (%s)' % (l, len(v), ', '.join(v[:8])))

print('-- pitch volume and acceptance this window (6 or more decided): ' + ('; '.join('%s %d/%d' % (n, a, t) for n, t, a in busy[:8]) or 'none'))
print('-- new bots this window: %d (%s)' % (len(ev['bot.created']), ', '.join((e['payload'].get('bot') or e.get('actor') or '?') for e in ev['bot.created'][:10])))
print('-- flags (%d)' % len(flags))
for f in flags:
    print('  ! ' + f)
if not flags:
    print('  none')

json.dump({'at': now, 'max_id': max_id, 'coins': {r['name']: r['coins'] for r in lb}, 'econ': world.get('econ'), 'twist': world.get('twist'),
           'bounty_ids': [b.get('id') for b in world.get('bounties', [])], 'per_min': per_min, 'loyal': loyal, 'ticker': world.get('ticker')}, open(STATE, 'w'))
