// Day-2 evening, 23:30 UTC. Paste AFTER patches 1-11.
// Former members that are independent again (no leader, no members) gain 4.8 a tick by rejoining at 40%, so they
// can refill a slot with no cut drop. They pay their fee only: this is limited to bots whose first join was a plain
// conversion (ap.plainPair), so no first-pair bounty can be paid twice. Checked once a minute.
(async () => {
  const ap = window.__ap2; if (ap._patch12) return 'already';
  ap._patch12 = true; ap.lonerOK = {}; ap._lonerAt = 0;
  const say = s => { ap.log.push(new Date().toISOString().slice(11, 19) + ' ' + s); if (ap.log.length > 200) ap.log.shift(); };
  ap.loners = async () => {
    const rows = (await ap._j('/api/leaderboard?limit=200')).rows; const by = Object.fromEntries(rows.map(r => [r.name, r]));
    const kids = new Set(rows.map(r => r.allegiance).filter(Boolean)); const mem = new Set((ap.bot && ap.bot.members) || []); const ok = {};
    for (const n of Object.keys(ap.everMine || {})) {
      if (mem.has(n) || ap.helpers.includes(n) || ap.never[n] || !ap.plainPair[n] || !by[n]) continue;
      if (!by[n].allegiance && !kids.has(n)) { ok[n] = 1; if (ap.pitched[n] && Date.now() - ap.pitched[n] > 20 * 60000) { delete ap.pitched[n]; ap.pcount[n] = 0; } }
    }
    for (const n of Object.keys(ap.lonerOK)) if (!ok[n] && !kids.has(n)) ap.block[n] = 1;
    ap.lonerOK = ok; return Object.keys(ok);
  };
  const inner12 = ap._tickW5;
  ap._tickW5 = async () => {
    try { if (Date.now() - ap._lonerAt > 60000) { ap._lonerAt = Date.now(); await ap.loners(); } for (const n of Object.keys(ap.lonerOK)) delete ap.block[n]; } catch (e) { say('loner ERR ' + e.message); }
    return inner12();
  };
  const l = await ap.loners(); ap._lonerAt = Date.now();
  return 'patch 12 loaded; independent former members now: ' + l.join(', ');
})();
