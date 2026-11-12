#!/usr/bin/env python3
"""pwwait.py <max_seconds> [--until HH:MM[:SS]]: block until something in Prompt Wars needs the supervisor, read-only.

Returns (exit 0, one line) at the first of:
  WORLD ...      phase, notice or next-open time changed
  TAGLINE ...    our public tagline changed while the world is frozen (= the loop's pre-open save, or someone edited the bot)
  TRIVIA OPEN .. a new trivia question is open
  CODE WAVE ...  three or more different bots redeemed a booth code within three minutes (a new code is out)
  MILESTONE ...  the --until UTC time was reached
  quiet ...      max_seconds passed
Polls once a minute while frozen and more than 10 minutes from the open, every 20 s otherwise."""
import json, os, sys, time, datetime, urllib.request

ME = 'sullen_nyquist'
H = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(H, 'pwwait_state.json')
SEEN = os.path.join(H, 'trivwatch_seen.json')
UTC = datetime.timezone.utc


def get(p):
    try:
        req = urllib.request.Request('https://kubecon.dstl8.ai' + p, headers={'User-Agent': 'curl/8'})
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read().decode())
    except Exception:
        return None


def ts(s):
    try:
        return datetime.datetime.fromisoformat(s.replace('Z', '+00:00')[:32] if '+' in s or s.endswith('Z') else s[:19]).astimezone(UTC) if ('+' in s or s.endswith('Z') or s[19:20] == '-') else datetime.datetime.fromisoformat(s[:19]).replace(tzinfo=UTC)
    except Exception:
        try:
            return datetime.datetime.fromisoformat(s[:19]).replace(tzinfo=UTC)
        except Exception:
            return None


def load(p, d):
    try:
        return json.load(open(p))
    except Exception:
        return d


def main():
    max_s = int(sys.argv[1])
    until = None
    if '--until' in sys.argv:
        parts = [int(x) for x in sys.argv[sys.argv.index('--until') + 1].split(':')]
        n = datetime.datetime.now(UTC)
        until = n.replace(hour=parts[0], minute=parts[1], second=parts[2] if len(parts) > 2 else 0, microsecond=0)
        if until <= n - datetime.timedelta(minutes=1):
            until += datetime.timedelta(days=1)
    st = load(STATE, {})
    seen = set(load(SEEN, []))
    start = time.time()
    last = ''
    while True:
        now = datetime.datetime.now(UTC)
        stamp = now.strftime('%H:%M:%S')
        w = get('/api/world')
        phase = None
        if w:
            ww = w.get('world') or {}
            phase = ww.get('phase')
            cur = {'phase': phase, 'notice': json.dumps(w.get('notice'))[:300], 'next_open': (w.get('day_window') or {}).get('next_open_at'), 'day': ww.get('day')}
            old = st.get('world')
            st['world'] = cur
            if old and old != cur:
                json.dump(st, open(STATE, 'w'))
                print('%s WORLD changed: %s -> %s' % (stamp, json.dumps(old), json.dumps(cur)))
                return 0
            nxt = ts(cur['next_open'] or '')
            near = bool(nxt and 0 <= (nxt - now).total_seconds() < 600)
        else:
            near = False
        b = get('/api/bots/' + ME)
        if b:
            t = b.get('tagline')
            old_t = st.get('tagline')
            st['tagline'] = t
            last = 'rank %s coins %s cut %s%%' % (b.get('rank'), b.get('coins'), b.get('cut_pct'))
            if phase == 'frozen' and old_t is not None and t != old_t:
                json.dump(st, open(STATE, 'w'))
                print('%s TAGLINE changed while frozen (cut %s%%): %r -> %r' % (stamp, b.get('cut_pct'), old_t, t))
                return 0
        if phase and phase != 'frozen':
            d = get('/api/feed?limit=3&type=trivia.posted')
            for e in (d or {}).get('events', []):
                p = e.get('payload') or {}
                key = str(p.get('id'))
                if key in seen:
                    continue
                seen.add(key)
                json.dump(sorted(seen), open(SEEN, 'w'))
                c = ts(p.get('closes_at') or '')
                if c and c > now:
                    json.dump(st, open(STATE, 'w'))
                    print('%s TRIVIA OPEN %s' % (stamp, json.dumps({'id': p.get('id'), 'question': p.get('question'), 'choices': p.get('choices'), 'reward': p.get('reward'),
                                                                   'closes_at': p.get('closes_at'), 'seconds_left': int((c - now).total_seconds())}, ensure_ascii=False)))
                    return 0
            d = get('/api/feed?limit=40&type=boost.redeemed')
            ev = [(ts(e.get('ts') or ''), (e.get('payload') or {}).get('bot'), (e.get('payload') or {}).get('reward')) for e in (d or {}).get('events', [])]
            recent = [x for x in ev if x[0] and (now - x[0]).total_seconds() < 180]
            bots = sorted(set(x[1] for x in recent))
            if len(bots) >= 3 and time.time() - st.get('wave_at', 0) > 900:
                st['wave_at'] = time.time()
                json.dump(st, open(STATE, 'w'))
                print('%s CODE WAVE: %d bots redeemed in the last 3 min (%s), reward %s; we %s' % (stamp, len(bots), ', '.join(bots[:8]), recent[0][2], 'HAVE it' if ME in bots else 'do NOT have it'))
                return 0
        json.dump(st, open(STATE, 'w'))
        if until and datetime.datetime.now(UTC) >= until:
            print('%s MILESTONE %s UTC reached | phase %s | %s' % (stamp, until.strftime('%H:%M:%S'), phase, last))
            return 0
        if time.time() - start >= max_s:
            print('%s quiet | phase %s | %s' % (stamp, phase, last))
            return 0
        step = 60 if (phase == 'frozen' and not near) else 20
        left = max_s - (time.time() - start)
        if until:
            left = min(left, (until - datetime.datetime.now(UTC)).total_seconds())
        time.sleep(max(1, min(step, left)))


if __name__ == '__main__':
    sys.exit(main())
