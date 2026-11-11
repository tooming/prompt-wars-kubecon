// Day-2 evening, 20:45 UTC. Paste AFTER patches 1-3.
// Found by the tactics radar: from 20:32 to 20:44 UTC the loop held 40% with up to four empty slots, pitching one
// new arrival at a time, because a queued arrival blocked the refill burst. It brought no join in 13 minutes.
(() => {
  const ap = window.__ap2; if (ap._patch4) return 'already';
  ap._patch4 = true;
  // (a) When burstFree or more slots are free, burst at once instead of waiting on single new arrivals at 40%.
  //     New arrivals are still pitched first inside the burst.
  const p3 = ap.policy;
  ap.policy = async () => {
    const now = Date.now(), high = ap.myCut > 10;
    const free = (ap.maxDirect || 8) - (ap.direct || 0) - (ap.helpersWaiting || 0);
    const late = !ap.goldenBursts && now >= ap.noBurstAfter;
    if (ap.policyOn && !ap.dry && ap.phase === 'open' && high && !late && free >= (ap.burstFree || 2) && ap.poolCount() >= 5 && ap.cooldownMs - (now - ap.lastPatch) <= 0)
      return ap.switchCut(10, free + ' slots free');
    return p3();
  };
  // (b) The first target list of a burst is already in burst order (never-recruited bots first), not returners.
  const sc = ap.switchCut;
  ap.switchCut = async (newCut, why) => {
    if (newCut <= 10 && ap.burstPrio) { if (!ap.prioKeep) ap.prioKeep = ap.prio; ap.prio = ap.burstPrio.slice(); }
    return sc(newCut, why);
  };
  return 'patch 4 loaded';
})();
