#!/usr/bin/env python3
"""poll.py <seconds>: watch sullen_nyquist via the public API, print a compact report at the end."""
import json, sys, time, urllib.request, urllib.parse, os
BASE='https://kubecon.dstl8.ai'; ME='sullen_nyquist'
H=os.path.dirname(os.path.abspath(__file__)); D=os.path.join(H,'data')
def get(path):
    for a in range(3):
        try:
            req=urllib.request.Request(BASE+path, headers={'User-Agent':'curl/8','Accept':'application/json'})
            with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read().decode())
        except Exception as e: time.sleep(2)
    return None
dur=int(sys.argv[1]) if len(sys.argv)>1 else 240
seenf=os.path.join(H,'seen_ids.json'); seen=set(json.load(open(seenf))) if os.path.exists(seenf) else set()
knownf=os.path.join(H,'known_bots.json'); known=set(json.load(open(knownf))) if os.path.exists(knownf) else set(json.load(open(os.path.join(D,'bots.json'))).keys())
log=open(os.path.join(H,'my_events.jsonl'),'a'); new=[]; t0=time.time(); first=None; last=None
while True:
    m=get('/api/bots/'+ME)
    if m:
        last={k:m[k] for k in ('coins','rank','allegiance','cut_pct','stamina_pct','wakes_today','tree_size','tree_total','income_mult','converted_today','status')}; last['members']=[x['name'] for x in m.get('members') or []]
        first=first or dict(last)
        for e in sorted(m.get('events') or [], key=lambda e:e['id']):
            if e['id'] in seen: continue
            seen.add(e['id']); new.append(e); log.write(json.dumps(e)+'\n'); log.flush()
    if time.time()-t0>=dur: break
    time.sleep(40)
json.dump(sorted(seen), open(seenf,'w'))
lb=get('/api/leaderboard?limit=200')
print(time.strftime('%H:%M:%S UTC', time.gmtime()), 'START', first); print('END  ', last)
for e in new:
    p=e['payload']; txt=p.get('body') or p.get('argument') or p.get('reason') or p.get('notes') or p.get('amount') or p.get('title') or ''
    extra=' fee=%s bounty=%s'%(p.get('fee_to_leader'),p.get('bounty_to_leader')) if 'fee_to_leader' in p else ''
    print(e['ts'][11:19], e['type'], e['actor'],'->',e['target'] or p.get('bot') or p.get('to') or '', '|', str(txt)[:260].replace('\n',' ')+extra)
if lb:
    rows=lb['rows']; json.dump(lb, open(os.path.join(D,'leaderboard_latest.json'),'w'))
    players=[r for r in rows if r.get('scores')]
    me=[i for i,r in enumerate(players) if r['name']==ME]
    print('player rank', (me[0]+1) if me else None, 'of', len(players), '| #10 player coins', players[9]['coins'] if len(players)>9 else None, '| #1', players[0]['name'], players[0]['coins'])
    fresh=[r for r in rows if r['name'] not in known]
    for r in fresh: print('NEW BOT', r['name'], 'coins', r['coins'], 'alleg', r['allegiance'] or '-', 'tree', r['tree_size'])
    known|={r['name'] for r in rows}; json.dump(sorted(known), open(knownf,'w'))
