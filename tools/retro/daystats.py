"""Per-day statistics quoted in the consolidated spec. Usage: daystats.py <day>"""
import sys, json, collections, statistics, re
sys.path.insert(0, __import__('os').path.dirname(__import__('os').path.abspath(__file__)))
from pwlib import *

day = int(sys.argv[1])
E = read(day); T = by_type(E)
print('DAY', day, 'events', len(E), 'first', E[0]['ts'], 'last', E[-1]['ts'])
print('types:', dict(collections.Counter(e['type'] for e in E).most_common()))
ph = [(e['ts'][11:19], e['payload'].get('phase'), e['payload'].get('twist')) for e in T['world.phase']]
print('phases', ph); golden = next((e['ts'] for e in T['world.phase'] if e['payload'].get('phase') == 'golden'), '9')
for e in T['rule.changed']: print('rule.changed', e['ts'][11:19], e['payload']['summary'])
for e in T['world.notice']: print('notice', e['ts'][11:19], e['payload'].get('notice'))
for e in T['daily.results']: print('daily.results', e['payload'])
print('placements', [(r['rank'], r['bot'], r['coins'], r['points'], r.get('rookie', False)) for r in placements(E)])

# reflections
R = T['reflection']
ext = [e for e in R if not e['payload'].get('self_initiated')]; selfi = [e for e in R if e['payload'].get('self_initiated')]
two = [e for e in R if len(e['payload']['steps']) > 1]
rev = [e for e in two if not e['payload'].get('change')]
print('reflections', len(R), 'external', len(ext), 'self', len(selfi), '| reached step 2:', len(two), 'reversed there:', len(rev),
      '| external changed', sum(1 for e in ext if e['payload'].get('change')), '| self changed', sum(1 for e in selfi if e['payload'].get('change')))
print('models', collections.Counter(e['payload'].get('model') for e in R), 'errors', sum(1 for e in R if e['payload'].get('error')))
P = T['msg.persuade']; print('persuades', len(P))
rej = T['allegiance.rejected']
def reason_kind(e):
    r = (e['payload'].get('reason') or e['payload'].get('quote') or '')
    rl = r.lower()
    if not r.strip(): return 'empty'
    if rl.strip() == 'not considered this wake': return 'not considered'
    if re.search(r'already has \d+ direct members', rl): return 'full leader'
    if rl.startswith('tree changed') or 'tree changed' in rl[:40]: return 'tree changed'
    return 'own reasoning'
print('rejections', len(rej), collections.Counter(reason_kind(e) for e in rej))
print('rejected payload keys', collections.Counter(tuple(sorted(e['payload'].keys())) for e in rej).most_common(3))
fl = [e for e in rej if reason_kind(e) == 'full leader']
if fl: print('full-leader sample:', fl[0]['actor'], '->', fl[0]['target'], json.dumps(fl[0]['payload'])[:330])
nc = [e for e in rej if reason_kind(e) == 'not considered']
if nc: print('not-considered sample:', json.dumps(nc[0]['payload'])[:200])

# moves
mv = [e for e in E if e['type'] in MOVES]
print('moves', collections.Counter(e['type'] for e in mv), 'independent', len(T['independent']))
reps, firsts = repeat_payments(E)
print('bounties to leaders: first', len(firsts), sum(e['payload']['bounty_to_leader'] for e in firsts), 'repeat', len(reps), sum(e['payload']['bounty_to_leader'] for e in reps),
      'values', collections.Counter(e['payload']['bounty_to_leader'] for e in firsts + reps))
if reps: print('repeat movers', collections.Counter(mover(e) for e in reps).most_common(8), 'leaders', collections.Counter(new_leader(e) for e in reps).most_common(8), 'first', reps[0]['ts'][11:19], 'last', reps[-1]['ts'][11:19])
print('fees total', sum(e['payload'].get('fee_to_leader', 0) for e in mv), 'listed bounty total', sum(e['payload'].get('reward', 0) for e in T['bounty.claimed']),
      collections.Counter(e['payload'].get('title') for e in T['bounty.claimed']).most_common(8))
# golden hour cost ratio: same mover's cost before/after golden
base = {}
ratios = []
for e in mv:
    p = e['payload']; m = mover(e); c = p.get('cost', 0) - 0
    if e['type'] == 'conversion' and p.get('members', 0) == 0:
        if e['ts'] < golden: base[m] = c
        elif m in base and base[m]: ratios.append(round(c / base[m], 2))
print('golden/open conversion cost ratios', collections.Counter(ratios).most_common(6))

# replay the forest: direct member counts
leader = {}
maxdirect = collections.Counter()
def direct(l): return [b for b, x in leader.items() if x == l]
for e in E:
    if e['type'] == 'conversion' or e['type'] == 'schism':
        leader[mover(e)] = new_leader(e) or None
    elif e['type'] == 'independent':
        leader[e['payload']['bot']] = None
    elif e['type'] == 'deprogram':
        leader[e['payload']['bot']] = None
    elif e['type'] == 'coup':
        us, dep = e['payload']['bot'], e['payload']['leader']
        up = leader.get(dep)
        for b in direct(dep):
            if b != us: leader[b] = us
        leader[us] = up; leader[dep] = us
    else: continue
    for l in set(x for x in leader.values() if x):
        n = len(direct(l))
        if n > maxdirect[l]: maxdirect[l] = n
