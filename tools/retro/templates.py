"""Are the reflection prompts the same on all three days? Reduces every published prompt to its skeleton.

The pitch, the inlined core, bot names and numbers are replaced by placeholders; what is left are the engine's own
lines. Prints the distinct lines per step and day, and the lines that do not occur on every day.
"""
import collections
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from pwlib import read  # noqa: E402

FIXED = 'You are under no obligation'


def skeleton(prompt, step):
    t = prompt
    if step in (1, 'consider'):
        # opening A: everything between "Their argument:" and the fixed paragraph is the pitch
        t = re.sub(r'(Their argument:).*?(?=' + FIXED + ')', r'\1 <PITCH>\n\n', t, flags=re.S)
    else:
        t = re.sub(r'(---\n).*(\n---)', r'\1<CORE>\2', t, flags=re.S)
    t = re.sub(r'^(.*?) is trying to persuade you to set your allegiance to (.*?)\. Their', r'<BOT> is trying to persuade you to set your allegiance to <BOT>. Their', t, flags=re.M)
    t = re.sub(r'allegiance from ".*?" to (\(independent[^)]*\)|\S+?)\.$', lambda m: 'allegiance from "<BOT>" to ' + ('<INDEPENDENT>' if m.group(1).startswith('(') else '<BOT>') + '.', t, flags=re.M)
    t = re.sub(r'(CHANGE your allegiance to: )(\(independent[^)]*\)|\S+)', lambda m: m.group(1) + ('<INDEPENDENT>' if m.group(2).startswith('(') else '<BOT>'), t)
    t = re.sub(r'Joining \S+ makes', 'Joining <BOT> makes', t)
    t = re.sub(r'\d+(\.\d+)?', '#', t)
    return [line.strip() for line in t.split('\n') if line.strip()]


lines = {}
for day in (1, 2, 3):
    for e in read(day):
        if e['type'] != 'reflection':
            continue
        for s in e['payload']['steps']:
            key = 1 if s['step'] in (1, 'consider') else 2
            c = lines.setdefault((key, day), collections.Counter())
            for line in skeleton(s['prompt'], s['step']):
                c[line] += 1

for step in (1, 2):
    sets = {day: set(lines.get((step, day), {})) for day in (1, 2, 3)}
    everywhere = sets[1] & sets[2] & sets[3]
    print('step', step, 'distinct lines per day', {d: len(s) for d, s in sets.items()}, 'on all three days', len(everywhere))
    for day in (1, 2, 3):
        only = sets[day] - everywhere
        for line in sorted(only):
            print('   day %d only-or-not-everywhere (%d x): %s' % (day, lines[(step, day)][line], line[:160]))
    if step == 1:
        for line in sorted(everywhere):
            print('   ALL DAYS:', line[:150])
