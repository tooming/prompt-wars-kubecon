#!/usr/bin/env python3
import json, re, collections, os
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'data')
R=json.load(open(os.path.join(D,'feed_reflection.json')))
def parse(e):
    p=e['payload']; pr=p['steps'][0]['prompt'] if p.get('steps') else ''
    d={}
    d['id']=e['id']; d['ts']=e['ts']; d['bot']=p['bot']; d['proposer']=p.get('proposer'); d['change']=p['change']; d['self']=bool(p.get('self_initiated')); d['err']=p.get('error')
    m=re.search(r'Their argument:\n"(.*?)"\n\nYou are under', pr, re.S); d['arg']=m.group(1) if m else ''
    m=re.search(r'Your disposition, set by your owner: (.*?)\n', pr); d['disp']=m.group(1) if m else ''
    m=re.search(r'you earn ([\d.]+) coins/tick now', pr); d['now']=float(m.group(1)) if m else None
    m=re.search(r'you would earn ([\d.]+) coins/tick', pr); d['then']=float(m.group(1)) if m else None
    m=re.search(r'one-off cost of (\d+) coins', pr); d['cost']=int(m.group(1)) if m else None
    m=re.search(r'makes a tree of (\d+)', pr); d['tree']=int(m.group(1)) if m else None
    m=re.search(r'less their (\d+)% cut', pr); d['cut']=int(m.group(1)) if m else None
    # loyalty/group line = line after disposition
    m=re.search(r'Your disposition, set by your owner: .*?\n(.*?)\nArithmetic', pr, re.S); d['loy']=m.group(1).strip() if m else ''
    d['decisions']=[s.get('decision') for s in p.get('steps',[])]
    d['prompt']=pr
    return d
P=[parse(e) for e in R]
if __name__=='__main__':
    ext=[d for d in P if not d['self'] and d['proposer']]
    print('n',len(P),'external',len(ext),'changed',sum(d['change'] for d in ext))
    def disp(d):
        s=d['disp']
        for k in ('very hard to move','skeptical','open','easily persuaded'):
            if k in s: return k
        return s[:40]
    def rate(key, rows=ext):
        c=collections.defaultdict(lambda:[0,0])
        for d in rows:
            k=key(d); c[k][0]+=1; c[k][1]+=d['change']
        for k,(n,y) in sorted(c.items(), key=lambda kv:str(kv[0])): print('   %-55s n=%4d conv=%3d  %.1f%%'%(str(k)[:55],n,y,100*y/n))
    print('by disposition'); rate(disp)
    def gain(d):
        if d['now'] is None or d['then'] is None: return 'n/a'
        g=d['then']-d['now']
        return 'gain>=5' if g>=5 else 'gain 1..5' if g>=1 else 'gain 0.1..1' if g>0.05 else 'zero' if g>-0.05 else 'loss'
    print('by gain'); rate(gain)
    print('by disposition x gain'); rate(lambda d:(disp(d),gain(d)))
    print('loyalty lines'); rate(lambda d:d['loy'][:55])
    print('by now-income (independent ~8)'); rate(lambda d:'indep(<9)' if d['now'] and d['now']<9 else 'small tree(9-13)' if d['now'] and d['now']<13 else 'full(>=13)' if d['now'] else 'n/a')
    print('by cost'); rate(lambda d:'n/a' if d['cost'] is None else '<=30' if d['cost']<=30 else '31-45' if d['cost']<=45 else '46-80' if d['cost']<=80 else '>80')
    print('since 22:30 by gain'); rate(gain,[d for d in ext if d['ts']>='2026-11-10T22:30'])
    print('unique disposition strings', collections.Counter(d['disp'] for d in P).most_common(8))
    print('unique loyalty strings', collections.Counter(d['loy'] for d in P).most_common(12))
    print(ext[0]['prompt'][-900:])
