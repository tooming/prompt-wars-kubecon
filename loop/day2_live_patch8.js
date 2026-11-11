// Day-2 evening, 22:19 UTC. Paste AFTER patches 1-7. Replaces the policy wrapper of patch 5.
// Why: a burst at 10% only ended when all slots were full, or after 8 minutes with no pitch pending. With a new
// target list every wake a pitch was always pending, so the burst that began at 22:06 UTC was still running 13
// minutes later for a single free slot, at about 17 coins a tick of lost cut income.
// Now a burst ends on time: after 8 minutes when at most one slot is still free, and after 12 minutes regardless.
(() => {
  const ap = window.__ap2; if (!ap._policyPlain) return 'no base policy';
  ap._patch8 = true;
  ap.policy = async () => {
    const now = Date.now(), high = ap.myCut > 10, pol = ap._policyPlain;
    const free = (ap.maxDirect || 8) - (ap.direct || 0) - (ap.helpersWaiting || 0);
    const cool = ap.cooldownMs - (now - ap.lastPatch) <= 0;
    // Golden Hour guard: no burst starts after 01:50 UTC, 40% is forced from 01:55 UTC (ap.goldenBursts lifts it).
    if (!ap.goldenBursts && now >= ap.forceHighAt && now < ap.forceHighAt + 4 * 3600000) {
      if (!high && !ap.dry && ap.policyOn && cool) return ap.switchCut(ap.HIGH, 'golden hour: hold ' + ap.HIGH + '%');
      return;
    }
    if (!ap.goldenBursts && high && now >= ap.noBurstAfter && now < ap.forceHighAt) return;
    if (!high && ap.policyOn && !ap.dry && (ap.phase === 'open' || ap.phase === 'golden') && (ap.direct || 0) >= 5 && cool) {
      const age = now - (ap.modeSince || 0);
      if ((age > (ap.maxRecruitMs || 480000) && free <= 1) || age > 12 * 60000) return ap.switchCut(ap.HIGH, 'burst time limit, ' + free + ' slot(s) still free');
    }
    const pool = ap.poolCount();
    if (high && (ap.direct || 0) >= 3 && pool < 5 && free < 2) return;    // dry pool: a single slot waits for an arrival
    const freshN = (ap.queue || []).filter(n => !ap.retry[n]).length;     // at 40% these are new arrivals gaining 4.5+
    if (ap.policyOn && !ap.dry && ap.phase === 'open' && high && free >= (ap.burstFree || 2) && freshN < free && pool >= 5 && cool)
      return ap.switchCut(10, free + ' slots free, ' + freshN + ' new arrivals queued');
    return pol();
  };
  return 'patch 8 loaded';
})();
