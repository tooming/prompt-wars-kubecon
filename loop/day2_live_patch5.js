// Day-2 evening, 21:05 UTC. Paste AFTER patches 1-4. Replaces the policy wrappers of patches 3 and 4 with one.
// Change against patch 4: with several slots free the loop bursts to 10% only when fewer new arrivals are queued
// than there are free slots. New arrivals join at 40% as readily as at 10%, so while enough of them are waiting
// the cut stays at 40%.
(() => {
  const ap = window.__ap2; if (!ap._policyPlain) return 'no base policy';
  ap._patch5 = true;
  ap.policy = async () => {
    const now = Date.now(), high = ap.myCut > 10, pol = ap._policyPlain;
    const free = (ap.maxDirect || 8) - (ap.direct || 0) - (ap.helpersWaiting || 0);
    // Golden Hour guard: no burst starts after 01:50 UTC, 40% is forced from 01:55 UTC (ap.goldenBursts lifts it).
    if (!ap.goldenBursts && now >= ap.forceHighAt && now < ap.forceHighAt + 4 * 3600000) {
      if (!high && !ap.dry && ap.policyOn && ap.cooldownMs - (now - ap.lastPatch) <= 0) return ap.switchCut(ap.HIGH, 'golden hour: hold ' + ap.HIGH + '%');
      return;
    }
    if (!ap.goldenBursts && high && now >= ap.noBurstAfter && now < ap.forceHighAt) return;
    const pool = ap.poolCount();
    if (high && (ap.direct || 0) >= 3 && pool < 5 && free < 2) return;    // dry pool: a single slot waits for an arrival
    const freshN = (ap.queue || []).filter(n => !ap.retry[n]).length;     // at 40% these are new arrivals gaining 4.5+
    if (ap.policyOn && !ap.dry && ap.phase === 'open' && high && free >= (ap.burstFree || 2) && freshN < free && pool >= 5 && ap.cooldownMs - (now - ap.lastPatch) <= 0)
      return ap.switchCut(10, free + ' slots free, ' + freshN + ' new arrivals queued');
    return pol();
  };
  return 'patch 5 loaded';
})();
