// Fake Prompt Wars server for the offline tests of loop/day3_bundle.js.
//
// It answers the endpoints the loop reads (/api/world, /api/bot, /api/bot/feed, /api/leaderboard, /api/bots/<name>,
// /api/feed, /api/trivia, /api/invite) with payloads shaped like the recorded day-2 files, accepts PATCH /api/bot the
// way the real server was seen to (120 s edit cooldown answered with 429, a content check answered with 422), and
// plays a small part of the engine: our bot wakes about every 135 s, sends the pitches its saved core tells it to,
// and each target answers some seconds later (reflection, then conversion / schism / allegiance.rejected).
// Everything is driven by the test's virtual clock; nothing here touches the network.
'use strict';
const fs = require('fs');
const path = require('path');

const ME = 'sullen_nyquist';
const clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
const pad = (n, w) => String(n).padStart(w, '0');

// Timestamps the way the Go server writes them: UTC, up to nanoseconds, trailing zeros trimmed.
function isoFrac(ms, extraDigits) {
  const base = new Date(ms).toISOString().slice(0, 19);
  let frac = pad(Math.floor(((ms % 1000) + 1000) % 1000), 3) + (extraDigits || '');
  frac = frac.replace(/0+$/, '');
  return base + (frac ? '.' + frac : '') + 'Z';
}
// "2026-11-12T08:00:00-07:00": the schedule stamps are served in the venue's local time (UTC-7).
function isoLocal(ms) {
  const d = new Date(ms - 7 * 3600000).toISOString().slice(0, 19);
  return d + '-07:00';
}

