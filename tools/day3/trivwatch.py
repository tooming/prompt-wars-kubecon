#!/usr/bin/env python3
"""trivwatch.py <until HH:MM UTC>: poll the public trivia feed every 20 s (read-only). Exits 0 AT ONCE, printing the
question, when a new question is open; exits 3 at the given UTC time. Seen ids are kept in trivwatch_seen.json."""
import json, os, sys, time, datetime, urllib.request

H = os.path.dirname(os.path.abspath(__file__))
SEEN = os.path.join(H, 'trivwatch_seen.json')


def get(p):
    try:
        req = urllib.request.Request('https://kubecon.dstl8.ai' + p, headers={'User-Agent': 'curl/8'})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


def main():
    hh, mm = sys.argv[1].split(':')
    now = datetime.datetime.now(datetime.timezone.utc)
    until = now.replace(hour=int(hh), minute=int(mm), second=0, microsecond=0)
    if until <= now:
        until += datetime.timedelta(days=1)
    seen = set(json.load(open(SEEN))) if os.path.exists(SEEN) else set()
    while datetime.datetime.now(datetime.timezone.utc) < until:
        d = get('/api/feed?limit=3&type=trivia.posted')
        for e in (d or {}).get('events', []):
            p = e.get('payload') or {}
            key = str(p.get('id'))
            if key in seen:
                continue
            seen.add(key)
            json.dump(sorted(seen), open(SEEN, 'w'))
            try:
                closes = datetime.datetime.fromisoformat(p['closes_at'][:19]).replace(tzinfo=datetime.timezone.utc)
            except Exception:
                closes = None
            n = datetime.datetime.now(datetime.timezone.utc)
            if closes and closes > n:
                print('TRIVIA OPEN ' + json.dumps({'id': p.get('id'), 'question': p.get('question'), 'choices': p.get('choices'), 'reward': p.get('reward'),
                                                   'closes_at': p.get('closes_at'), 'seconds_left': int((closes - n).total_seconds())}, ensure_ascii=False))
                return 0
        time.sleep(20)
    print('trivwatch: reached %s UTC with no new question' % sys.argv[1])
    return 3


if __name__ == '__main__':
    sys.exit(main())
