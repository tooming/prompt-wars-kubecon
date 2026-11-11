#!/usr/bin/env python3
"""spill.py [since_iso]: today's allegiance changes - payload keys, who got fee/bounty, and any change where the
recruiter (event actor / reflection proposer) differs from the bot's new leader (the 8-direct-member spill rule)."""
import json, sys, time, urllib.request, collections
def get(p):
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://kubecon.dstl8.ai'+p, headers={'User-Agent':'curl/8'}), timeout=20) as r: return json.loads(r.read().decode())
        except Exception as e: time.sleep(2)
since=sys.argv[1] if len(sys.argv)>1 else '2026-11-11T15:00'
ev=[]
for t in ('conversion','schism','coup'):
    ev+=[e for e in (get('/api/feed?limit=300&type='+t) or {'events':[]})['events'] if e['ts']>=since]; time.sleep(0.3)
ev.sort(key=lambda e:e['id'])
keys=collections.Counter(k for e in ev for k in e['payload'])
print(time.strftime('%H:%M:%S',time.gmtime()), 'changes since', since, ':', len(ev), '| payload keys', dict(keys))
bl=collections.Counter(e['payload'].get('bounty_to_leader') for e in ev); print('bounty_to_leader values', dict(bl))
odd=[e for e in ev if e['actor']!=(e['payload'].get('leader') or e['payload'].get('new_leader')) and not e['payload'].get('self_initiated')]
print('recruiter != new leader:', len(odd))
for e in odd[:12]:
    p=e['payload']; print('  ',e['ts'][11:19],e['type'],'actor',e['actor'],'bot',p.get('bot'),'leader',p.get('leader') or p.get('new_leader'),{k:v for k,v in p.items() if k not in ('argument','quote','bot','leader')})
lead=collections.Counter((e['payload'].get('leader') or e['payload'].get('new_leader')) for e in ev)
print('top recruiters today:', lead.most_common(10))
for e in ev[-4:]:
    p=e['payload']; print('  last:',e['ts'][11:19],e['type'],e['actor'],'<-',p.get('bot'),{k:v for k,v in p.items() if k not in ('argument','quote','bot')})
