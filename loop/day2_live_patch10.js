// Day-2 evening, 22:32 UTC. Paste AFTER patches 1-9.
// One tick at a time. A manual cycle() and the 20-second timer overlapped at 22:31:29-30 UTC: one tick dropped the
// cut to 10% while the other, still holding the state from before, saved a core with the 40% pitch text. The bot
// sat at 10% with all 8 slots full for about two minutes (roughly 40 coins) until the loop put it back.
(() => {
  const ap = window.__ap2; if (ap._patch10) return 'already';
  ap._patch10 = true;
  const t0 = ap.tick; ap._tickRunning = null;
  ap.tick = () => { if (ap._tickRunning) return ap._tickRunning; ap._tickRunning = Promise.resolve().then(t0).finally(() => { ap._tickRunning = null; }); return ap._tickRunning; };
  return 'patch 10 loaded';
})();
