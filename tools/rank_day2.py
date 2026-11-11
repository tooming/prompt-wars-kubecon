#!/usr/bin/env python3
import json, re, collections
D='data_final/'; ME='sullen_nyquist'
bots=json.load(open(D+'bots.json')); R=json.load(open(D+'feed_reflection.json'))
moves=json.load(open(D+'feed_conversion.json'))+json.load(open(D+'feed_schism.json'))+json.load(open(D+'feed_coup.json'))
rej=json.load(open('data/feed_allegiance.rejected.json')); per=json.load(open('data/feed_msg.persuade.json'))
recv=collections.Counter(e['payload']['to'] for e in per); dropped=collections.Counter(e['payload']['bot'] for e in rej if 'not considered' in e['payload']['reason'])
joined_me=set(e['payload']['bot'] for e in moves if (e['payload'].get('leader')==ME or e['payload'].get('new_leader')==ME) and not e['payload'].get('self_initiated'))
st=collections.defaultdict(lambda: dict(n=0,c=0,ng=0,cg=0,nsmall=0,csmall=0,mine=0,mine_c=0,core=None,disp=''))
for e in R:
    p=e['payload']
    if p.get('self_initiated') or not p.get('proposer') or not p.get('steps'): continue
    pr=p['steps'][0]['prompt']; s=st[p['bot']]
    a=re.search(r'you earn ([\d.]+) coins/tick now', pr); b=re.search(r'you would earn ([\d.]+) coins/tick', pr)
    d=re.search(r'Your disposition, set by your owner: you are ([a-z ]+?)[\.\,]', pr); s['disp']=d.group(1) if d else s['disp']
    s['n']+=1; s['c']+=p['change']
    if a and b:
        g=float(b.group(1))-float(a.group(1))
        if g>0.05: s['ng']+=1; s['cg']+=p['change']
        if 0.05<g<=3.5 and float(a.group(1))<9: s['nsmall']+=1; s['csmall']+=p['change']   # alone, small gain: like tomorrow's first pitches
    if p['proposer']==ME: s['mine']+=1; s['mine_c']+=p['change']
    if len(p['steps'])>1:
        m=re.search(r'Read your core again.*?\n(.*)', p['steps'][1]['prompt'], re.S)
        if m: s['core']=m.group(1)[:1500]
prior={'very hard to move':0.16,'skeptical':0.32,'open to persuasion':0.47,'easily persuaded':0.59,'':0.42}
NEVER=re.compile(r'never (change|follow|join|leave)|do not join|you do not join|follow no ?one|allegiance never|stay independent|remain independent|never switch|i stay|must lead|only lead|hermit', re.I)
rows=[]
for n,b in bots.items():
    if n==ME: continue
    s=st[n]; sl=b['sliders']; pr0=prior.get(s['disp'],0.42) if s['n'] else (0.59 if sl['resistance']<=20 else 0.47 if sl['resistance']<=40 else 0.42 if sl['resistance']<60 else 0.32 if sl['resistance']<80 else 0.16)
    p=(s['cg']+3*pr0)/(s['ng']+3)
    if n in joined_me: p=min(0.97,p*1.25+0.05)
    never=bool(s['core'] and NEVER.search(s['core'])) and s['cg']==0
    cont=dropped[n]/max(1,recv[n])
    cost=round(40*(2-0.02*sl['opportunist'] if sl['opportunist']<=50 else 1.5-0.01*sl['opportunist']))
    score=p*(1-0.6*cont)*(0.25 if never else 1)*(0.5 if (s['ng']>=4 and s['cg']==0) else 1)
    rows.append(dict(n=n,score=round(score,3),p=round(p,2),ng=s['ng'],cg=s['cg'],mine='%d/%d'%(s['mine_c'],s['mine']),joined=n in joined_me,res=sl['resistance'],opp=sl['opportunist'],cost=cost,house=b['is_house'],cont=round(cont,2),recv=recv[n],never=never,disp=s['disp'][:10],created=b['created_at'][5:16]))
rows.sort(key=lambda r:-r['score'])
json.dump(rows, open('day2_rank.json','w'))
print('%-22s score  p   gain(conv/n) mine  joined res opp cost house cont recv never'%'name')
for r in rows[:62]: print('%-22s %.3f %.2f %3d/%-3d %-5s %-5s %3d %3d %3d %-5s %.2f %4d %s'%(r['n'],r['score'],r['p'],r['cg'],r['ng'],r['mine'],r['joined'],r['res'],r['opp'],r['cost'],r['house'],r['cont'],r['recv'],r['never']))
print('PRIO:', json.dumps([r['n'] for r in rows if r['score']>=0.12]))
print('n prio', sum(r['score']>=0.12 for r in rows), 'of', len(rows), '| leaked cores', sum(1 for s in st.values() if s['core']))
