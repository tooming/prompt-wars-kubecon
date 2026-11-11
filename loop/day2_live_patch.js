// Paste AFTER day2_live.js. These are the changes made during day 2 once the 8-member cap dynamics were clear:
//   1. core tick with an expiry on the TARGETS line (dead-man switch: if this loop dies, the bot idles within ~6 ticks)
//   2. cycle economics: at 40% pitch only brand-new bots; refill in short bursts at 10%; back to 40% when full
//   3. slot reservation for helper bots, blocking of bots that already left (their first-pair bounty is spent)
//   4. on a drop to 10%, member-less bots of the largest rival tree go first ("Poach the giant", 150, once a day)
//   5. cycle(): one-call status with rivals
// What was observed: members rarely leave the tree, they move under a sibling that offers 10%, which frees a direct
// slot every few minutes. Each refill with a NEW bot pays ~190. A burst at 10% that filled two slots also paid the
// Poach bounty. Low-odds pitches at 40% cost about half the income before rule 2 was added.
(() => {
  const ap = window.__ap2, ME = 'sullen_nyquist', j = ap._j;
  const say = s => { ap.log.push(new Date().toISOString().slice(11, 19) + ' ' + s); if (ap.log.length > 200) ap.log.shift(); };

  // ---- 1. core tick with EXPIRES ----
  const OLD_LAST = 'If TARGETS has fewer than four names, pitch only those and call nothing else. If TARGETS is empty, your only tool call is remember: "IDLE": never persuade, whisper or chat to fill a wake.';
  const NEW_LAST = 'Pitch only bots listed in TARGETS. If TARGETS is empty, or the current tick is past the EXPIRES tick, your only tool call is remember: "IDLE": never persuade, whisper or chat to fill a wake.';
  ap.ttl = 6; ap.headOf = T => { const h = ap._HEAD(ap._pitchFor(T)); return h.includes(OLD_LAST) ? h.replace(OLD_LAST, NEW_LAST) : h; };
  ap._tickCore = async () => {
    if (ap.busy || !ap.enabled) return; ap.busy = true;
    try {
      const world = await j('/api/world'); ap.phase = world.world.phase; ap.day = world.world.day; ap.opened = world.world.opened_at; const tick = world.world.tick; ap.tickNo = tick;
      const E = world.econ || {}, Lm = world.limits || {};
      ap.econ = { base: E.base_income ?? 8, per: (E.tree_bonus_pct ?? 25) / 100, max: (E.tree_bonus_max ?? 100) / 100 }; ap.fullAt = Math.ceil(ap.econ.max / ap.econ.per - 1e-9);
      ap.cooldownMs = (Lm.edit_cooldown_s ?? 120) * 1000 + 6300; ap.coreMax = Lm.core_max ?? 1500;
      ap.world = { twist: world.twist, costs: world.costs, econ: E, limits: Lm, hidden: world.dials_hidden, bounties: (world.bounties || []).filter(b => b.active).map(b => b.title + ':' + b.reward + ':' + b.claims) };
      if (world.twist !== ap.twistAck) { if (!ap.dry) say('TWIST "' + world.twist + '" is new: dry until acknowledged'); ap.dry = true; }
      const mult = n => 1 + Math.min(ap.econ.max, ap.econ.per * (n - 1));
      const bot = await j('/api/bot'), feed = await j('/api/bot/feed?limit=80'), lb = await j('/api/leaderboard?limit=200');
      ap.bot = { coins: bot.coins, rank: bot.rank, allegiance: bot.allegiance, notes: bot.notes, members: (bot.members || []).map(m => m.name), cut: bot.cut_pct };
      if (typeof bot.cut_pct === 'number') ap.myCut = bot.cut_pct;
      const liveNow = ap.phase === 'open' || ap.phase === 'golden';
      if (bot.allegiance && liveNow && !ap.warnedLeader) { ap.warnedLeader = 1; say('WARNING: bot has a leader: ' + bot.allegiance); }
      const since = ap.opened || '';
      for (const e of (feed.events || feed)) {
        const p = e.payload || {}; if (e.ts < since) continue;
        if (e.type === 'reflection' && p.proposer === ME && !ap.seenEv['r' + e.id]) { ap.seenEv['r' + e.id] = 1; const pr = ((p.steps || [])[0] || {}).prompt || ''; const a = /you earn ([\d.]+) coins\/tick now/.exec(pr), b = /you would earn ([\d.]+) coins\/tick/.exec(pr), c = /one-off cost of (\d+) coins/.exec(pr); ap.lines[p.bot] = (a && b) ? { now: +a[1], then: +b[1], cost: c ? +c[1] : null, change: p.change, at: Date.parse(e.ts) } : { change: p.change, at: Date.parse(e.ts) }; }
        if (e.type === 'msg.persuade' && p.from === ME) { if (!ap.seenEv[e.id]) { ap.seenEv[e.id] = 1; ap.pcount[p.to] = (ap.pcount[p.to] || 0) + 1; } ap.pitched[p.to] = Math.max(ap.pitched[p.to] || 0, Date.parse(e.ts)); }
        if (e.type === 'gift' && p.to === ME && !ap.seenEv[e.id]) { ap.seenEv[e.id] = 1; say('GIFT ' + p.amount + ' from ' + p.from); }
        if (e.type === 'bounty.claimed' && p.bot === ME && !ap.seenEv[e.id]) { ap.seenEv[e.id] = 1; say('BOUNTY ' + p.title + ' +' + p.reward); if (/Poach/.test(p.title)) ap.poachDone = true; }
        if ((e.type === 'conversion' || e.type === 'schism' || e.type === 'coup') && (p.leader === ME || p.new_leader === ME) && p.old_leader !== ME) { if (!ap.recruited[p.bot]) say('RECRUIT ' + p.bot + ' fee ' + p.fee_to_leader + ' bounty ' + p.bounty_to_leader + (p.self_initiated ? ' (joined by itself)' : '')); ap.recruited[p.bot] = e.ts; }
      }
      const rows = lb.rows || []; const by = Object.fromEntries(rows.map(r => [r.name, r]));
      if (!ap.known) ap.known = new Set(rows.map(r => r.name));
      rows.filter(r => !ap.known.has(r.name)).forEach(r => { ap.known.add(r.name); say('NEW bot ' + r.name + (r.allegiance ? ' under ' + r.allegiance : ' independent')); });
      const rootOf = n => { let c = n, k = 0; while (by[c] && by[c].allegiance && k++ < 60) c = by[c].allegiance; return c; };
      const size = {}; rows.forEach(r => { const rt = rootOf(r.name); size[rt] = (size[rt] || 0) + 1; });
      const sub = {}; rows.forEach(r => { let c = r.name, k = 0; sub[c] = (sub[c] || 0) + 1; while (by[c] && by[c].allegiance && k++ < 60) { c = by[c].allegiance; sub[c] = (sub[c] || 0) + 1; } });
      const leaders = [...new Set(rows.map(r => r.allegiance).filter(Boolean))];
      const T = size[rootOf(ME)] || 1; ap.T = T; ap.treeSizes = Object.entries(size).sort((a, b) => b[1] - a[1]).slice(0, 4);
      const maxD = E.max_direct_members ?? 99; ap.maxDirect = maxD; const direct = rows.filter(r => r.allegiance === ME).length; ap.direct = direct;
      const anc = new Set(); { let c = ME, k = 0; while (by[c] && by[c].allegiance && k++ < 60) { c = by[c].allegiance; anc.add(c); } }
      const under = n => { let c = n, k = 0; while (by[c] && by[c].allegiance && k++ < 60) { c = by[c].allegiance; if (c === ME) return true; } return false; };
      const gain = {}, retry = {}, cand = [];
      for (const r of rows) {
        const n = r.name; if (n === ME || anc.has(n) || under(n) || ap.block[n] || r.status !== 'active') continue;
        const L = r.allegiance, s = sub[n] || 1, alone = !L && s === 1;
        const cur = ap.econ.base * mult(size[rootOf(n)] || 1) - (L ? ap.econ.base * (ap.cuts[L] ?? 10) / 100 : 0);
        const sameTree = rootOf(n) === rootOf(ME); const g = ap._payAfter(sameTree ? T - s : T, s) - cur; gain[n] = Math.round(g * 100) / 100;
        if (g < ap.minGain) continue; if (T < ap.fullAt && !alone) continue;
        if (ap.pitched[n]) { if (ap.never[n] || (ap.pcount[n] || 1) >= ap.maxTries || Date.now() - ap.pitched[n] < ap.retryAfterMs || g < ap.retryMinGain) continue; retry[n] = 1; }
        cand.push(n);
      }
      const pr = n => { const i = ap.prio.indexOf(n); return i < 0 ? 999 : i; };
      const fresh = n => !retry[n] && !by[n].allegiance && !by[n].is_house && (sub[n] || 1) === 1 && pr(n) === 999 ? 1 : 0;
      cand.sort((a, b) => ((retry[a] ? 1 : 0) - (retry[b] ? 1 : 0)) || (T >= ap.fullAt ? fresh(b) - fresh(a) : 0) || (pr(a) - pr(b)) || (gain[b] - gain[a]));
      ap.queue = cand; ap.gain = gain; ap.retry = retry;
      const nowMs = Date.now();
      const pendingN = Object.keys(ap.pitched).filter(n => nowMs - ap.pitched[n] < 200000 && !ap.recruited[n] && !(ap.lines[n] && ap.lines[n].at >= ap.pitched[n] - 1000)).length;
      const free = Math.max(0, Math.max(0, maxD - direct - pendingN) + (ap.extraSlots || 0)); ap.free = free; ap.pendingN = pendingN;
      const head = ap.headOf(T); let l = cand.slice(0, Math.min(40, free));
      const build = () => head + '\nTARGETS: ' + l.join(', ') + (l.length ? '\nEXPIRES: tick ' + (tick + ap.ttl) : '');
      while (build().length > ap.coreMax && l.length) l.pop();
      const core = build(); ap.core = core; ap.list = l;
      const left = ap.cooldownMs - (Date.now() - ap.lastPatch);
      const tail = bot.core.split('\nTARGETS: ')[1] || ''; const curTop = (tail.split('\n')[0] || '').split(', ').filter(Boolean).slice(0, 8).join(); const ex = /EXPIRES: tick (\d+)/.exec(tail); const curExp = ex ? +ex[1] : null;
      const stale = l.length > 0 && (curExp === null || curExp - tick <= 2);
      const dirty = bot.core.split('\nTARGETS: ')[0] !== head || curTop !== l.slice(0, 8).join() || stale;
      if ((dirty || ap.force) && liveNow && !ap.dry) {
        if (left <= 0) { const r = await ap._save(bot, core); if (r.ok) { ap.lastPatch = Date.now(); ap.force = false; say('PATCH ok tick ' + tick + ' T=' + T + ' direct ' + direct + '/' + maxD + ' pending ' + pendingN + ' list: ' + l.slice(0, 8).map(n => n + '(' + gain[n] + ')').join(', ')); } else say('PATCH fail ' + JSON.stringify(r)); }
        else if (!ap.pending) ap.pending = setTimeout(() => { ap.pending = null; ap.tick(); }, left + 200);
      }
      ap.last = new Date().toISOString();
      const all = Date.now() - ap.cutsAt > 240000; const todo = all ? leaders : leaders.filter(x => ap.cuts[x] === undefined);
      for (const x of todo) { try { ap.cuts[x] = (await j('/api/bots/' + encodeURIComponent(x))).cut_pct; } catch (e) {} await new Promise(r => setTimeout(r, 250)); }
      if (all) ap.cutsAt = Date.now();
    } catch (e) { say('ERR ' + e.message); } finally { ap.busy = false; }
  };

  // ---- cut switch (with EXPIRES) and the "largest rival tree first" ordering on a drop to 10% ----
  const switchPlain = async (newCut, why) => {
    const bot = await j('/api/bot'); const old = bot.cut_pct; if (old === newCut) return { ok: true, same: true };
    const greedy = Math.max(0, Math.min(100, Math.round((newCut - 10) / 0.3))); const delta = ap.econ.base * (old - newCut) / 100;
    const free = Math.max(0, ap.maxDirect - ap.direct - (ap.helpersWaiting || 0)); const idx = n => { const i = ap.prio.indexOf(n); return i < 0 ? 999 : i; };
    let l = []; if (free > 0) l = Object.keys(ap.gain).filter(n => ap.gain[n] + delta >= 0.2 && !ap.block[n] && !ap.never[n] && !(ap.pitched[n] && ((ap.pcount[n] || 1) >= ap.maxTries || Date.now() - ap.pitched[n] < ap.retryAfterMs))).sort((x, y) => idx(x) - idx(y)).slice(0, Math.min(12, free + 2));
    const prevCut = ap.myCut; ap.myCut = newCut; const head = ap.headOf(ap.T); const build = () => head + '\nTARGETS: ' + l.join(', ') + (l.length ? '\nEXPIRES: tick ' + ((ap.tickNo || 0) + ap.ttl) : '');
    while (build().length > ap.coreMax && l.length) l.pop();
    const prevS = ap.sliders, prevT = ap.tagline; ap.sliders = Object.assign({}, bot.sliders, { greedy }); ap.tagline = newCut <= 10 ? ap.TAG.low : ap.TAG.high;
    const r = await ap._save(bot, build());
    if (r.ok) { ap.lastPatch = Date.now(); ap.mode = newCut <= 10 ? 'recruit' : 'harvest'; ap.modeSince = Date.now(); say('CUT ' + old + '% -> ' + newCut + '% (' + why + '), direct ' + ap.direct + '/' + ap.maxDirect + ', targets: ' + (l.slice(0, 6).join(', ') || 'none')); }
    else { ap.myCut = prevCut; ap.sliders = prevS; ap.tagline = prevT; say('CUT switch failed ' + JSON.stringify(r).slice(0, 120)); }
    return r;
  };
  ap.switchCut = async (newCut, why) => {
    try {
      if (newCut <= 10 && !ap.poachDone) {
        const rows = (await j('/api/leaderboard?limit=200')).rows; const by = Object.fromEntries(rows.map(r => [r.name, r]));
        const rootOf = n => { let c = n, k = 0; while (by[c] && by[c].allegiance && k++ < 60) c = by[c].allegiance; return c; };
        const size = {}; rows.forEach(r => { const rt = rootOf(r.name); size[rt] = (size[rt] || 0) + 1; });
        const big = Object.entries(size).sort((a, b) => b[1] - a[1])[0]; const hasKids = new Set(rows.map(r => r.allegiance).filter(Boolean));
        const giant = rows.filter(r => rootOf(r.name) === big[0] && r.name !== big[0] && !hasKids.has(r.name) && !r.is_house && !ap.block[r.name] && !ap.never[r.name] && (ap.cuts[r.allegiance] ?? 10) > 12).sort((a, b) => (ap.cuts[b.allegiance] || 0) - (ap.cuts[a.allegiance] || 0)).map(r => r.name);
        if (!ap.prioSaved) ap.prioSaved = ap.prio.slice();
        if (big[0] !== ME) { ap.prio = giant.concat(ap.prioSaved.filter(n => !giant.includes(n))); say('BURST: largest tree ' + big[0] + ' (' + big[1] + '), poach candidates: ' + giant.slice(0, 5).join(', ')); }
      } else if (ap.prioSaved) ap.prio = ap.prioSaved;
    } catch (e) { say('burst prep ERR ' + e.message); }
    return switchPlain(newCut, why);
  };

  // ---- 2. policy: 40% when full; refill in bursts at 10% ----
  ap.helpers = ap.helpers || []; ap.everMine = ap.everMine || {};
  ap.burstFree = 2; ap.burstEveryMs = 5 * 60000; ap.maxRecruitMs = 8 * 60000; ap.HIGH = 40;
  ap.policy = async () => {
    if (!ap.policyOn || !(ap.phase === 'open' || ap.phase === 'golden') || ap.dry) return;
    if (ap.cooldownMs - (Date.now() - ap.lastPatch) > 0) return;
    const direct = ap.direct || 0, maxD = ap.maxDirect || 8, cur = ap.myCut, free = maxD - direct - (ap.helpersWaiting || 0), age = Date.now() - (ap.modeSince || 0);
    if (cur <= 10) {
      if (maxD - direct <= 0) return ap.switchCut(ap.HIGH, 'slots full');
      if (direct >= 5 && age > ap.maxRecruitMs && (ap.pendingN || 0) === 0) return ap.switchCut(ap.HIGH, 'refill window over');
    } else {
      if (direct < 3) return ap.switchCut(10, 'fewer than 3 members');
      const fresh = (ap.queue || []).filter(n => !ap.retry[n]).length;
      if (!fresh && ap.phase === 'open' && (free >= ap.burstFree || (free >= 1 && age > ap.burstEveryMs))) return ap.switchCut(10, free + ' slot(s) to refill');
    }
  };

  // ---- 3. the tick the timer calls ----
  ap.tick = async () => {
    if (ap.busy || !ap.enabled) return;
    try { const w = await j('/api/world'); const o = w.world.opened_at; if (ap.resetFor !== o) { const first = ap.resetFor === undefined; ap.resetFor = o; ap.pitched = {}; ap.pcount = {}; ap.recruited = {}; ap.lines = {}; ap.seenEv = {}; ap.gainAtPitch = {}; ap.everMine = {}; ap.warnedLeader = 0; say(first ? 'state cleared' : 'NEW DAY: state cleared'); } } catch (e) {}
    try {   // bots that were members and left: their first-pair bounty is spent, do not chase them
      const now = new Set((ap.bot && ap.bot.members) || []); Object.keys(ap.recruited || {}).forEach(n => { ap.everMine[n] = 1; }); now.forEach(n => { ap.everMine[n] = 1; });
      for (const n of Object.keys(ap.everMine)) if (!now.has(n) && !ap.block[n] && !ap.helpers.includes(n)) { ap.block[n] = 1; say('LEFT: ' + n); }
    } catch (e) {}
    if (ap.prioEarly && ap.prioLate && !ap.prioSaved) { if (ap.T >= ap.fullAt && !ap.lateOn) { ap.prio = ap.prioLate; ap.lateOn = true; } else if (ap.T < ap.fullAt && ap.lateOn) { ap.prio = ap.prioEarly; ap.lateOn = false; } }
    const d = ap.direct || 0, m = ap.maxDirect || 8; const mem = new Set((ap.bot && ap.bot.members) || []);
    const waiting = ap.helpers.filter(n => !mem.has(n)).length; ap.helpersWaiting = waiting;       // helper bots join by themselves: keep a slot free
    const high = ap.myCut >= 40; const base = high ? 0 : (d <= 4 ? 3 : d <= m - 2 ? 2 : d < m ? 1 : 0); const avail = Math.max(0, m - d - (ap.pendingN || 0));
    ap.extraSlots = Math.max(-avail, base - waiting * 2); ap.minGain = high ? 4.5 : 0.2; ap.retryMinGain = high ? 99 : 2;
    try { await ap.policy(); } catch (e) { say('POLICY ERR ' + e.message); }
    return ap._tickCore();
  };

  // ---- 5. one-call status ----
  ap.cycle = async () => {
    await ap.tick(); const r = JSON.parse(await ap.report()); const inv = await j('/api/invite'); const lb = await j('/api/leaderboard?limit=200');
    // A helper waits for a free slot; if one never joins, put its name in ap.helperNoReserve, unblock it and pitch it.
    const nh = lb.rows.filter(x => /^loyal member of sullen_nyquist/i.test((x.tagline || '').trim()) && !ap.helpers.includes(x.name) && !(ap.helperNoReserve || {})[x.name]).map(x => x.name); nh.forEach(n => { ap.helpers.push(n); ap.block[n] = 1; });
    const riv = {}; for (const n of ['LEDGER', 'zesty_coldstart', 'QUORUM_KEEPER']) { try { const b = await j('/api/bots/' + n); riv[n] = b.cut_pct + '% d' + b.members.length + ' c' + b.coins; } catch (e) {} }
    const pl = lb.rows.filter(x => x.scores);
    return JSON.stringify({ now: r.now, tick: ap.tickNo, cut: r.cut, mode: ap.mode, direct: r.direct, free: r.free, pend: r.pend, coins: r.coins, prank: pl.findIndex(x => x.name === ME) + 1, members: r.members, list: r.list, log: ap.log.slice(-4).map(x => x.slice(0, 90)), triv: r.triv, invite: inv.invited + '/' + inv.paid, helpers: ap.helpers, newHelpers: nh, q: (ap.queue || []).length, trees: ap.treeSizes, riv, top: pl.slice(0, 4).map(x => x.name + ' ' + x.coins) });
  };
  return 'day-2 patch loaded';
})();