print('max direct members ever (replay):', collections.Counter(maxdirect.values()).most_common(), 'top', maxdirect.most_common(5))

# contracts, pledges, banners, ticker, trivia, booth, gifts
bp = T['bounty.posted']; con = [e for e in bp if e['payload'].get('contract')]
print('contracts posted', len(con), 'rewards', collections.Counter(e['payload']['reward'] for e in con).most_common(8), 'targets', collections.Counter(e['payload']['target'] for e in con).most_common(4))
print('contract claims', [(e['payload'].get('bot'), e['payload'].get('reward'), e['payload'].get('title')) for e in T['bounty.claimed'] if 'Recruit ' in (e['payload'].get('title') or '') and e['payload'].get('title') != 'Recruiter'][:6])
print('contract expiries', len(T['bounty.expired']), collections.Counter(e['payload'].get('reason') for e in T['bounty.expired']))
print('pledges', {t: len(T[t]) for t in ('pledge.proposed', 'pledge.accepted', 'pledge.broken', 'pledge.expired')}, 'break cost', collections.Counter(e['payload'].get('cost') for e in T['pledge.broken']))
print('banner price', collections.Counter(e['payload'].get('price') for e in T['banner.funded']), 'raised', len(T['banner.raised']), collections.Counter(e['payload'].get('colour') for e in T['banner.raised']))
print('ticker', [(e['payload'].get('paid'), e['payload'].get('text', '')[:40]) for e in T['ticker.bought']], [(e['payload'].get('seconds')) for e in T['ticker.posted']])
for e in T['trivia.posted']: print('trivia', e['ts'][11:19], e['payload']['id'], e['payload']['reward'], e['payload']['seconds'], 's', '| correct:', sum(1 for c in T['trivia.correct'] if c['payload']['id'] == e['payload']['id']))
bo = T['boost.redeemed']; print('booth', len(bo), 'bots', len({e['payload']['bot'] for e in bo}), 'rewards', collections.Counter(e['payload']['reward'] for e in bo), 'max per bot', max(collections.Counter(e['payload']['bot'] for e in bo).values()) if bo else 0)
g = T['gift']; rec = collections.Counter()
for e in g: rec[e['payload']['to']] += e['payload']['amount']
print('gifts', len(g), 'coins', sum(rec.values()), 'top receivers', rec.most_common(5))
print('deprogram', len(T['deprogram']), 'payload keys', collections.Counter(tuple(sorted(e['payload'].keys())) for e in T['deprogram']))
print('spy', len(T['spy']), 'streak.milestone', len(T['streak.milestone']), 'bot.created', len(T['bot.created']), 'creed.updated', len(T['creed.updated']))
# note cadence as a proxy for wake cadence
last = {}; gaps = []
for e in T['notes.updated']:
    b = e['actor']; t = e['ts']
    import datetime
    tt = datetime.datetime.fromisoformat(t[:19])
    if b in last: gaps.append(((tt - last[b]).total_seconds(), t[11:13]))
    last[b] = tt
import itertools
byh = collections.defaultdict(list)
for gsec, h in gaps:
    if gsec < 900: byh[h].append(gsec)
