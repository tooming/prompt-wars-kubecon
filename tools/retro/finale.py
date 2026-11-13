"""Tables for the retrospective, from the archive that tools/archive.py writes.

Usage: finale.py [day]     (default 3)

Prints, for the given day: where the coins of the official top seven came from (public events only), the repeat
join bounties by leader, and, for day 3, the static counterfactual with those payments removed.
"""
import collections
import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwlib import ARCH, MOVES, by_type, mover, new_leader, placements, read, repeat_payments  # noqa: E402

DAY = int(sys.argv[1]) if len(sys.argv) > 1 else 3
E = read(DAY)
T = by_type(E)
reps, firsts = repeat_payments(E)
place = placements(E)
coins = {r['bot']: r['coins'] for r in place}

src = collections.defaultdict(collections.Counter)
for e in firsts:
    src[new_leader(e)]['first'] += e['payload']['bounty_to_leader']
    src[new_leader(e)]['n_first'] += 1
for e in reps:
    src[new_leader(e)]['repeat'] += e['payload']['bounty_to_leader']
    src[new_leader(e)]['n_repeat'] += 1
for e in E:
    if e['type'] in MOVES and new_leader(e):
        src[new_leader(e)]['fees'] += e['payload'].get('fee_to_leader', 0)
        src[new_leader(e)]['joins'] += 1
for e in T['bounty.claimed']:
    src[e['payload']['bot']]['listed'] += e['payload'].get('reward', 0)
for e in T['boost.redeemed']:
    src[e['payload']['bot']]['booth'] += e['payload']['reward']
for e in T['trivia.correct']:
    src[e['payload']['bot']]['trivia'] += e['payload']['reward']
for e in T['gift']:
    src[e['payload']['to']]['gifts'] += e['payload']['amount']
    src[e['payload']['from']]['gifts'] -= e['payload']['amount']

print('## Day-%d coin sources (public events; "rest" = final - 500 start - the listed columns)\n' % DAY)
print('| Bot | Final | First joins | Repeat joins | Join fees | Booth codes | Trivia | Listed bounties | Gifts, net | Rest |')
print('|---|---|---|---|---|---|---|---|---|---|')
for r in [r for r in place if r['rank'] <= 10][:7]:
    b = r['bot']
    s = src[b]
    known = s['first'] + s['repeat'] + s['fees'] + s['listed'] + s['booth'] + s['trivia'] + s['gifts']
    print('| %s | %s | %s (%d) | %s (%d) | %s | %s | %s | %s | %s | %s |' % (
        b, f"{coins[b]:,}", f"{s['first']:,}", s['n_first'], f"{s['repeat']:,}", s['n_repeat'], f"{s['fees']:,}",
        f"{s['booth']:,}", f"{s['trivia']:,}", f"{s['listed']:,}", f"{s['gifts']:+,}", f"{coins[b] - 500 - known:,}"))

print('\n## Join bounties, day %d\n' % DAY)
total = lambda xs: sum(e['payload']['bounty_to_leader'] for e in xs)  # noqa: E731
print('first-time payments %d (%d coins); repeat payments %d (%d coins)' % (len(firsts), total(firsts), len(reps), total(reps)))
lb = json.load(open(os.path.join(ARCH, 'snapshot', 'leaderboard.json')))['rows']
if reps:
    print('repeats: first %s, last %s, self-initiated %d, by type %s, returning bots %d' % (
        reps[0]['ts'], reps[-1]['ts'], sum(1 for e in reps if e['payload'].get('self_initiated')),
        dict(collections.Counter(e['type'] for e in reps)), len({mover(e) for e in reps})))
    per = collections.defaultdict(lambda: [0, 0, collections.Counter()])
    for e in reps:
        row = per[new_leader(e)]
        row[0] += 1
        row[1] += e['payload']['bounty_to_leader']
        row[2][mover(e)] += 1
    house = {r['name'] for r in lb if r['is_house']}
    print('\n| Leader paid | Repeat payments | Coins | Returning bot |')
    print('|---|---|---|---|')
    for l, (n, c, m) in sorted(per.items(), key=lambda x: (-x[1][1], x[0])):
        print('| %s%s | %d | %s | %s |' % (l, ' (house bot)' if l in house else '', n, f'{c:,}', ', '.join('%s (%d)' % x for x in m.most_common())))

if DAY == 3:
    POINTS = [75, 54, 45, 36, 30, 24, 18, 12, 6, 3]
    champ = {r['name']: r['points'] for r in json.load(open(os.path.join(ARCH, 'snapshot', 'championship.json')))['rows']}
    final = {r['name']: r['coins'] for r in lb}
    players = [r['name'] for r in sorted(lb, key=lambda r: -r['coins']) if not r['is_house']]
    act_pts = {n: (POINTS[i] if i < 10 else 0) for i, n in enumerate(players)}
    for label, with_fees in (('bounties only', False), ('bounties and the fees paid on those joins', True)):
        adj = collections.Counter()
        for e in reps:
            adj[new_leader(e)] += e['payload']['bounty_to_leader']
            if with_fees:
                adj[new_leader(e)] += e['payload']['fee_to_leader']
                adj[mover(e)] -= e['payload']['fee_to_leader']
        cf = {n: final[n] - adj[n] for n in players}
        order = sorted(cf, key=lambda n: -cf[n])
        tot = {n: champ.get(n, 0) - act_pts[n] + (POINTS[order.index(n)] if order.index(n) < 10 else 0) for n in players}
        print('\n## Static counterfactual, repeat %s removed\n' % label)
        print('| Day-3 place | Bot | Coins | Day points | Championship | Actual |')
        print('|---|---|---|---|---|---|')
        for i, n in enumerate(order[:8]):
            print('| %d | %s | %s | %d | %d | %d |' % (i + 1, n, f'{cf[n]:,}', POINTS[i], tot[n], champ.get(n, 0)))
        print('championship order:', sorted(tot.items(), key=lambda x: -x[1])[:6])
