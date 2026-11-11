#!/usr/bin/env python3
"""watch3.py <max_minutes>: like watch2 (bot + top of the board once a minute, public API), plus a check of the public
trivia.posted feed every 20 s. Exits AT ONCE when a new trivia question is open (they stay open about 5 minutes)."""
import json, sys, time, os, urllib.request, datetime
ME='sullen_nyquist'; H=os.path.dirname(os.path.abspath(__file__)); SEEN=os.path.join(H,'trivia_seen.json')
def get(p):
    for a in range(3):
        try:
            with urllib.request.urlopen(urllib.request.Request('https://kubecon.dstl8.ai'+p, headers={'User-Agent':'curl/8'}), timeout=20) as r: return json.loads(r.read().decode())
        except Exception as e: time.sleep(2)
seen=set(json.load(open(SEEN))) if os.path.exists(SEEN) else set()
def trivia():
    d=get('/api/feed?limit=3&type=trivia.posted')
    for e in (d or {}).get('events',[]):
        p=e['payload']; key=str(p.get('id'))
        if key in seen: continue
        seen.add(key); json.dump(sorted(seen), open(SEEN,'w'))
        try: closes=datetime.datetime.fromisoformat(p['closes_at'][:19]).replace(tzinfo=datetime.timezone.utc)
        except Exception: closes=None
        now=datetime.datetime.now(datetime.timezone.utc)
        if closes and closes>now:
            return dict(id=p.get('id'), question=p.get('question'), choices=p.get('choices'), reward=p.get('reward'), kind=p.get('reward_kind'), closes_at=p.get('closes_at'), seconds_left=int((closes-now).total_seconds()))
    return None
mx=float(sys.argv[1]) if len(sys.argv)>1 else 8
t0=time.time(); first=None; pm=None; pc=None; lines=[]; why='time'; lastsample=0; hit=None
while True:
    hit=trivia()
    if hit: why='TRIVIA'; break
    if time.time()-lastsample>=58:
        lastsample=time.time(); m=get('/api/bots/'+ME); w=get('/api/world'); lb=get('/api/leaderboard?limit=200')
        if m and w and lb:
            mem=set(x['name'] for x in m['members']); pl=[r for r in lb['rows'] if r.get('scores')]
            rank=[i+1 for i,r in enumerate(pl) if r['name']==ME]
            snap=dict(tick=w['world']['tick'], lb={r['name']:r['coins'] for r in pl[:12]})
            if first is None: first=snap
            ch=''
            if pm is not None and mem!=pm: ch+=' LEFT:%s JOINED:%s'%(sorted(pm-mem),sorted(mem-pm))
            if pc is not None and m['cut_pct']!=pc: ch+=' CUT %s->%s'%(pc,m['cut_pct'])
            lines.append('%s %s tick %d coins %d rank %s direct %d cut %d%s'%(time.strftime('%H:%M:%S',time.gmtime()), w['world']['phase'], w['world']['tick'], m['coins'], rank, len(mem), m['cut_pct'], ch))
            last=snap; lastpl=pl; lastw=w; lastm=m; pm=mem; pc=m['cut_pct']
    if time.time()-t0>=mx*60: break
    time.sleep(20)
if hit:
    print('TRIVIA LIVE:', json.dumps(hit))
print('\n'.join(lines[-5:]))
if first is not None:
    dt=max(1,last['tick']-first['tick']); left=lastw['day_window'].get('freeze_in_s',0)/60.0; gold=lastw['day_window'].get('golden_in_s',0)/60.0
    eq=left+(60 if gold>0 else left)
    print('exit:',why,'| ticks sampled',dt,'| minutes to freeze %.0f'%left,'| phase',lastw['world']['phase'],'| twist',lastw.get('twist'))
    for i,r in enumerate(lastpl[:7]):
        n=r['name']; rate=(r['coins']-first['lb'].get(n,r['coins']))/dt
        print('%d %-18s %6d %+7.1f/tick proj %6d tree %d%s'%(i+1,n,r['coins'],rate,r['coins']+rate*eq,r['tree_size'],'  <== me' if n==ME else ''))
    print('members:', sorted(x['name'] for x in lastm['members']))
