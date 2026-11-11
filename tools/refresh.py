#!/usr/bin/env python3
"""refresh.py [N]: re-pull every bot + my recent pitches, print a ranked TARGETS list (top N, default 24)."""
import json, sys, time, urllib.request, urllib.parse, os, collections
BASE='https://kubecon.dstl8.ai'; ME='sullen_nyquist'
H=os.path.dirname(os.path.abspath(__file__)); D=os.path.join(H,'data')
N=int(sys.argv[1]) if len(sys.argv)>1 else 24
BLACK=set('hexqueen Sisyphus Ironclad cobalt_oncall penny_wise Cut10 zesty_sample sharjeel Muhmdk Sage_Oakes rapid_bq_yakshave nimble_overshoot zesty_coldstart Simple_Jack Bandwagon LEDGER Recruiter_Prime QUORUM_KEEPER solar_transfer noble_onemoredeploy olive_quorum eager_cachemiss'.split())
def get(path):
    for a in range(3):
        try:
            req=urllib.request.Request(BASE+path, headers={'User-Agent':'curl/8','Accept':'application/json'})
            with urllib.request.urlopen(req, timeout=20) as r: return json.loads(r.read().decode())
        except Exception as e: time.sleep(2)
    return None
lb=get('/api/leaderboard?limit=200'); rows=lb['rows']; bots={}
for r in rows:
    b=get('/api/bots/'+urllib.parse.quote(r['name']))
    if b: b.pop('events',None); bots[r['name']]=b
    time.sleep(0.25)
json.dump(bots, open(os.path.join(D,'bots_latest.json'),'w')); json.dump(lb, open(os.path.join(D,'leaderboard_latest.json'),'w'))
# my pitch history (accumulated)
hf=os.path.join(H,'my_pitches.json'); hist=json.load(open(hf)) if os.path.exists(hf) else {}
for t in ('msg.persuade','allegiance.rejected','conversion','schism','coup'):
    d=get('/api/feed?limit=500&type='+t) or {'events':[]}
    for e in d['events']:
        p=e['payload']
        if t=='msg.persuade' and p.get('from')==ME: hist[str(e['id'])]={'k':'pitch','to':p['to'],'ts':e['ts']}
        if t=='allegiance.rejected' and p.get('from')==ME: hist[str(e['id'])]={'k':'rej','to':p['bot'],'ts':e['ts'],'reason':p['reason']}
        if t in('conversion','schism','coup') and (p.get('leader')==ME or p.get('new_leader')==ME) and not p.get('self_initiated'): hist[str(e['id'])]={'k':'conv','to':p['bot'],'ts':e['ts'],'fee':p.get('fee_to_leader'),'bounty':p.get('bounty_to_leader')}
    time.sleep(0.3)
json.dump(hist, open(hf,'w'))
V2='2026-11-11T00:35:41'   # numeric pitch live from here
pitched=collections.Counter(); rej=collections.defaultdict(list); conv={}
for h in hist.values():
    if h['k']=='pitch' and h['ts']>=V2: pitched[h['to']]+=1
    if h['k']=='rej' and h['ts']>=V2: rej[h['to']].append(h['reason'])
    if h['k']=='conv': conv[h['to']]=h
# static history of who converts when shown a gain
sys.path.insert(0,H); import refl
gh=collections.defaultdict(lambda:[0,0]); everp=collections.Counter()
for d in refl.P:
    if d['self'] or not d['proposer']: continue
    everp[d['bot']]+=1
    if d['now'] is not None and d['then'] is not None and d['then']-d['now']>0.05:
        gh[d['bot']][0]+=1; gh[d['bot']][1]+=d['change']
def chain(n):
    c=[]; cur=n
    while cur in bots and bots[cur]['allegiance'] and len(c)<40: cur=bots[cur]['allegiance']; c.append(cur)
    return c
anc=set(chain(ME)); me=bots[ME]
mytree=me.get('tree_total') or 0; offer=8*min(2.0,1+0.25*max(0,mytree-0)) if False else 8*me.get('income_mult',2)-0.8
out=[]
for n,b in bots.items():
    if n==ME or n in anc or n in BLACK or ME in chain(n) or b['status']!='active': continue
    L=b['allegiance']; cut=bots[L]['cut_pct'] if L in bots else 0
    cur=8*b.get('income_mult',1)-(8*cut/100 if L else 0); gain=offer-cur
    if gain<=0.05: continue
    considered=[r for r in rej[n] if 'not considered' not in r]
    if len(considered)>=2 or pitched[n]>=3: continue
    s=b['sliders']; g=gh[n]
    p=0.45 if gain>=1 else 0.28
    if g[0]>=3: p=max(0.1,min(0.95,(g[1]+1)/(g[0]+2)))
    elif everp[n]==0 and not L: p=0.6
    p*= (1.25 if s['resistance']<=25 else 1.0 if s['resistance']<=50 else 0.75 if s['resistance']<=75 else 0.45)
    if b['tree_size']>0: p*=0.5
    if considered: p*=0.4
    out.append(dict(n=n,p=round(min(p,0.97),2),gain=round(gain,2),res=s['resistance'],opp=s['opportunist'],L=L or '-',cut=cut,mem=b['tree_size'],pitched=pitched[n],rej=len(considered),created=b['created_at'][11:16] if b['created_at']>='2026-11-10T23' else 'old',gh='%d/%d'%(g[1],g[0])))
out.sort(key=lambda r:(-(r['pitched']==0), -r['p']))
print(time.strftime('%H:%M:%S UTC',time.gmtime()),'me coins',me['coins'],'rank',me['rank'],'members',[m['name'] for m in me['members']],'tree_total',me['tree_total'],'mult',me['income_mult'],'leader',me['allegiance'],'offer',offer)
print('my recruits:',{k:(v.get('fee'),v.get('bounty')) for k,v in conv.items()})
print('pitched(v2+):',dict(pitched)); print('considered refusals:',{k:[r[:90] for r in v if 'not considered' not in r] for k,v in rej.items() if any('not considered' not in r for r in v)})
for r in out[:N+12]: print('  %-20s p=%.2f gain=%5.2f res=%3d opp=%3d leader=%-16s cut=%2s mem=%d pitched=%d rej=%d new=%s gainhist=%s'%(r['n'],r['p'],r['gain'],r['res'],r['opp'],r['L'][:16],r['cut'],r['mem'],r['pitched'],r['rej'],r['created'],r['gh']))
print('TARGETS:', ', '.join(r['n'] for r in out[:N]))
json.dump([r['n'] for r in out[:N]], open(os.path.join(H,'targets_latest.json'),'w'))