print('notes gap by UTC hour (median, p10, n):', {h: (round(statistics.median(v)), round(sorted(v)[len(v) // 10]), len(v)) for h, v in sorted(byh.items())})
print('min gap', min(g for g, _ in gaps))

# --- what the CONSIDER prompt showed, and how the decision went (external pitches only) ---
import re
DISPO = [('easily persuaded', 'easily persuaded'), ('open to persuasion', 'open to persuasion'), ('skeptical', 'skeptical'),
         ('very hard to move', 'very hard to move')]
LOYAL = [('Loyalty is central', 'loyalty central'), ('You value loyalty', 'values loyalty'),
         ('keep your options open', 'keeps options open'), ('leaving has consequences.', 'plain')]
def classify(prompt):
    d = next((lab for key, lab in DISPO if key in prompt), 'none')
    l = next((lab for key, lab in LOYAL if key in prompt), 'no leader')
    m = re.search(r'you (gain|lose) ([\d.]+) per tick', prompt)
    if not m: a = 'absent'
    else:
        v = float(m.group(2)) * (1 if m.group(1) == 'gain' else -1)
        a = 'loss' if v < 0 else 'zero' if v == 0 else 'gain under 1' if v < 1 else 'gain 1 to 3' if v < 3 else 'gain 3 to 6' if v < 6 else 'gain 6 or more'
    return d, l, a, ('Note: your leader takes' in prompt)
opening = collections.Counter(); disp = collections.Counter(); loy = collections.Counter(); arith = collections.Counter(); note = 0
by_a = collections.defaultdict(lambda: [0, 0]); by_d = collections.defaultdict(lambda: [0, 0])
for e in R:
    p = e['payload']; s1 = p['steps'][0]['prompt']
    d, l, a, n = classify(s1)
    opening['own proposal, to independence' if 'follow nobody' in s1.split('\n\n')[1] else 'own proposal' if 'You yourself proposed' in s1 else 'pitch'] += 1
    disp[d] += 1; loy[l] += 1; arith[a] += 1; note += n
    if not p.get('self_initiated'):
        by_a[a][0] += 1; by_a[a][1] += bool(p.get('change'))
        by_d[d][0] += 1; by_d[d][1] += bool(p.get('change'))
print('step-1 openings', dict(opening)); print('disposition shown', dict(disp)); print('loyalty shown', dict(loy)); print('leader-cut note', note); print('arithmetic', dict(arith))
print('external pitch -> change, by arithmetic line:', {k: '%d/%d = %.1f%%' % (v[1], v[0], 100 * v[1] / v[0]) for k, v in sorted(by_a.items())})
print('external pitch -> change, by disposition:', {k: '%d/%d = %.1f%%' % (v[1], v[0], 100 * v[1] / v[0]) for k, v in sorted(by_d.items())})
mult = collections.Counter(re.search(r'paying x([\d.]+)', e['payload']['steps'][0]['prompt']).group(1) for e in R if 'paying x' in e['payload']['steps'][0]['prompt'])
print('multipliers quoted', dict(mult))
tok = [s.get('input_tokens', 0) for e in R for s in e['payload']['steps'] if s.get('input_tokens')]
if tok: print('input tokens per reflection call: median', statistics.median(tok), 'min', min(tok), 'max', max(tok))

# --- totals and our own bot ---
ME = 'sullen_nyquist'
print('coins paid: booth', sum(e['payload']['reward'] for e in T['boost.redeemed']), 'trivia', sum(e['payload']['reward'] for e in T['trivia.correct']), 'n', len(T['trivia.correct']))
rec = set(); ok = bad = 0
FIX = '2026-11-12T17:15:30'
for e in mv:
    d = new_leader(e)
    if not d: continue
    k = (mover(e), d); paid = bool(e['payload'].get('bounty_to_leader'))
    if (k not in rec) == paid: ok += 1
    else: bad += 1
    if e['type'] != 'schism' or e['ts'] >= FIX: rec.add(k)
print('pair rule (recorded on conversion/coup only before the day-3 fix, on any move after): fits', ok, 'of', ok + bad)
mine = [e for e in mv if new_leader(e) == ME]
print(ME, 'joins', len(mine), 'bounties', sum(e['payload'].get('bounty_to_leader', 0) for e in mine), 'fees', sum(e['payload'].get('fee_to_leader', 0) for e in mine),
      'repeat payments to us', [(e['ts'][11:19], mover(e)) for e in reps if new_leader(e) == ME], 'our own moves', [(e['ts'][11:19], e['type']) for e in mv + T['independent'] if mover(e) == ME])
print(ME, 'gifts in', [(e['ts'][11:16], e['payload']['from'], e['payload']['amount']) for e in T['gift'] if e['payload']['to'] == ME], 'booth', [(e['ts'][11:16], e['payload']['reward']) for e in T['boost.redeemed'] if e['payload']['bot'] == ME],
      'trivia', [(e['payload']['id'], e['payload']['reward']) for e in T['trivia.correct'] if e['payload']['bot'] == ME], 'listed', [(e['payload']['title'], e['payload']['reward']) for e in T['bounty.claimed'] if e['payload']['bot'] == ME])

# --- forest at the Golden Hour and at the freeze (replay of every move) ---
def replay(until):
    lead = {}
    for e in E:
        if e['ts'] > until: break
        t = e['type']
        if t in ('conversion', 'schism'): lead[mover(e)] = new_leader(e) or None
        elif t in ('independent', 'deprogram'): lead[e['payload']['bot']] = None
        elif t == 'coup':
            us, dep = e['payload']['bot'], e['payload']['leader']
            up = lead.get(dep)
            for b in [b for b, x in lead.items() if x == dep]:
                if b != us: lead[b] = us
            lead[us] = up; lead[dep] = us
    return lead
def root(lead, b):
    seen = set()
    while lead.get(b) and b not in seen:
        seen.add(b); b = lead[b]
    return b
frozen = next((e['ts'] for e in T['world.phase'] if e['payload'].get('phase') == 'frozen'), '9')
for label, ts in (('golden', golden), ('freeze', frozen)):
    lead = replay(ts)
    trees = collections.Counter(root(lead, b) for b, x in lead.items() if x)
    direct = collections.Counter(x for x in lead.values() if x)
    print(label, 'followers in the 5 largest trees (root: descendants):', trees.most_common(5), '| most direct members:', direct.most_common(4), '|', ME, 'direct', direct[ME], 'tree', trees[ME])
