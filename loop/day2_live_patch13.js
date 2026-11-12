// Day-2 evening, 00:15 UTC (Nov 12). Paste AFTER patches 1-12.
// Pre-golden refill, 01:32-01:50 UTC. A member seated at 02:00 pays double for the hour (6.4 a tick at 40%) and a
// move costs the mover triple, so day-1 members hardly left in the Golden Hour. With no never-pitched bots left,
// the empty slots are filled with former members: fee only (plain-conversion pairs, so no bounty can repeat),
// never the excluded bots. Inside the window a burst is not cut short by the usual time limit; it ends when the
// slots are full, or at 01:55 UTC when 40% is forced (patch 3 guard).
(() => {
  const ap = window.__ap2; if (ap._patch13) return 'already';
  ap._patch13 = true; ap._patch13b = true;
  const say = s => { ap.log.push(new Date().toISOString().slice(11, 19) + ' ' + s); if (ap.log.length > 200) ap.log.shift(); };
  ap.preGoldenFrom = Date.UTC(2026, 10, 12, 1, 32, 0);
  ap.inPreGolden = () => { const n = Date.now(); return n >= ap.preGoldenFrom && n < ap.noBurstAfter; };
  ap.returners = () => { const mem = new Set((ap.bot && ap.bot.members) || []); const g = ap.gain || {}; const add = (ap.myCut || 10) > 10 ? 2.4 : 0;
    return Object.keys(ap.everMine || {}).filter(n => !mem.has(n) && !ap.helpers.includes(n) && !ap.never[n] && ap.plainPair[n] && g[n] !== undefined && g[n] + add > 0.2); };
  const inner13 = ap._tickW5;
  ap._tickW5 = async () => {
    try { if (ap.inPreGolden()) { for (const n of Object.keys(ap.everMine || {})) { if (ap.never[n] || !ap.plainPair[n] || ap.helpers.includes(n)) continue; delete ap.block[n]; if (ap.pitched[n] && Date.now() - ap.pitched[n] > 20 * 60000) { delete ap.pitched[n]; ap.pcount[n] = 0; } } } } catch (e) { say('pregolden ERR ' + e.message); }
    return inner13();
  };
  const p11 = ap.policy;
  ap.policy = async () => {
    try {
      if (ap.inPreGolden() && ap.policyOn && !ap.dry) {
        const cool = ap.cooldownMs - (Date.now() - ap.lastPatch) <= 0;
        if (ap.myCut <= 10) {
          const full = (ap.maxDirect || 8) - (ap.direct || 0) <= 0;
          if (full && cool) return ap.switchCut(ap.HIGH, 'slots full before the golden hour');
          return;
        }
        if (ap.phase === 'open') {
          const free = (ap.maxDirect || 8) - (ap.direct || 0) - (ap.helpersWaiting || 0);
          if (free >= 1 && cool && (ap.returners().length >= 1 || ap.poolNewCount() >= 1)) return ap.switchCut(10, 'pre-golden refill, ' + free + ' slot(s) free');
        }
      }
    } catch (e) { say('pregolden policy ERR ' + e.message); }
    return p11();
  };
  return 'patch 13 loaded';
})();
