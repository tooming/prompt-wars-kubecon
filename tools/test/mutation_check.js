#!/usr/bin/env node
// Does the harness notice a broken bundle? Each entry below breaks one rule in a COPY of loop/day3_bundle.js (the
// original is never touched), runs the scenarios that should catch it, and checks that the expected assertion fails.
//
//   node tools/test/mutation_check.js <work-dir>        (the mutated copies and JSON results are written to <work-dir>)
'use strict';
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = process.argv[2];
if (!dir) { console.error('usage: node tools/test/mutation_check.js <work-dir>'); process.exit(2); }
fs.mkdirSync(dir, { recursive: true });
const SRC = fs.readFileSync(path.resolve(__dirname, '..', '..', 'loop', 'day3_bundle.js'), 'utf8');
const TEST = path.join(__dirname, 'day3_bundle.test.js');

const mutants = [
  { name: 'never list ignored', from: 'const isNever = n => !!(NEVER[n] || S.perm.never[n]);', to: 'const isNever = n => false;', run: ['4a', '1a'], expect: 'no name from the never list is ever in a TARGETS line' },
  { name: 'helpers are pitched', from: 'if (isNever(n) || isHelper(n) || (r.status', to: 'if (isNever(n) || (r.status', run: ['5c'], expect: 'no helper bot is ever in a TARGETS line' },
  { name: 'saves 26 s inside the edit cooldown', from: 'cooldownMarginMs: 6300,', to: 'cooldownMarginMs: -26000,', run: ['2'], expect: 'at most one save per edit cooldown' },
  { name: 'Golden Hour guards lifted', from: 'goldenBursts: false,', to: 'goldenBursts: true,', run: ['8b'], expect: 'the cut is forced to 40% within 25 s' },
  { name: 'bursts allowed in the last 10 minutes', from: 'if (G.lateNoBurst) return null;', to: '', run: ['8c'], expect: 'no burst: the cut stays at 40%' },
  { name: 'any former member may be pitched again', from: 'if (!day.plainPair[n]) return null;', to: '', run: ['9a'], expect: 'no pitch to a former member whose pair with us was not formed by a plain conversion' },
  { name: 'the 10% pitch no longer says the cut moves', from: "const moves = 'it moves between ' + lo + '% and ' + hi + '% during the day';", to: "const moves = 'the lowest cut allowed';", run: ['2'], expect: 'pitch and tagline are true as stated' },
  { name: 'pitch text keeps the old cut after a switch', from: 'const P2 = plan(snap, dec.to, now, day, { tagline: bot.tagline, switching: true });', to: 'const P2 = plan(snap, R.myCut, now, day, { tagline: bot.tagline, switching: true });', run: ['3'], expect: 'pitch and tagline are true as stated' },
  { name: 'defence heading changed', from: "'DEFENCE (absolute)\\n' +", to: "'DEFENCE\\n' +", run: ['2'], expect: 'every saved core contains the defence section' },
  { name: 'core asks for a whisper', from: "'2. Your second response is one remember call:", to: "'2. Your second response is one whisper to your leader and one remember call:", run: ['2'], expect: 'the core asks the bot for persuade and remember only' },
  { name: 'an exception inside the tick', from: 'const snap = snapshot(rows, bot, now, day, false);', to: "const snap = snapshot(rows, bot, now, day, false); if (snap.direct === 5) throw new Error('boom');", run: ['2'], expect: 'no exception caught inside a tick' },
  { name: 'an exception that escapes the timer', from: 'const beat = () => {', to: "const beat = () => { if (R.okTicks === 40) { R.okTicks++; throw new Error('boom'); }", run: ['2'], expect: 'no uncaught exception' },
  { name: 'the timer stops after 30 ticks and the watchdog is off', from: 'const watchdog = () => {', to: 'const watchdog = () => { if (R.okTicks > 30 && R.timer) { clearInterval(R.timer); R.timer = null; } return;', run: ['2'], expect: 'timer still alive at the end' },
  { name: 'thin-pool rule removed', from: 'if (P.poolNew < CFG.thinPool && free < 2) return null;', to: '', run: ['5a'], expect: 'no burst in 25 minutes' },
  { name: 'burst hard limit removed', from: '|| age > CFG.burstHardMs)) return to(hi', to: '|| false)) return to(hi', run: ['4b'], expect: 'the burst ends by the time limit' },
  { name: 'pitches right up to the freeze', from: 'stopPitchBeforeFreezeS: 150,', to: 'stopPitchBeforeFreezeS: -900,', run: ['8a'], expect: 'no pitch went out in the last 150 s before the freeze' },
  { name: 'a new day is not detected', from: 'if (changed) newDay(id, now);', to: 'if (false) newDay(id, now);', run: ['1a'], expect: 'the new day is detected by itself' },
  { name: 'no backoff after a 422', from: 'R.retryAt = now + back - 1500;', to: 'R.retryAt = 0;', run: ['6a'], expect: 'the retries back off' },
  { name: 'slots full does not raise the cut', from: "if (m - d <= 0) return to(hi, 'slots full');", to: '', run: ['3'], expect: 'the cut goes to 40% within one edit cooldown' },
  { name: 'the core may be 60 characters too long', from: ['if (mk(l.concat([n])).length <= max) l.push(n); else if (l.length >= CFG.callsMax) break;', 'return { core, list: l, fits: core.length <= max };'], to: ['if (mk(l.concat([n])).length <= max + 60) l.push(n); else if (l.length >= CFG.callsMax) break;', 'return { core, list: l, fits: true };'], run: ['2'], expect: 'every saved core is at most 1500 characters' },
  { name: 'a tick every 8 s instead of 20 s', from: 'tickMs: 20000,', to: 'tickMs: 8000,', run: ['3'], expect: 'request count per simulated minute' },
  { name: 'the tagline is not shortened', from: "return s.length <= R.taglineMax ? s : (typeof fallback === 'string' ? fallback : '');", to: "return s + ' The best tree of the day, join it right now.';", run: ['2'], expect: 'every tagline is at most 80 characters' },
  { name: 'an extra endpoint is called', from: "try { const t = await getJSON('/api/trivia'), q = t && t.trivia;", to: "try { await getJSON('/api/bot/insight'); const t = await getJSON('/api/trivia'), q = t && t.trivia;", run: ['2'], expect: 'only the known read endpoints and PATCH /api/bot are ever called' }
];

