#!/usr/bin/env node
// Offline checks for the review fixes of 2026-11-11 in loop/day3_bundle.js (version day3-bundle-2). They use the same
// fake browser and fake game as day3_bundle.test.js and cover what that file has no scenario for: an unreadable
// leaderboard, a refused page size, an unknown phase name, other slot limits and no limit, a late open, pitch events
// missing from the own feed, the import of the day-2 lists, "no second pitch" names, a repeated first-pair bounty,
// a stale PATCH answer, refused saves, profile reads answered 429, a lower core_max, the idle flag, the pre-golden
// pitch text and single-wake lists.
//
//   node tools/test/day3_review_fixes.test.js            run everything (about 15 s)
//   node tools/test/day3_review_fixes.test.js E1 E13     run the named scenarios
'use strict';
const H = require('./lib/harness');
const { mkSim, commonChecks, asserter, parsed, greedyOf, hhmmss, HELPERS3, ME, Game } = H;
const MIN = 60000;
const helperTimes = { leosharkpark: 20, dapper_grafana: 75, rowdy_baseline: 130 };
function helpersJoin(g) { for (const n of Object.keys(helperTimes)) { g.moveCost[n] = 80; g.atOpenPlus(helperTimes[n], x => x.join(n, { self: true })); } }
function acceptFirst(g, n) { let k = 0; g.policy = () => (k < n ? (k++, 'accept') : 'reject'); }
const cutChanges = (sim, from) => sim.game.patches.filter(p => p.status === 200 && p.cutBefore !== p.cutAfter && p.sent >= (from || 0));
const nonHelperMembers = g => g.joins.filter(j => !HELPERS3.includes(j.name) && g.rows.get(j.name).allegiance === ME).map(j => j.name);
const only = process.argv.slice(2);
const list = [];
const scenario = (id, title, fn) => list.push({ id, title, fn });
function richForest(sim) { const g = sim.game; g.applyRecordedForest(); for (const r of g.rows.values()) { const n = r.name; if (n === ME || n === 'LEDGER' || g.rootOf(n) === ME) continue; if (!r.allegiance && g.treeCount(n) < 5) r.allegiance = 'LEDGER'; } }

scenario('E1', 'the leaderboard answers 503 from the eighth join on: the cut still goes to 40%', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt; let from = Infinity, to = Infinity;
  helpersJoin(g); acceptFirst(g, 5);
  const join0 = g.join.bind(g);
  g.join = (n, opt) => { const ok = join0(n, opt); if (ok && g.directOf(ME).length === 8 && from === Infinity) { from = g.clock.now; to = from + 15 * MIN; } return ok; };
  g.fault = rec => (rec.t >= from && rec.t < to && /leaderboard/.test(rec.url)) ? { status: 503, text: 'x' } : null;
  await sim.untilOpen(40 * 60);
  const up = cutChanges(sim, o).find(p => greedyOf(p) === 100);
  A.ok(from < Infinity && up && up.sent - from <= 150000, 'cut to 40% within one cooldown of the eighth join although the board is unreadable', up ? Math.round((up.sent - from) / 1000) + ' s' : 'never; ' + sim.log.slice(-4).join(' | '));
  A.ok(sim.logHas(/slots full \(the leaderboard cannot be read\)/) && sim.logHas(/the leaderboard cannot be read: no new targets/) && sim.logHas(/the leaderboard answers again/), 'log: blind switch, blind notice, board back', sim.logGrep(/leaderboard|CUT/).join(' | '));
  const blindSaves = g.patches.filter(p => p.sent >= from && p.sent < to);
  A.ok(blindSaves.length === 1 && greedyOf(blindSaves[0]) === 100 && parsed(blindSaves[0]).targets.length === 0, 'the only save while blind is the cut change, with no targets', blindSaves.map(p => hhmmss(p.sent) + ' g' + greedyOf(p) + ' ' + parsed(p).targets.length).join());
  A.ok(up && /in a tree paying the full x2\.00/.test(parsed(up).pitch), 'its pitch states the full tree (tree size from /api/bot)', up && parsed(up).pitch);
  await commonChecks(sim, A); return sim;
});

