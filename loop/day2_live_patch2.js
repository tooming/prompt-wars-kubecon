// Day-2 afternoon tweaks, applied in the game tab on 2026-11-11 at 18:38 and 18:58 UTC.
// Paste AFTER day2_live.js and day2_live_patch.js (both must have defined window.__ap2).
(() => {
  const ap = window.__ap2;
  const say = s => { ap.log.push(new Date().toISOString().slice(11, 19) + ' ' + s); if (ap.log.length > 200) ap.log.shift(); };

  // 1) A former member that now leads members of its own is worth pitching again: it pays a larger fee on return
  //    (its own move cost plus 50 per member it carries). The 150 first-pair bounty is paid again only if the pair
  //    was never formed by a plain conversion (see docs, "Day 2 addendum"). Member-less leavers stay blocked.
  // 2) During 10% bursts the saved priority order is set aside so targets are ordered by gain.
  if (!ap._innerBeforeKids) {
    ap._innerBeforeKids = ap._tickW5;
    ap._tickW5 = async () => {
      try {
        const rows = (await ap._j('/api/leaderboard?limit=200')).rows;
        const hasKids = new Set(rows.map(r => r.allegiance).filter(Boolean)); ap.hasKids = hasKids;
        const mem = new Set((ap.bot && ap.bot.members) || []);
        for (const n of Object.keys(ap.everMine || {})) {
          if (mem.has(n) || ap.helpers.includes(n)) continue;
          if (hasKids.has(n)) {
            if (ap.block[n]) { delete ap.block[n]; say('UNBLOCK ' + n + ' (has members: larger fee on return)'); }
            if (ap.pitched[n] && Date.now() - ap.pitched[n] > 8 * 60000) { delete ap.pitched[n]; ap.pcount[n] = 0; }
          }
        }
        if (ap.myCut <= 10) { if (!ap.prioKeep) { ap.prioKeep = ap.prio; } ap.prio = []; }
        else if (ap.prioKeep) { ap.prio = ap.prioKeep; ap.prioKeep = null; }
      } catch (e) { say('kids ERR ' + e.message); }
      return ap._innerBeforeKids();
    };
  }
  delete ap.block.moth; // never ours, a gain-insensitive flipper: a new pair

  // 3) cycle() also reports: live contracts posted by other bots (800-coin "Recruit X for Y" entries in
  //    /api/world bounties) and how many never-recruited bots are still worth a pitch at a 10% cut
  //    (pool = pitched fewer than maxTries times, poolNew = never pitched).
  if (!ap._cycleW2) {
    const orig = ap.cycle; ap._cycleW2 = orig;
    ap.cycle = async () => {
      const r = await orig(); let o;
      try { o = typeof r === 'string' ? JSON.parse(r) : r; } catch (e) { return r; }
      try {
        const w = await ap._j('/api/world');
        o.contracts = (w.bounties || []).filter(b => b.active && (b.contract || /^contract/.test(b.key || ''))).map(b => (b.title || '') + ' ' + b.reward);
        const has = (v, n) => Array.isArray(v) ? v.includes(n) : !!(v && v[n]);
        const g = ap.gain || {}; const add = (ap.myCut || 10) > 10 ? 2.4 : 0; const mt = ap.maxTries || 2;
        const pool = Object.keys(g).filter(n => !has(ap.everMine, n) && !has(ap.block, n) && !has(ap.never, n) && ((ap.pcount || {})[n] || 0) < mt && g[n] + add > 0.2);
        o.pool = pool.length; o.poolNew = pool.filter(n => !((ap.pcount || {})[n])).length;
      } catch (e) { o.cerr = String(e).slice(0, 60); }
      return typeof r === 'string' ? JSON.stringify(o) : o;
    };
  }
  return 'day-2 patch 2 loaded';
})();
