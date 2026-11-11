#!/usr/bin/env python3
import json, collections, os, sys
D=os.path.join(os.path.dirname(os.path.abspath(__file__)),'data')
bots=json.load(open(os.path.join(D,'bots.json')))
conv=json.load(open(os.path.join(D,'feed_conversion.json')))+json.load(open(os.path.join(D,'feed_coup.json')))
flips=collections.Counter(); recent=collections.Counter(); mine=set()
for e in conv:
    p=e['payload']
    if p.get('self_initiated'): continue
    flips[p['bot']]+=1
    if e['ts']>='2026-11-10T22:30': recent[p['bot']]+=1
    if p['leader']=='sullen_nyquist': mine.add(p['bot'])
ME='sullen_nyquist'
def chain(n):
    c=[]; cur=n
    while cur and cur in bots and bots[cur]['allegiance'] and len(c)<30:
        cur=bots[cur]['allegiance']; c.append(cur)
    return c
rows=[]
for n,b in bots.items():
    if n==ME: continue
    L=b['allegiance']; cut=bots[L]['cut_pct'] if L in bots else None
    mult=b.get('income_mult',1)
    cur = 8*mult - (8*cut/100 if cut else 0)
    s=b['sliders']
    rows.append(dict(name=n,house=b['is_house'],res=s['resistance'],opp=s['opportunist'],tr=s['trusting'],leader=L or '-',cut=cut,mult=mult,cur=round(cur,2),gain=round(15.2-cur,2),flips=flips[n],recent=recent[n],tree=b['tree_size'],coins=b['coins'],status=b['status'],inert=b.get('inert'),exh=b.get('exhausted'),mine=ME in chain(n),anc=n in chain(ME),prev=n in mine,model=b.get('model')))
if __name__=='__main__':
    print('%-22s %-5s %3s %3s %3s %-18s %4s %4s %5s %5s %2s %2s %3s %6s %s'%('name','house','res','opp','tr','leader','cut','mult','cur','gain','fl','rc','tre','coins','flags'))
    for r in sorted(rows,key=lambda r:(r['res'],-r['gain'])):
        fl=','.join(k for k in ('mine','anc','prev','inert','exh') if r[k])+('' if r['status']=='active' else ','+r['status'])
        print('%-22s %-5s %3d %3d %3d %-18s %4s %4s %5s %5s %2d %2d %3d %6d %s %s'%(r['name'][:22],r['house'],r['res'],r['opp'],r['tr'],r['leader'][:18],r['cut'],r['mult'],r['cur'],r['gain'],r['flips'],r['recent'],r['tree'],r['coins'],r['model'],fl))
