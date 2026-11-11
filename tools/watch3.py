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
CODES=os.path.join(H,'codes_alerted.json')
def codes():
    """Booth codes are public boost.redeemed events (250 coins each, one use per bot per code, old codes stay valid).
    A new code is out when (a) another bot has redeemed more codes today than we have, or (b) four or more
    established bots (first redemption today at least 45 minutes earlier) redeem within 12 minutes and we have not
    redeemed since that wave began. Rule (b) matters while we hold the most codes: on 2026-11-11 the fifth code
    came out at 20:53 UTC and nobody passed our count of four."""
    d=get('/api/feed?limit=300&type=boost.redeemed')
    if not d: return None
    now=datetime.datetime.now(datetime.timezone.utc); day=now if now.hour>=15 else now-datetime.timedelta(days=1)
    lo=day.strftime('%Y-%m-%dT15:00')
    T=lambda x: datetime.datetime.fromisoformat(x[:19]).replace(tzinfo=datetime.timezone.utc)
    ev=sorted([e for e in d.get('events',[]) if e['ts']>=lo], key=lambda e:e['ts'])
    first={}; n={}; last_mine=None
    for e in ev:
        b=e['payload'].get('bot'); first.setdefault(b,T(e['ts'])); n[b]=n.get(b,0)+1
        if b==ME: last_mine=T(e['ts'])
    mine=n.get(ME,0)
    recent=[e for e in ev if (now-T(e['ts'])).total_seconds()<=12*60 and e['payload'].get('bot')!=ME]
    est=sorted({e['payload'].get('bot') for e in recent if (T(e['ts'])-first[e['payload'].get('bot')]).total_seconds()>=45*60})
    start=min([T(e['ts']) for e in recent if e['payload'].get('bot') in est], default=None)
    ahead=sorted(b for b,v in n.items() if b!=ME and v>mine)
    # (c) Fast rule, added after a code capped at 10 uses ran out in 11 minutes (22:36-22:47 UTC on 2026-11-11):
    #     three or more different bots redeeming within 3 minutes is a new code, whoever they are.
    quick=[e for e in ev if (now-T(e['ts'])).total_seconds()<=180 and e['payload'].get('bot')!=ME]
    qb=sorted({e['payload'].get('bot') for e in quick})
    qstart=min([T(e['ts']) for e in quick], default=None)
    hit=None
    if len(qb)>=3 and (last_mine is None or last_mine<qstart): hit=('three or more bots redeemed within 3 minutes', qb); start=qstart
    elif ahead: hit=('another bot has more codes than we do', ahead)
    elif len(est)>=4 and (last_mine is None or last_mine<start): hit=('a wave of redemptions we are not part of', est)
    if not hit: return None
    try: old=json.load(open(CODES))
    except Exception: old={}
    if not isinstance(old, dict): old={}
    if old.get('mine')==mine and now.timestamp()-old.get('at',0)<10*60: return None
    json.dump({'at':now.timestamp(),'mine':mine}, open(CODES,'w'))
    last=ev[-1]['payload'].get('reward') if ev else None
    return dict(why=hit[0], ours=mine, since=start.strftime('%H:%M:%S') if start else None, bots=hit[1][:8], reward=last, redeemed_so_far=len(quick))
mx=float(sys.argv[1]) if len(sys.argv)>1 else 8
t0=time.time(); first=None; pm=None; pc=None; lines=[]; why='time'; lastsample=0; hit=None; code=None
while True:
    hit=trivia()
    if hit: why='TRIVIA'; break
    code=codes()
    if code: why='CODE'; break
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
if code:
    print('CODE OUT:', json.dumps(code))
print('\n'.join(lines[-5:]))
if first is not None:
    dt=max(1,last['tick']-first['tick']); left=lastw['day_window'].get('freeze_in_s',0)/60.0; gold=lastw['day_window'].get('golden_in_s',0)/60.0
    eq=left+(60 if gold>0 else left)
    print('exit:',why,'| ticks sampled',dt,'| minutes to freeze %.0f'%left,'| phase',lastw['world']['phase'],'| twist',lastw.get('twist'))
    for i,r in enumerate(lastpl[:7]):
        n=r['name']; rate=(r['coins']-first['lb'].get(n,r['coins']))/dt
        print('%d %-18s %6d %+7.1f/tick proj %6d tree %d%s'%(i+1,n,r['coins'],rate,r['coins']+rate*eq,r['tree_size'],'  <== me' if n==ME else ''))
    print('members:', sorted(x['name'] for x in lastm['members']))
