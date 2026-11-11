#!/usr/bin/env python3
"""watch.py <samples> <interval_s>: sample coins/members/rank and print per-minute deltas + who left/joined."""
import json, sys, time, urllib.request
ME='sullen_nyquist'
def get(p):
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://kubecon.dstl8.ai'+p, headers={'User-Agent':'curl/8'}), timeout=20) as r: return json.loads(r.read().decode())
        except Exception as e: time.sleep(2)
n=int(sys.argv[1]); iv=int(sys.argv[2]); prev=None; pm=None
for i in range(n):
    m=get('/api/bots/'+ME); w=get('/api/world')
    if m and w:
        mem=set(x['name'] for x in m['members'])
        d='' if prev is None else ' d=%+d'%(m['coins']-prev)
        ch='' if pm is None else (' LEFT:%s'%sorted(pm-mem) if pm-mem else '')+(' JOINED:%s'%sorted(mem-pm) if mem-pm else '')
        print(time.strftime('%H:%M:%S',time.gmtime()), w['world']['phase'], 'tick', w['world']['tick'], 'coins', m['coins'], d, 'rank', m['rank'], 'direct', len(mem), 'cut', m['cut_pct'], ch, flush=True)
        prev=m['coins']; pm=mem
    if i<n-1: time.sleep(iv)
lb=get('/api/leaderboard?limit=200')
if lb:
    pl=[r for r in lb['rows'] if r.get('scores')]
    print('TOP:', ' | '.join('%d %s %d'%(i+1,r['name'],r['coins']) for i,r in enumerate(pl[:8])))
    print('player rank', [i+1 for i,r in enumerate(pl) if r['name']==ME], 'of', len(pl))
