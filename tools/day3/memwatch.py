#!/usr/bin/env python3
"""memwatch.py <max_seconds>: poll our public member list every 20 s (read-only). Exits at once when it changes, when a
new trivia question is open, or when LEDGER passes us; prints one status line at the end otherwise."""
import json, os, sys, time, datetime, urllib.request

ME, RIVAL = 'sullen_nyquist', 'LEDGER'
H = os.path.dirname(os.path.abspath(__file__))
SEEN = os.path.join(H, 'trivwatch_seen.json')
ST = os.path.join(H, 'memwatch_state.json')


def get(p):
    try:
        req = urllib.request.Request('https://kubecon.dstl8.ai' + p, headers={'User-Agent': 'curl/8'})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


def names(b):
    return sorted((m.get('name') if isinstance(m, dict) else m) for m in (b.get('members') or []))


def main():
    max_s = int(sys.argv[1])
    try:
        st = json.load(open(ST))
    except Exception:
        st = {}
    try:
        seen = set(json.load(open(SEEN)))
    except Exception:
        seen = set()
    start = time.time()
    line = ''
    while True:
        now = datetime.datetime.now(datetime.timezone.utc)
        stamp = now.strftime('%H:%M:%S')
        b = get('/api/bots/' + ME)
        r = get('/api/bots/' + RIVAL)
        if b:
            cur = names(b)
            old = st.get('members')
            st['members'] = cur
            json.dump(st, open(ST, 'w'))
            line = 'us %s (#%s) cut %s%% members %s | %s %s (#%s) members %s' % (b.get('coins'), b.get('rank'), b.get('cut_pct'), cur, RIVAL, (r or {}).get('coins'), (r or {}).get('rank'), len((r or {}).get('members') or []))
            if old is not None and old != cur:
                print('%s MEMBERS CHANGED: left %s, joined %s | %s' % (stamp, sorted(set(old) - set(cur)), sorted(set(cur) - set(old)), line))
                return 0
            if r and r.get('coins') and b.get('coins') and r['coins'] > b['coins'] and not st.get('passed'):
                st['passed'] = True
                json.dump(st, open(ST, 'w'))
                print('%s LEDGER PASSED US | %s' % (stamp, line))
                return 0
            if r and b.get('coins') and r.get('coins') and r['coins'] <= b['coins']:
                st['passed'] = False
        d = get('/api/feed?limit=3&type=trivia.posted')
        for e in (d or {}).get('events', []):
            p = e.get('payload') or {}
            key = str(p.get('id'))
            if key in seen:
                continue
            seen.add(key)
            json.dump(sorted(seen), open(SEEN, 'w'))
            try:
                c = datetime.datetime.fromisoformat(p['closes_at'][:19]).replace(tzinfo=datetime.timezone.utc)
            except Exception:
                c = None
            if c and c > now:
                print('%s TRIVIA OPEN %s' % (stamp, json.dumps({'id': p.get('id'), 'question': p.get('question'), 'choices': p.get('choices'), 'reward': p.get('reward'), 'seconds_left': int((c - now).total_seconds())}, ensure_ascii=False)))
                return 0
        if time.time() - start >= max_s:
            print('%s quiet | %s' % (stamp, line))
            return 0
        time.sleep(20)


if __name__ == '__main__':
    sys.exit(main())
