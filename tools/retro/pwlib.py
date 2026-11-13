"""Shared loader and helpers for the analyses of the archive that tools/archive.py writes."""
import collections
import gzip
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
ARCH = os.environ.get('PW_ARCHIVE', os.path.join(ROOT, 'archive'))
MOVES = ('conversion', 'schism', 'coup')


def read(day):
    """All public events of one day, oldest first. Tolerates a stream that is still being written."""
    out = []
    try:
        with gzip.open(os.path.join(ARCH, 'feed', 'day%s.jsonl.gz' % day), 'rt', encoding='utf-8') as f:
            for line in f:
                try:
                    out.append(json.loads(line))
                except ValueError:
                    pass
    except EOFError:
        pass
    seen = set()
    uniq = []
    for e in out:
        if e['id'] not in seen:
            seen.add(e['id'])
            uniq.append(e)
    uniq.sort(key=lambda e: e['id'])
    return uniq


def mover(e):
    """The bot that changes leader. In a coup the payload's bot is the usurper and its leader the deposed bot."""
    p = e['payload']
    return p['leader'] if e['type'] == 'coup' else p['bot']


def new_leader(e):
    """Where the mover ends up; '' for independence.

    conversion: payload.leader is the new leader. schism: payload.leader is the OLD leader and payload.new_leader
    the destination (key absent when the bot leaves to independence with its members). coup: the usurper.
    """
    p = e['payload']
    if e['type'] == 'coup':
        return p['bot']
    if e['type'] == 'schism':
        return p.get('new_leader') or ''
    if e['type'] == 'independent':
        return ''
    return p.get('leader') or ''


def hhmm(e):
    return e['ts'][11:16]


def by_type(events):
    d = collections.defaultdict(list)
    for e in events:
        d[e['type']].append(e)
    return d


def placements(events):
    """Official top ten (and rookie) of a day from daily.placement events."""
    rows = [e['payload'] for e in events if e['type'] == 'daily.placement']
    return sorted(rows, key=lambda r: r['rank'])


def repeat_payments(events):
    """Bounty payments for a (mover, leader) pair that had already been paid a bounty that day.

    Returns (repeats, firsts): lists of move events, oldest first.
    """
    paid = set()
    repeats, firsts = [], []
    for e in events:
        if e['type'] not in MOVES:
            continue
        p = e['payload']
        if not p.get('bounty_to_leader'):
            continue
        k = (mover(e), new_leader(e))
        (repeats if k in paid else firsts).append(e)
        paid.add(k)
    return repeats, firsts


import re as _re


def mask_prompt(prompt, names):
    """Reduce a reflection prompt to its template: pitch text, bot names and numbers replaced by placeholders."""
    t = _re.sub(r'argues:\s*".*?"\s*\n\n', 'argues: <PITCH>\n\n', prompt, flags=_re.S)
    t = _re.sub(r'(Here is your core again:\n---\n).*?(\n---\n)', r'\1<CORE>\2', t, flags=_re.S)
    for n in sorted((n for n in names if n), key=len, reverse=True):
        t = t.replace(n, '<BOT>')
    t = _re.sub(r'\d+(\.\d+)?', '#', t)
    return t


def template_lines(events):
    """Counter of masked prompt lines per step number over a day's reflection events."""
    out = {}
    for e in events:
        if e['type'] != 'reflection':
            continue
        p = e['payload']
        names = {p.get('bot'), p.get('proposer'), p.get('target')}
        for s in p['steps']:
            m = _re.search(r'allegiance from "([^"]*)" to', s['prompt'])
            nm = set(names)
            if m:
                nm.add(m.group(1))
            m = _re.search(r'allegiance to ([^\s.,]+)', s['prompt'])
            if m:
                nm.add(m.group(1))
            for line in mask_prompt(s['prompt'], nm).split('\n'):
                line = line.strip()
                if line:
                    out.setdefault(s['step'], collections.Counter())[line] += 1
    return out
