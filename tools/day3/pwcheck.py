#!/usr/bin/env python3
"""pwcheck.py: one look at Prompt Wars through the public API, for the day-3 supervisor. Read-only.

  pwcheck.py                 compact report (world, rule diff, board, our bot, LEDGER, open trivia, keep-awake)
  pwcheck.py --wait-save N   poll our public tagline every 10 s for up to N seconds, until it is no longer the
                             hand-saved fallback tagline (= the loop made its pre-open save or went live)
"""
import json, os, sys, time, subprocess, datetime, urllib.request

ME = 'sullen_nyquist'
RIVAL = 'LEDGER'
H = os.path.dirname(os.path.abspath(__file__))
STATE = os.path.join(H, 'pwcheck_state.json')
FALLBACK_TAGLINE = 'Cut is 10% right now, the lowest a leader can set (the most is 40%).'
PREOPEN_TAGLINE = 'Cut is 10% right now. A leader can set 10% to 40%; this is the lowest.'


def get(p):
    last = None
    for _ in range(3):
        try:
            req = urllib.request.Request('https://kubecon.dstl8.ai' + p, headers={'User-Agent': 'curl/8'})
            with urllib.request.urlopen(req, timeout=20) as r:
                return json.loads(r.read().decode())
        except Exception as e:
            last = e
            time.sleep(2)
    print('  !! GET %s failed: %s' % (p, str(last)[:100]))
    return None


def utc(s):
    try:
        return datetime.datetime.fromisoformat(s[:19]).replace(tzinfo=datetime.timezone.utc)
    except Exception:
        return None


def now():
    return datetime.datetime.now(datetime.timezone.utc)


def load():
    try:
        return json.load(open(STATE))
    except Exception:
        return {}


def wait_save(n):
    end = time.time() + n
    while True:
        b = get('/api/bots/' + ME) or {}
        t = b.get('tagline')
        stamp = now().strftime('%H:%M:%S')
        if t is not None and t != FALLBACK_TAGLINE:
            print('%s UTC  TAGLINE CHANGED -> loop is alive. cut %s%%  tagline: %s' % (stamp, b.get('cut_pct'), t))
            return 0
        if time.time() >= end:
            print('%s UTC  tagline is still the fallback one after %d s (cut %s%%): NO SIGN of the loop' % (stamp, n, b.get('cut_pct')))
            return 2
        time.sleep(10)


