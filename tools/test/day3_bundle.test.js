#!/usr/bin/env node
// Offline tests for loop/day3_bundle.js (the unattended day-3 operator loop).
//
//   node tools/test/day3_bundle.test.js                 run everything
//   node tools/test/day3_bundle.test.js 4b 8a           run the scenarios whose id starts with one of these
//   node tools/test/day3_bundle.test.js --log 4b        also print the loop's own log and every save of that scenario
//   node tools/test/day3_bundle.test.js --json out.json write the results as JSON too
//
// No dependencies and no network: the bundle is evaluated in a fake browser (lib/fakebrowser.js: virtual clock, timers,
// Date, window) against a fake game server (lib/fakegame.js) built from the recorded day-2 data. The recorded data
// is read from PW_DATA_1900 / PW_DATA_2035 (defaults: the scratchpad paths in lib/harness.js); PW_BUNDLE overrides
// the bundle file. The bundle is never edited. Exit code 1 when any assertion fails.
//
// Scenario ids: 1a-10g are the ten scenarios that were asked for, with variants (kind "core"); 0 and 11a-24b are other
// things an unattended day can meet (kind "extra"); 20 rests on server behaviour nobody has observed (kind "assumed").
// Every scenario ends with the same common assertions (lib/harness.js, commonChecks): no exception, timer alive, core
// at most 1500 with the defence section, pitch at most 500, tagline at most 80, nobody from the never list or a helper
// in TARGETS, one save per edit cooldown, request rate, and what the simulated bot actually sent.
// tools/test/mutation_check.js breaks the bundle in 23 ways (in copies) and checks that these tests notice each one.
'use strict';
const fs = require('fs');
const H = require('./lib/harness');
const { mkSim, commonChecks, Results, asserter, parsed, greedyOf, hhmmss, HELPERS3, ME, Game } = H;

const MIN = 60000;
const argv = process.argv.slice(2);
const flag = n => argv.includes(n);
const jsonOut = argv.includes('--json') ? argv[argv.indexOf('--json') + 1] : null;
const only = argv.filter((a, i) => !a.startsWith('--') && argv[i - 1] !== '--json');
const SHOW_LOG = flag('--log');

const scenarios = [];
// kind: 'core' = the ten scenarios asked for (with their variants), 'extra' = other things an unattended day can meet,
// 'assumed' = behaviour of the server that was never observed (reported apart, never counted as a failure of the bundle)
let KIND = 'core';
const scenario = (id, title, fn) => scenarios.push({ id, title, fn, kind: KIND });

// ------------------------------------------------------------------ building blocks
const helperTimes = { leosharkpark: 20, dapper_grafana: 75, rowdy_baseline: 130 };       // seconds after the open: ticks 1, 2 and 3
function helpersJoin(g, at) { const t = at || helperTimes; for (const n of Object.keys(t)) { g.moveCost[n] = 80; g.atOpenPlus(t[n], x => x.join(n, { self: true })); } }
function acceptFirst(g, n) { let k = 0; g.policy = () => (k < n ? (k++, 'accept') : 'reject'); }
const neverOf = sim => { const c = sim.pw().cfg; return new Set([].concat(c.neverPatch3, c.neverPatch9, c.neverBase)); };
const pickable = (sim, n, avoid) => { const g = sim.game, nv = neverOf(sim), av = new Set(avoid || []); return [...g.rows.keys()].filter(x => x !== ME && !nv.has(x) && !HELPERS3.includes(x) && !g.pitchedToday.has(x) && g.rootOf(x) !== ME && !av.has(x) && !g.rows.get(x).is_house).sort().slice(0, n); };
const acceptedCutChanges = (sim, greedy, from, to) => sim.game.patches.filter(p => p.status === 200 && greedyOf(p) === greedy && p.cutBefore !== p.cutAfter && p.sent >= (from || 0) && p.sent <= (to == null ? Infinity : to));
const listedBetween = (sim, name, from, to) => sim.game.patches.filter(p => p.sent >= from && p.sent <= to && parsed(p).targets.includes(name));
const nonHelperMembers = g => g.joins.filter(j => !HELPERS3.includes(j.name) && g.rows.get(j.name).allegiance === ME).map(j => j.name);
const secs = ms => Math.round(ms / 100) / 10 + ' s';

// Everybody outside our tree sits in three big trees whose leaders take 10%: nobody gains by joining us. `payers`
// are put under a leader who takes `payerCut`: they, and only they, gain by joining us at 10%.
function thinForest(sim, payers, payerCut) {
  const g = sim.game, roots = ['LEDGER', 'zesty_coldstart', 'QUORUM_KEEPER'], payerLeader = 'Cut10', fillers = ['Sage_Oakes', 'olive_quorum', 'gilded_cilium', 'noble_pager'];
  let i = 0;
  for (const r of g.rows.values()) { const n = r.name; if (n === ME || g.rootOf(n) === ME || roots.includes(n) || n === payerLeader) continue; r.allegiance = roots[i++ % 3]; }
  for (const n of roots) { g.rows.get(n).allegiance = ''; g.cuts[n] = 10; }
  g.rows.get(payerLeader).allegiance = ''; g.cuts[payerLeader] = payerCut == null ? 25 : payerCut;
  for (const n of fillers.concat(payers || [])) g.rows.get(n).allegiance = payerLeader;
  return payerLeader;
}
// The recorded day-2 forest with its recorded cuts; trees smaller than five are hung under LEDGER, so nobody
// gains 4.5 a tick by joining us at 40% (no "new arrival" is queued) while many gain something at 10%.
function richForest(sim) {
  const g = sim.game; g.applyRecordedForest();
  for (const r of g.rows.values()) { const n = r.name; if (n === ME || n === 'LEDGER' || g.rootOf(n) === ME) continue; if (!r.allegiance && g.treeCount(n) < 5) r.allegiance = 'LEDGER'; }
}
// A day that has reached "8 of 8 at 40%" through the loop's own opening, with a forest for everybody else.
async function midday(o, forest) {
  const sim = mkSim(o || {}), g = sim.game;
  helpersJoin(g); acceptFirst(g, 5);
  g.atOpenPlus(600, () => forest(sim));
  await sim.untilOpen(14 * 60 + 30);
  return sim;
}
function preconditions(A, sim, what) {
  const st = sim.status();
  return A.ok(st.cut === 40 && st.direct === '8/8' && st.firstFull === true, 'precondition: ' + (what || 'the loop itself reached 8 of 8 members at 40%'), JSON.stringify({ cut: st.cut, direct: st.direct, firstFull: st.firstFull, log: st.log.slice(-3) }));
}

// ------------------------------------------------------------------ 1. frozen -> new day
scenario('1a', 'paste while day 2 is frozen, then roll over into day 3: coins 500, empty tree, unknown twist', async A => {
  const sim = mkSim({ pasteBeforeMin: 30, game: { twist: 'thursday-fog', rules: r => { r.econ.streak_tax_pct = 3; r.econ.twist_rule = 'Leaders pay <b>3%</b> of their streak bonus.'; r.costs.pledge = 5; r.costs.spy = 2; r.limits.name_max = 24; } } });
  const g = sim.game, o = sim.openAt, T = sim.schedOpen, pasteT = sim.pastes[0].t;
  A.ok(/^pw3 day3-bundle-2 loaded/.test(sim.pastes[0].result), 'the paste answers "pw3 day3-bundle-2 loaded"', sim.pastes[0].result);
  sim.pw().never('sage_bode');                                    // learned by hand before the day changes
  await sim.run(1000);
  A.ok(g.patches.length === 0, 'nothing is saved at paste time', g.patches.length + ' saves');
  const st = JSON.parse(await sim.manual(() => sim.pw().cycle()));
  A.ok(st.armed === true && st.phase === 'frozen' && st.signedIn === true && st.bot === ME && st.lastError === '', 'cycle() after the paste: armed, signed in as sullen_nyquist, phase frozen, no error', JSON.stringify({ armed: st.armed, phase: st.phase, signedIn: st.signedIn, bot: st.bot, lastError: st.lastError }));
  A.ok(/will be saved 170 s before the open/.test(st.openingCore) && st.timeSource === 'day_window.next_open_at' && Math.abs(st.nextOpenInMin - 30) < 0.3, 'cycle() shows the open time from /api/world and the pending opening core', JSON.stringify({ openingCore: st.openingCore, timeSource: st.timeSource, nextOpenInMin: st.nextOpenInMin }));
  const prev = await sim.manual(() => sim.pw().preview());
  A.ok(/cut 10%, greedy 0/.test(prev) && /EXPIRES: tick 8/.test(prev) && g.patches.length === 0, 'preview() prints the opening core and saves nothing', prev.slice(0, 120));
  await sim.until(T - 5 * MIN);
  const idle = g.requests.filter(r => !r.manual && r.t > pasteT + 8000 && r.t < T - 5 * MIN);
  A.ok(idle.every(r => r.url === '/api/world') && idle.length >= 22 && idle.length <= 26, 'while frozen it reads only /api/world, about once a minute', idle.length + ' requests in 25 minutes: ' + [...new Set(idle.map(r => r.url))].join(', '));
  await sim.until(T - 175000);
  A.ok(g.patches.length === 0, 'no save earlier than 175 s before the announced open', g.patches.map(p => hhmmss(p.sent)).join(', '));
  await sim.until(o - 500);
  const fast = g.requests.filter(r => !r.manual && r.url === '/api/world' && r.t >= T - 4 * MIN && r.t < T);
  A.ok(fast.length >= 11 && fast.length <= 13, 'in the last four minutes it reads /api/world every 20 s', fast.length + ' reads');
  const pre = g.patches.slice();
  A.ok(pre.length === 1 && pre[0].status === 200 && pre[0].sent >= T - 172000 && pre[0].sent <= T - 140000, 'exactly one save before the open, about 170 s before the announced time', pre.map(p => hhmmss(p.sent) + ' HTTP ' + p.status).join(', '));
  const c = pre.length ? parsed(pre[0]) : { targets: [], pitch: '' };
  A.ok(pre.length && greedyOf(pre[0]) === 0 && g.me.cut_pct === 10, 'the opening core sets greedy 0: the bot is at 10% before the open', 'greedy ' + (pre[0] && greedyOf(pre[0])) + ', cut ' + g.me.cut_pct);
  A.ok(/^The arithmetic line shows what you would earn with me: my cut is 10% right now; it moves between 10% and 40% during the day\./.test(c.pitch || '') && !/earn \d|adds \d|up to \d|\d\.\d/.test(c.pitch || ''), 'the opening pitch says the cut is 10% right now and moves between 10% and 40%, and carries no figure that depends on a rule value (the day\'s values are not served before the open)', c.pitch);
  A.ok(c.targets.length >= 3 && c.targets.length <= 5 && c.calls === 3 && c.exp === 8, 'opening core: three to five targets, CALLS: 3, EXPIRES: tick 8', c.targets.join(', ') + ' / CALLS ' + c.calls + ' / EXPIRES ' + c.exp);
  A.ok(!c.targets.includes('sage_bode'), 'a bot added with __pw3.never() is not in the opening core', c.targets.join(', '));
  A.ok(sim.status().openingCore === 'saved', 'status now reports the opening core as saved', sim.status().openingCore);

  await sim.untilOpen(25);
  const pw = sim.pw();
  A.ok(pw.rt.live === true && pw.S.day.openedAt === g.openedIso && pw.S.day.dayNo === 3, 'the loop is live on day 3 within 25 s of the open, with nobody touching it', JSON.stringify({ live: pw.rt.live, openedAt: pw.S.day.openedAt, dayNo: pw.S.day.dayNo }));
  A.ok(sim.logHas(/NEW DAY 3 /), 'the new day is detected by itself ("NEW DAY 3" in the log)', sim.log.slice(-6).join('\n'));
  A.ok(sim.logHas(/RULES changed.*twist: "tuesday" -> "thursday-fog"/) && sim.logHas(/RULES changed.*econ\.streak_tax_pct: undefined -> 3/), 'the unknown twist and the new rule values are logged and the loop carries on', sim.logGrep(/RULES/).join('\n'));
  A.ok(!!pw.S.perm.never.sage_bode, 'never-pitch names learned before the open survive the new day', Object.keys(pw.S.perm.never).join());
  A.ok(Object.keys(pw.S.day.plainPair).length === 0 && Object.keys(pw.S.day.everMine).length === 0 && Object.keys(pw.S.day.recruited).length === 0, 'the per-day state is empty: day-2 joins still in the feeds are not counted', 'plainPair ' + Object.keys(pw.S.day.plainPair).join() + ' everMine ' + Object.keys(pw.S.day.everMine).join());
  const st2 = sim.status();
  A.ok(st2.direct === '0/8' && st2.tree === 1 && st2.twist === 'thursday-fog' && st2.day === 3 && st2.cut === 10 && st2.coins <= 500, 'status after the open: day 3, the new twist, 0 of 8 members, tree of one, at most 500 coins, cut 10%', JSON.stringify({ direct: st2.direct, tree: st2.tree, twist: st2.twist, day: st2.day, cut: st2.cut, coins: st2.coins }));
  const w0 = g.wakes[0];
  A.ok(w0 && w0.tick === 1 && w0.sent.length === 3 && w0.cut === 10, "the bot's first wake of the day (tick 1) sends three pitches at 10% from the opening core", JSON.stringify(w0));

  await sim.untilOpen(20 * 60);
  const live = sim.accepted().filter(p => p.sent > o);
  A.ok(live.length >= 6, 'the loop keeps saving fresh target lists through the first 20 minutes', live.length + ' accepted saves after the open');
  const expired = g.wakes.filter(w => /expired/.test(w.idle));
  A.ok(expired.length === 0, 'no wake found the saved list past its EXPIRES tick while the loop was healthy', expired.map(w => hhmmss(w.t) + ' ' + w.idle).join(', '));
  A.ok(g.wakes.filter(w => w.sent.length).length >= 8, 'the bot pitched on (nearly) every wake of the opening', g.wakes.map(w => w.sent.length).join(','));
  A.ok(sim.logGrep(/reservation is released/).length === 3, 'helpers that never join lose their reserved slot after 15 minutes', sim.logGrep(/HELPER/).join('\n'));
  await commonChecks(sim, A, { extraNever: ['sage_bode'] });
  return sim;
});

scenario('1b', 'a day-2 loop (window.__ap2) is still in the tab at paste time', async A => {
  const sim = mkSim({ noPaste: true, pasteBeforeMin: 8 });
  const g = sim.game, clock = sim.clock, w = sim.win;
  let ap2Beats = 0;
  const ap2 = { enabled: true, dry: false, policyOn: true, never: { otter_telemetry: 1, 'bad name!': 1, LEDGER: 1 }, helpers: ['curious_namespace'], lastPatch: clock.now - 30000, pending: null };
  ap2.timer = w.setInterval(() => { if (ap2.enabled) ap2Beats++; }, 20000); ap2.trivTimer = w.setInterval(() => { if (ap2.enabled) ap2Beats++; }, 45000);
  const ids = [ap2.timer, ap2.trivTimer]; w.__ap2 = ap2;
  sim.paste();
  A.ok(ap2.enabled === false && ap2.dry === true && ap2.policyOn === false && ap2.timer === null && ap2.trivTimer === null && !clock.has(ids[0]) && !clock.has(ids[1]), 'the day-2 loop is switched off and its timers are cleared', JSON.stringify({ enabled: ap2.enabled, dry: ap2.dry, timer: ap2.timer }));
  const pw = sim.pw();
  A.ok(pw.S.perm.never.otter_telemetry && !pw.S.perm.never['bad name!'] && pw.S.perm.helpers.curious_namespace === 1, 'its learned never-pitch names and helper names are taken over', JSON.stringify(pw.S.perm));
  ap2.enabled = true; ap2.dry = false;                                   // somebody (or an old timeout) switches it back on
  await sim.run(40000);
  A.ok(ap2.enabled === false && ap2.dry === true, 'a day-2 loop that is switched on again is switched off by the watchdog', JSON.stringify({ enabled: ap2.enabled, dry: ap2.dry }));
  helpersJoin(g); acceptFirst(g, 3);
  g.atOpenPlus(200, x => x.join('curious_namespace', { self: true }));
  await sim.untilOpen(12 * 60);
  A.ok(ap2Beats === 0, 'the day-2 loop never ran again', ap2Beats + ' beats');
  A.ok(sim.accepted().length >= 3, 'the bundle itself runs the day', sim.accepted().length + ' saves');
  await commonChecks(sim, A, { extraNever: ['otter_telemetry'], extraHelpers: ['curious_namespace'] });
  return sim;
});

