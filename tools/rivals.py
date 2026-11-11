#!/usr/bin/env python3
"""rivals.py <seconds>: two leaderboard samples -> coins/tick for the top players and projected freeze totals."""
import json, sys, time, urllib.request
def get(p):
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://kubecon.dstl8.ai'+p, headers={'User-Agent':'curl/8'}), timeout=20) as r: return json.loads(r.read().decode())
        except Exception as e: time.sleep(2)
dur=int(sys.argv[1]) if len(sys.argv)>1 else 180
a=get('/api/leaderboard?limit=200'); wa=get('/api/world'); time.sleep(dur); b=get('/api/leaderboard?limit=200'); wb=get('/api/world')
ticks=max(1, wb['world']['tick']-wa['world']['tick']); left=wb['day_window']['freeze_in_s']/60.0
A={r['name']:r for r in a['rows']}
rows=[r for r in b['rows'] if r.get('scores')][:9]
print(time.strftime('%H:%M:%S',time.gmtime()), 'ticks sampled', ticks, 'minutes to freeze %.1f'%left, wb['world']['phase'])
out=[]
for r in rows:
    rate=(r['coins']-A[r['name']]['coins'])/ticks if r['name'] in A else 0
    out.append((r['name'], r['coins'], rate, r['coins']+rate*left, r['tree_size']))
for i,(n,c,rate,proj,t) in enumerate(out): print('%d %-18s %6d  %+7.1f/tick  proj %6d  tree %d'%(i+1,n,c,rate,proj,t))
print('projected order:', ' > '.join(n for n,_,_,p,_ in sorted(out,key=lambda x:-x[3])))