let bad = 0;
mutants.forEach((m, i) => {
  const from = [].concat(m.from), to = [].concat(m.to); let text = SRC, miss = null;
  from.forEach((f, k) => { const n = text.split(f).length - 1; if (n !== 1) miss = 'the text to change occurs ' + n + ' times in the bundle: ' + f.slice(0, 50); else text = text.replace(f, () => to[k]); });
  if (miss) { console.log('SKIP    ' + m.name + ': ' + miss); bad++; return; }
  const file = path.join(dir, 'mutant_' + i + '.js'), out = path.join(dir, 'mutant_' + i + '.json');
  try { fs.unlinkSync(out); } catch (e) {}
  fs.writeFileSync(file, text);
  const r = spawnSync(process.execPath, [TEST].concat(m.run, ['--json', out]), { env: Object.assign({}, process.env, { PW_BUNDLE: file }), encoding: 'utf8' });
  let res = []; try { res = JSON.parse(fs.readFileSync(out, 'utf8')); } catch (e) {}
  const failed = res.reduce((a, s) => a.concat(s.checks.filter(c => !c.passed).map(c => s.id + ': ' + c.name)), []).concat(res.filter(s => s.error).map(s => s.id + ': HARNESS ERROR ' + s.error.split('\n')[0]));
  const hit = m.expect ? failed.some(f => f.includes(m.expect)) : failed.some(f => f.includes('request count per simulated minute'));
  if (!hit) bad++;
  console.log((hit ? 'CAUGHT' : 'MISSED') + '  ' + m.name + '  [' + m.run.join(',') + ']  ' + (hit ? '' : 'expected a failure of "' + (m.expect || 'request count') + '"; failed instead: ' + (failed.slice(0, 4).join(' | ') || 'nothing') + (r.status === null ? ' (run error: ' + r.error + ')' : '')));
  if (hit && process.argv.includes('--all')) console.log('        also failed: ' + failed.filter(f => !f.includes(m.expect || 'request count')).slice(0, 5).join(' | '));
});
console.log('\n' + mutants.length + ' mutants, ' + (mutants.length - bad) + ' caught, ' + bad + ' missed or skipped');
process.exit(bad ? 1 : 0);