scenario('1c', 'the frozen world serves no next_open_at: the built-in day-3 schedule is used', async A => {
  const sim = mkSim({ pasteBeforeMin: 10, game: { noNextOpen: true } });
  const g = sim.game, T = sim.schedOpen;
  const st = JSON.parse(await sim.manual(() => sim.pw().cycle()));
  A.ok(st.timeSource === 'CONFIG fallback' && Math.abs(st.nextOpenInMin - 10) < 0.3 && st.armed === true, 'cycle(): armed, open time from the CONFIG fallback', JSON.stringify({ timeSource: st.timeSource, nextOpenInMin: st.nextOpenInMin, armed: st.armed }));
  helpersJoin(g); acceptFirst(g, 5);
  await sim.until(sim.openAt - 500);
  A.ok(g.patches.length === 1 && g.patches[0].status === 200 && Math.abs(g.patches[0].sent - (T - 170000)) < 25000, 'the opening core is saved about 170 s before 15:00 UTC', g.patches.map(p => hhmmss(p.sent)).join(', '));
  await sim.untilOpen(10 * 60);
  A.ok(sim.logHas(/NEW DAY 3 /) && sim.status().direct === '8/8', 'the day starts and fills the slots as usual', sim.status().direct);
  await commonChecks(sim, A);
  return sim;
});

