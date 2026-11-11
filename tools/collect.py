#!/usr/bin/env python3
"""Gentle collector for the Prompt Wars public API. Usage: collect.py bots | feed <type> [maxpages] | all"""
import json, sys, time, urllib.request, urllib.parse, os
BASE='https://kubecon.dstl8.ai'
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'data')
def get(path):
    for attempt in range(4):
        try:
            req=urllib.request.Request(BASE+path, headers={'User-Agent':'curl/8','Accept':'application/json'})
            with urllib.request.urlopen(req, timeout=25) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            err=e; time.sleep(2+3*attempt)
    print('FAIL', path, err, file=sys.stderr); return None
def bots():
    lb=get('/api/leaderboard?limit=200'); rows=lb['rows']
    json.dump(lb, open(os.path.join(D,'leaderboard.json'),'w'))
    out={}
    for r in rows:
        b=get('/api/bots/'+urllib.parse.quote(r['name']))
        if b:
            b.pop('events',None); out[r['name']]=b
        time.sleep(0.35)
    json.dump(out, open(os.path.join(D,'bots.json'),'w'))
    print('bots', len(out))
def feed(typ, maxpages=40):
    evs=[]; before=None
    for p in range(maxpages):
        q='/api/feed?limit=500&type='+urllib.parse.quote(typ)+(('&before=%d'%before) if before else '')
        d=get(q)
        if not d or not d.get('events'): break
        e=d['events']; evs+=e; before=min(x['id'] for x in e)
        if len(e)<500 or any(x.get('day')!=1 for x in e): break
        time.sleep(0.6)
    evs=[x for x in evs if x.get('day')==1]
    json.dump(evs, open(os.path.join(D,'feed_%s.json'%typ),'w'))
    print(typ, len(evs), 'oldest', evs[-1]['ts'] if evs else None)
if __name__=='__main__':
    a=sys.argv[1]
    if a=='bots': bots()
    elif a=='feed': feed(sys.argv[2], int(sys.argv[3]) if len(sys.argv)>3 else 40)
    elif a=='all':
        for t in ['conversion','gift','bounty.claimed','coup','schism','reflection','allegiance.rejected','msg.persuade']:
            feed(t)
        bots()
        feed('msg.whisper', 12)
