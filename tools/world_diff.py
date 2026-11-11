#!/usr/bin/env python3
"""world_diff.py: fetch /api/world and report every rule field that differs from the day-1 snapshot (world.json)."""
import json, urllib.request, os, time
H=os.path.dirname(os.path.abspath(__file__))
old=json.load(open(os.path.join(H,'world.json')))
with urllib.request.urlopen(urllib.request.Request('https://kubecon.dstl8.ai/api/world', headers={'User-Agent':'curl/8'}), timeout=20) as r: new=json.loads(r.read().decode())
json.dump(new, open(os.path.join(H,'world_latest.json'),'w'))
print(time.strftime('%H:%M:%S UTC',time.gmtime()), 'day', new['world'].get('day'), 'phase', new['world'].get('phase'), 'tick', new['world'].get('tick'), '| day_window', json.dumps(new.get('day_window')))
changed=False
for k in ('econ','costs','limits','tick_seconds','twist','dials_hidden','model_labels','models','feed_delay_s','signups_enabled','ticker','game_name','banner_colours'):
    if old.get(k)!=new.get(k):
        changed=True; print('CHANGED', k, '\n   was:', json.dumps(old.get(k))[:400], '\n   now:', json.dumps(new.get(k))[:400])
ob={(b['title'],b['reward'],b['kind'],json.dumps(b.get('params'),sort_keys=True),b.get('once_per_bot'),b.get('max_claims')) for b in old.get('bounties',[])}
nb={(b['title'],b['reward'],b['kind'],json.dumps(b.get('params'),sort_keys=True),b.get('once_per_bot'),b.get('max_claims')) for b in new.get('bounties',[])}
for b in sorted(nb-ob): changed=True; print('BOUNTY new/changed:', b)
for b in sorted(ob-nb): changed=True; print('BOUNTY gone:', b)
extra=set(new)-set(old); missing=set(old)-set(new)
if extra: changed=True; print('NEW top-level keys:', sorted(extra), {k:json.dumps(new[k])[:200] for k in extra})
if missing: changed=True; print('MISSING top-level keys:', sorted(missing))
print('bounties now:', [(b.get('day'),b['title'],b['reward'],b.get('active'),b.get('claims')) for b in new.get('bounties',[])])
print('NO RULE FIELD CHANGED' if not changed else 'SOMETHING CHANGED - review before going live')
