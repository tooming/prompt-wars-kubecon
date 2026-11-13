"""Write the small public tables that belong in the repository from the archive: official daily placements,
rule changes, phase times, the final championship table and the day-3 /api/world snapshot. Bot names and scores
only; no messages.
"""
import json
import os
import shutil
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwlib import ARCH, ROOT, read  # noqa: E402

out = {'placements': {}, 'results': {}, 'rule_changes': [], 'phases': []}
for day in (1, 2, 3):
    for e in read(day):
        t = e['type']
        if t == 'daily.placement':
            p = e['payload']
            out['placements'].setdefault(str(day), []).append({k: p[k] for k in ('rank', 'bot', 'coins', 'points', 'rookie') if k in p})
        elif t == 'daily.results':
            out['results'][str(day)] = e['payload']
        elif t == 'rule.changed':
            out['rule_changes'].append({'ts': e['ts'], 'day': day, 'summary': e['payload']['summary']})
        elif t == 'world.phase':
            out['phases'].append({'ts': e['ts'], **e['payload']})
for rows in out['placements'].values():
    rows.sort(key=lambda r: r['rank'])
data = os.path.join(ROOT, 'data')
json.dump(out, open(os.path.join(data, 'official_results.json'), 'w'), indent=1, ensure_ascii=False)
shutil.copy(os.path.join(ARCH, 'snapshot', 'world.json'), os.path.join(data, 'world_day3.json'))
champ = json.load(open(os.path.join(ARCH, 'snapshot', 'championship.json')))
champ['rows'] = [{k: r[k] for k in ('name', 'points', 'days', 'best_rank', 'is_house')} for r in champ['rows'] if r['points'] > 0]
json.dump(champ, open(os.path.join(data, 'championship_final.json'), 'w'), indent=1, ensure_ascii=False)
print('written: data/official_results.json, data/world_day3.json, data/championship_final.json')
