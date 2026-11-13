#!/usr/bin/env python3
"""Archive the Prompt Wars public record: read-only GETs, about two requests a second, resumable.

Usage: archive.py [out_dir]        (default: archive/ at the repository root, which is git-ignored)

Writes: snapshot/*.json  final-state endpoints (world, championship, leaderboard, house bots, map)
        static/*         the client source and style sheet, for reading only
        feed/day<N>.jsonl.gz  every public event of day N, newest first; feed/state.json is the resume point
        bots/<name>.json every bot's public profile

The feed holds other players' messages, notes and (through the reaffirm step) cores. Keep the pull local; publish
derived tables only. A full pull after the finale was about 440,000 events, 900 requests and 45 minutes.
"""
import gzip, json, os, sys, time, urllib.parse, urllib.request

BASE = 'https://kubecon.dstl8.ai'
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'archive')
PAUSE = 0.5


def raw(path):
    err = None
    for attempt in range(6):
        try:
            req = urllib.request.Request(BASE + path, headers={'User-Agent': 'curl/8', 'Accept': '*/*'})
            with urllib.request.urlopen(req, timeout=40) as r:
                return r.read()
        except Exception as e:  # noqa: BLE001
            err = e
            time.sleep(3 + 5 * attempt)
    print('FAIL', path, err, flush=True)
    return None


def save(rel, data):
    p = os.path.join(OUT, rel)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, 'wb') as f:
        f.write(data)


def snapshot():
    for rel, path in [
        ('snapshot/world.json', '/api/world'),
        ('snapshot/championship.json', '/api/championship'),
        ('snapshot/leaderboard.json', '/api/leaderboard?limit=500'),
        ('snapshot/housebots.json', '/api/housebots'),
        ('snapshot/map.json', '/api/map'),
        ('static/index.html', '/'),
        ('static/app.js', '/static/app.js'),
        ('static/spectate.js', '/static/spectate.js'),
        ('static/graph.js', '/static/graph.js'),
        ('static/icons.js', '/static/icons.js'),
        ('static/style.css', '/static/style.css'),
        ('static/sw.js', '/sw.js'),
        ('static/manifest.json', '/manifest.json'),
    ]:
        b = raw(path)
        if b is not None:
            save(rel, b)
            print('saved', rel, len(b), flush=True)
        time.sleep(PAUSE)


def bots():
    lb = json.load(open(os.path.join(OUT, 'snapshot/leaderboard.json')))
    n = 0
    for r in lb['rows']:
        name = r['name']
        rel = 'bots/%s.json' % urllib.parse.quote(name, safe='')
        if os.path.exists(os.path.join(OUT, rel)):
            continue
        b = raw('/api/bots/' + urllib.parse.quote(name, safe=''))
        if b is not None:
            save(rel, b)
            n += 1
        time.sleep(0.35)
    print('bots saved', n, flush=True)


def feed():
    d = os.path.join(OUT, 'feed')
    os.makedirs(d, exist_ok=True)
    sp = os.path.join(d, 'state.json')
    st = json.load(open(sp)) if os.path.exists(sp) else {'before': None, 'count': 0, 'done': False}
    if st.get('done'):
        print('feed already complete', st, flush=True)
        return
    files = {}
    pages = 0
    while True:
        q = '/api/feed?limit=500' + (('&before=%d' % st['before']) if st['before'] else '')
        b = raw(q)
        if b is None:
            print('giving up at', st, flush=True)
            break
        j = json.loads(b)
        evs = j if isinstance(j, list) else (j.get('events') or [])
        if not evs:
            st['done'] = True
            break
        for e in evs:
            day = e.get('day')
            if day not in files:
                files[day] = gzip.open(os.path.join(d, 'day%s.jsonl.gz' % day), 'at', encoding='utf-8')
            files[day].write(json.dumps(e, ensure_ascii=False, separators=(',', ':')) + '\n')
        st['before'] = min(e['id'] for e in evs)
        st['count'] += len(evs)
        pages += 1
        if pages % 20 == 0:
            for f in files.values():
                f.flush()
            json.dump(st, open(sp, 'w'))
            print('page', pages, 'events', st['count'], 'at id', st['before'], evs[-1].get('ts'), flush=True)
        time.sleep(PAUSE)
    for f in files.values():
        f.close()
    json.dump(st, open(sp, 'w'))
    print('feed finished', st, flush=True)


if __name__ == '__main__':
    snapshot()
    feed()
    bots()
    print('ALL DONE', flush=True)