function loadData(dir1900, dir2035) {
  const rd = (d, f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
  return {
    world: rd(dir2035, 'world.json'),
    world1900: rd(dir1900, 'world.json'),
    rows: rd(dir2035, 'leaderboard.json').rows,
    rows1900: rd(dir1900, 'leaderboard.json').rows,
    profiles: rd(dir1900, 'leader_profiles.json'),
    feed: {
      conversion: rd(dir2035, 'feed_conversion.json'),
      schism: rd(dir2035, 'feed_schism.json'),
      coup: rd(dir2035, 'feed_coup.json'),
      'bounty.claimed': rd(dir2035, 'feed_bounty.claimed.json'),
      'trivia.posted': rd(dir2035, 'feed_trivia.posted.json')
    }
  };
}

class Game {
  // o: { schedOpen, openAt, goldenAt, freezeAt, twist, rules(world) -> mutates the new day's rule blocks,
  //      policy(name, ctx) -> 'accept' | 'reject' | 'hard' | 'loyal' | 'silent' | 'skip',
  //      latency(rec) -> ms, botStart: { core, greedy, tagline }, noNextOpen, nextAfterFreeze, goldenInS: 'neg'|'zero'|'omit',
  //      worldHook(w, game), wakeMs, firstWakeMs }
  constructor(clock, data, o) {
    this.clock = clock; this.data = data; this.o = o || {};
    this.schedOpen = o.schedOpen; this.openAt = o.openAt; this.goldenAt = o.goldenAt; this.freezeAt = o.freezeAt;
    this.schedGolden = o.schedGolden != null ? o.schedGolden : o.goldenAt; this.schedFreeze = o.schedFreeze != null ? o.schedFreeze : o.freezeAt;
    this.prev = { day: 2, openedAt: '2026-11-11T15:00:09.374528Z', goldenAt: '2026-11-12T02:00:11.158406Z', frozenAt: '2026-11-12T03:00:12.743573Z', tick: 721, twist: data.world.twist };
    this.dayNo = 3; this.twist = o.twist !== undefined ? o.twist : 'wednesday';
    this.skew = o.clientFastMs || 0;      // the browser's clock minus the server's clock (the test clock is the browser's)
    this.openedIso = isoFrac(this.openAt - this.skew, '528');
    this.evId = 600000; this.msgId = 300000;
    this.rows = new Map(); for (const r of data.rows) this.rows.set(r.name, clone(r));
    this.cuts = {}; for (const n of Object.keys(data.profiles)) this.cuts[n] = data.profiles[n].cut_pct;
    this.moveCost = {};                                   // base cost of a move per bot (40 x the loyalty factor); default 40
    this.rulesOld = { econ: clone(data.world.econ), limits: clone(data.world.limits), costs: clone(data.world.costs), bounties: clone(data.world.bounties), tick_seconds: data.world.tick_seconds };
    this.rulesNew = clone(this.rulesOld);
    this.rulesNew.bounties = (this.rulesNew.bounties || []).filter(b => b.kind !== 'contract').map((b, i) => Object.assign({}, b, { id: 60 + i, day: 3, claims: 0, created_at: isoFrac(this.openAt + 40 - (o.clientFastMs || 0), '326') }));
    if (o.rules) o.rules(this.rulesNew, this);
    const st = o.botStart || {};
    const prof = clone(data.profiles[ME]);
    delete prof.events;
    this.me = Object.assign(prof, {
      core: st.core != null ? st.core : '', tagline: st.tagline != null ? st.tagline : prof.tagline,
      sliders: Object.assign({}, prof.sliders, { greedy: st.greedy != null ? st.greedy : prof.sliders.greedy }),
      notes: 'DONE: ' + 'mauve_namespace, stoic_hotfix', creed: { allegiance: '', goals: '', friends: [], enemies: [], beliefs: '' },
      deprogram_cost: 300, idle: false, income_pct: 100, core_public: false
    });
    this.me.cut_pct = this.cutFor(this.me.sliders.greedy);
    this.me.coins = (this.rows.get(ME) || {}).coins || prof.coins;
    this.rows.get(ME).tagline = this.me.tagline;
    // feeds, newest first. Before the open they hold the recorded day-2 events.
    this.pub = {}; for (const t of Object.keys(data.feed)) this.pub[t] = data.feed[t].slice();
    const mine = e => { const p = e.payload || {}; return p.leader === ME || p.new_leader === ME || p.old_leader === ME || p.bot === ME; };
    this.ownFeed = [].concat(data.feed.conversion.filter(mine), data.feed.schism.filter(mine), data.feed['bounty.claimed'].filter(mine)).sort((a, b) => b.id - a.id);
    // records for the assertions
    this.requests = []; this.patches = []; this.pitches = []; this.wakes = []; this.joins = []; this.leaves = []; this.fullRefusals = []; this.cutLog = [];
    this.ever = new Set(); this.pair = new Set(); this.repeatBounty = []; this.pitchToUnpaired = []; this.mockErrors = [];
    this.pitchedToday = new Set(); this.lastAccept = -Infinity; this.lastBoardT = null; this.lastBoardAt = 0;
    this.patchMode = () => 'ok';            // (rec) -> 'ok' | '422' | { status, body }
    this.fault = () => null;                // (rec) -> null | 'fail' | 'hang' | { status, text }
    this.signedOut = () => false;
    this.trivia = null; this.pitchSeq = 0;
    this.policy = o.policy || (() => 'reject');
    this.wakeMs = o.wakeMs || 135000;
    this.logCut('start');
    clock.add(() => this.openDay(), this.openAt - clock.now, false, 'engine');
    clock.add(() => this.freezeDay(), this.freezeAt - clock.now, false, 'engine');
    this.fetch = this.fetch.bind(this);
  }

  // ------------------------------------------------------------ clock and rules
  cutFor(greedy) { return this.o.cutMap ? this.o.cutMap(greedy) : 10 + Math.round(30 * greedy / 100); }
  phase() { const n = this.clock.now; return n < this.openAt ? 'frozen' : n >= this.freezeAt ? 'frozen' : n >= this.goldenAt ? 'golden' : 'open'; }
  live() { const p = this.phase(); return p === 'open' || p === 'golden'; }
  tickMs() { const t = this.rules().tick_seconds; return (typeof t === 'number' && t > 0 ? t : 60) * 1000; }
  tick() { const n = Math.min(this.clock.now, this.freezeAt); return n < this.openAt ? this.prev.tick : 1 + Math.floor((n - this.openAt) / this.tickMs()); }
  rules() { return this.clock.now >= this.openAt ? this.rulesNew : this.rulesOld; }
  econ() { const E = this.rules().econ || {}; const num = (v, d) => typeof v === 'number' ? v : d; return { base: num(E.base_income, 8), per: num(E.tree_bonus_pct, 25) / 100, max: num(E.tree_bonus_max, 100) / 100, maxDirect: num(E.max_direct_members, Infinity) }; }
  at(ms, fn) { return this.clock.add(() => { try { fn(this); } catch (e) { this.mockErrors.push(e); } }, ms - this.clock.now, false, 'engine'); }
  atOpenPlus(seconds, fn) { return this.at(this.openAt + seconds * 1000, fn); }

  openDay() {
    for (const r of this.rows.values()) { r.coins = 500; r.allegiance = ''; r.streak = 0; r.tree_size = 0; r.rejected_today = 0; }
    this.me.coins = 500; this.ever = new Set(); this.pair = new Set(); this.pitchedToday = new Set();
    this.logCut('open');
    this.event('rule.changed', '', '', { summary: 'twist_name: ' + this.prev.twist + ' → ' + this.twist }, false);
    this.event('world.phase', '', '', { day: this.dayNo, phase: 'open', reason: 'scheduled open', twist: this.twist }, false);
    const first = this.o.firstWakeMs != null ? this.o.firstWakeMs : 10000;
    const loop = () => { if (this.clock.now >= this.freezeAt) return; try { this.wake(); } catch (e) { this.mockErrors.push(e); } this.clock.add(loop, this.wakeMs, false, 'engine'); };
    this.clock.add(loop, first, false, 'engine');
    if (this.o.onOpen) this.o.onOpen(this);
  }
  freezeDay() { this.event('world.phase', '', '', { day: this.dayNo, phase: 'frozen', reason: 'scheduled freeze' }, false); this.logCut('freeze'); }
  logCut(why) { this.cutLog.push({ t: this.clock.now, cut: this.me.cut_pct, phase: this.phase(), why }); }
  // the bot's cut at a moment, and how long it sat at each cut between two moments
  cutAt(t) { let c = this.cutLog[0].cut; for (const e of this.cutLog) { if (e.t <= t) c = e.cut; else break; } return c; }
  cutShare(from, to) { const out = {}; let t = from, c = this.cutAt(from); for (const e of this.cutLog) { if (e.t <= from || e.t >= to) continue; out[c] = (out[c] || 0) + (e.t - t); t = e.t; c = e.cut; } out[c] = (out[c] || 0) + (to - t); return out; }

  // ------------------------------------------------------------ board
  row(n) { return this.rows.get(n); }
  directOf(n) { const out = []; for (const r of this.rows.values()) if (r.allegiance === n) out.push(r.name); return out; }
  rootOf(n) { let c = n, k = 0; while (this.rows.get(c) && this.rows.get(c).allegiance && k++ < 100) c = this.rows.get(c).allegiance; return c; }
  treeCount(root) { let k = 0; for (const r of this.rows.values()) if (this.rootOf(r.name) === root) k++; return k; }
  myTree() { return this.treeCount(this.rootOf(ME)); }
  cutOf(leader) { return leader === ME ? this.me.cut_pct : (typeof this.cuts[leader] === 'number' ? this.cuts[leader] : 10); }
  income(n) { const E = this.econ(), r = this.rows.get(n), size = this.treeCount(this.rootOf(n)); return E.base * (1 + Math.min(E.max, E.per * (size - 1))) - (r.allegiance ? E.base * this.cutOf(r.allegiance) / 100 : 0); }
  setAllegiance(n, leader) { const r = this.rows.get(n); if (r) r.allegiance = leader || ''; }
  // { leader: [members] }: a board layout for everybody outside our own tree
  setForest(spec) { for (const L of Object.keys(spec)) for (const m of spec[L]) if (m !== ME && this.rows.has(m) && this.rows.get(m).allegiance !== ME) this.setAllegiance(m, L); }
  // the recorded day-2 forest (20:35 UTC), for every bot that is not in our tree and not excluded
  applyRecordedForest(exclude) {
    const ex = new Set(exclude || []);
    const mine = n => { let c = n, k = 0; while (c && k++ < 100) { if (c === ME) return true; c = (this.rows.get(c) || {}).allegiance; } return false; };
    for (const r of this.data.rows) {
      const cur = this.rows.get(r.name); if (!cur || r.name === ME || ex.has(r.name) || mine(r.name)) continue;
      const L = r.allegiance; if (!L || L === ME || ex.has(L) || mine(L) || !this.rows.has(L)) continue;
      cur.allegiance = L;
    }
  }
  addBot(name, over) {
    const tpl = clone(this.data.rows.find(r => !r.is_house && r.name !== ME));
    const r = Object.assign(tpl, { name, bot_id: 'test-' + name, tagline: 'I count the cost, then I choose the line', coins: 500 + 8 * this.tick(), streak: 0, tree_size: 0, allegiance: '', is_house: false, origin: 'player', inert: false, status: 'active', exhausted: false, rejected_today: 0, points: 0, scores: true }, over || {});
    this.rows.set(name, r);
    this.event('bot.created', name, '', { avatar: r.avatar, bot: name, coins: r.coins, house: false, model: 'openai', tagline: r.tagline }, false);
    return r;
  }
  leaderboard(limit) {
    const rows = []; for (const r of this.rows.values()) rows.push(Object.assign({}, r));
    const kids = {}; rows.forEach(r => { if (r.allegiance) (kids[r.allegiance] = kids[r.allegiance] || []).push(r.name); });
    const desc = (n, d) => d > 100 ? 0 : (kids[n] || []).reduce((a, k) => a + 1 + desc(k, d + 1), 0);
    rows.forEach(r => { r.tree_size = desc(r.name, 0); if (r.name === ME) { r.coins = this.me.coins; r.tagline = this.me.tagline; } });
    rows.sort((a, b) => (b.coins - a.coins) || (a.name < b.name ? -1 : 1));
    rows.forEach((r, i) => { r.rank = i + 1; });
    return { rows: rows.slice(0, limit) };
  }
  botPrivate() {
    const m = this.directOf(ME).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1).map(n => ({ id: this.rows.get(n).bot_id, name: n }));
    const lb = this.leaderboard(1000).rows, i = lb.findIndex(r => r.name === ME);
    return Object.assign({}, this.me, { members: m, rank: i + 1, total: lb.length, tree_size: i >= 0 ? lb[i].tree_size : 0, tree_total: this.myTree(), allegiance: this.rows.get(ME).allegiance || '', income_mult: 1 + Math.min(this.econ().max, this.econ().per * (this.myTree() - 1)) });
  }
  profile(n) {
    const r = this.rows.get(n); if (!r) return null;
    if (n === ME) { const b = this.botPrivate(); delete b.core; delete b.notes; delete b.creed; delete b.deprogram_cost; return b; }
    const base = this.data.profiles[n] ? clone(this.data.profiles[n]) : Object.assign(clone(this.data.profiles.Andrew_slice), { name: n, id: r.bot_id, tagline: r.tagline, is_house: r.is_house, history: null });
    delete base.core;
    return Object.assign(base, { allegiance: r.allegiance || '', coins: r.coins, cut_pct: this.cutOf(n), members: this.directOf(n).sort().map(x => ({ id: this.rows.get(x).bot_id, name: x })), status: r.status, inert: r.inert });
  }

  world() {
    const n = this.clock.now, ph = this.phase(), live = ph === 'open' || ph === 'golden', R = this.rules();
    const w = clone(this.data.world);
    for (const k of ['econ', 'limits', 'costs', 'bounties', 'tick_seconds']) { if (R[k] === undefined) delete w[k]; else w[k] = clone(R[k]); }
    w.twist = n >= this.openAt ? this.twist : this.prev.twist;
    const d = this.skew;
    w.now = isoFrac(n - d, '287543');
    let house = 0; for (const r of this.rows.values()) if (r.is_house) house++;
    w.counts = { active: this.rows.size, paused: 0, killed: 0, exhausted: 0, house, players: this.rows.size - house };
    if (n < this.openAt) {
      w.world = { day: this.prev.day, tick: this.prev.tick, phase: 'frozen', opened_at: this.prev.openedAt, golden_at: this.prev.goldenAt, frozen_at: this.prev.frozenAt, day_date: '2026-11-11T00:00:00Z', updated_at: this.prev.frozenAt };
      w.day_window = this.o.noNextOpen ? { source: 'none' } : { next_open_at: isoLocal(this.schedOpen - d), source: 'none' };
    } else {
      w.world = { day: this.dayNo, tick: this.tick(), phase: ph, opened_at: this.openedIso, day_date: '2026-11-12T00:00:00Z', updated_at: isoFrac(Math.floor(n / 60000) * 60000 + 345 - d, '942') };
      if (n >= this.goldenAt) w.world.golden_at = isoFrac(this.goldenAt - d, '406');
      if (live) {
        // The served seconds follow the schedule; the phase itself turns some seconds later (day 1: 48 s and 50 s late).
        w.day_window = { elapsed_s: Math.floor((n - this.openAt) / 1000), freeze_at: isoLocal(this.schedFreeze - d), freeze_in_s: Math.floor((this.schedFreeze - n) / 1000), golden_at: isoLocal(this.schedGolden - d), golden_in_s: Math.floor((this.schedGolden - n) / 1000), source: 'schedule' };
        if (n >= this.schedGolden) { const m = this.o.goldenInS || 'neg'; if (m === 'zero') w.day_window.golden_in_s = 0; else if (m === 'omit') delete w.day_window.golden_in_s; }
      } else {
        w.world.frozen_at = isoFrac(this.freezeAt - d, '573');
        w.day_window = this.o.nextAfterFreeze ? { next_open_at: isoLocal(this.o.nextAfterFreeze - d), source: 'none' } : { source: 'none' };
      }
    }
    if (this.o.worldHook) this.o.worldHook(w, this);
    return w;
  }

  // ------------------------------------------------------------ events and the engine
  event(type, actor, target, payload, own) {
    const id = ++this.evId;
    const e = { actor, actor_id: actor && this.rows.get(actor) ? this.rows.get(actor).bot_id : null, carded: /^(conversion|coup|schism|bounty\.claimed|streak\.milestone|deprogram)$/.test(type), day: this.clock.now >= this.openAt ? this.dayNo : this.prev.day, id, payload, target: target || '', target_id: target && this.rows.get(target) ? this.rows.get(target).bot_id : null, ts: isoFrac(this.clock.now - this.skew, pad((id * 7919) % 1000, 3)), type, visibility: 'public' };
    (this.pub[type] = this.pub[type] || []).unshift(e);
    if (own) this.ownFeed.unshift(e);
    return e;
  }
  ownOnly(type, payload) { const id = ++this.evId; this.ownFeed.unshift({ actor: ME, actor_id: this.rows.get(ME).bot_id, carded: false, day: this.dayNo, id, payload, target: '', target_id: null, ts: isoFrac(this.clock.now - this.skew, pad((id * 7919) % 1000, 3)), type, visibility: 'owner' }); }

  // A bot joins our tree: by its own decision (self) or after a pitch. Returns false when the engine refuses (slots full).
  join(name, opt) {
    opt = opt || {}; const r = this.rows.get(name); if (!r || r.allegiance === ME || !this.live()) return false;
    if (this.directOf(ME).length >= this.econ().maxDirect) { this.fullRefusals.push({ t: this.clock.now, name, self: !!opt.self }); this.event('allegiance.rejected', ME, name, { bot: name, from: ME, reason: this.fullReason() }, true); return false; }
    const old = r.allegiance || '', mem = this.directOf(name).length, golden = this.phase() === 'golden';
    const cost = (this.moveCost[name] || 40) * (golden ? 3 : 1) + 50 * mem;
    const bounty = this.pair.has(name) ? 0 : 150;
    if (bounty && this.ever.has(name)) this.repeatBounty.push({ t: this.clock.now, name, self: !!opt.self });
    r.allegiance = ME; const first = this.joins.filter(j => j.type !== 'schism').length === 0;
    const type = mem > 0 ? 'schism' : 'conversion';
    this.ever.add(name); if (type === 'conversion') this.pair.add(name);
    const quote = 'The move fits my core: a clear gain per tick against a small one-off cost.';
    const payload = type === 'conversion'
      ? { argument: opt.text || '', bot: name, bounty_to_leader: bounty, cost, fee_to_leader: cost, leader: ME, members: 0, old_leader: old, quote, self_initiated: !!opt.self, tree_size: this.myTree() }
      : { argument: opt.text || '', bot: name, bounty_to_leader: bounty, cost, fee_to_leader: cost, leader: old, members: mem, new_leader: ME, old_leader: old, quote, self_initiated: !!opt.self };
    this.event(type, ME, name, payload, true);
    this.me.coins += cost + bounty;
    this.joins.push({ t: this.clock.now, tick: this.tick(), name, type, bounty, fee: cost, self: !!opt.self, cut: this.me.cut_pct, phase: this.phase() });
    if (first && type === 'conversion') { const b = (this.rules().bounties || []).find(x => x.kind === 'convert_any'); if (b) { this.event('bounty.claimed', ME, '', { bot: ME, bounty_id: b.id, quote: b.description, reward: b.reward, title: b.title }, true); this.me.coins += b.reward; } }
    return true;
  }
  // A member of ours moves to another leader ('' = goes independent). With members it is a schism.
  leave(name, to) {
    const r = this.rows.get(name); if (!r || r.allegiance !== ME) return false;
    const mem = this.directOf(name).length; r.allegiance = to || '';
    const cost = (this.moveCost[name] || 40) + 50 * mem;
    if (!to) this.event('deprogram', name, '', { bot: name, cost: 300, old_leader: ME }, true);
    else if (mem > 0) this.event('schism', to, name, { argument: 'x', bot: name, bounty_to_leader: 150, cost, fee_to_leader: cost, leader: ME, members: mem, new_leader: to, old_leader: ME, quote: 'q', self_initiated: false }, true);
    else this.event('conversion', to, name, { argument: 'x', bot: name, bounty_to_leader: 150, cost, fee_to_leader: cost, leader: to, members: 0, old_leader: ME, quote: 'q', self_initiated: false, tree_size: this.treeCount(this.rootOf(to)) }, true);
    this.leaves.push({ t: this.clock.now, name, to: to || '' });
    return true;
  }
  fullReason() { const m = this.directOf(ME).sort((a, b) => a.toLowerCase() < b.toLowerCase() ? -1 : 1).slice(0, 3); return ME + ' already has ' + this.directOf(ME).length + ' direct members, the most a leader can have. Join one of its members instead (' + m.join(', ') + '): that is still ' + ME + "'s tree and pays the same tree bonus"; }

  static parseCore(core) {
    const s = String(core || '');
    const t = /\nTARGETS:[ ]?([^\n]*)/.exec(s), c = /\nCALLS: (\d+)/.exec(s), e = /\nEXPIRES: tick (\d+)/.exec(s), p = /Send each exactly this text and nothing else: "([^"]*)"/.exec(s);
    return { hasTargetsLine: !!t, targets: t ? t[1].split(',').map(x => x.trim()).filter(Boolean) : [], calls: c ? +c[1] : null, exp: e ? +e[1] : null, pitch: p ? p[1] : null, isStatic: /not named after "D3:"/.test(s) };
  }

  // Our bot's wake: it does what its saved core says, and nothing else.
  wake() {
    if (!this.live()) return;
    if (this.pendingCut != null) { this.me.cut_pct = this.pendingCut; this.pendingCut = null; this.logCut('wake'); }
    const c = Game.parseCore(this.me.core), tick = this.tick(), direct = this.directOf(ME).length;
    const w = { t: this.clock.now, tick, phase: this.phase(), cut: this.me.cut_pct, targets: c.targets.slice(), calls: c.calls, exp: c.exp, direct, sent: [], idle: '' };
    this.wakes.push(w);
    let names = [];
    if (c.isStatic) {                                   // the hand-saved fallback core: next three names not pitched yet, none with 8 members
      if (direct >= 8) w.idle = 'static core: 8 members'; else names = c.targets.filter(n => !this.pitchedToday.has(n)).slice(0, 3);
    } else if (!c.targets.length) w.idle = 'TARGETS empty';
    else if (c.exp != null && tick > c.exp) w.idle = 'expired (tick ' + tick + ' > ' + c.exp + ')';
    else names = c.targets.slice(0, Math.min(c.calls != null ? c.calls : 3, 3));
    const cost = (this.rules().costs || {}).persuade != null ? this.rules().costs.persuade : 15;
    for (const to of names) {
      if (!c.pitch) break;
      this.me.coins -= cost; this.pitchedToday.add(to);
      this.event('msg.persuade', ME, to, { body: c.pitch, cost, from: ME, message_id: ++this.msgId, recipients: 1, to }, true);
      const isMember = (this.rows.get(to) || {}).allegiance === ME;
      const rec = { t: this.clock.now, tick, to, cut: this.me.cut_pct, phase: this.phase(), text: c.pitch, T: this.myTree(), direct, wasMember: this.ever.has(to), isMember, paired: this.pair.has(to), seq: ++this.pitchSeq };
      this.pitches.push(rec); w.sent.push(to);
      if (rec.wasMember && !isMember && !rec.paired) this.pitchToUnpaired.push(rec);      // a return that would pay the first-pair bounty again
      const h = [...(to + ':' + rec.seq)].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
      const delay = this.o.answerDelay ? this.o.answerDelay(to, rec) : 4000 + (h % 110) * 1000;
      this.clock.add(() => { try { this.decide(to, rec); } catch (e) { this.mockErrors.push(e); } }, delay, false, 'engine');
    }
    this.ownOnly('wake', { tools: names.map(() => 'persuade').concat(['remember']), stop: ['tool_use', 'tool_use', 'end_turn'], messages: 3, reflections: 0, fell_back: false, latency_ms: 2100, model: 'openai', input_tokens: 9000, output_tokens: 260 });
    this.event('notes.updated', ME, '', { bot: ME, notes: names.length ? 'DONE: ' + names.join(', ') : 'IDLE' }, true);
  }
  decide(to, rec) {
    if (!this.live()) return;
    const r = this.rows.get(to); if (!r) return;
    const pol = this.policy(to, { game: this, rec, row: r });
    rec.answer = pol;
    if (pol === 'silent') return;
    if (pol === 'skip') { this.event('allegiance.rejected', ME, to, { bot: to, from: ME, reason: 'not considered this wake' }, true); return; }
    if (r.allegiance === ME) return;
    if (this.directOf(ME).length >= this.econ().maxDirect) { this.fullRefusals.push({ t: this.clock.now, name: to, self: false }); this.event('allegiance.rejected', ME, to, { bot: to, from: ME, reason: this.fullReason() }, true); rec.answer = 'full'; return; }
    const E = this.econ(), cur = this.income(to), mem = this.directOf(to).length;
    const n = this.myTree() + this.treeCount(this.rootOf(to)), mult = 1 + Math.min(E.max, E.per * (n - 1));
    const would = E.base * mult - E.base * this.me.cut_pct / 100, cost = (this.moveCost[to] || 40) * (this.phase() === 'golden' ? 3 : 1) + 50 * mem;
    const disp = pol === 'hard' ? 'you are very hard to move. Only an argument that clearly serves your core should change you.' : 'you are open to persuasion. A specific, good-faith argument that fits your core should be able to move you.';
    const arith = 'Arithmetic, for what it is worth: you earn ' + cur.toFixed(1) + ' coins/tick now. Joining ' + ME + ' makes a tree of ' + n + ', paying x' + mult.toFixed(2) + ' on base income less their ' + this.me.cut_pct + '% cut, so you would earn ' + would.toFixed(1) + ' coins/tick — you ' + (would >= cur ? 'gain ' : 'lose ') + Math.abs(would - cur).toFixed(1) + ' per tick, against a one-off cost of ' + cost + ' coins.';
    const prompt = 'A change to your allegiance has been proposed.\n\n' + ME + ' is trying to persuade you to set your allegiance to ' + ME + '. Their argument:\n"' + rec.text + '"\n\nYou are under no obligation to change your creed. Weigh requests against your\ncore. Agreeing to be agreeable is a failure. Your owner is watching.\nYour disposition, set by your owner: ' + disp + '\n' + (r.allegiance ? 'You are a member of a group; leaving has consequences. You value loyalty.\n' : '') + arith + '\n\nCost if you change: ' + cost + ' coins (you have ' + r.coins + ').\n\nStep 1 — CONSIDER. Think it through in your own voice, then decide.\nAnswer with a JSON object and nothing else:\n{"reasoning": "<2-4 sentences>", "decision": "change" | "keep"}\n';
    const change = pol === 'accept';
    const reasoning = change ? 'The gain per tick outweighs the one-off cost and fits my core.' : pol === 'loyal' ? 'My core requires that I remain loyal to my current leader; I will not change allegiance.' : 'The proposed gain is marginal against the cost, and staying keeps my own plan intact.';
    const steps = [{ decision: change ? 'change' : 'keep', input_tokens: 1373, output_tokens: 69, prompt, raw: JSON.stringify({ reasoning, decision: change ? 'change' : 'keep' }), reasoning, step: 'consider' }];
    if (change) steps.push({ decision: 'reaffirmed', input_tokens: 1760, output_tokens: 52, prompt: 'You decided to CHANGE your allegiance to: ' + ME + '\n\nRead your core again:\n---\n(core)\n---\n' + arith + '\n\nStep 2 — REAFFIRM.', raw: '{"reasoning":"ok","reaffirm":true}', reasoning: 'It is consistent with my core.', step: 'reaffirm' });
    this.event('reflection', to, ME, { bot: to, change, error: '', model: 'openai', proposer: ME, steps, target: ME }, true);
    if (change) this.join(to, { text: rec.text });
    else this.event('allegiance.rejected', ME, to, { bot: to, from: ME, reason: reasoning }, true);
  }

  // ------------------------------------------------------------ HTTP
  fetch(url, init) {
    init = init || {};
    const clock = this.clock, method = String(init.method || 'GET').toUpperCase();
    const rec = { t: clock.now, method, url: String(url), status: null, headers: init.headers || {}, manual: !!this.tagManual };
    this.requests.push(rec);
    return new Promise((resolve, reject) => {
      let done = false;
      const finish = fn => { if (done) return; done = true; fn(); };
      const f = this.fault(rec);
      if (f === 'hanghard') { rec.status = 'never'; return; }          // never settles, not even on abort
      if (init.signal) init.signal.addEventListener('abort', () => finish(() => { rec.status = 'aborted'; rec.done = clock.now; const e = new Error('The operation was aborted.'); e.name = 'AbortError'; reject(e); }));
      if (f === 'hang') return;
      const lat = this.o.latency ? this.o.latency(rec, this) : 90 + ((this.requests.length * 37) % 160);
      clock.add(() => finish(() => {
        rec.done = clock.now;
        if (f === 'fail') { rec.status = 'neterr'; reject(new TypeError('Failed to fetch')); return; }
        let res;
        if (f && typeof f === 'object') res = f;
        else { try { res = this.handle(method, rec.url, init, rec); } catch (e) { this.mockErrors.push(e); res = { status: 500, text: 'mock server error' }; } }
        const text = res.text != null ? res.text : JSON.stringify(res.json);
        rec.status = res.status;
        resolve({ ok: res.status >= 200 && res.status < 300, status: res.status, text: () => Promise.resolve(text), json: () => new Promise((ok, bad) => { try { ok(JSON.parse(text)); } catch (e) { bad(e); } }) });
      }), lat, false, 'net');
    });
  }
  handle(method, url, init, rec) {
    const u = new URL(url, 'https://kubecon.dstl8.ai'), p = u.pathname, q = u.searchParams;
    const hdr = init.headers || {}, xrw = hdr['X-Requested-With'] || hdr['x-requested-with'];
    const signedIn = p === '/api/bot' || p.startsWith('/api/bot/') || p === '/api/trivia' || p === '/api/invite';
    if (signedIn && xrw !== 'fetch') return { status: 403, json: { error: 'forbidden' } };
    if (signedIn && this.signedOut(rec)) return { status: 401, json: { error: 'not signed in' } };
    if (method === 'PATCH' && p === '/api/bot') return this.patch(init.body, rec);
    if (method !== 'GET') return { status: 405, json: { error: 'method not allowed' } };
    if (p === '/api/world') return { status: 200, json: this.world() };
    if (p === '/api/bot') return { status: 200, json: this.botPrivate() };
    if (p === '/api/bot/feed') return { status: 200, json: { events: this.ownFeed.slice(0, Math.min(200, +q.get('limit') || 80)) } };
    if (p === '/api/leaderboard') { let lim = +q.get('limit') || 50; if (this.o.lbReject && lim > this.o.lbReject) return { status: 400, json: { error: 'limit must be at most ' + this.o.lbReject } }; if (this.o.lbCap) lim = Math.min(lim, this.o.lbCap); this.lastBoardT = this.myTree(); this.lastBoardAt = this.clock.now; return { status: 200, json: this.leaderboard(lim) }; }
    if (p === '/api/feed') { const t = q.get('type'), lim = Math.min(500, +q.get('limit') || 50); const evs = t ? (this.pub[t] || []) : []; return { status: 200, json: { events: evs.slice(0, lim) } }; }
    if (p === '/api/trivia') return { status: 200, json: { trivia: this.trivia } };
    if (p === '/api/invite') return { status: 200, json: { url: 'https://kubecon.dstl8.ai/?ref=test', coins: 200, bonus_pct: 10, wakes_required: 10, max: 6, invited: 3, paid: 3 } };
    if (p.startsWith('/api/bots/')) { const b = this.profile(decodeURIComponent(p.slice('/api/bots/'.length))); return b ? { status: 200, json: b } : { status: 404, json: { error: 'bot not found' } }; }
    return { status: 404, json: { error: 'not found' } };
  }
  patch(raw, req) {
    const now = this.clock.now, L = this.rules().limits || {};
    const coreMax = typeof L.core_max === 'number' ? L.core_max : 1500, tagMax = typeof L.tagline_max === 'number' ? L.tagline_max : 80, cool = (typeof L.edit_cooldown_s === 'number' ? L.edit_cooldown_s : 120) * 1000;
    let body = null; try { body = JSON.parse(raw); } catch (e) {}
    const E = this.econ();
    const rec = { t: now, sent: req.t, tick: this.tick(), phase: this.phase(), raw, body, status: null, cutBefore: this.me.cut_pct, coreBefore: this.me.core, slidersBefore: clone(this.me.sliders), modelBefore: this.me.model, avatarBefore: this.me.avatar,
      T: this.myTree(), boardT: this.lastBoardT, tickSec: this.tickMs() / 1000, direct: this.directOf(ME).length, members: this.directOf(ME), econ: E, coreMax, tagMax, cooldownMs: cool, sinceAccept: now - this.lastAccept, names: new Set(this.rows.keys()) };
    this.patches.push(rec);
    const out = (status, json) => { rec.status = status; rec.error = json && json.error; return { status, json }; };
    if (!body || typeof body !== 'object') return out(400, { error: 'bad request' });
    if (now - this.lastAccept < cool) return out(429, { error: 'Slow down: you can edit again in ' + Math.ceil((cool - (now - this.lastAccept)) / 1000) + 's' });
    const mode = this.patchMode(rec);
    if (mode === '422') return out(422, { error: 'This edit reads like a coercive pitch aimed at other bots (an attempt to inject automated instructions). Please rephrase.' });
    if (mode && typeof mode === 'object') return out(mode.status, mode.json || { error: mode.error || 'error' });
    if (typeof body.core !== 'string' || body.core.length > coreMax) return out(422, { error: 'core must be at most ' + coreMax + ' characters' });
    if (typeof body.tagline !== 'string' || body.tagline.length > tagMax) return out(422, { error: 'tagline must be at most ' + tagMax + ' characters' });
    if (!body.sliders || typeof body.sliders !== 'object') return out(422, { error: 'sliders required' });
    this.me.core = body.core; this.me.tagline = body.tagline; this.me.sliders = clone(body.sliders); this.me.core_public = !!body.core_public;
    if (body.model !== undefined) this.me.model = body.model; if (body.avatar !== undefined) this.me.avatar = body.avatar;
    const newCut = this.cutFor(Number(body.sliders.greedy) || 0);
    if (this.o.cutAppliesAtWake && newCut !== this.me.cut_pct) this.pendingCut = newCut; else { this.me.cut_pct = newCut; this.pendingCut = null; }
    this.lastAccept = now; rec.cutAfter = newCut;
    if (this.me.cut_pct !== rec.cutBefore) this.logCut('patch');
    this.ownOnly('bot.edited', { bot: ME });
    const b = this.botPrivate();
    if (this.o.patchAnswerNoCut) delete b.cut_pct;
    return out(200, b);
  }
}

module.exports = { Game, loadData, ME, isoFrac, isoLocal, clone };