scenario('1d', 'the day opens 10 minutes before the announced time and the bot was left at 40% with an empty list', async A => {
  const evening = 'You are sullen_nyquist. One goal: end the day with the most coins.\n\n' + H.DEFENCE + '\n\nEVERY WAKE: remember "IDLE".\nTARGETS: ';
  const sim = mkSim({ pasteBeforeMin: 30, openOffsetMs: -10 * MIN, game: { botStart: { core: evening, greedy: 100, tagline: 'Full x2.00 tree bonus from your first tick: you keep 12.8 coins a tick.' } } });
  const g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(10 * 60);
  const pw = sim.pw(), firstLive = g.requests.find(r => r.url === '/api/bot' && r.t > o && !r.manual);
  A.ok(firstLive && firstLive.t - o <= 62000, 'the loop notices the early open within a minute (it was polling once a minute)', firstLive ? secs(firstLive.t - o) : 'never');
  const down = acceptedCutChanges(sim, 0, o)[0];
  A.ok(down && down.sent - o <= 65000, 'it takes the bot from 40% to 10% for the opening by itself', down ? secs(down.sent - o) + ' after the open' : 'no such save');
  A.ok(g.patches.filter(p => p.sent < o).length === 0, 'no opening core was saved (the open came before its time)', '');
  A.ok(sim.status().direct === '8/8' && pw.S.day.firstFull, 'the opening still fills the eight slots', sim.status().direct);
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 2. the opening
scenario('2', 'the opening: tree of 1, helpers join by themselves at ticks 1 to 3, first joins', async A => {
  const sim = mkSim({});
  const g = sim.game, o = sim.openAt;
  helpersJoin(g);
  let k = 0; g.policy = () => (k++ % 2 === 0 ? 'accept' : 'reject');
  await sim.untilOpen(19);
  const s0 = sim.status();
  A.ok(s0.tree === 1 && s0.direct === '0/8' && s0.helpersWaiting.length === 3, 'first live tick: tree of one, 0 of 8, three helpers awaited', JSON.stringify({ tree: s0.tree, direct: s0.direct, waiting: s0.helpersWaiting }));
  await sim.untilOpen(200);
  const hj = g.joins.filter(j => HELPERS3.includes(j.name));
  A.ok(hj.length === 3 && hj.map(j => j.tick).join() === '1,2,3' && hj.every(j => j.self), 'scenario: the three helpers joined by themselves at ticks 1, 2 and 3', hj.map(j => j.name + '@' + j.tick).join(', '));
  A.ok(sim.status().helpersWaiting.length === 0, 'no helper is awaited once all three are members', sim.status().helpersWaiting.join());
  A.ok(sim.logGrep(/RECRUIT \S+ \(conversion, joined by itself\)/).length === 3, 'the loop logs the helpers as "joined by itself"', sim.logGrep(/RECRUIT/).join('\n'));
  await sim.untilOpen(12 * 60);
  const pw = sim.pw(), joinAt = {}; g.joins.forEach(j => { joinAt[j.name] = j.t; });
  const lowOpen = g.patches.filter(p => p.status === 200 && p.sent > o && greedyOf(p) === 0);
  const tooMany = lowOpen.filter(p => { const direct = g.joins.filter(j => j.t <= p.sent - 25000).length, waiting = HELPERS3.filter(h => !(joinAt[h] <= p.sent)).length; return parsed(p).targets.length > Math.max(0, 8 - direct - waiting) + 3; });
  A.ok(tooMany.length === 0, 'no list is longer than the free slots (minus one per awaited helper) plus the slack of three', tooMany.map(p => hhmmss(p.sent) + ' ' + parsed(p).targets.length + ' names').join(', '));
  const first = g.patches.find(p => p.status === 200 && p.sent > o);
  A.ok(first && first.sent - o <= 25000 && first.direct === 0 && /With me you earn 9\.2 at once/.test(parsed(first).pitch), 'the first save after the open comes within 25 s and still pitches a tree of one (earn 9.2 at once)', first ? hhmmss(first.sent) + ' ' + parsed(first).pitch.slice(0, 90) : 'none');
  const staticPitch = Game.parseCore(H.STATIC_CORE).pitch, alone = g.pitches.filter(x => x.T < 4);
  // the first wake still plays the hand-saved core, which the opening save leaves in place; every later pitch to a small tree is the loop's cold-start text
  A.ok(g.pitches.length >= 6 && alone.length >= 3 && alone.every(x => x.text === staticPitch || /^Alone, base income is 8 a tick/.test(x.text)) && g.wakes[0].sent.length === 3 && g.pitches.slice(0, 3).every(x => x.text === staticPitch && x.cut === 10), 'while the tree is small the bot sends the hand-saved core\'s pitch (first wake, at 10%) or the loop\'s cold-start pitch', alone.length + ' of ' + g.pitches.length + ' pitches below a tree of four; first: ' + (g.pitches[0] || {}).text);
  const fullPitch = g.pitches.filter(x => x.cut === 10 && /in a tree paying the full x2\.00/.test(x.text));
  A.ok(fullPitch.length >= 1 && fullPitch.every(x => /cut is 10% right now: at this cut you keep 15\.2/.test(x.text) && /moves between 10% and 40%/.test(x.text)), 'once the tree pays the full bonus the 10% pitch says so: keep 15.2 now, the cut moves between 10% and 40%', (fullPitch[0] || {}).text);
  A.ok(pw.S.day.n.recruits === g.joins.length && pw.S.day.n.bounties === g.joins.reduce((a, j) => a + j.bounty, 0) && pw.S.day.n.fees === g.joins.reduce((a, j) => a + j.fee, 0), 'the loop counted every join, fee and bounty', JSON.stringify(pw.S.day.n) + ' vs ' + g.joins.length + ' joins');
  A.ok(g.joins.length === 8 && g.joins.every(j => j.bounty === 150) && sim.status().direct === '8/8', 'eight first joins, each paying the first-pair bounty once', g.joins.map(j => j.name + ':' + j.bounty).join(', '));
  const expired = g.wakes.filter(w => /expired/.test(w.idle));
  A.ok(expired.length === 0, 'no wake found the list expired', expired.map(w => hhmmss(w.t)).join());
  A.ok(g.fullRefusals.filter(x => x.self).length === 0, 'no helper found the slots full', g.fullRefusals.map(x => x.name).join());
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 3. slots full -> 40%
scenario('3', 'slots full at 10% -> the cut switches to 40%', async A => {
  const sim = mkSim({});
  const g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(18 * 60);
  const pw = sim.pw();
  const full = g.joins.length >= 8 ? g.joins[7].t : null;
  A.ok(full != null, 'scenario: the eighth member joined', g.joins.length + ' joins');
  const ups = acceptedCutChanges(sim, 100, o), up = ups[0];
  A.ok(up && full != null && up.sent >= full && up.sent - full <= 150000, 'the cut goes to 40% within one edit cooldown (150 s) of the eighth join, not before it', up ? secs(up.sent - full) + ' after the eighth join' : 'no save with greedy 100');
  A.ok(up && up.cutAfter === 40 && up.direct === 8, 'that save sets greedy 100 (40%) with 8 of 8 members', up ? JSON.stringify({ cutAfter: up.cutAfter, direct: up.direct }) : '');
  const c = up ? parsed(up) : { pitch: '', targets: [] };
  A.ok(/^You keep 12\.8 coins a tick with me: sullen_nyquist takes 40%, in a tree paying the full x2\.00\./.test(c.pitch), 'the 40% pitch names 40% and 12.8 a tick', c.pitch);
  A.ok(up && up.body.tagline === 'Full x2.00 tree bonus from your first tick: you keep 12.8 coins a tick.', 'the tagline changes with it', up && up.body.tagline);
  A.ok(c.targets.length === 0 && c.calls === null && c.exp === null, 'with all slots full nobody is listed (a full leader pays 15 coins per refused pitch)', c.targets.join());
  A.ok(sim.logHas(/CUT 10% -> 40% \(slots full\)/) && pw.S.day.firstFull === true && sim.status().mode === 'harvest', 'log and state: "CUT 10% -> 40% (slots full)", mode harvest', sim.logGrep(/CUT/).join('\n'));
  A.ok(up && Object.keys(g.cutShare(up.t + 1, sim.clock.now)).join() === '40' && acceptedCutChanges(sim, 0, o).length === 0, 'the cut then stays at 40% while the slots stay full', JSON.stringify(g.cutShare(o, sim.clock.now)));
  const after = up ? g.patches.filter(p => p.sent > up.sent) : [];
  A.ok(after.length <= 1, 'no needless saves while nothing changes', after.length + ' saves after the switch');
  const latePitch = up ? g.pitches.filter(x => x.t > up.t + 140000) : [];
  A.ok(latePitch.length === 0, 'the full bot sends no more pitches', latePitch.length + ' pitches');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 4. two members leave -> burst -> back on time
function burstScenario(id, title, policyAfter, expectEnd) {
  scenario(id, title, async A => {
    const sim = await midday({}, richForest), g = sim.game;
    preconditions(A, sim);
    const st0 = sim.status();
    A.ok(st0.newQueued === 0 && st0.neverPitchedPool >= 5, 'precondition: no new arrival is queued at 40% and several never-pitched bots would gain at 10%', JSON.stringify({ newQueued: st0.newQueued, neverPitchedPool: st0.neverPitchedPool }));
    const mem = nonHelperMembers(g), leavers = mem.slice(0, 2), leaveAt = sim.t(15 * 60);
    g.policy = policyAfter(sim);
    g.at(leaveAt, x => { x.leave(leavers[0], 'LEDGER'); x.leave(leavers[1], 'LEDGER'); });
    await sim.until(leaveAt + 20 * MIN);
    const down = acceptedCutChanges(sim, 0, leaveAt)[0];
    A.ok(down && down.sent - leaveAt <= 45000, 'a refill burst starts (cut to 10%) within 45 s of the two members leaving', down ? secs(down.sent - leaveAt) : 'no burst');
    if (!down) { await commonChecks(sim, A); return sim; }
    const c = parsed(down);
    A.ok(/cut is 10% right now: at this cut you keep 15\.2 coins a tick in a tree paying the full x2\.00\. The cut moves between 10% and 40% during the day; at 40% you keep 12\.8\./.test(c.pitch), 'the burst pitch is the true 10% text (10% right now, moves between 10% and 40%)', c.pitch);
    A.ok(c.targets.length >= 3 && c.calls === 3, 'the burst lists at least three targets', c.targets.join(', '));
    A.ok(sim.logHas(/CUT 40% -> 10% \(2 slots free, 0 new arrivals queued/), 'the log gives the reason: 2 slots free, 0 new arrivals queued', sim.logGrep(/CUT/).join('\n'));
    const leaverListed = leavers.filter(n => listedBetween(sim, n, leaveAt, sim.clock.now).length);
    A.ok(leaverListed.length === 0, 'the two leavers (member-less, under another leader) are not pitched again', leaverListed.join());
    const up = acceptedCutChanges(sim, 100, down.sent)[0], len = up ? up.sent - down.sent : null;
    A.ok(up && len <= 12 * MIN + 150000, 'the burst ends by the time limit: back at 40% no later than 12 minutes (plus one edit cooldown) after it began', up ? 'lasted ' + secs(len) : 'still at 10% after ' + secs(sim.clock.now - down.sent));
    if (up) A.ok(len >= expectEnd.min && len <= expectEnd.max, expectEnd.what, 'lasted ' + secs(len) + '; log: ' + sim.logGrep(/CUT 10% -> 40%/).slice(-1)[0]);
    // what happens next, for the report: time at each cut in the 40 minutes after the first burst began
    await sim.until(down.sent + 40 * MIN);
    const share = g.cutShare(down.sent, down.sent + 40 * MIN), bursts = acceptedCutChanges(sim, 0, leaveAt).length;
    A.note('40 minutes from the first burst: ' + Math.round((share[10] || 0) / MIN * 10) / 10 + ' min at 10%, ' + Math.round((share[40] || 0) / MIN * 10) / 10 + ' min at 40%, ' + bursts + ' bursts, members now ' + g.directOf(ME).length + '/8; reasons: ' + sim.logGrep(/CUT /).slice(-6).map(l => l.replace(/^\S+ \S+ /, '').replace(/, direct.*$/, '')).join(' | '));
    A.ok(g.wakes.filter(w => /expired/.test(w.idle)).length === 0, 'no wake found the list expired', '');
    await commonChecks(sim, A);
    return sim;
  });
}
burstScenario('4a', 'two members leave, no new arrivals, several never-pitched bots -> burst; every target refuses quickly', () => () => 'reject',
  { min: 8 * MIN - 5000, max: 12 * MIN + 150000, what: 'with refusals only, the burst runs at least the 8 minute window and at most 12 minutes' });
burstScenario('4b', 'the same, but no target ever answers: the 12 minute hard limit ends the burst', () => () => 'silent',
  { min: 12 * MIN - 5000, max: 12 * MIN + 150000, what: 'with pitches always pending the burst ends at the 12 minute hard limit' });
burstScenario('4c', 'the same, and one target joins: with one slot left the burst ends at the 8 minute limit', sim => { let k = 0; return () => (k++ === 0 ? 'accept' : 'silent'); },
  { min: 8 * MIN - 5000, max: 8 * MIN + 150000, what: 'with one slot still free the burst ends at the 8 minute soft limit' });

// ------------------------------------------------------------------ 5. thin pool
scenario('5a', 'thin pool: three never-pitched bots would gain, one slot free -> no burst', async A => {
  let payers;
  const sim = await midday({}, s => { payers = pickable(s, 3); thinForest(s, payers, 25); }), g = sim.game;
  preconditions(A, sim);
  const leaveAt = sim.t(15 * 60), leaver = nonHelperMembers(g)[0];
  g.policy = () => 'accept';
  g.at(leaveAt, x => x.leave(leaver, 'LEDGER'));
  await sim.until(leaveAt + 60000);
  const st = sim.status();
  A.ok(st.direct === '7/8' && st.neverPitchedPool === 3 && st.newQueued === 0, 'precondition: 7 of 8, exactly three never-pitched bots that gain at 10%, nobody queued at 40%', JSON.stringify({ direct: st.direct, pool: st.neverPitchedPool, newQueued: st.newQueued }));
  await sim.until(leaveAt + 25 * MIN);
  const downs = acceptedCutChanges(sim, 0, leaveAt);
  A.ok(downs.length === 0 && Object.keys(g.cutShare(leaveAt, sim.clock.now)).join() === '40', 'no burst in 25 minutes: the cut stays at 40% and the single slot waits for a new arrival', downs.map(p => hhmmss(p.sent)).join() + ' ' + JSON.stringify(g.cutShare(leaveAt, sim.clock.now)));
  A.ok(g.pitches.filter(x => x.t > leaveAt).length === 0, 'nobody is pitched meanwhile', g.pitches.filter(x => x.t > leaveAt).map(x => x.to).join());
  // then a new bot arrives: it gains 4.8 a tick at 40% and is pitched without a cut drop
  g.addBot('fresh_arrival_1');
  await sim.run(6 * MIN);
  A.ok(g.joins.some(j => j.name === 'fresh_arrival_1' && j.cut === 40) && acceptedCutChanges(sim, 0, leaveAt).length === 0, 'a new arrival is then pitched and joins at 40%, still without a burst', g.joins.map(j => j.name + '@' + j.cut).slice(-2).join(', '));
  await commonChecks(sim, A);
  return sim;
});
scenario('5b', 'control for 5a: eight never-pitched bots would gain -> the single free slot does start a burst', async A => {
  let payers;
  const sim = await midday({}, s => { payers = pickable(s, 8); thinForest(s, payers, 25); }), g = sim.game;
  preconditions(A, sim);
  const leaveAt = sim.t(15 * 60), leaver = nonHelperMembers(g)[0];
  g.policy = () => 'silent';
  g.at(leaveAt, x => x.leave(leaver, 'LEDGER'));
  await sim.until(leaveAt + 20 * MIN);
  const down = acceptedCutChanges(sim, 0, leaveAt)[0];
  A.ok(down && down.sent - leaveAt <= 60000, 'with a pool of eight the same single free slot starts a burst (so 5a is the thin-pool rule at work)', down ? secs(down.sent - leaveAt) : 'no burst; ' + JSON.stringify(sim.status().neverPitchedPool));
  const listed = down ? parsed(down).targets : [];
  A.ok(listed.length > 0 && listed.every(n => payers.includes(n)), 'only the bots that gain are listed', listed.join(', '));
  const up = down && acceptedCutChanges(sim, 100, down.sent)[0];
  A.ok(up && up.sent - down.sent <= 12 * MIN + 150000, 'and the burst ends on time', up ? secs(up.sent - down.sent) : 'still at 10%');
  await commonChecks(sim, A);
  return sim;
});

scenario('5c', 'thin pool, one member gone and a helper bot that fell out of the tree: the helper is not pitched, a slot waits for it, and it comes back by itself', async A => {
  const sim = await midday({}, s => thinForest(s, [], 25)), g = sim.game;
  preconditions(A, sim);
  const outAt = sim.t(15 * 60), leaver = nonHelperMembers(g)[0];
  g.at(outAt, x => { x.leave('dapper_grafana', ''); x.leave(leaver, 'LEDGER'); });
  g.at(outAt + 9 * MIN, x => x.join('dapper_grafana', { self: true }));
  await sim.until(outAt + 8 * MIN);
  const st = sim.status();
  A.ok(st.direct === '6/8' && st.helpersWaiting.join() === 'dapper_grafana' && st.cut === 40, 'the loop shows 6 of 8, the helper awaited, cut 40%', JSON.stringify({ direct: st.direct, waiting: st.helpersWaiting, cut: st.cut }));
  A.ok(listedBetween(sim, 'dapper_grafana', outAt, sim.clock.now).length === 0 && g.pitches.filter(x => x.t > outAt).length === 0, 'the independent helper (it would gain 4.8 a tick at 40%) is not listed or pitched', '');
  await sim.until(outAt + 14 * MIN);
  const back = g.joins.find(j => j.name === 'dapper_grafana' && j.t > outAt);
  A.ok(back && back.self && back.bounty === 0 && sim.status().direct === '7/8', 'it rejoins by itself, paying the fee only', back ? JSON.stringify({ fee: back.fee, bounty: back.bounty }) : 'not back');
  A.ok(acceptedCutChanges(sim, 0, outAt).length === 0, 'no burst was started for its slot', '');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 6. HTTP 422 for ten minutes
function check422(A, sim, from, to, maxTries) {
  const g = sim.game, tries = g.patches.filter(p => p.sent >= from - 1000 && p.t < to), n422 = tries.filter(p => p.status === 422);
  A.ok(n422.length >= 3, 'scenario: saves were answered 422 during the ten minutes', n422.length + ' x 422');
  A.ok(sim.accepted().filter(p => p.t >= from && p.t < to).length === 0, 'scenario: no save was accepted during the ten minutes', '');
  A.ok(n422.length <= maxTries, 'the retries back off: at most ' + maxTries + ' attempts in ten minutes', n422.length + ' attempts at ' + n422.map(p => hhmmss(p.sent)).join(' '));
  let minGap = Infinity; for (let i = 1; i < tries.length; i++) minGap = Math.min(minGap, tries[i].sent - tries[i - 1].sent);
  A.ok(minGap >= 18000, 'never two save attempts less than 18 s apart', 'smallest gap ' + secs(minGap));
  const firstOk = sim.accepted().find(p => p.t >= to);
  A.ok(firstOk && firstOk.t - to <= 125000, 'the first save after the 422 streak is accepted within about two minutes', firstOk ? secs(firstOk.t - to) + ' after the streak ended' : 'no accepted save afterwards');
  A.ok(sim.pw().S.day.n.s422 + (sim.pre422 || 0) >= n422.length - 1 && sim.logHas(/HTTP 422 \(content check/), 'the 422 answers are counted and logged', 'counted ' + sim.pw().S.day.n.s422 + ', sent ' + n422.length);
  return firstOk;
}
scenario('6a', 'every save answered 422 for 10 minutes during the opening, then accepted', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt, from = o + 30000, to = from + 10 * MIN;
  helpersJoin(g); g.policy = () => 'reject';
  g.patchMode = rec => (rec.t >= from && rec.t < to) ? '422' : 'ok';
  await sim.until(to + 8 * MIN);
  const firstOk = check422(A, sim, from, to, 12);
  const during = g.wakes.filter(w => w.t >= from && w.t < to);
  A.ok(during.some(w => /expired/.test(w.idle)), 'meanwhile the stale list expired and the bot idled (the EXPIRES dead-man worked)', during.map(w => w.idle || w.sent.length).join(','));
  const after = firstOk ? g.wakes.filter(w => w.t > firstOk.t) : [];
  A.ok(after.length >= 2 && after.every(w => w.sent.length > 0), 'after the streak the bot pitches again on every wake', after.map(w => w.sent.length || w.idle).join(','));
  const dupNames = {}; g.pitches.forEach(x => { dupNames[x.to] = (dupNames[x.to] || 0) + 1; });
  A.note('cost of the streak: ' + Object.values(dupNames).filter(n => n > 1).reduce((a, n) => a + n - 1, 0) + ' repeated pitches (same names pitched again while the list could not be replaced), each 15 coins');
  await commonChecks(sim, A);
  return sim;
});
scenario('6b', 'the same 10 minutes of 422 while the switch to 40% is due', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt, from = o + 3 * MIN, to = from + 10 * MIN;
  helpersJoin(g); acceptFirst(g, 5);
  g.patchMode = rec => (rec.t >= from && rec.t < to) ? '422' : 'ok';
  await sim.until(to + 8 * MIN);
  check422(A, sim, from, to, 12);
  const full = g.joins.length >= 8 ? g.joins[7].t : null, up = acceptedCutChanges(sim, 100, o)[0];
  A.ok(full != null && full < to, 'scenario: the slots filled during the streak', full ? hhmmss(full) : 'never');
  A.ok(up && up.t >= to && up.t - to <= 125000, 'the switch to 40% lands within about two minutes of the first accepted save', up ? secs(up.t - to) + ' after the streak ended' : 'never');
  A.ok(up && /takes 40%/.test(parsed(up).pitch) && up.cutAfter === 40, 'cut and pitch text change together in that save', up && parsed(up).pitch.slice(0, 80));
  await commonChecks(sim, A);
  return sim;
});
scenario('6c', 'the same 10 minutes of 422 across the opening-core save and the open itself', async A => {
  const sim = mkSim({}), g = sim.game, T = sim.schedOpen, from = T - 200000, to = from + 10 * MIN;
  helpersJoin(g); g.policy = () => 'reject';
  g.patchMode = rec => (rec.t >= from && rec.t < to) ? '422' : 'ok';
  await sim.until(sim.openAt - 500);
  sim.pre422 = g.patches.filter(p => p.status === 422).length;
  A.ok(sim.pre422 >= 2 && sim.accepted().length === 0, 'the opening core is retried before the open and never accepted', sim.pre422 + ' attempts');
  await sim.untilOpen(25);
  A.ok(sim.pw().rt.live === true && sim.logHas(/NEW DAY 3 /), 'the loop still goes live at the open', sim.log.slice(-4).join('\n'));
  await sim.until(to + 8 * MIN);
  check422(A, sim, from, to, 13);
  A.ok(g.wakes[0] && g.wakes[0].sent.length === 3 && g.wakes[0].cut === 10, 'meanwhile the bot played the hand-saved static core at 10% (three pitches on its first wake)', JSON.stringify(g.wakes[0]));
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 7. the network fails for five minutes
function outage(id, title, kind, o2) {
  scenario(id, title, async A => {
    o2 = o2 || {};
    const sim = mkSim({}), g = sim.game, o = sim.openAt, from = o + 60000, to = from + (o2.minutes || 5) * MIN;
    helpersJoin(g); g.policy = () => 'reject';
    const hit = rec => rec.t >= from && rec.t < to && (!o2.only || o2.only.test(rec.url));
    if (kind === 'signedout') g.signedOut = rec => rec.t >= from && rec.t < to; else g.fault = rec => hit(rec) ? kind : null;
    await sim.until(from + 30000);
    const stMid = sim.status();
    await sim.until(to - 1000);
    const pw = sim.pw();
    const inWin = g.requests.filter(r => r.t >= from && r.t < to);
    if (!o2.only && kind !== 'signedout') A.ok(inWin.length > 0 && inWin.every(r => r.status !== 200), 'scenario: every request failed during the five minutes', inWin.length + ' requests, statuses ' + [...new Set(inWin.map(r => r.status))].join());
    if (!o2.only) A.ok(g.patches.filter(p => p.sent >= from && p.sent < to).length === 0, 'no save is attempted while the reads fail', g.patches.filter(p => p.sent >= from && p.sent < to).length + ' attempts');
    const perMin = inWin.length / ((to - from) / MIN);
    if (!o2.only) A.ok(perMin <= 14, 'the loop does not hammer a failing server (no faster than its normal rate)', Math.round(perMin * 10) / 10 + ' requests a minute during the outage');
    A.ok(sim.logHas(o2.logRe || /ERR \/api\/world/), 'the failure is in the log', sim.log.slice(-5).join('\n'));
    if (kind === 'signedout') A.ok(stMid.signedIn === false && stMid.armed === false && sim.logHas(/NOT SIGNED IN/), 'status shows signedIn false / armed false and the log says NOT SIGNED IN', JSON.stringify({ signedIn: stMid.signedIn, armed: stMid.armed }));
    await sim.until(to + 7 * MIN);
    const firstGood = g.requests.find(r => r.t >= to && r.url === '/api/bot/feed?limit=80' && r.status === 200);
    A.ok(firstGood && firstGood.t - to <= (kind === 'hang' ? 40000 : 22000), 'the loop is reading again within one tick of the network coming back', firstGood ? secs(firstGood.t - to) : 'never');
    const firstOk = sim.accepted().find(p => p.t >= to);
    A.ok(firstOk && firstOk.t - to <= 150000, 'a fresh list is saved within 150 s', firstOk ? secs(firstOk.t - to) : 'none');
    const after = firstOk ? g.wakes.filter(w => w.t > firstOk.t + 1000) : [];
    A.ok(after.length >= 2 && after.every(w => w.sent.length > 0), 'and the bot pitches again on every wake', after.map(w => w.sent.length || w.idle).join(','));
    A.ok(sim.status().armed === true, 'cycle()/status reports armed again', JSON.stringify({ armed: sim.status().armed, signedIn: sim.status().signedIn }));
    A.note('watchdog restarts ' + pw.rt.wdRestarts + '; wakes during the outage: ' + g.wakes.filter(w => w.t >= from && w.t < to).map(w => w.idle ? 'idle (' + w.idle + ')' : w.sent.join('+')).join(' | '));
    if (o2.extra) o2.extra(A, sim, from, to);
    await commonChecks(sim, A);
    return sim;
  });
}
outage('7a', 'every fetch fails (network error) for 5 minutes during the opening', 'fail');
outage('7b', 'every fetch hangs for 5 minutes (no answer; the 15 s timeout has to abort it)', 'hang');
outage('7c', 'every request answers HTTP 503 with an HTML page for 5 minutes', { status: 503, text: '<html><body>Service Unavailable</body></html>' });
outage('7d', 'the session is lost for 5 minutes (/api/bot answers 401)', 'signedout', { logRe: /ERR \/api\/bot: HTTP 401/ });
outage('7e', 'only the own feed (/api/bot/feed) fails, for 8 minutes', { status: 502, text: 'Bad Gateway' }, {
  only: /^\/api\/bot\/feed/, minutes: 8, logRe: /ERR \/api\/bot\/feed/,
  extra: (A, sim, from, to) => {
    const g = sim.game, tops = new Set(sim.accepted().filter(p => p.t >= from && p.t < to).map(p => parsed(p).targets.slice(0, 3).join())), cnt = {};
    g.pitches.filter(x => x.t >= from && x.t < to + 140000).forEach(x => { cnt[x.to] = (cnt[x.to] || 0) + 1; });
    A.ok(tops.size >= 2, 'without the feed the list still moves on (names listed for a whole wake count as pitched)', tops.size + ' different top-three lists: ' + [...tops].join(' | '));
    A.ok(Math.max(0, ...Object.values(cnt)) <= 3, 'no bot is pitched more than three times while the feed is blind', JSON.stringify(cnt));
  }
});

// ------------------------------------------------------------------ 8. the run-up to the Golden Hour
scenario('8a', 'the 30 minutes before the Golden Hour: refill window with former members, no burst in the last 10 minutes, 40% through the hour, quiet before the freeze', async A => {
  const sim = await midday({ goldenMin: 80, freezeMin: 140 }, s => thinForest(s, [], 25)), g = sim.game;
  preconditions(A, sim);
  const G = sim.schedGolden, F = sim.schedFreeze, X = nonHelperMembers(g);
  g.policy = n => (n === X[0] || n === 'fresh_arrival_1') ? 'accept' : /^fresh_arrival_/.test(n) ? 'silent' : 'reject';
  g.at(G - 40 * MIN, x => { x.leave(X[0], 'Cut10'); x.leave(X[1], 'Cut10'); });
  g.at(G - 9 * MIN, x => x.leave(X[2], 'Cut10'));
  g.at(G + 10 * MIN, x => x.addBot('fresh_arrival_1'));
  g.at(G + 25 * MIN, x => x.leave(X[3], 'Cut10'));
  for (let i = 2; i <= 9; i++) g.at(F - (8 - 0.75 * (i - 2)) * MIN, x => x.addBot('fresh_arrival_' + i));       // eight more, the last one 2 min 45 s before the freeze
  await sim.until(G - 28 * MIN - 2000);
  A.ok(acceptedCutChanges(sim, 0, G - 40 * MIN).length === 0 && g.cutAt(sim.clock.now) === 40, 'before the window: two slots free, pool dry -> no burst, the cut stays 40%', sim.logGrep(/CUT/).slice(-2).join('\n'));
  A.ok([X[0], X[1]].every(n => listedBetween(sim, n, G - 40 * MIN, sim.clock.now).length === 0), 'before the window the two leavers (plain pairs, now under another leader) are not pitched', '');
  A.ok(sim.status().preGolden === false && sim.status().timeSource === 'day_window.golden_in_s', 'status: not yet in the pre-golden window; times come from day_window.golden_in_s', JSON.stringify({ pre: sim.status().preGolden, src: sim.status().timeSource, goldenInMin: sim.status().goldenInMin }));
  await sim.until(G - 10 * MIN);
  const down = acceptedCutChanges(sim, 0, G - 28 * MIN - 2000)[0];
  A.ok(down && down.sent >= G - 28 * MIN && down.sent - (G - 28 * MIN) <= 45000, 'the refill window opens 28 minutes before the Golden Hour: cut to 10% within 45 s', down ? hhmmss(down.sent) + ' = golden -' + Math.round((G - down.sent) / 6000) / 10 + ' min' : 'no burst in the window');
  const names = down ? parsed(down).targets : [];
  A.ok(names.length === 2 && names.includes(X[0]) && names.includes(X[1]), 'it lists exactly the two former members (fee only, their pair is a plain conversion)', names.join(', '));
  const back = g.joins.find(j => j.name === X[0] && j.t > G - 28 * MIN);
  A.ok(back && back.bounty === 0 && back.fee > 0, 'the returning member pays its fee and no second first-pair bounty', back ? JSON.stringify({ fee: back.fee, bounty: back.bounty }) : 'did not return');
  const up = down && acceptedCutChanges(sim, 100, down.sent)[0];
  A.ok(up && up.sent < G - 10 * MIN && sim.logHas(/CUT 10% -> 40% \(nobody left to pitch before the golden hour\)/), 'with nobody left to pitch the cut is back at 40% before the last 10 minutes', up ? hhmmss(up.sent) : 'still 10% at golden -10 min');
  await sim.until(F - 5000);
  const lateDown = acceptedCutChanges(sim, 0, G - 10 * MIN);
  A.ok(lateDown.length === 0, 'no burst starts in the last 10 minutes before the Golden Hour or inside it, although slots are free', lateDown.map(p => hhmmss(p.sent)).join());
  const share = g.cutShare(G - 5 * MIN + 25000, F);
  A.ok(Object.keys(share).join() === '40', 'the cut is 40% from 5 minutes before the Golden Hour to the freeze', JSON.stringify(share));
  A.ok(g.directOf(ME).length < 8, 'scenario: slots were free in that time', g.directOf(ME).length + '/8');
  const gp = g.pitches.filter(x => x.phase === 'golden');
  A.ok(gp.some(x => x.to === 'fresh_arrival_1') && gp.every(x => x.cut === 40 && /takes 40%/.test(x.text)), 'inside the hour a new arrival is pitched at 40%', gp.map(x => x.to + '@' + x.cut).join(', '));
  A.ok(gp.every(x => !/repays the fee/.test(x.text)), 'the Golden Hour pitch does not promise that the gain repays the (tripled) fee', (gp[0] || {}).text);
  A.ok(g.joins.some(j => j.name === 'fresh_arrival_1' && j.phase === 'golden' && j.cut === 40), 'and it joins at 40%', '');
  const lateWakes = g.wakes.filter(w => w.t > F - 10 * MIN && w.t <= F - 150000), lastWakes = g.wakes.filter(w => w.t > F - 150000 && w.t < g.freezeAt);
  A.ok(lateWakes.some(w => w.sent.some(n => /^fresh_arrival_/.test(n))), 'new arrivals are still pitched 10 to 2.5 minutes before the freeze', lateWakes.map(w => hhmmss(w.t) + ':' + (w.sent.join('+') || w.idle)).join(' | '));
  A.ok(lastWakes.length >= 1 && lastWakes.every(w => w.sent.length === 0), 'but the wake inside the last 150 s sends nothing, although candidates are waiting', lastWakes.map(w => hhmmss(w.t) + ':' + (w.sent.join('+') || w.idle)).join(' | '));
  await sim.until(F + 12 * MIN);
  const lastCore = Game.parseCore(g.me.core), freezeTick = 1 + Math.floor((g.freezeAt - g.openAt) / 60000);
  A.ok(lastCore.targets.length === 0 || lastCore.exp <= freezeTick - 3, 'the core left on the bot at the freeze lists nobody (or expired at least three ticks before it)', 'TARGETS ' + lastCore.targets.join() + ' EXPIRES ' + lastCore.exp + ', freeze tick ' + freezeTick);
  A.ok(g.patches.filter(p => p.sent > g.freezeAt + 1000).length === 0, 'nothing is saved after the freeze', g.patches.filter(p => p.sent > g.freezeAt).map(p => hhmmss(p.sent)).join());
  const post = g.requests.filter(r => r.t > g.freezeAt + 90000);
  A.ok(post.every(r => r.url === '/api/world') && post.length <= 12, 'after the freeze the loop idles on /api/world, about once a minute', post.length + ' requests: ' + [...new Set(post.map(r => r.url))].join());
  A.ok(sim.logHas(/world is now "frozen": the loop idles/), 'the log notes the freeze', sim.log.slice(-3).join('\n'));
  await commonChecks(sim, A);
  return sim;
});
scenario('8b', 'a burst still running 5 minutes before the Golden Hour is forced back to 40%; nothing at 10% inside the hour', async A => {
  const sim = await midday({ goldenMin: 80, freezeMin: 140, game: { goldenInS: 'zero' } }, richForest), g = sim.game;
  preconditions(A, sim);
  const G = sim.schedGolden, F = sim.schedFreeze, X = nonHelperMembers(g);
  g.policy = () => 'silent';
  g.at(G - 31 * MIN, x => { x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
  g.at(G + 5 * MIN, x => x.leave(X[2], 'LEDGER'));
  g.at(G + 20 * MIN, x => { x.leave(X[3], 'LEDGER'); x.leave(X[4], 'LEDGER'); x.leave('rowdy_baseline', 'LEDGER'); });
  await sim.until(G - 6 * MIN);
  A.ok(g.cutAt(sim.clock.now) === 10, 'precondition: a refill burst is still running 6 minutes before the Golden Hour (inside the window it has no time limit)', 'cut ' + g.cutAt(sim.clock.now) + '; ' + sim.logGrep(/CUT/).slice(-3).join(' | '));
  const started = acceptedCutChanges(sim, 0, G - 31 * MIN)[0];
  A.ok(started && (G - 6 * MIN) - started.sent > 12 * MIN + 150000, 'inside the window the burst is not cut short by the 12 minute limit', started ? 'running for ' + secs(G - 6 * MIN - started.sent) : '');
  await sim.until(G + 60000);
  const forced = acceptedCutChanges(sim, 100, G - 6 * MIN)[0];
  A.ok(forced && forced.sent >= G - 5 * MIN && forced.sent - (G - 5 * MIN) <= 25000, 'the cut is forced to 40% within 25 s of "5 minutes before the Golden Hour"', forced ? hhmmss(forced.sent) + ' = golden -' + Math.round((G - forced.sent) / 600) / 100 + ' min' : 'not forced');
  A.ok(sim.logHas(/CUT 10% -> 40% \(golden hour: hold 40%\)/), 'the log gives the reason', sim.logGrep(/CUT/).slice(-2).join('\n'));
  const guard = sim.accepted().filter(p => p.t > G - 5 * MIN - 126000 && p.t < G - 5 * MIN);
  A.ok(guard.length === 0, 'no list save used up the edit cooldown in the two minutes before the forced switch', guard.map(p => hhmmss(p.t)).join());
  await sim.until(F + 3 * MIN);
  const share = g.cutShare(G - 5 * MIN + 25000, F), lateDown = acceptedCutChanges(sim, 0, G - 10 * MIN);
  A.ok(Object.keys(share).join() === '40' && lateDown.length === 0, 'nothing at 10% from then to the freeze, even with 2 of 8 members left', JSON.stringify(share) + ' ' + lateDown.map(p => hhmmss(p.sent)).join());
  A.ok(g.directOf(ME).length === 2, 'scenario: only two members were left inside the hour', g.directOf(ME).length + '/8');
  await commonChecks(sim, A);
  return sim;
});

scenario('8c', 'two members leave 9 minutes before the Golden Hour while many bots would gain at 10%: no burst may start', async A => {
  const sim = await midday({ goldenMin: 80, freezeMin: 140 }, richForest), g = sim.game;
  const G = sim.schedGolden, F = sim.schedFreeze;
  preconditions(A, sim);
  await sim.until(G - 9 * MIN - 5000);
  A.ok(g.cutAt(sim.clock.now) === 40 && g.directOf(ME).length === 8 && sim.status().neverPitchedPool >= 5, 'precondition: 8 of 8 at 40% ten minutes before the Golden Hour, pool not dry', JSON.stringify({ cut: g.cutAt(sim.clock.now), direct: g.directOf(ME).length, pool: sim.status().neverPitchedPool }));
  const X = nonHelperMembers(g); g.policy = () => 'silent';
  g.leave(X[0], 'LEDGER'); g.leave(X[1], 'LEDGER');
  await sim.until(F + 2 * MIN);
  const downs = g.patches.filter(p => p.sent > G - 9 * MIN - 5000 && greedyOf(p) === 0);
  A.ok(downs.length === 0 && Object.keys(g.cutShare(G - 9 * MIN, F)).join() === '40', 'no burst: the cut stays at 40% from then to the freeze with two slots free', downs.map(p => hhmmss(p.sent)).join() + ' ' + JSON.stringify(g.cutShare(G - 9 * MIN, F)));
  A.ok(sim.status().noBurst === true || sim.status().phase === 'frozen', 'status showed noBurst', '');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 9. former members that carry members
function returnerSetup(o) {
  // A (sage_bode) and C (otter_telemetry) join by a plain conversion; B (glum_replicaset) arrives with a member, by schism.
  const sim = mkSim(Object.assign({ goldenMin: 80, freezeMin: 140 }, o || {})), g = sim.game;
  const who = { A: 'sage_bode', C: 'otter_telemetry', B: 'glum_replicaset', b1: 'wily_backlog' };
  helpersJoin(g);
  g.policy = n => (n === 'curious_namespace' ? 'reject' : 'accept');
  g.atOpenPlus(60, x => x.setAllegiance(who.b1, who.B));
  g.atOpenPlus(600, () => {
    who.payers = pickable(sim, 6, Object.values(who)); who.a = pickable(sim, 2, Object.values(who).concat(who.payers));
    thinForest(sim, who.payers, 25);
    g.policy = n => (n === who.A || n === who.C || n === who.B) ? 'accept' : 'reject';
  });
  g.atOpenPlus(900, x => { x.leave(who.A, 'Cut10'); x.leave(who.C, 'Cut10'); x.leave(who.B, 'Cut10'); });
  g.atOpenPlus(930, x => { x.setAllegiance(who.a[0], who.A); x.setAllegiance(who.a[1], who.A); x.cuts[who.A] = 10; x.cuts[who.B] = 10; });
  sim.who = who;
  return sim;
}
function returnerChecks(A, sim, from, label) {
  const g = sim.game, who = sim.who, G = sim.schedGolden, pw = sim.pw();
  const bListed = listedBetween(sim, who.B, from, Infinity), bPitched = g.pitches.filter(x => x.to === who.B && x.t > sim.t(900));
  A.ok(bListed.length === 0 && bPitched.length === 0, label + 'the former member that came by schism (no plain-conversion record) is never listed or pitched again, though it carries a member and would gain', bListed.map(p => hhmmss(p.sent)).join() + ' / pitched ' + bPitched.length);
  const aListed = listedBetween(sim, who.A, from, G - 28 * MIN), aBack = g.joins.find(j => j.name === who.A && j.t > sim.t(900));
  A.ok(aListed.length >= 1, label + 'the former member with a plain-conversion record that now leads two members is listed again', 'listed in ' + aListed.length + ' saves');
  A.ok(aBack && aBack.type === 'schism' && aBack.bounty === 0 && aBack.fee === 140, label + 'it returns with its members and pays the fee only (40 + 2 x 50), no second bounty', aBack ? JSON.stringify({ type: aBack.type, fee: aBack.fee, bounty: aBack.bounty }) : 'did not return');
  const cEarly = listedBetween(sim, who.C, from, G - 28 * MIN - 1000);
  A.ok(cEarly.length === 0, label + 'a member-less former member under another leader is not pitched before the pre-golden window', cEarly.map(p => hhmmss(p.sent)).join());
  const cLate = listedBetween(sim, who.C, G - 28 * MIN, G), cBack = g.joins.find(j => j.name === who.C && j.t > G - 28 * MIN);
  A.ok(cLate.length >= 1 && cBack && cBack.bounty === 0, label + 'inside the window it is pitched and returns for the fee only', 'listed ' + cLate.length + ', returned ' + JSON.stringify(cBack && { fee: cBack.fee, bounty: cBack.bounty }));
  A.ok(pw.S.day.plainPair[who.A] && pw.S.day.plainPair[who.C] && !pw.S.day.plainPair[who.B] && pw.S.day.everMine[who.B], label + 'loop state: A and C are plain pairs, B is an ever-member without one', JSON.stringify({ A: pw.S.day.plainPair[who.A], C: pw.S.day.plainPair[who.C], B: pw.S.day.plainPair[who.B], everB: pw.S.day.everMine[who.B] }));
}
scenario('9a', 'former members that carry members, with and without a plain-conversion record (loop running since the open)', async A => {
  const sim = returnerSetup(), g = sim.game, who = sim.who;
  await sim.untilOpen(880);
  const jb = g.joins.find(j => j.name === who.B), ja = g.joins.find(j => j.name === who.A), jc = g.joins.find(j => j.name === who.C);
  A.ok(jb && jb.type === 'schism' && jb.bounty === 150 && ja && ja.type === 'conversion' && jc && jc.type === 'conversion' && g.directOf(ME).length === 8, 'scenario: A and C joined by conversion, B by schism with one member; 8 of 8', JSON.stringify({ A: ja && ja.type, C: jc && jc.type, B: jb && jb.type, direct: g.directOf(ME).length }));
  await sim.until(sim.schedGolden + 2 * MIN);
  A.ok(sim.logHas(new RegExp('LEFT: ' + who.B + ' \\(not a plain pair: never pitched again today\\)')), 'the log marks B as "not a plain pair: never pitched again today"', sim.logGrep(/LEFT/).join('\n'));
  returnerChecks(A, sim, sim.t(900), '');
  await commonChecks(sim, A);
  return sim;
});
scenario('9b', 'the same history, but the tab is reloaded and the bundle pasted again at +20 min (empty localStorage): pairs are rebuilt from the public feed', async A => {
  const sim = returnerSetup(), g = sim.game, who = sim.who, clock = sim.clock;
  await sim.untilOpen(20 * 60);
  for (const [id, t] of [...clock.timers]) if (t.tag === 'pageI' || t.tag === 'pageT') clock.clear(id);       // the reload kills the page and its timers
  for (const k of Object.keys(sim.storage)) delete sim.storage[k];
  sim.newWindow(); await sim.run(45000);                                                   // 45 s with no loop at all
  const before = g.patches.length; sim.paste();
  await sim.run(1500);
  A.ok(sim.logHas(/joining day 3 in progress/), 'the new paste notices that the day is running', sim.log.slice(-4).join('\n'));
  const pw = sim.pw();
  A.ok(pw.S.day.pairsOk === true && pw.S.day.plainPair[who.A] && pw.S.day.plainPair[who.C] && !pw.S.day.plainPair[who.B] && pw.S.day.everMine[who.B], 'today\'s members and plain pairs are rebuilt from the public feed before anything is listed', JSON.stringify({ pairsOk: pw.S.day.pairsOk, A: pw.S.day.plainPair[who.A], B: pw.S.day.plainPair[who.B], everB: pw.S.day.everMine[who.B] }));
  await sim.until(sim.schedGolden + 2 * MIN);
  returnerChecks(A, sim, sim.t(900), 'after the re-paste: ');
  A.ok(g.patches.length > before, 'the re-pasted loop saves again', (g.patches.length - before) + ' saves');
  const early = g.patches.filter(p => p.status === 429);
  A.ok(early.length <= 1 && (!early.length || sim.logHas(/HTTP 429 \(edit cooldown\), next try in \d+ s/)), 'the fresh paste does not know when the old page last saved: at most one save is answered 429, and the loop waits as told', early.map(p => hhmmss(p.sent) + ' (' + secs(p.sinceAccept) + ' after the last accepted save)').join());
  const share = g.cutShare(sim.pastes[1].t, sim.t(30 * 60));
  A.note('re-pasted 20 min after the open with 6 of 8 members and nobody left to pitch: ' + Math.round((share[10] || 0) / 6000) / 10 + ' min at 10% before the 30-minute opening rule let it return to 40% (' + sim.logGrep(/opening ends after/).join('') + ')');
  await commonChecks(sim, A, { expect429: 1 });
  return sim;
});
scenario('9c', 'the same, re-pasted after a reload with the stored state still in localStorage (4 minute gap)', async A => {
  const sim = returnerSetup(), g = sim.game, who = sim.who, clock = sim.clock;
  await sim.untilOpen(20 * 60);
  for (const [id, t] of [...clock.timers]) if (t.tag === 'pageI' || t.tag === 'pageT') clock.clear(id);
  A.ok(Object.keys(sim.storage).length === 1, 'the loop had written its state to localStorage', Object.keys(sim.storage).join());
  sim.newWindow(); await sim.run(4 * MIN);
  sim.paste(); await sim.run(1500);
  A.ok(sim.logHas(/state restored from this browser/), 'the paste restores the stored state', sim.log.slice(-4).join('\n'));
  await sim.until(sim.schedGolden + 2 * MIN);
  returnerChecks(A, sim, sim.t(900), 'after the restore: ');
  await commonChecks(sim, A);
  return sim;
});

// A bot that arrives with a member (schism: the engine records no pair) leaves again a few seconds later, while it is
// still on the saved list. The loop takes it off its plan at once; whether the bot pitches it again depends on the
// corrected list reaching the server before the bot's next wake.
function staleList(id, title, with422) {
  scenario(id, title, async A => {
    const sim = mkSim({}), g = sim.game, o = sim.openAt, B = 'glum_replicaset', b1 = 'wily_backlog';
    helpersJoin(g);
    g.policy = n => (n === 'curious_namespace' ? 'reject' : 'accept');
    g.atOpenPlus(60, x => x.setAllegiance(b1, B));
    let leftAt = null, hit = null;
    const join0 = g.join.bind(g);
    g.join = (name, opt) => { const ok = join0(name, opt); if (ok && name === B && leftAt === null) { leftAt = g.clock.now + 8000; g.at(leftAt, x => x.leave(B, '')); } return ok; };
    if (with422) g.patchMode = rec => (leftAt !== null && rec.t >= leftAt && hit === null) ? (hit = rec.t, '422') : 'ok';
    await sim.untilOpen(12 * 60);
    const first = g.joins.find(j => j.name === B);
    A.ok(first && first.type === 'schism' && first.bounty === 150 && leftAt !== null && g.leaves.some(l => l.name === B), 'scenario: ' + B + ' joined with its member (schism, bounty 150) and left 8 s later', JSON.stringify(first));
    if (with422) A.ok(hit !== null && hit - leftAt < 30000, 'scenario: the first save after it left (the one that takes it off the list) was answered 422 once', hit === null ? 'no save was refused' : secs(hit - leftAt) + ' after it left');
    A.ok(sim.logHas(new RegExp('LEFT: ' + B + ' \\(not a plain pair: never pitched again today\\)')), 'the loop notices at once and marks it "never pitched again today"', sim.logGrep(/LEFT/).join(' | '));
    const lateList = g.patches.filter(p => p.status === 200 && p.t > leftAt + 25000 && parsed(p).targets.includes(B));
    A.ok(lateList.length === 0, 'no list saved after that names it', lateList.map(p => hhmmss(p.sent)).join());
    const again = g.pitches.filter(x => x.to === B && x.t > leftAt), wake = again.length ? g.wakes.find(w => w.t === again[0].t) : null, back = g.joins.filter(j => j.name === B)[1];
    A.ok(again.length === 0, 'the bot does not pitch it again', again.length ? 'pitched again at ' + hhmmss(again[0].t) + ' from the list saved before it left (TARGETS ' + wake.targets.join(', ') + ' / EXPIRES ' + wake.exp + '); ' + (back ? 'it rejoined at ' + hhmmss(back.t) + ' paying fee ' + back.fee + ' and bounty ' + back.bounty + ' again; loop log: ' + sim.logGrep(/NOTE: /).join(' | ') : 'it did not rejoin') : '');
    await commonChecks(sim, A);
    return sim;
  });
}
staleList('9d', 'a bot that came by schism leaves 8 s later; the corrected list is saved before the next wake', false);
staleList('9e', 'the same, but the save of the corrected list is answered 422 once (one retry, 20 s later)', true);

// ------------------------------------------------------------------ 10. changed and missing rule values
scenario('10a', 'max_direct_members is 6 and econ.tree_bonus_max is missing', async A => {
  const sim = mkSim({ game: { rules: r => { r.econ.max_direct_members = 6; delete r.econ.tree_bonus_max; r.econ.tree_limit_rule = 'A leader can have at most <b>6 direct members</b>.'; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 6);
  await sim.untilOpen(15 * 60);
  const st = sim.status();
  A.ok(st.rules.maxDirect === 6 && st.rules.bonusMax === 1, 'the loop reads 6 slots and falls back to the day-2 bonus cap for the missing field', JSON.stringify(st.rules));
  A.ok(sim.logHas(/RULES changed.*econ\.max_direct_members: 8 -> 6/) && sim.logHas(/econ\.tree_bonus_max: 100 -> undefined/), 'both changes are logged', sim.logGrep(/RULES/).join('\n'));
  const full = g.joins.length >= 6 ? g.joins[5].t : null, up = acceptedCutChanges(sim, 100, o)[0];
  A.ok(full != null && st.direct === '6/6', 'six members fill the slots', st.direct);
  A.ok(up && up.direct === 6 && up.sent - full <= 150000, 'the cut goes to 40% when the six slots are full', up ? secs(up.sent - full) + ' after the sixth join' : 'no switch; log: ' + sim.log.slice(-3).join(' | '));
  const tooMany = g.patches.filter(p => p.sent > o && parsed(p).targets.length > Math.max(0, 6 - g.joins.filter(j => j.t <= p.sent - 25000).length) + 3);
  A.ok(tooMany.length === 0, 'lists are sized for six slots', tooMany.map(p => hhmmss(p.sent) + ' ' + parsed(p).targets.length).join());
  A.ok(g.fullRefusals.length <= 3, 'at most one wake of pitches hits the full tree', g.fullRefusals.length + ' refused');
  await commonChecks(sim, A);
  return sim;
});
scenario('10b', 'changed numbers: base 10, bonus 20% up to 60%, edit cooldown 180 s, tagline_max 60, persuade 30', async A => {
  const sim = mkSim({ game: { rules: r => { r.econ.base_income = 10; r.econ.tree_bonus_pct = 20; r.econ.tree_bonus_max = 60; r.limits.edit_cooldown_s = 180; r.limits.tagline_max = 60; r.costs.persuade = 30; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(20 * 60);
  const st = sim.status(), live = g.patches.filter(p => p.sent > o);
  A.ok(st.rules.base === 10 && st.rules.bonus === 0.2 && st.rules.bonusMax === 0.6 && st.rules.cooldownS === 180 && st.rules.persuade === 30, 'the loop works with the served numbers', JSON.stringify(st.rules));
  const first = live.find(p => p.status === 200);
  A.ok(first && /^Alone, base income is 10 a tick\. With me you earn 1[135] at once: my cut is 10% right now; it moves between 10% and 40% during the day\. Each bot that joins after you adds 2 more, up to 15\.0 at a 10% cut\./.test(parsed(first).pitch), 'the cold-start pitch is written from the new numbers (base 10, +2 a bot, up to 15.0)', first && parsed(first).pitch);
  const up = acceptedCutChanges(sim, 100, o)[0];
  A.ok(up && /^You keep 12\.0 coins a tick with me: sullen_nyquist takes 40%, in a tree paying the full x1\.60\./.test(parsed(up).pitch), 'so is the 40% pitch (12.0 a tick, x1.60)', up && parsed(up).pitch);
  const acc = sim.accepted().filter(p => p.t > o); let minGap = Infinity; for (let i = 1; i < acc.length; i++) minGap = Math.min(minGap, acc[i].t - acc[i - 1].t);
  A.ok(minGap >= 180000, 'accepted saves are at least the served 180 s apart', 'smallest gap ' + secs(minGap));
  A.ok(live.length >= 3 && live.every(p => p.body.tagline.length <= 60), 'taglines fit the served 60 characters', live.map(p => p.body.tagline.length).join(' '));
  await commonChecks(sim, A);
  return sim;
});
scenario('10g', 'tick_seconds is 30 instead of 60', async A => {
  const sim = mkSim({ game: { rules: r => { r.tick_seconds = 30; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); g.policy = () => 'reject';
  await sim.untilOpen(25 * 60);
  const live = sim.accepted().filter(p => p.t > o + 60000 && parsed(p).targets.length);
  A.ok(live.length >= 6 && live.every(p => parsed(p).exp - p.tick >= 11 && parsed(p).exp - p.tick <= 13), 'EXPIRES is still about six minutes ahead: twelve of the shorter ticks', live.map(p => parsed(p).exp - p.tick).join());
  const expired = g.wakes.filter(w => w.t > o + 5 * MIN && /expired/.test(w.idle));
  A.ok(expired.length === 0, 'no wake finds the list expired once the loop writes the lists itself', expired.map(w => hhmmss(w.t) + ' ' + w.idle).join());
  A.note('the opening core is written before the open with EXPIRES: tick 8, which is four minutes at 30 s a tick; wakes that found it expired: ' + g.wakes.filter(w => w.t <= o + 5 * MIN && /expired/.test(w.idle)).length);
  await commonChecks(sim, A);
  return sim;
});
scenario('10f', 'limits.core_max is lowered to 1400', async A => {
  const sim = mkSim({ game: { rules: r => { r.limits.core_max = 1400; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(20 * 60);
  const live = g.patches.filter(p => p.sent > o);
  A.ok(sim.logHas(/RULES changed.*limits\.core_max: 1500 -> 1400/), 'the change is logged', sim.logGrep(/RULES/).join('\n'));
  A.ok(live.every(p => p.body.core.length <= 1400), 'nothing longer than 1400 characters is sent', live.map(p => p.body.core.length).join());
  A.ok(live.filter(p => p.status === 200).length >= 3, 'the loop still saves cores (a shorter text) and keeps the bot working under the smaller limit', live.length + ' saves after the open; log: ' + sim.logGrep(/does not fit/).slice(0, 1).join(''));
  A.ok(g.pitches.filter(x => x.t > o + 9 * 60000).length > 0 || g.directOf(ME).length === 8, 'the bot is still recruiting (or full) ten minutes into the day', g.directOf(ME).length + '/8 members, last pitch at ' + (g.pitches.length ? hhmmss(g.pitches[g.pitches.length - 1].t) : 'never') + ', wakes: ' + g.wakes.slice(-4).map(w => w.idle || w.sent.length).join(' | '));
  const t = sim.pw()._test, need = c => (t.headFor(t.pitchFor(c[0], c[1], false)) + '\nTARGETS: ').length;
  A.note('core length with an empty TARGETS line: ' + need([1, 10]) + ' (10%, tree of one), ' + need([9, 10]) + ' (10%, full tree), ' + need([9, 40]) + ' (40%); three average names plus CALLS and EXPIRES need about 60 more');
  await commonChecks(sim, A);
  return sim;
});
scenario('10c', 'the whole econ and limits blocks are missing from /api/world (so no slot limit is served, as on day 1)', async A => {
  const sim = mkSim({ game: { rules: r => { delete r.econ; delete r.limits; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 9);
  g.atOpenPlus(600, () => richForest(sim));
  await sim.untilOpen(120 * 60);
  const st = sim.status();
  A.ok(st.rules.base === 8 && st.rules.bonus === 0.25 && st.rules.bonusMax === 1 && st.rules.cooldownS === 120 && st.rules.maxDirect === 99, 'the loop falls back to the day-2 numbers (and no slot limit) and keeps running', JSON.stringify(st.rules));
  A.ok(sim.accepted().filter(p => p.t > o).length >= 10 && g.pitches.length >= 20, 'it keeps saving lists and the bot keeps pitching', sim.accepted().length + ' saves, ' + g.pitches.length + ' pitches');
  const share = g.cutShare(o, sim.clock.now);
  A.note('with no slot limit served and ' + g.directOf(ME).length + ' members: ' + Math.round((share[10] || 0) / MIN) + ' min at 10%, ' + Math.round((share[40] || 0) / MIN) + ' min at 40% in 120 minutes; cut changes: ' + sim.logGrep(/CUT /).map(l => l.replace(/^\S+ (\S+) CUT (\S+ -> \S+) \(([^)]*)\).*/, '$1 $2 ($3)')).join(' | '));
  await commonChecks(sim, A);
  return sim;
});
scenario('10d', 'a twist makes one pitch cost 150 coins', async A => {
  const sim = mkSim({ game: { rules: r => { r.costs.persuade = 150; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); g.policy = () => 'accept';
  await sim.untilOpen(12 * 60);
  const live = sim.accepted().filter(p => p.t > o);
  A.ok(live.length >= 1 && live.every(p => parsed(p).targets.length === 0), 'after the open every saved list is empty (a pitch above 100 coins is not worth it)', live.map(p => parsed(p).targets.length).join());
  A.ok(sim.logHas(/no targets listed: a pitch costs 150/), 'the log says why', sim.logGrep(/no targets/).join('\n'));
  const wasted = g.pitches.filter(x => x.t > o);
  A.note(wasted.length + ' pitches (' + wasted.length * 150 + ' coins) still went out from the opening core, which was saved before the open under the old price');
  A.ok(wasted.length <= 3, 'at most the first wake pitches at the new price (the opening core was written under the old rules)', wasted.length + ' pitches at 150 coins');
  await commonChecks(sim, A);
  return sim;
});
scenario('10e', 'odd shapes: twist is an object, bounties null, max_direct_members a string, costs missing, an unknown event type and a null event in the feed', async A => {
  const sim = mkSim({ game: { twist: { name: 'chaos', level: 2 }, rules: r => { r.bounties = null; r.econ.max_direct_members = '8'; delete r.costs; delete r.tick_seconds; }, onOpen: x => { x.ownFeed.unshift(null); x.ownFeed.unshift({ id: 1, ts: x.openedIso, type: 'daily.surprise', payload: null }); x.ownFeed.unshift({ id: 2, type: 'reflection' }); } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(15 * 60);
  A.ok(sim.accepted().filter(p => p.t > o).length >= 3 && g.joins.length === 8, 'the loop runs the opening regardless', sim.accepted().length + ' saves, ' + g.joins.length + ' joins');
  A.ok(sim.status().rules.maxDirect === 99, 'a slot limit served as text is not used (falls back to "no limit")', JSON.stringify(sim.status().rules));
  await commonChecks(sim, A);
  return sim;
});

// ================================================================== beyond the ten: other things an unattended day can meet
KIND = 'extra';
// ------------------------------------------------------------------ 0. the fixed texts
scenario('0', 'static checks: CONFIG lists, the hand-saved fallback core, the runbook tagline', async A => {
  const sim = mkSim({ pasteBeforeMin: 60 }), cfg = sim.pw().cfg, nv = neverOf(sim), nameOk = /^[A-Za-z0-9_.\-]{1,32}$/;
  await sim.run(1000);
  A.ok(cfg.helpers.every(h => !nv.has(h)), 'no helper is on a never list', cfg.helpers.filter(h => nv.has(h)).join());
  const all = [].concat(cfg.openingOrder, cfg.burstOrder, [...nv], cfg.helpers);
  A.ok(all.every(n => nameOk.test(n)), 'every configured name is a plain bot name', all.filter(n => !nameOk.test(n)).join());
  const ovl = cfg.openingOrder.concat(cfg.burstOrder).filter(n => nv.has(n) || cfg.helpers.includes(n));
  A.ok(ovl.length === 0, 'no name is both in a target order and on a never or helper list', ovl.join(', '));
  const core = H.STATIC_CORE, c = Game.parseCore(core), tag = 'Cut is 10% right now, the lowest a leader can set (the most is 40%).';
  A.ok(core.length <= 1500 && core.includes(H.DEFENCE) && c.pitch && c.pitch.length <= 500 && tag.length <= 80, 'cores/day3_static_core.txt: at most 1500 characters, defence section, pitch at most 500; runbook tagline at most 80', core.length + ' / ' + (c.pitch || '').length + ' / ' + tag.length);
  A.ok(c.targets.length === 24 && c.targets.every(n => !nv.has(n) && !cfg.helpers.includes(n)) && new Set(c.targets).size === 24, 'its 24 targets: none on a never list, none a helper, no duplicate', c.targets.filter(n => nv.has(n) || cfg.helpers.includes(n)).join());
  A.ok(/My cut is 10% right now, the lowest a leader can set \(the most is 40%\)/.test(c.pitch) && !/\d+\.\d/.test(c.pitch), 'its pitch states the 10% cut and the 10-40% range and promises no income figure', c.pitch);
  const steps = core.split('\n').filter(l => /^[12]\. /.test(l)).join('\n').replace(/"[^"]*"/g, '""');
  A.ok(/persuade/.test(steps) && /remember/.test(steps) && !/\b(whisper|tree_chat|broadcast|gift|pledge|spy|update_creed)\b/.test(steps), 'it asks for persuade and remember only', steps);
  const missing = c.targets.filter(n => !sim.game.rows.has(n));
  A.note('static-core targets not on the recorded 20:35 UTC board: ' + (missing.join(', ') || 'none') + '; bundle text is ' + H.BUNDLE.length + ' characters');
  return sim;
});

// ------------------------------------------------------------------ 11. whole days with random events
function mulberry(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function soak(id, seed) {
  scenario(id, 'a whole day 3 from one paste the evening before (seed ' + seed + '): 12 h frozen, random joins, leaves, arrivals, 11% of saves answered 422, lost requests, a 2 minute outage, trivia, Golden Hour, freeze, 3 h after', async A => {
    const rnd = mulberry(seed), pasteAt = Date.parse('2026-11-12T03:12:00Z');
    const sim = mkSim({ pasteAt, game: { goldenInS: seed % 2 ? 'neg' : 'omit' } }), g = sim.game, o = sim.openAt, G = sim.schedGolden, F = sim.schedFreeze;
    const h = n => [...n].reduce((a, ch) => (a * 33 + ch.charCodeAt(0)) >>> 0, seed);
    const hard = n => h(n) % 4 === 0, loyal = n => h(n) % 23 === 1;
    g.policy = (name) => {
      if (loyal(name)) return 'loyal';
      const r = rnd(); if (r < 0.08) return 'skip'; if (r < 0.12) return 'silent';
      const E = g.econ(), n = g.myTree() + g.treeCount(g.rootOf(name)), gain = E.base * (1 + Math.min(E.max, E.per * (n - 1))) - E.base * g.me.cut_pct / 100 - g.income(name);
      return rnd() < (gain > 0.05 ? (hard(name) ? 0.15 : 0.45) : 0.03) ? 'accept' : (hard(name) ? 'hard' : 'reject');
    };
    g.patchMode = () => (rnd() < 0.11 ? '422' : 'ok');
    const outFrom = o + 150 * MIN, outTo = outFrom + 2 * MIN;
    g.fault = rec => ((rec.t >= outFrom && rec.t < outTo) || (rec.t > o && rnd() < 0.004)) ? 'fail' : null;
    for (const n of HELPERS3) g.moveCost[n] = 80;
    let k = 0;
    const minute = () => {
      if (!g.live()) return;
      for (const hlp of HELPERS3) if (g.rows.get(hlp).allegiance !== ME && rnd() < 0.5) g.join(hlp, { self: true });        // helpers set their allegiance on a wake, again if refused
      const leaders = [...new Set([...g.rows.values()].map(r => r.allegiance).filter(x => x && x !== ME && g.rootOf(x) !== ME))];
      for (const n of g.directOf(ME)) {
        if (HELPERS3.includes(n)) continue;
        const p = g.me.cut_pct >= 40 ? (g.phase() === 'golden' ? 0.006 : 0.027) : 0.003;
        if (rnd() < p) { const dest = rnd() < 0.12 || !leaders.length ? '' : leaders[Math.floor(rnd() * leaders.length)]; g.leave(n, dest); if (rnd() < 0.3) { const f = [...g.rows.values()].find(r => !r.allegiance && r.name !== ME && r.name !== n && g.directOf(r.name).length === 0 && !HELPERS3.includes(r.name)); if (f) g.setAllegiance(f.name, n); } }
      }
      if (rnd() < 0.12) g.addBot('newbot_' + (++k));
      if (leaders.length && rnd() < 0.3) { const out = [...g.rows.values()].filter(r => r.name !== ME && g.rootOf(r.name) !== ME && !HELPERS3.includes(r.name) && g.directOf(r.name).length === 0); const r = out[Math.floor(rnd() * out.length)]; if (r) r.allegiance = rnd() < 0.2 ? '' : leaders[Math.floor(rnd() * leaders.length)]; }
      if (leaders.length && rnd() < 0.1) g.cuts[leaders[Math.floor(rnd() * leaders.length)]] = [10, 10, 15, 20, 25, 30, 40][Math.floor(rnd() * 7)];
      if (rnd() < 0.05) g.event('reflection', ME, 'LEDGER', { bot: ME, change: false, error: '', model: 'openai', proposer: 'LEDGER', steps: [{ decision: 'keep', prompt: 'x', reasoning: 'My core requires that I follow nobody.', step: 'consider' }], target: 'LEDGER' }, true);
      if (rnd() < 0.02) g.event('gift', 'leosharkpark', ME, { amount: 50, from: 'leosharkpark', to: ME }, true);
      if (rnd() < 0.03) {                       // a member of ours is deposed by a bot it had recruited (a coup inside our tree)
        const X = g.directOf(ME).filter(n => !HELPERS3.includes(n))[0], Y = [...g.rows.values()].find(r => !r.allegiance && r.name !== ME && !HELPERS3.includes(r.name) && g.directOf(r.name).length === 0);
        if (X && Y) { Y.allegiance = ME; g.rows.get(X).allegiance = Y.name; g.ever.add(Y.name); g.pair.add(Y.name); g.event('coup', Y.name, X, { argument: 'x', bot: Y.name, bounty_to_leader: 150, cost: 40, fee_to_leader: 40, leader: X, members: 0, old_leader: ME, quote: 'q', self_initiated: false, tree_size: 3 }, true); }
      }
    };
    for (let t = o + 30000; t < g.freezeAt; t += MIN) g.at(t, minute);
    g.atOpenPlus(12 * 60, x => x.applyRecordedForest());
    g.atOpenPlus(100 * 60, x => { x.trivia = { id: 9, question: 'What booth is ControlTheory at?', choices: ['123', '200', '188', '187'], closes_at: new Date(x.clock.now + 600000).toISOString(), reward: 500, reward_kind: 'coins', seconds: 600 }; });
    g.atOpenPlus(110 * 60, x => { x.trivia = null; });

    await sim.until(o - 500);
    const idle = g.requests.filter(r => r.t > pasteAt + 5000 && r.t < sim.schedOpen - 5 * MIN);
    A.ok(idle.every(r => r.url === '/api/world') && idle.length >= 700 && idle.length <= 712, 'the night: only /api/world, once a minute, for almost twelve hours', idle.length + ' requests');
    A.ok(g.patches.length >= 1 && g.patches.filter(p => p.status === 200).length === 1 && g.patches[0].sent >= sim.schedOpen - 172000, 'one accepted opening-core save in the last three minutes before the open', g.patches.map(p => hhmmss(p.sent) + ' ' + p.status).join(', '));
    await sim.until(F + 3 * 3600000);
    const pw = sim.pw();
    A.ok(sim.logHas(/NEW DAY 3 /) && pw.S.day.dayNo === 3, 'the day was taken up by itself', '');
    const share = g.cutShare(o, F), gShare = g.cutShare(G, F), late = g.cutShare(G - 5 * MIN + 150000, G);
    A.ok(Object.keys(gShare).join() === '40', 'the cut is 40% for the whole Golden Hour', JSON.stringify(gShare));
    A.ok(Object.keys(late).join() === '40', 'and already from five minutes before it (allowing one 422 retry)', JSON.stringify(late));
    A.ok(acceptedCutChanges(sim, 0, G - 10 * MIN).length === 0, 'no burst starts in the last ten minutes before the hour or inside it', '');
    A.ok(g.patches.filter(p => p.sent > g.freezeAt + 1000).length === 0, 'nothing is saved after the freeze', '');
    const post1 = g.requests.filter(r => r.t > g.freezeAt + 2 * MIN && r.t < g.freezeAt + 2 * 3600000), post2 = g.requests.filter(r => r.t > g.freezeAt + 2 * 3600000 + 11 * MIN);
    A.ok(post1.every(r => r.url === '/api/world') && post1.length <= 120 && post2.length <= 6, 'after the freeze: /api/world once a minute, then every ten minutes after two hours', post1.length + ' in the first two hours, ' + post2.length + ' in the third');
    A.ok(sim.logHas(/TRIVIA is open/), 'the trivia question is logged (not answered)', '');
    const kept = Array.from(pw.S.log), want = [/OPENING CORE saved/, /NEW DAY 3 /, /RULES changed/], lost = want.filter(re => !kept.some(l => re.test(l)));
    A.ok(lost.length === 0, 'three hours after the freeze the log (__pw3.tail) still holds the lines the runbook says to read first: OPENING CORE saved, NEW DAY 3, RULES changed', 'missing: ' + lost.map(String).join(', ') + '; the loop wrote ' + sim.log.length + ' lines since the paste and keeps the last ' + kept.length + '; the oldest kept line is "' + String(kept[0]).slice(0, 70) + '"');
    A.ok(g.requests.every(r => !/trivia\/\d/.test(r.url)), 'no trivia answer is ever sent', '');
    const lowMembers = g.joins.length;
    A.ok(lowMembers >= 8, 'the day recruited at least eight members', lowMembers + ' joins');
    const idleExpired = g.wakes.filter(w => /expired/.test(w.idle) && !(w.t >= outFrom && w.t < outTo + 3 * MIN));
    A.note('day: ' + g.joins.length + ' joins (bounties ' + g.joins.reduce((a, j) => a + j.bounty, 0) + ', fees ' + g.joins.reduce((a, j) => a + j.fee, 0) + '), ' + g.leaves.length + ' leaves, ' + g.pitches.length + ' pitches (' + g.pitches.length * 15 + ' coins), ' + Math.round((share[10] || 0) / MIN) + ' min at 10% and ' + Math.round((share[40] || 0) / MIN) + ' min at 40%, ' + acceptedCutChanges(sim, 0, o).length + ' bursts, members at the freeze ' + g.directOf(ME).length + '/8, learned never: ' + Object.keys(pw.S.perm.never).join(',') + '; wakes that found the list expired outside the outage: ' + idleExpired.length + '; loop counters ' + JSON.stringify(pw.S.day.n));
    await commonChecks(sim, A);
    return sim;
  });
}
soak('11a', 20261112); soak('11b', 7); soak('11c', 424242);

// ------------------------------------------------------------------ 12. a hidden tab
function hiddenTab(id, title, timeoutAlign) {
  scenario(id, title, async A => {
    const sim = mkSim({ goldenMin: 80, freezeMin: 140, pasteBeforeMin: 12 }), g = sim.game, o = sim.openAt, G = sim.schedGolden, F = sim.schedFreeze;
    sim.win.document.visibilityState = 'hidden'; (sim.win.__test.docListeners.visibilitychange || []).forEach(f => f());
    sim.clock.throttleMs = 60000; sim.clock.throttleTimeoutMs = timeoutAlign;
    helpersJoin(g); acceptFirst(g, 5);
    g.atOpenPlus(600, () => richForest(sim));
    g.at(G - 31 * MIN, x => { const X = nonHelperMembers(x); x.policy = () => 'silent'; x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
    await sim.until(o - 500);
    A.ok(sim.accepted().length === 1 && sim.accepted()[0].sent >= sim.schedOpen - 172000, 'the opening core is still saved before the open', sim.accepted().map(p => hhmmss(p.sent)).join());
    await sim.untilOpen(14 * 60);
    A.ok(sim.logHas(/TAB HIDDEN/) && sim.logHas(/SLOW TIMER/), 'the log says TAB HIDDEN and SLOW TIMER', sim.logGrep(/TAB|SLOW/).join(' | '));
    A.ok(sim.status().direct === '8/8' && sim.status().cut === 40, 'the opening still reaches 8 of 8 and 40%', JSON.stringify({ direct: sim.status().direct, cut: sim.status().cut }));
    await sim.until(F + 5 * MIN);
    const forced = acceptedCutChanges(sim, 100, G - 6 * MIN)[0], share = g.cutShare(G, F);
    A.ok(g.cutAt(G - 6 * MIN) === 10, 'precondition: a burst is running 6 minutes before the Golden Hour', 'cut ' + g.cutAt(G - 6 * MIN));
    A.ok(forced && forced.sent - (G - 5 * MIN) <= 65000, 'the forced return to 40% comes within about a minute of its time', forced ? secs(forced.sent - (G - 5 * MIN)) + ' late' : 'never');
    A.ok(Object.keys(share).join() === '40', 'the cut is 40% for the whole Golden Hour', JSON.stringify(share));
    const exp = g.wakes.filter(w => /expired/.test(w.idle));
    A.note('ticks completed: ' + sim.pw().rt.okTicks + ' in ' + Math.round((sim.clock.now - sim.pastes[0].t) / MIN) + ' min; wakes that found the list expired: ' + exp.length + ' of ' + g.wakes.length);
    await commonChecks(sim, A);
    return sim;
  });
}
hiddenTab('12a', 'the tab is hidden and throttled the whole time: interval timers once a minute, one-shot timers once a second (what Chrome does)', 1000);
hiddenTab('12b', 'worst case: every timer of the page fires only once a minute', 60000);

// ------------------------------------------------------------------ 13. a slow server
scenario('13', 'a slow server: every request takes 2.5 s', async A => {
  const sim = mkSim({ game: { latency: () => 2500 } }), g = sim.game;
  helpersJoin(g); g.policy = () => 'reject';
  await sim.untilOpen(30 * 60);
  A.ok(sim.accepted().length >= 8, 'lists are still saved', sim.accepted().length + ' accepted saves');
  A.note('ticks take about ' + Math.round((sim.clock.now - sim.pastes[0].t) / sim.pw().rt.okTicks / 100) / 10 + ' s apart on average; ' + g.patches.filter(p => p.status === 429).length + ' saves answered 429');
  await commonChecks(sim, A);
  return sim;
});

scenario('13b', 'the public feed (/api/feed, read every 10 minutes) is slow: 4 s per read; everything else is fast', async A => {
  const sim = mkSim({ game: { latency: rec => /^\/api\/feed/.test(rec.url) ? 4000 : 150 } }), g = sim.game;
  helpersJoin(g); g.policy = () => 'reject';
  await sim.untilOpen(65 * 60);
  const early = g.patches.filter(p => p.status === 429);
  A.ok(sim.accepted().length >= 20, 'lists are still saved', sim.accepted().length + ' accepted saves');
  A.note(early.length + ' saves were sent inside the cooldown and answered 429 (' + early.map(p => Math.round(p.sinceAccept / 1000) + ' s').join(', ') + ' after the last accepted save). The loop dates a save at the start of its tick: a tick that first spent 12 s on the three feed reads saves 12 s later than it thinks, and the next save comes that much too early');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 14. pasted twice
scenario('14', 'the bundle is pasted a second time into the running tab, in the middle of a tick', async A => {
  const sim = mkSim({}), g = sim.game, clock = sim.clock;
  helpersJoin(g); g.policy = () => 'reject';
  await sim.untilOpen(5 * 60 + 10.6 + 0.15);                       // 150 ms after a timer beat: a tick is reading
  const pitchedBefore = Object.keys(sim.pw().S.day.pitched).length, oldRt = sim.pw().rt, running = !!oldRt.running;
  sim.paste();
  const page = [...clock.timers.values()].filter(t => t.tag === 'pageI');
  A.ok(page.length === 2 && clock.has(sim.pw().rt.timer) && clock.has(sim.pw().rt.wdTimer) && !clock.has(oldRt.timer || -1), 'exactly one tick timer and one watchdog are left', page.length + ' interval timers');
  A.ok(sim.logHas(/replaces an earlier paste, state kept/) && Object.keys(sim.pw().S.day.pitched).length === pitchedBefore && pitchedBefore > 0, 'the second paste keeps what the first one learned', pitchedBefore + ' pitched before, ' + Object.keys(sim.pw().S.day.pitched).length + ' after');
  A.note('a tick of the first copy was ' + (running ? '' : 'not ') + 'in flight at the paste');
  const n0 = g.requests.length, t0 = clock.now;
  await sim.run(10 * MIN);
  A.ok((g.requests.length - n0) / 10 <= 16, 'the request rate does not double', Math.round((g.requests.length - n0) / 10 * 10) / 10 + ' a minute after the second paste');
  A.ok(sim.accepted().filter(p => p.t > t0).length >= 3, 'and the loop keeps saving', '');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 15. the watchdog
scenario('15a', 'one request never settles, not even when aborted: the watchdog has to free the loop', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt; let done = false;
  helpersJoin(g); g.policy = () => 'reject';
  g.fault = rec => (!done && rec.t > o + 5 * MIN && /leaderboard/.test(rec.url)) ? (done = true, 'hanghard') : null;
  await sim.untilOpen(15 * 60);
  const stuck = g.requests.find(r => r.status === 'never'), next = stuck && g.requests.find(r => r.t > stuck.t);
  A.ok(stuck && next && next.t - stuck.t <= 215000, 'the loop is back within 215 s (watchdog limit 180 s + its 30 s period)', stuck && next ? secs(next.t - stuck.t) : 'never');
  A.ok(sim.pw().rt.wdRestarts === 1 && sim.logHas(/WATCHDOG: no tick completed for \d+ s \(one is stuck\): timer restarted/), 'the watchdog logged one restart', sim.logGrep(/WATCHDOG/).join(' | '));
  A.ok(sim.accepted().filter(p => p.t > stuck.t + 215000).length >= 2, 'saving goes on afterwards', '');
  await commonChecks(sim, A);
  return sim;
});
scenario('15b', 'the tick timer is gone (cleared by something else in the page): the watchdog starts a new one', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt;
  helpersJoin(g); g.policy = () => 'reject';
  await sim.untilOpen(5 * 60);
  sim.clock.clear(sim.pw().rt.timer); const t0 = sim.clock.now;
  await sim.untilOpen(15 * 60);
  const next = g.requests.find(r => r.t > t0 + 25000);
  A.ok(next && next.t - t0 <= 215000 && sim.pw().rt.wdRestarts >= 1, 'ticks resume within 215 s', next ? secs(next.t - t0) : 'never');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 16. the computer's clock is wrong
function skewed(id, title, ms) {
  scenario(id, title, async A => {
    const sim = mkSim({ goldenMin: 80, freezeMin: 140, pasteBeforeMin: 12, game: { clientFastMs: ms } }), g = sim.game, o = sim.openAt, G = sim.schedGolden, F = sim.schedFreeze;
    helpersJoin(g); acceptFirst(g, 5);
    g.atOpenPlus(600, () => richForest(sim));
    g.at(G - 31 * MIN, x => { const X = nonHelperMembers(x); x.policy = () => 'silent'; x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
    await sim.until(o - 500);
    const pre = sim.accepted();
    A.ok(pre.length === 1 && Math.abs(pre[0].sent - (sim.schedOpen - 170000)) <= 25000, 'the opening core is saved about 170 s before the real open (the server clock is used, not the computer\'s)', pre.map(p => secs(sim.schedOpen - p.sent) + ' before the open').join());
    await sim.untilOpen(25);
    A.ok(sim.pw().rt.live && sim.logHas(/NEW DAY 3 /), 'the open is noticed', '');
    await sim.untilOpen(14 * 60);
    A.ok(sim.status().direct === '8/8' && sim.status().cut === 40, 'the opening reaches 8 of 8 and 40%', JSON.stringify({ direct: sim.status().direct, cut: sim.status().cut }));
    await sim.until(F + 5 * MIN);
    const forced = acceptedCutChanges(sim, 100, G - 6 * MIN)[0], share = g.cutShare(G - 5 * MIN + 25000, F);
    A.ok(g.cutAt(G - 6 * MIN) === 10 && forced && forced.sent >= G - 5 * MIN && forced.sent - (G - 5 * MIN) <= 25000, 'the forced return to 40% comes at the real "5 minutes before the Golden Hour"', forced ? 'golden -' + Math.round((G - forced.sent) / 600) / 100 + ' min' : 'cut at -6 min: ' + g.cutAt(G - 6 * MIN));
    A.ok(Object.keys(share).join() === '40', 'and holds to the real freeze', JSON.stringify(share));
    const st = sim.pw().S.day;
    A.note('refused because the slots were full: ' + g.fullRefusals.length + '; pitches ' + g.pitches.length + '; repeated names ' + (g.pitches.length - new Set(g.pitches.map(x => x.to)).size) + ' (the loop compares event times from the server with the computer\'s clock when it counts unanswered pitches and waits before a second pitch)');
    await commonChecks(sim, A);
    return sim;
  });
}
skewed('16a', "the computer's clock is 5 minutes fast", 5 * MIN);
skewed('16b', "the computer's clock is 5 minutes slow", -5 * MIN);

// ------------------------------------------------------------------ 17. signed in as somebody else
scenario('17', 'the tab is signed in as another bot', async A => {
  const sim = mkSim({ noPaste: true }), g = sim.game;
  g.me.name = 'other_bot'; sim.paste();
  helpersJoin(g);
  const st = JSON.parse(await sim.manual(() => sim.pw().cycle()));
  A.ok(st.armed === false && st.signedIn === false, 'cycle() says not armed, not signed in', JSON.stringify({ armed: st.armed, signedIn: st.signedIn, bot: st.bot }));
  await sim.untilOpen(10 * 60);
  A.ok(g.patches.length === 0, 'nothing is ever saved to the other bot', g.patches.length + ' saves');
  A.ok(sim.logHas(/WRONG ACCOUNT/) || sim.logHas(/signed in as "other_bot"/), 'the log says why', sim.log.slice(-4).join('\n'));
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 18. more than 200 bots
function bigBoard(id, title, gameOpt, expectLog) {
  scenario(id, title, async A => {
    const sim = mkSim({ noPaste: true, game: gameOpt }), g = sim.game;
    for (let i = 0; i < 60; i++) g.addBot('crowd_' + i, { coins: 100 + i });
    sim.paste(); helpersJoin(g); acceptFirst(g, 5);
    await sim.untilOpen(12 * 60);
    A.ok(sim.logHas(expectLog), 'the log shows how the longer board was handled', sim.logGrep(/board|leaderboard/).join(' | '));
    A.ok(sim.status().direct === '8/8' && sim.status().cut === 40, 'the opening still reaches 8 of 8 and 40%', JSON.stringify({ direct: sim.status().direct, cut: sim.status().cut, bots: sim.pw().rt.info.bots }));
    A.note('rows the loop sees: ' + sim.pw().rt.info.bots + ' of ' + g.rows.size + ', page limit now ' + sim.pw().rt.lbLimit);
    await commonChecks(sim, A);
    return sim;
  });
}
bigBoard('18a', '224 bots on the board, the server honours limit=400', {}, /asking for 400 from now on/);
bigBoard('18b', '224 bots, the server never returns more than 200 rows', { lbCap: 200 }, /leaderboard read may be incomplete/);
bigBoard('18c', '224 bots, the server answers HTTP 400 to a limit above 200', { lbReject: 200 }, /leaderboard with limit 400 failed: back to 200/);

// ------------------------------------------------------------------ 19. the dial maps differently
scenario('19a', 'a twist moves the dial: greedy 0 gives 15%, greedy 100 gives 40%', async A => {
  const sim = mkSim({ game: { cutMap: gr => 15 + Math.round(25 * gr / 100) } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.until(o - 500);
  const pre = sim.accepted();
  A.ok(pre.length === 2 && /my cut is 15% right now\./.test(parsed(pre[1]).pitch) && !/moves between/.test(parsed(pre[1]).pitch), 'the opening core is saved a second time with the real 15% in the pitch, still before the open, and states no range while the top of today\'s dial is unknown', pre.map(p => hhmmss(p.sent) + ': ' + (parsed(p).pitch || '').slice(60, 130)).join(' | '));
  await sim.untilOpen(12 * 60);
  A.ok(sim.status().direct === '8/8' && sim.status().cut === 40 && g.pitches.every(x => /15% right now/.test(x.text)), 'the opening runs at 15% with true pitches and ends at 40%', JSON.stringify({ direct: sim.status().direct, cut: sim.status().cut }));
  await commonChecks(sim, A);
  return sim;
});
scenario('19b', 'a twist fixes the cut at 25% whatever the dial says', async A => {
  const sim = mkSim({ game: { cutMap: () => 25 } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(45 * 60);
  A.ok(sim.logHas(/the greedy dial did not move the cut \(25%\)/), 'the dead dial is noticed and logged', sim.logGrep(/dial|RULES: /).join(' | '));
  A.ok(g.pitches.length > 0 && g.pitches.every(x => /25%/.test(x.text)), 'every pitch names 25%', '');
  A.ok(g.patches.filter(p => p.sent > o).length <= 12, 'no stream of useless saves', g.patches.filter(p => p.sent > o).length + ' saves in 45 min');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 20. (not observed, assumed) a changed cut only shows at the bot's next wake
KIND = 'assumed';
scenario('20', 'NOT OBSERVED, an assumption about the server: a changed cut shows in /api/bot only after the bot\'s next wake', async A => {
  const sim = mkSim({ goldenMin: 80, freezeMin: 140, game: { cutAppliesAtWake: true } }), g = sim.game, o = sim.openAt, G = sim.schedGolden, F = sim.schedFreeze;
  helpersJoin(g); acceptFirst(g, 5);
  g.atOpenPlus(600, () => richForest(sim));
  g.at(G - 31 * MIN, x => { const X = nonHelperMembers(x); x.policy = () => 'silent'; x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
  await sim.until(F + 2 * MIN);
  const holds = sim.logGrep(/the greedy dial did not move the cut/), gShare = g.cutShare(G, F);
  A.ok(holds.length === 0, 'the loop does not mistake the delay for a dead dial (which stops all cut changes for 30 minutes)', holds.length + ' times: ' + holds.slice(0, 2).join(' | '));
  A.ok(Object.keys(gShare).join() === '40', 'the cut is 40% for the whole Golden Hour', JSON.stringify(gShare) + ' ms at each cut');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 21. an admin pause
KIND = 'extra';
function pauseScenario(id, title, startMin) {
  scenario(id, title, async A => {
    let from = 0, to = 0;
    const sim = mkSim({ game: { worldHook: (w, x) => { if (x.clock.now >= from && x.clock.now < to) { w.world.phase = 'paused'; w.day_window = { source: 'none' }; } } } }), g = sim.game, o = sim.openAt;
    from = o + startMin * MIN; to = from + 5 * MIN;
    helpersJoin(g); acceptFirst(g, 5);
    await sim.until(from - 1000);
    preconditions(A, sim, 'the bot is at 40% with 8 of 8 members when the pause begins');
    await sim.until(to + 8 * MIN);
    A.ok(sim.logHas(/unknown phase "paused": treated as not open/), 'the unknown phase is logged and treated as not open', sim.logGrep(/phase/).join(' | '));
    const during = g.patches.filter(p => p.sent >= from && p.sent < to);
    A.ok(during.length === 0, 'nothing is saved while the world is not open', during.map(p => hhmmss(p.sent) + ' greedy ' + greedyOf(p) + ' TARGETS ' + parsed(p).targets.join('+') + ' EXPIRES ' + parsed(p).exp + ' "' + (parsed(p).pitch || '').slice(0, 60) + '..."').join(' | ') + ' ; log: ' + sim.logGrep(/OPENING CORE|next open at/).slice(1).join(' | '));
    const share = g.cutShare(from, sim.clock.now);
    A.ok(Object.keys(share).join() === '40', 'the cut stays at 40% (all eight slots are full the whole time)', Math.round((share[10] || 0) / 1000) + ' s at 10%');
    const back = g.requests.find(r => r.t >= to && r.url === '/api/bot');
    A.ok(back && back.t - to <= 62000, 'the loop is live again within a minute of the pause ending', back ? secs(back.t - to) : 'never');
    A.ok(sim.logGrep(/NEW DAY/).length === 1, 'the same day goes on (no second "NEW DAY")', sim.logGrep(/NEW DAY/).length + ' NEW DAY lines');
    await commonChecks(sim, A);
    return sim;
  });
}
pauseScenario('21a', 'the world shows an unknown phase ("paused") for 5 minutes, 25 minutes into the day', 25);
pauseScenario('21b', 'the same pause 6 minutes into the day (inside 15 minutes of the built-in 15:00 UTC open time)', 6);

// ------------------------------------------------------------------ 24. the computer sleeps
scenario('24a', 'the computer sleeps for 25 minutes in the middle of the day (the runbook forbids it; what happens if it does)', async A => {
  const sim = await midday({}, richForest), g = sim.game;
  preconditions(A, sim);
  const X = nonHelperMembers(g); g.policy = () => 'silent';
  g.at(sim.t(20 * 60), x => { x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
  await sim.untilOpen(23 * 60);
  const t0 = sim.clock.now, cut0 = g.cutAt(t0);
  await sim.clock.sleep(25 * MIN, t => t.tag === 'engine');
  const t1 = sim.clock.now;
  await sim.until(t1 + 20 * MIN);
  const during = g.requests.filter(r => r.t > t0 + 2000 && r.t < t1);
  A.ok(during.length === 0 && cut0 === 10, 'scenario: a burst was running at 10% when the computer fell asleep; no request for 25 minutes', during.length + ' requests, cut ' + cut0);
  const asleep = g.wakes.filter(w => w.t > t0 && w.t < t1);
  A.ok(asleep.filter(w => w.sent.length).length <= 3 && asleep.slice(-6).every(w => /expired/.test(w.idle)), 'the bot stops pitching within about six ticks (EXPIRES) and idles', asleep.map(w => w.sent.length || w.idle).join(' | '));
  const first = g.requests.find(r => r.t >= t1);
  A.ok(first && first.t - t1 <= 21000 && sim.logHas(/SLOW TIMER/), 'at wake the loop reads again within one tick and logs SLOW TIMER', first ? secs(first.t - t1) : 'never');
  const up = acceptedCutChanges(sim, 100, t1)[0];
  A.ok(up && up.sent - t1 <= 45000, 'the overdue burst is ended at once (back to 40%)', up ? secs(up.sent - t1) : 'not within 20 min; cut now ' + g.cutAt(sim.clock.now));
  A.note('asleep at 10% with 6 members for 25 minutes: about ' + Math.round(25 * 6 * 2.4) + ' coins of cut income lost; nothing the loop can do while the computer sleeps');
  await commonChecks(sim, A);
  return sim;
});
scenario('24b', 'the computer sleeps from 10 minutes before the open to 20 minutes after it', async A => {
  const sim = mkSim({ pasteBeforeMin: 30 }), g = sim.game, o = sim.openAt;
  helpersJoin(g); g.policy = () => 'reject';
  await sim.until(sim.schedOpen - 10 * MIN);
  await sim.clock.sleep(30 * MIN, t => t.tag === 'engine');
  const t1 = sim.clock.now;
  await sim.until(t1 + 15 * MIN);
  A.ok(g.patches.filter(p => p.sent < t1).length === 0, 'no opening core was saved (the computer was asleep)', '');
  A.ok(g.wakes.filter(w => w.t < t1 && w.sent.length).length >= 5, 'meanwhile the bot played the hand-saved static core', g.wakes.filter(w => w.t < t1).map(w => w.sent.length).join());
  A.ok(sim.logHas(/NEW DAY 3 /) && sim.accepted().length >= 1 && sim.accepted()[0].sent - t1 <= 25000, 'at wake the loop takes up day 3 and saves its own core within 25 s', sim.accepted().length ? secs(sim.accepted()[0].sent - t1) : 'no save');
  const mine = new Set(g.pitches.filter(x => x.t < t1).map(x => x.to)), again = g.pitches.filter(x => x.t > t1 + 150000 && mine.has(x.to));
  A.note('bots pitched by the static core before the loop woke: ' + mine.size + '; of these pitched again by the loop afterwards: ' + again.length + ' (the own feed only goes back 80 events)');
  await commonChecks(sim, A);
  return sim;
});

// ------------------------------------------------------------------ 23. no times in the live world
function noTimes(id, title, hook, src, gameOpt) {
  scenario(id, title, async A => {
    const sim = mkSim({ game: Object.assign({ worldHook: hook }, gameOpt || {}) }), g = sim.game, o = sim.openAt, G = sim.schedGolden, F = sim.schedFreeze;
    helpersJoin(g); acceptFirst(g, 5);
    g.atOpenPlus(600, () => richForest(sim));
    g.at(G - 31 * MIN, x => { const X = nonHelperMembers(x); x.policy = () => 'silent'; x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
    await sim.until(G - 6 * MIN);
    const st = sim.status();
    A.ok(st.timeSource === src && Math.abs(st.goldenInMin - 6) < 0.2 && Math.abs(st.freezeInMin - 66) < 0.2, 'the Golden Hour and freeze times come from ' + src + ' and are right', JSON.stringify({ src: st.timeSource, goldenInMin: st.goldenInMin, freezeInMin: st.freezeInMin }));
    A.ok(g.cutAt(sim.clock.now) === 10, 'precondition: a burst is running 6 minutes before the Golden Hour', 'cut ' + g.cutAt(sim.clock.now));
    await sim.until(F + 3 * MIN);
    const forced = acceptedCutChanges(sim, 100, G - 6 * MIN)[0], share = g.cutShare(G - 5 * MIN + 25000, F);
    A.ok(forced && forced.sent >= G - 5 * MIN && forced.sent - (G - 5 * MIN) <= 25000, 'the cut is forced to 40% five minutes before 19:00 UTC', forced ? hhmmss(forced.sent) : 'never');
    A.ok(Object.keys(share).join() === '40', 'and stays there until the freeze', JSON.stringify(share));
    await commonChecks(sim, A);
    return sim;
  });
}
noTimes('23a', 'a whole day whose live /api/world serves no Golden Hour or freeze time at all: the built-in schedule is used', w => { if (w.world.phase !== 'frozen') w.day_window = { source: 'none' }; }, 'CONFIG fallback');
noTimes('23b', 'only absolute stamps are served (golden_at, freeze_at) and the computer\'s clock is 5 minutes fast', w => { if (w.world.phase !== 'frozen') { delete w.day_window.golden_in_s; delete w.day_window.freeze_in_s; delete w.day_window.elapsed_s; } }, 'day_window.golden_at', { clientFastMs: 5 * MIN });

// ------------------------------------------------------------------ 22. bots that only carry the helper tagline
scenario('22', 'five other bots carry the helper tagline ("Loyal member of sullen_nyquist\'s tree.") and never join', async A => {
  const sim = mkSim({ noPaste: true }), g = sim.game, o = sim.openAt;
  const fakes = pickableNames(g, 5); fakes.forEach(n => { g.rows.get(n).tagline = "Loyal member of sullen_nyquist's tree."; });
  sim.paste(); helpersJoin(g); g.policy = () => 'accept';
  await sim.untilOpen(25 * 60);
  const afterHelpers = g.pitches.filter(x => x.t > o + 150000), firstLate = afterHelpers[0];
  A.ok(fakes.every(n => sim.pw().S.perm.helpers[n]) && g.pitches.every(x => !fakes.includes(x.to)), 'each of them is taken for a helper: a slot is kept for it and it is never pitched', '');
  A.note('with 3 real helpers in and 5 slots held for the look-alikes, the next pitch after tick 3 went out ' + (firstLate ? Math.round((firstLate.t - o) / 6000) / 10 + ' min after the open' : 'never') + '; members 10 minutes in: ' + g.joins.filter(j => j.t < o + 10 * MIN).length + '/8, 25 minutes in: ' + g.directOf(ME).length + '/8 (' + sim.logGrep(/reservation is released/).length + ' reservations released after 15 min)');
  await commonChecks(sim, A, { extraHelpers: fakes });
  return sim;
});
function pickableNames(g, n) { const skip = new Set(HELPERS3.concat([ME])); return [...g.rows.keys()].filter(x => !skip.has(x) && /^(stoic_hotfix|rapid_runbook|eager_sensor|fussy_oncall|LumberjackViking|mauve_ratelimit|Seanimam|Coolnames)$/.test(x)).slice(0, n); }

// ------------------------------------------------------------------ 25. for comparison: the day-2 loop's request rate
scenario('25', 'for comparison only: the request rate of the day-2 loop as stored in the repo (day2_live.js + 13 patches, dry mode) on the same mid-day board', async A => {
  const path = require('path'), { paste } = require('./lib/fakebrowser');
  const sim = mkSim({ noPaste: true, pasteBeforeMin: 1 }), g = sim.game, o = sim.openAt;
  g.atOpenPlus(30, x => { x.applyRecordedForest(); for (const r of H.DATA.rows) if (r.allegiance === ME) x.setAllegiance(r.name, ME); });
  await sim.untilOpen(60);
  const dir = path.resolve(__dirname, '..', '..', 'loop'), files = ['day2_live.js', 'day2_live_patch.js'].concat([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].map(n => 'day2_live_patch' + n + '.js'));
  for (const f of files) { paste(sim.win, fs.readFileSync(path.join(dir, f), 'utf8'), f); await sim.run(700); }
  const t0 = sim.clock.now;
  await sim.run(24 * MIN);
  const reqs = g.requests.filter(r => r.t >= t0), per = {};
  for (const r of reqs) { const k = Math.floor((r.t - t0) / MIN); per[k] = (per[k] || 0) + 1; }
  const counts = Object.values(per), peak = Math.max(...counts), mean = reqs.length / 24, kinds = {};
  for (const r of reqs) { const k = r.url.replace(/\?.*$/, '').replace(/^\/api\/bots\/.*/, '/api/bots/<name>'); kinds[k] = (kinds[k] || 0) + 1; }
  A.ok(reqs.length > 200 && sim.win.__ap2 && sim.win.__ap2.dry === true && g.patches.length === 0, 'the day-2 loop ran in dry mode (reads only) for 24 minutes', reqs.length + ' requests; log: ' + ((sim.win.__ap2 || {}).log || []).slice(-2).join(' | '));
  A.note('day-2 loop, ' + Object.keys(g.cuts).length + ' recorded leader cuts, 24 minutes: peak ' + peak + ' requests in one minute, mean ' + Math.round(mean * 10) / 10 + ' a minute (' + Object.keys(kinds).sort((a, b) => kinds[b] - kinds[a]).map(k => kinds[k] + ' ' + k).join(', ') + '). The stored files never call the hooks that patches 2, 3, 9, 12 and 13 hang on ap._tickW5, so the loop that ran live on day 2 made a few more requests than this.');
  sim.rate = { peak, mean, over: 0, minutes: 24 };
  return sim;
});

// ------------------------------------------------------------------ runner
(async () => {
  const R = new Results(), started = Date.now(); let lastKind = null;
  for (const s of scenarios) {
    if (only.length && !only.some(p => s.id === p || (s.id.startsWith(p) && /^[a-z]/.test(s.id.slice(p.length))))) continue;
    const sc = R.scenario(s.id, s.title), A = asserter(sc), t0 = Date.now();
    let sim = null;
    try { sim = await s.fn(A, sc); } catch (e) { sc.error = (e && e.stack) || String(e); }
    sc.ms = Date.now() - t0;
    const failed = sc.checks.filter(c => !c.passed);
    sc.kind = s.kind; sc.rate = sim && sim.rate;
    if (s.kind !== lastKind) { lastKind = s.kind; console.log('\n== ' + ({ core: 'the ten scenarios (with variants)', extra: 'beyond the ten', assumed: 'server behaviour that was never observed (an assumption, reported apart)' })[s.kind]); }
    console.log((failed.length || sc.error ? 'FAIL' : 'PASS') + '  ' + s.id.padEnd(4) + s.title + '  [' + (sc.checks.length - failed.length) + '/' + sc.checks.length + ' assertions, ' + sc.ms + ' ms]');
    if (sc.error) console.log('      HARNESS ERROR: ' + sc.error.split('\n').join('\n      '));
    for (const c of failed) console.log('      FAILED: ' + c.name + (c.detail ? '\n              ' + c.detail.split('\n').join('\n              ') : ''));
    for (const n of sc.notes) console.log('      note: ' + n);
    if (SHOW_LOG && sim) {
      console.log('      ---- loop log');
      for (const l of sim.log) console.log('      ' + l);
      console.log('      ---- saves');
      for (const p of sim.game.patches) console.log('      ' + hhmmss(p.sent) + ' tick ' + p.tick + ' HTTP ' + p.status + ' greedy ' + greedyOf(p) + ' direct ' + p.direct + ' T ' + p.T + ' len ' + p.body.core.length + ' | ' + p.body.core.split('\n').slice(-3).filter(l => /^(TARGETS|CALLS|EXPIRES)/.test(l)).join(' / '));
      console.log('      ---- wakes');
      for (const w of sim.game.wakes) console.log('      ' + hhmmss(w.t) + ' tick ' + w.tick + ' cut ' + w.cut + ' direct ' + w.direct + ' ' + (w.idle ? 'idle: ' + w.idle : 'pitched ' + w.sent.join(', ')));
    }
  }
  const all = R.list.reduce((a, s) => a.concat(s.checks.map(c => Object.assign({ scenario: s.id, kind: s.kind }, c))), []), bad = all.filter(c => !c.passed), errs = R.list.filter(s => s.error);
  console.log('\nrequests a minute (peak / mean while the day is live): ' + R.list.filter(s => s.rate).map(s => s.id + ' ' + s.rate.peak + '/' + Math.round(s.rate.mean * 10) / 10).join(', '));
  for (const k of ['core', 'extra', 'assumed']) { const sl = R.list.filter(s => s.kind === k), cl = all.filter(c => c.kind === k); if (sl.length) console.log(k.padEnd(8) + sl.length + ' scenarios (' + sl.filter(s => s.checks.some(c => !c.passed) || s.error).length + ' with a failed assertion), ' + cl.length + ' assertions: ' + cl.filter(c => c.passed).length + ' passed, ' + cl.filter(c => !c.passed).length + ' failed'); }
  console.log(R.list.length + ' scenarios, ' + all.length + ' assertions: ' + (all.length - bad.length) + ' passed, ' + bad.length + ' failed' + (errs.length ? ', ' + errs.length + ' scenarios with a harness error' : '') + '  (' + (Date.now() - started) + ' ms, bundle ' + H.BUNDLE_PATH + ')');
  if (bad.length) { const by = {}; bad.forEach(c => { (by[c.name] = by[c.name] || []).push(c.scenario); }); console.log('\nFailed assertions by name:'); for (const n of Object.keys(by)) console.log('  ' + by[n].join(', ').padEnd(28) + ' ' + n); }
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify(R.list, null, 1));
  process.exit(bad.length || errs.length ? 1 : 0);
})();