scenario('E2', 'the leaderboard hangs from 10 min before the Golden Hour to 12 min into it, during a pre-golden burst', async A => {
  const sim = mkSim({ goldenMin: 80, freezeMin: 140 }), g = sim.game, G = sim.schedGolden, F = sim.schedFreeze;
  helpersJoin(g); acceptFirst(g, 5);
  g.atOpenPlus(600, () => richForest(sim));
  g.at(G - 31 * MIN, x => { const X = nonHelperMembers(x); x.policy = () => 'silent'; x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
  g.fault = rec => (rec.t >= G - 10 * MIN && rec.t < G + 12 * MIN && /leaderboard/.test(rec.url)) ? 'hang' : null;
  await sim.until(G - 10 * MIN - 1000);
  A.ok(g.cutAt(sim.clock.now) === 10, 'precondition: a burst is running at 10% when the board starts to hang', 'cut ' + g.cutAt(sim.clock.now));
  await sim.until(F + 2 * MIN);
  const share = g.cutShare(G - 5 * MIN + 150000, F);
  A.ok(Object.keys(share).join() === '40', 'the cut is 40% from 2.5 min after the force time to the freeze', JSON.stringify(share) + ' ' + sim.logGrep(/CUT/).slice(-3).join(' | '));
  const forced = cutChanges(sim, G - 6 * MIN).find(p => greedyOf(p) === 100);
  A.ok(forced && forced.sent - (G - 5 * MIN) <= 45000, 'forced within 45 s of its time (each tick loses 15 s to the hanging read)', forced ? Math.round((forced.sent - (G - 5 * MIN)) / 1000) + ' s' : 'never');
  await commonChecks(sim, A, { skipRate: false }); return sim;
});

scenario('E3', 'limit=200 is refused with HTTP 400 all day: the loop steps down to limit=100 and carries on', async A => {
  const sim = mkSim({ game: { lbReject: 150 } }), g = sim.game;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(12 * 60);
  A.ok(sim.logHas(/leaderboard refused limit 200 \(HTTP 400\): the next read asks for limit 100/), 'logged', sim.logGrep(/leaderboard/).join(' | '));
  A.ok(sim.status().direct === '8/8' && sim.status().cut === 40, 'the opening still reaches 8 of 8 and 40%', JSON.stringify({ d: sim.status().direct, c: sim.status().cut, lim: sim.pw().rt.lbLimit }));
  await commonChecks(sim, A); return sim;
});

scenario('E4', 'the day opens with the unknown phase name "live" (day window served): the loop goes live', async A => {
  const sim = mkSim({ pasteBeforeMin: 10, game: { worldHook: (w, x) => { if (w.world.phase === 'open' || w.world.phase === 'golden') w.world.phase = 'live'; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.until(o - 500);
  const pre = g.patches.slice();
  A.ok(pre.length === 1 && pre[0].body.core === H.STATIC_CORE && greedyOf(pre[0]) === 0 && /A leader can set 10% to 40%; this is the lowest\./.test(pre[0].body.tagline), 'the opening save leaves the hand-saved core in place (dial 0, tagline of its own)', pre.map(p => hhmmss(p.sent) + ' ' + p.body.tagline).join());
  A.ok(sim.logHas(/OPENING CORE saved for the open: cut 10%, the hand-saved fallback core stays in place \(24 targets, no expiry\)/), 'log line', sim.logGrep(/OPENING/).join(' | '));
  await sim.untilOpen(40 * 60);
  A.ok(sim.logHas(/unknown phase "live" with the day window running/) && sim.pw().rt.live === true, 'the unknown phase is treated as open', sim.logGrep(/phase/).join(' | '));
  A.ok(sim.accepted().filter(p => p.t > o).length >= 2 && sim.status().direct === '8/8' && sim.status().cut === 40, 'the day runs: saves after the open, 8 of 8, 40%', JSON.stringify({ saves: sim.accepted().length, d: sim.status().direct, c: sim.status().cut }));
  await commonChecks(sim, A); return sim;
});

scenario('E5', 'the day opens with an unknown phase and NO day window: the loop cannot go live, the hand-saved core plays on', async A => {
  const sim = mkSim({ pasteBeforeMin: 10, game: { worldHook: (w, x) => { if (w.world.phase === 'open' || w.world.phase === 'golden') { w.world.phase = 'running'; w.day_window = { source: 'none' }; } } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); g.policy = () => 'reject';
  await sim.untilOpen(40 * 60);
  A.ok(g.patches.filter(p => p.t > o).length === 0, 'nothing is saved after the open', g.patches.length + '');
  A.ok(g.me.core === H.STATIC_CORE && g.pitches.length >= 15 && new Set(g.pitches.map(x => x.to)).size === g.pitches.length, 'the bot plays the fallback core: many targets, each pitched once', g.pitches.length + ' pitches to ' + new Set(g.pitches.map(x => x.to)).size + ' bots');
  A.ok(sim.logHas(/unknown phase "running": treated as not open/), 'logged', '');
  return sim;
});

scenario('E6', 'max_direct_members is 2: no flapping', async A => {
  const sim = mkSim({ game: { rules: r => { r.econ.max_direct_members = 2; } } }), g = sim.game, o = sim.openAt;
  g.policy = () => 'accept';
  await sim.untilOpen(60 * 60);
  const ch = cutChanges(sim, o);
  A.ok(g.directOf(ME).length === 2 && ch.length <= 2 && g.cutAt(sim.clock.now) === 40, 'two members, at most two cut changes in an hour, 40% at the end', ch.length + ' changes: ' + sim.logGrep(/CUT/).join(' | '));
  await commonChecks(sim, A); return sim;
});

scenario('E7', 'max_direct_members is 4, one member leaves, nobody answers: the burst ends by the time limits', async A => {
  const sim = mkSim({ game: { rules: r => { r.econ.max_direct_members = 4; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 1);
  await sim.untilOpen(10 * 60);
  richForest(sim);
  await sim.untilOpen(14 * 60);
  A.ok(sim.status().direct === '4/4' && sim.status().cut === 40, 'precondition: 4 of 4 at 40%', JSON.stringify({ d: sim.status().direct, c: sim.status().cut }));
  const X = nonHelperMembers(g); g.policy = () => 'silent'; const t0 = sim.clock.now; g.leave(X[0], 'LEDGER');
  await sim.until(t0 + 30 * MIN);
  const down = cutChanges(sim, t0).find(p => greedyOf(p) === 0), up = down && cutChanges(sim, down.sent).find(p => greedyOf(p) === 100);
  A.ok(down && up && up.sent - down.sent <= 12 * MIN + 150000 && sim.logHas(/CUT 10% -> 40% \((burst time limit|refill window over)/), 'with 3 of 4 members a burst starts and ends by the time limits (they apply from 3 members when the limit is 4)', down ? (up ? Math.round((up.sent - down.sent) / 1000) + ' s' : 'no end; ') + sim.logGrep(/CUT/).slice(-3).join(' | ') : 'no burst ' + sim.logGrep(/CUT/).join(' | '));
  await commonChecks(sim, A); return sim;
});

scenario('E8', 'no slot limit is served: 10% all day until the Golden Hour guard, 40% through the hour', async A => {
  const sim = mkSim({ goldenMin: 100, freezeMin: 160, game: { rules: r => { delete r.econ.max_direct_members; } } }), g = sim.game, o = sim.openAt, G = sim.schedGolden, F = sim.schedFreeze;
  helpersJoin(g); acceptFirst(g, 12);
  g.atOpenPlus(600, () => richForest(sim));
  await sim.until(F + 2 * MIN);
  const before = g.cutShare(o + 60000, G - 5 * MIN), gold = g.cutShare(G - 5 * MIN + 150000, F), ch = cutChanges(sim, o);
  A.ok(Object.keys(before).join() === '10', '10% from the open to 5 min before the Golden Hour', JSON.stringify(before));
  A.ok(Object.keys(gold).join() === '40' && ch.length === 1, '40% through the Golden Hour, one cut change in the day', JSON.stringify(gold) + ' ' + ch.length + ' ' + sim.logGrep(/CUT/).join(' | '));
  const late = g.patches.filter(p => p.status === 200 && p.sent > G - 28 * MIN - 5000 && p.sent < G - 5 * MIN && greedyOf(p) === 0).map(p => parsed(p).pitch);
  A.ok(late.length >= 1 && Game.parseCore(g.me.core).pitch !== null && late.every(x => /moves between 10% and 40% and will be 40% through the Golden Hour, to the freeze/.test(x)), 'the 10% pitch in the run-up says the cut will be 40% through the Golden Hour', late[0]);
  await commonChecks(sim, A); return sim;
});

scenario('E9', 'the open comes 45 minutes late: the loop keeps reading once a minute and goes live within a minute', async A => {
  const sim = mkSim({ pasteAt: Date.parse('2026-11-12T03:12:00Z'), openOffsetMs: 45 * MIN, game: {} }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.until(o - 1000);
  const last10 = g.requests.filter(r => r.t > o - 10 * MIN && r.t < o);
  A.ok(last10.length >= 9, 'in the ten minutes before the late open the world is read about once a minute', last10.length + ' reads');
  await sim.untilOpen(75);
  A.ok(sim.pw().rt.live === true && sim.logHas(/NEW DAY 3 /), 'live within 75 s of the late open', sim.log.slice(-3).join(' | '));
  A.ok(g.me.core !== '' && g.wakes.length >= 1 && g.wakes[0].sent.length === 3, 'the first wake pitched three (the fallback core was still in place)', JSON.stringify(g.wakes[0]));
  await sim.untilOpen(12 * 60);
  A.ok(sim.status().direct === '8/8', 'the opening fills', sim.status().direct);
  await commonChecks(sim, A, { skipRate: true }); return sim;
});

scenario('E10', 'the own feed shows no persuade events at all; the notes still say DONE: names', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt;
  helpersJoin(g); g.policy = () => 'silent';
  const wake0 = g.wake.bind(g);
  g.wake = () => { wake0(); const w = g.wakes[g.wakes.length - 1]; g.me.notes = w.sent.length ? 'DONE: ' + w.sent.join(', ') : 'IDLE'; g.ownFeed = g.ownFeed.filter(e => e.type !== 'msg.persuade'); };
  await sim.untilOpen(60 * 60);
  const cnt = {}; g.pitches.forEach(x => { cnt[x.to] = (cnt[x.to] || 0) + 1; });
  const max = Math.max(...Object.values(cnt));
  A.ok(sim.logHas(/WARNING: the own feed shows no pitch to .*: they are counted as pitched/), 'the warning is logged', sim.logGrep(/WARNING/).join(' | '));
  A.ok(max <= 3 && Object.keys(cnt).length >= 20, 'no bot is pitched more than three times in an hour and the list moves on', 'max ' + max + ', ' + g.pitches.length + ' pitches to ' + Object.keys(cnt).length + ' bots');
  return sim;
});

scenario('E11', 'importDay2 classification', async A => {
  const sim = mkSim({ pasteBeforeMin: 60 }), pw = sim.pw();
  const r = JSON.parse(pw.importDay2(JSON.stringify({ never: { learned_a: 1, dapper_observer: 1, moth: 1, otter_telemetry: 1, was_member_x: 1, 'bad name!': 1, LEDGER: 1, leosharkpark: 1, plain_flag: 1 }, block: { learned_a: 1, dapper_observer: 1, otter_telemetry: 1, was_member_x: 1, leosharkpark: 1 }, everMine: { dapper_observer: 1, was_member_x: 1 }, helpers: ['new_helper'] })));
  A.ok(r.neverPitchAdded.join() === 'learned_a,otter_telemetry,was_member_x' && r.noSecondPitchAdded.join() === 'moth,plain_flag' && r.helpersAdded.join() === 'new_helper' && r.skipped.join() === 'bad name!', 'never / once / helpers / skipped', JSON.stringify(r));
  const r2 = JSON.parse(pw.importDay2(['only_names_a', 'sage_bode']));
  A.ok(r2.neverPitchAdded.join() === 'only_names_a,sage_bode', 'a plain array is taken as never-pitch names', JSON.stringify(r2));
  const st = sim.status();
  A.ok(st.neverLearned.includes('learned_a') && st.noSecondPitch.includes('dapper_observer') && st.noSecondPitch.includes('moth') && st.helpers.includes('new_helper'), 'status shows them', JSON.stringify({ n: st.neverLearned, o: st.noSecondPitch }));
  const st2 = JSON.parse(await sim.manual(() => pw.cycle()));
  A.ok(/on the bot, but it lists never-pitch or helper names \(sage_bode, otter_telemetry\)/.test(st2.fallbackCore), 'cycle() names the fallback-core targets that are now never-pitch', st2.fallbackCore);
  await sim.until(sim.openAt - 500);
  const pre = sim.game.patches[0];
  A.ok(pre && pre.body.core !== H.STATIC_CORE && !parsed(pre).targets.includes('sage_bode') && parsed(pre).exp === 8, 'so the opening save replaces that core with the loop\'s own', pre ? parsed(pre).targets.join() : 'none');
  return sim;
});

scenario('E12', 'a dapper_observer-like "no second pitch" name: one pitch a day, never as a former member', async A => {
  const sim = mkSim({ goldenMin: 80, freezeMin: 140 }), g = sim.game, o = sim.openAt, G = sim.schedGolden;
  helpersJoin(g);
  g.policy = n => (n === 'dapper_observer' ? 'accept' : 'reject');
  await sim.untilOpen(30 * 60);
  const j = g.joins.find(x => x.name === 'dapper_observer');
  A.ok(j && j.type === 'conversion', 'scenario: dapper_observer was pitched once and joined', JSON.stringify(j));
  g.leave('dapper_observer', '');
  await sim.until(G + 2 * MIN);
  const n = g.pitches.filter(x => x.to === 'dapper_observer').length;
  A.ok(n === 1, 'it is not pitched again as an independent former member (not even in the pre-golden window)', n + ' pitches');
  return sim;
});

scenario('E13', 'the engine pays the first-pair bounty on every join (the pair quirk is gone): former members are switched off after the first repeat', async A => {
  const sim = mkSim({ goldenMin: 200, freezeMin: 260 }), g = sim.game, o = sim.openAt;
  helpersJoin(g); g.policy = () => 'accept';
  g.atOpenPlus(1, () => { g.pair = { has: () => false, add: () => {} }; });                    // no pair is ever recorded
  g.atOpenPlus(600, () => { const roots = ['LEDGER', 'zesty_coldstart', 'QUORUM_KEEPER']; let i = 0; for (const r of g.rows.values()) { if (r.name === ME || g.rootOf(r.name) === ME || roots.includes(r.name)) continue; r.allegiance = roots[i++ % 3]; } for (const n of roots) { g.rows.get(n).allegiance = ''; g.cuts[n] = 10; } });
  const minute = () => { if (!g.live()) return; const X = nonHelperMembers(g); if (X.length) g.leave(X[0], ''); };
  for (let t = o + 12 * MIN; t < o + 150 * MIN; t += 9 * MIN) g.at(t, minute);
  await sim.untilOpen(160 * 60);
  const rep = g.repeatBounty.filter(x => !x.self);
  A.ok(rep.length <= 2 && sim.logHas(/the plain-pair rule does not hold today, former members are not pitched again/), 'at most two repeat bounties (the one that trips the switch, plus a list already saved)', rep.length + ': ' + rep.map(x => hhmmss(x.t) + ' ' + x.name).join());
  const t1 = rep.length ? rep[0].t + 150000 : 0;
  const later = g.pitches.filter(x => x.t > t1 && x.wasMember && !x.isMember);
  A.ok(rep.length >= 1 && later.length === 0 && sim.status().formerMembersOff === true, 'after that no former member is pitched', later.length + ' pitches');
  return sim;
});

scenario('E14', 'the PATCH answer shows the bot as it was before the edit (stale cut); GET /api/bot is right', async A => {
  const sim = mkSim({ goldenMin: 80, freezeMin: 140 }), g = sim.game, G = sim.schedGolden, F = sim.schedFreeze;
  const patch0 = g.patch.bind(g);
  g.patch = (raw, req) => { const before = g.me.cut_pct, res = patch0(raw, req); if (res.status === 200) res.json = Object.assign({}, res.json, { cut_pct: before }); return res; };
  helpersJoin(g); acceptFirst(g, 5);
  g.atOpenPlus(600, () => richForest(sim));
  g.at(G - 31 * MIN, x => { const X = nonHelperMembers(x); x.policy = () => 'silent'; x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
  await sim.until(F + 2 * MIN);
  A.ok(!sim.logHas(/the greedy dial did not move the cut/), 'no dead-dial hold', sim.logGrep(/dial/).join(' | '));
  const share = g.cutShare(G - 5 * MIN + 25000, F);
  A.ok(Object.keys(share).join() === '40', '40% from the force time to the freeze', JSON.stringify(share));
  await commonChecks(sim, A); return sim;
});

scenario('E15', 'the server answers HTTP 400 to every save with greedy 100', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  g.patchMode = rec => (rec.body && rec.body.sliders && rec.body.sliders.greedy === 100) ? { status: 400, json: { error: 'greedy out of range' } } : 'ok';
  await sim.untilOpen(40 * 60);
  const bad = g.patches.filter(p => p.status === 400);
  let minGap = Infinity; for (let i = 1; i < bad.length; i++) minGap = Math.min(minGap, bad[i].sent - bad[i - 1].sent);
  A.ok(bad.length >= 4 && bad.length <= 14 && minGap >= 18000, 'the refused cut change is retried with a growing wait, not every 20 s', bad.length + ' attempts in ~30 min, smallest gap ' + Math.round(minGap / 1000) + ' s');
  A.ok(sim.logHas(/four cut changes in a row were refused/), 'the policy pauses after four refusals', sim.logGrep(/WARNING/).join(' | '));
  await commonChecks(sim, A); return sim;
});

scenario('E16', 'leader profiles answer HTTP 429', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  g.atOpenPlus(600, () => richForest(sim));
  g.fault = rec => /^\/api\/bots\//.test(rec.url) ? { status: 429, text: '{"error":"slow down"}' } : null;
  await sim.untilOpen(40 * 60);
  const prof = g.requests.filter(r => /^\/api\/bots\//.test(r.url) && r.t > o + 600000);
  A.ok(prof.length <= 8 && sim.logHas(/leader profiles answer HTTP 429/), 'at most one profile read per five minutes after a 429', prof.length + ' profile reads in 30 min');
  await commonChecks(sim, A); return sim;
});

scenario('E17', 'core_max is 1450', async A => {
  const sim = mkSim({ game: { rules: r => { r.limits.core_max = 1450; } } }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(20 * 60);
  const live = g.patches.filter(p => p.sent > o && p.status === 200 && parsed(p).targets.length);
  A.ok(live.length >= 2 && live.every(p => p.body.core.length <= 1450 && parsed(p).calls === Math.min(3, parsed(p).targets.length)) && sim.status().direct === '8/8', 'cores fit 1450 and the opening fills', live.map(p => p.body.core.length + '/' + parsed(p).targets.length).join(' '));
  await commonChecks(sim, A); return sim;
});

scenario('E18', 'the game marks the bot as idle with reduced income', async A => {
  const sim = mkSim({}), g = sim.game;
  helpersJoin(g); acceptFirst(g, 5);
  g.atOpenPlus(900, x => { x.me.idle = true; x.me.income_pct = 60; });
  await sim.untilOpen(20 * 60);
  A.ok(sim.logHas(/IDLE PENALTY: the game marks the bot as quiet \(idle true, it earns 60% of base income\)/) && sim.status().idle === true && sim.status().incomePct === 60, 'logged and in status', sim.logGrep(/IDLE/).join(' | '));
  return sim;
});

scenario('E19', 'pre-golden window with a full tree: the 10% pitch says what is ahead; numbers checked', async A => {
  const sim = mkSim({ goldenMin: 80, freezeMin: 140 }), g = sim.game, G = sim.schedGolden;
  helpersJoin(g); acceptFirst(g, 5);
  g.atOpenPlus(600, () => richForest(sim));
  g.at(G - 31 * MIN, x => { const X = nonHelperMembers(x); x.policy = () => 'silent'; x.leave(X[0], 'LEDGER'); x.leave(X[1], 'LEDGER'); });
  await sim.until(G + 60000);
  const win = g.patches.filter(p => p.status === 200 && greedyOf(p) === 0 && p.sent >= G - 28 * MIN);
  const want = "sullen_nyquist's cut is 10% right now; it moves between 10% and 40% and will be 40% through the Golden Hour, to the freeze: you keep 15.2 coins a tick at 10% and 12.8 at 40%. The arithmetic line shows the numbers as they are now. Set allegiance to sullen_nyquist now.";
  A.ok(win.length >= 3 && win.every(p => parsed(p).pitch === want), 'every 10% save in the window carries the run-up text', win.length + ' saves; ' + (win[0] ? parsed(win[0]).pitch : ''));
  A.ok(win.every(p => parsed(p).targets.length >= 2 || parsed(p).targets.length === 0) && win.every(p => p.body.core.length <= 1500), 'and still lists its names (two slots are free)', win.map(p => parsed(p).targets.length).join());
  const sent = g.pitches.filter(x => x.t >= G - 25 * MIN && x.cut === 10);
  A.ok(sent.length >= 3 && sent.every(x => /will be 40% through the Golden Hour/.test(x.text)), 'pitches sent at 10% in the window say so', sent.length + '');
  await commonChecks(sim, A); return sim;
});

scenario('E20', 'the leaderboard cannot be read from the open on, for 40 minutes', async A => {
  const sim = mkSim({ pasteBeforeMin: 10 }), g = sim.game, o = sim.openAt;
  helpersJoin(g); acceptFirst(g, 5);
  g.fault = rec => (rec.t >= o - 5 * MIN && rec.t < o + 40 * MIN && /leaderboard/.test(rec.url)) ? { status: 500, text: 'x' } : null;
  await sim.untilOpen(39 * 60);
  const live = g.patches.filter(p => p.sent > o);
  A.ok(g.patches.filter(p => p.sent < o).length === 1 && g.patches[0].body.core === H.STATIC_CORE, 'the opening save left the fallback core in place', '');
  A.ok(g.joins.length === 8 && g.pitches.length >= 5, 'the fallback core recruited: 8 members', g.joins.length + ' joins, ' + g.pitches.length + ' pitches');
  A.ok(live.length === 1 && greedyOf(live[0]) === 100 && parsed(live[0]).targets.length === 0 && /in a tree paying the full x2\.00/.test(parsed(live[0]).pitch), 'the only save is the switch to 40% when the slots are full, with the full-tree text', live.map(p => hhmmss(p.sent) + ' g' + greedyOf(p)).join() + ' ' + sim.logGrep(/CUT/).join(' | '));
  await sim.untilOpen(50 * 60);
  A.ok(sim.logHas(/the leaderboard answers again/) && sim.status().boardUnreadable === false, 'normal again when the board returns', sim.log.slice(-3).join(' | '));
  await commonChecks(sim, A); return sim;
});

scenario('E21', '/api/bot shows no cut_pct at all', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt;
  const bp = g.botPrivate.bind(g); g.botPrivate = () => { const b = bp(); delete b.cut_pct; return b; };
  helpersJoin(g); acceptFirst(g, 5);
  await sim.untilOpen(20 * 60);
  A.ok(sim.accepted().filter(p => p.t > o).length >= 3 && g.joins.length === 8, 'the loop keeps saving and the opening fills', sim.accepted().length + ' saves, ' + g.joins.length + ' joins, cut ' + g.me.cut_pct);
  A.ok(g.me.cut_pct === 40, 'and reaches 40%', sim.logGrep(/CUT/).join(' | '));
  return sim;
});

scenario('E22', 'a bot that carries a member is only listed in a single-wake list', async A => {
  const sim = mkSim({}), g = sim.game, o = sim.openAt, B = 'glum_replicaset';
  helpersJoin(g); g.policy = () => 'reject';
  g.atOpenPlus(60, x => x.setAllegiance('wily_backlog', B));
  await sim.untilOpen(30 * 60);
  const withB = g.patches.filter(p => p.status === 200 && p.sent > o + 80000 && parsed(p).targets.includes(B));      // from the moment it carries a member
  A.ok(withB.length >= 1 && withB.every(p => parsed(p).exp <= p.tick + 1), 'every list that names it expires one tick after the save', withB.map(p => 'tick ' + p.tick + ' exp ' + parsed(p).exp).join(', '));
  const pit = g.pitches.filter(x => x.to === B);
  A.ok(pit.length >= 1, 'and it is pitched', pit.length + ' pitches; wakes expired: ' + g.wakes.filter(w => /expired/.test(w.idle)).length + ' of ' + g.wakes.length);
  const twice = []; for (const p of withB) { const ws = g.wakes.filter(w => w.t > p.t && w.targets.includes(B) && w.exp === parsed(p).exp && w.sent.includes(B)); if (ws.length > 1) twice.push(hhmmss(p.sent)); }
  A.ok(twice.length === 0, 'no such list served two wakes', twice.join());
  await commonChecks(sim, A); return sim;
});

scenario('E23', 'no persuade events and the notes never change; only the wake events show the calls', async A => {
  const sim = mkSim({}), g = sim.game;
  helpersJoin(g); g.policy = () => 'silent';
  const wake0 = g.wake.bind(g);
  g.wake = () => { wake0(); g.ownFeed = g.ownFeed.filter(e => e.type !== 'msg.persuade' && e.type !== 'notes.updated'); };
  await sim.untilOpen(60 * 60);
  const cnt = {}; g.pitches.forEach(x => { cnt[x.to] = (cnt[x.to] || 0) + 1; });
  A.ok(sim.logHas(/a wake with 3 persuade call\(s\) followed the save/) && Math.max(...Object.values(cnt)) <= 3 && Object.keys(cnt).length >= 20, 'the list moves on by the wake events', 'max ' + Math.max(...Object.values(cnt)) + ', ' + g.pitches.length + ' pitches to ' + Object.keys(cnt).length + ' bots; ' + sim.logGrep(/WARNING/).join(' | '));
  return sim;
});

scenario('E24', 'the own feed shows nothing of the bot at all (no persuade, no wake, no notes): the reviewer\'s case', async A => {
  const sim = mkSim({}), g = sim.game;
  helpersJoin(g); g.policy = () => 'silent';
  const wake0 = g.wake.bind(g);
  g.wake = () => { wake0(); g.ownFeed = g.ownFeed.filter(e => e.type !== 'msg.persuade' && e.type !== 'notes.updated' && e.type !== 'wake'); };
  await sim.untilOpen(60 * 60);
  const cnt = {}; g.pitches.forEach(x => { cnt[x.to] = (cnt[x.to] || 0) + 1; });
  A.ok(sim.logHas(/nothing shows the bot's wakes today/) && Object.keys(cnt).length >= 12, 'after ten minutes the list moves on by time alone', 'max ' + Math.max(...Object.values(cnt)) + ', ' + g.pitches.length + ' pitches to ' + Object.keys(cnt).length + ' bots; ' + sim.logGrep(/WARNING/).join(' | '));
  A.ok(Math.max(...Object.values(cnt)) <= 6, 'no bot is pitched more than six times in the hour (the first ten minutes repeat)', JSON.stringify(cnt));
  return sim;
});

(async () => {
  let bad = 0;
  for (const s of list) {
    if (only.length && !only.includes(s.id)) continue;
    const sc = { checks: [], notes: [] }, A = asserter(sc); let err = null;
    try { await s.fn(A); } catch (e) { err = e; }
    const failed = sc.checks.filter(c => !c.passed);
    console.log((failed.length || err ? 'FAIL' : 'PASS') + '  ' + s.id.padEnd(4) + s.title + '  [' + (sc.checks.length - failed.length) + '/' + sc.checks.length + ']');
    if (err) { console.log('      ERROR ' + (err.stack || err)); bad++; }
    for (const c of failed) { bad++; console.log('      FAILED: ' + c.name + '\n              ' + String(c.detail).split('\n').join('\n              ').slice(0, 900)); }
  }
  console.log(bad ? bad + ' failed checks' : 'all extra checks passed');
  process.exit(bad ? 1 : 0);
})();
