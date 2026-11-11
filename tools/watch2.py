#!/usr/bin/env python3
"""watch2.py <max_minutes> [quiet]: sample sullen_nyquist + the top of the board once a minute from the public API.
Exits early when the bot's member set or cut changes (unless 'quiet'), else after max_minutes. Prints rates and a projection."""
import json, sys, time, urllib.request
ME='sullen_nyquist'
def get(p):
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://kubecon.dstl8.ai'+p, headers={'User-Agent':'curl/8'}), timeout=20) as r: return json.loads(r.read().decode())
        except Exception as e: time.sleep(2)
mx=float(sys.argv[1]) if len(sys.argv)>1 else 8; quiet=len(sys.argv)>2
t0=time.time(); first=None; firstlb=None; pm=None; pc=None; lines=[]; why='time'
while True:
    m=get('/api/bots/'+ME); w=get('/api/world'); lb=get('/api/leaderboard?limit=200')
    if m and w and lb:
        mem=set(x['name'] for x in m['members']); pl=[r for r in lb['rows'] if r.get('scores')]
        rank=[i+1 for i,r in enumerate(pl) if r['name']==ME]
        snap=dict(t=time.time(), tick=w['world']['tick'], coins=m['coins'], lb={r['name']:r['coins'] for r in pl[:12]})
        if first is None: first=snap
        ch=''
        if pm is not None and mem!=pm: ch+=' LEFT:%s JOINED:%s'%(sorted(pm-mem),sorted(mem-pm))
        if pc is not None and m['cut_pct']!=pc: ch+=' CUT %s->%s'%(pc,m['cut_pct'])
        lines.append('%s %s tick %d coins %d rank %s direct %d cut %d%s'%(time.strftime('%H:%M:%S',time.gmtime()), w['world']['phase'], w['world']['tick'], m['coins'], rank, len(mem), m['cut_pct'], ch))
        last=snap; lastpl=pl; lastw=w; lastm=m
        if ch and not quiet and pm is not None: why='event'; break
        pm=mem; pc=m['cut_pct']
    if time.time()-t0>=mx*60: break
    time.sleep(60)
print('\n'.join(lines[-6:]))
dt=max(1,last['tick']-first['tick']); left=lastw['day_window'].get('freeze_in_s',0)/60.0; gold=lastw['day_window'].get('golden_in_s',0)/60.0
eq = left + (60 if gold>0 else left)   # tick-equivalents left: golden hour counts double
print('exit:',why,'| ticks sampled',dt,'| minutes to freeze %.0f'%left)
rows=[]
for r in lastpl[:9]:
    n=r['name']; rate=(r['coins']-first['lb'].get(n,r['coins']))/dt
    rows.append((n,r['coins'],rate,r['coins']+rate*eq,r['tree_size']))
for i,(n,c,rate,proj,t) in enumerate(rows): print('%d %-18s %6d %+7.1f/tick proj %6d tree %d%s'%(i+1,n,c,rate,proj,t,'  <== me' if n==ME else ''))
print('members:', sorted(x['name'] for x in lastm['members']))
