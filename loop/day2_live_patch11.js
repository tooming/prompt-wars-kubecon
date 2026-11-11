// Day-2 evening, 23:28 UTC. Paste AFTER patches 1-10. Replaces the policy wrapper of patch 8.
// Why: only two never-pitched bots that would gain were left, and the last three bursts converted 4 of 8, 0 of 9
// and 1 of 6. The burst rules now look at never-pitched bots (ap.poolNewCount), not at everything pitched fewer
// than twice: fewer than 5 means a single free slot waits for a new arrival at 40%; fewer than 2 means no burst.
(() => {
  const ap = window.__ap2; if (!ap._policyPlain) return 'no base policy';
  ap._patch11 = true;
  ap.poolNewCount = () => { const g = ap.gain || {}; const add = (ap.myCut || 10) > 10 ? 2.4 : 0; return Object.keys(g).filter(n => !ap.everMine[n] && !ap.block[n] && !ap.never[n] && !((ap.pcount || {})[n]) && g[n] + add > 0.2).length; };
  ap.policy = async () => {
    const now = Date.now(), high = ap.myCut > 10, pol = ap._policyPlain;
    const free = (ap.maxDirect || 8) - (ap.direct || 0) - (ap.helpersWaiting || 0);
    const cool = ap.cooldownMs - (now - ap.lastPatch) <= 0;
    if (!ap.goldenBursts && now >= ap.forceHighAt && now < ap.forceHighAt + 4 * 3600000) {
      if (!high && !ap.dry && ap.policyOn && cool) return ap.switchCut(ap.HIGH, 'golden hour: hold ' + ap.HIGH + '%');
      return;
    }
    if (!ap.goldenBursts && high && now >= ap.noBurstAfter && now < ap.forceHighAt) return;
    if (!high && ap.policyOn && !ap.dry && (ap.phase === 'open' || ap.phase === 'golden') && (ap.direct || 0) >= 5 && cool) {
      const age = now - (ap.modeSince || 0);
      if ((age > (ap.maxRecruitMs || 480000) && free <= 1) || age > 12 * 60000) return ap.switchCut(ap.HIGH, 'burst time limit, ' + free + ' slot(s) still free');
    }
    const fresh = ap.poolNewCount();
    if (high && (ap.direct || 0) >= 3 && fresh < 5 && free < 2) return;
    if (high && (ap.direct || 0) >= 3 && fresh < 2) return;
    const freshN = (ap.queue || []).filter(n => !ap.retry[n]).length;
    if (ap.policyOn && !ap.dry && ap.phase === 'open' && high && free >= (ap.burstFree || 2) && freshN < free && fresh >= 2 && cool)
      return ap.switchCut(10, free + ' slots free, ' + freshN + ' new arrivals queued, ' + fresh + ' never pitched');
    return pol();
  };
  return 'patch 11 loaded';
})();