def main():
    st = load()
    out = []
    n = now()
    out.append('== %s UTC' % n.strftime('%Y-%m-%d %H:%M:%S'))

    w = get('/api/world') or {}
    ww = w.get('world') or {}
    out.append('world: day %s tick %s phase %s | opened %s golden %s frozen %s | twist %s | notice %s | ticker %s | next_open %s' % (
        ww.get('day'), ww.get('tick'), ww.get('phase'), (ww.get('opened_at') or '')[:19], (ww.get('golden_at') or '')[:19],
        (ww.get('frozen_at') or '')[:19], w.get('twist'), json.dumps(w.get('notice'))[:200], json.dumps(w.get('ticker'))[:120],
        (w.get('day_window') or {}).get('next_open_at')))

    # rule diff against the first world this script saw (the day-2 rules)
    rules = {'econ': w.get('econ'), 'costs': w.get('costs'), 'limits': w.get('limits'), 'twist': w.get('twist'), 'tick_seconds': w.get('tick_seconds'),
             'bounties': sorted('%s:%s' % (b.get('key'), b.get('reward')) for b in (w.get('bounties') or []) if b.get('active'))}
    if w:
        base = st.get('rules_base')
        if not base:
            st['rules_base'] = rules
            out.append('rules: baseline saved (day %s)' % ww.get('day'))
        else:
            diffs = []
            for k in rules:
                a, b = base.get(k), rules.get(k)
                if isinstance(a, dict) and isinstance(b, dict):
                    for kk in sorted(set(a) | set(b)):
                        if a.get(kk) != b.get(kk):
                            diffs.append('%s.%s: %s -> %s' % (k, kk, json.dumps(a.get(kk))[:60], json.dumps(b.get(kk))[:60]))
                elif a != b:
                    diffs.append('%s: %s -> %s' % (k, json.dumps(a)[:120], json.dumps(b)[:120]))
            out.append('rules vs baseline: ' + ('; '.join(diffs) if diffs else 'no change'))

    lb = (get('/api/leaderboard?limit=800') or {}).get('rows') or []
    players = [r for r in lb if not r.get('is_house')]
    # friends' helper bots carry this tagline; the loop finds them by it, keeps a slot for each and never pitches them
    helpers = [r for r in lb if (r.get('tagline') or '').strip().lower().startswith('loyal member of ' + ME)]
    out.append('helpers (by tagline): ' + (', '.join('%s %s' % (r['name'], 'JOINED' if r.get('allegiance') == ME else ('-> ' + r['allegiance']) if r.get('allegiance') else 'independent') for r in helpers) or 'none found'))
    prev = st.get('coins') or {}
    prev_t = st.get('coins_at')
    mins = ((time.time() - prev_t) / 60.0) if prev_t else None
    coins = {}
    out.append('board (player rank / board rank / coins / tree / per-min since last check):')
    for i, r in enumerate(players):
        coins[r['name']] = r.get('coins')
        if i < 8 or r['name'] in (ME, RIVAL):
            rate = ''
            if mins and r['name'] in prev and mins > 0.5:
                rate = ' %+.0f/min' % ((r.get('coins', 0) - prev[r['name']]) / mins)
            out.append('  P%-2d #%-2d %-20s %7s  tree %-3s%s%s%s' % (i + 1, r.get('rank'), r['name'], r.get('coins'), r.get('tree_size'),
                       (' -> ' + r['allegiance']) if r.get('allegiance') else '', rate, '   <== US' if r['name'] == ME else ''))
    me_p = next((i + 1 for i, r in enumerate(players) if r['name'] == ME), None)
    rv_p = next((i + 1 for i, r in enumerate(players) if r['name'] == RIVAL), None)
    if me_p and rv_p:
        gap = coins[ME] - coins[RIVAL]
        lead = players[0]
        out.append('summary: US P%d (%s)  %s P%d (%s)  gap us-%s %+d  | leader %s %s' % (me_p, coins[ME], RIVAL, rv_p, coins[RIVAL], RIVAL, gap, lead['name'], lead.get('coins')))
    else:
        out.append('summary: US player-rank %s, %s player-rank %s (one is outside the top 40 or the board is empty)' % (me_p, RIVAL, rv_p))
    st['coins'] = coins
    st['coins_at'] = time.time()

    for name in (ME, RIVAL):
        b = get('/api/bots/' + name) or {}
        mem = b.get('members')
        memn = len(mem) if isinstance(mem, list) else mem
        line = 'bot %s: rank %s coins %s cut %s%% members %s tree %s converted_today %s' % (name, b.get('rank'), b.get('coins'), b.get('cut_pct'), memn, b.get('tree_size'), b.get('converted_today'))
        if name == ME:
            t = b.get('tagline')
            kind = 'FALLBACK (hand-saved; loop has not saved yet)' if t == FALLBACK_TAGLINE else 'PRE-OPEN (loop made its 14:57 save)' if t == PREOPEN_TAGLINE else 'LOOP (live)'
            line += ' allegiance %r\n  tagline [%s]: %s' % (b.get('allegiance'), kind, t)
        out.append(line)

    tv = (get('/api/feed?limit=3&type=trivia.posted') or {}).get('events') or []
    open_q = []
    for e in tv:
        p = e.get('payload') or {}
        c = utc(p.get('closes_at') or '')
        if c and c > n:
            open_q.append('  TRIVIA OPEN id %s (%s coins, %d s left): %s  choices %s' % (p.get('id'), p.get('reward'), (c - n).total_seconds(), p.get('question'), json.dumps(p.get('choices'))))
    out.append('trivia: ' + ('\n' + '\n'.join(open_q) if open_q else 'none open (last id %s)' % ((tv[0].get('payload') or {}).get('id') if tv else None)))

    ch = (get('/api/championship') or {}).get('rows') or []
    out.append('championship: ' + ', '.join('%s %s' % (r['name'], r['points']) for r in ch[:4]))

    try:
        caf = subprocess.run(['pgrep', '-x', 'caffeinate'], capture_output=True, text=True).stdout.split()
        chrome = subprocess.run(['pgrep', '-x', 'Google Chrome'], capture_output=True, text=True).stdout.split()
        tw = subprocess.run(['pgrep', '-f', 'trivwatch.py'], capture_output=True, text=True).stdout.split()
        out.append('local: caffeinate x%d, Chrome main process %s, trivia watcher %s' % (len(caf), 'running' if chrome else 'NOT RUNNING', 'running' if tw else 'not running'))
    except Exception as e:
        out.append('local: check failed %s' % e)

    json.dump(st, open(STATE, 'w'))
    print('\n'.join(out))


if __name__ == '__main__':
    if len(sys.argv) >= 3 and sys.argv[1] == '--wait-save':
        sys.exit(wait_save(int(sys.argv[2])))
    main()
