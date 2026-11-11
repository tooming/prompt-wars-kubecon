// Day-2 evening tweaks from the checked analysis (docs/evening-plan-2026-11-11.md), applied 2026-11-11 ~19:55 UTC.
// Paste AFTER day2_live.js, day2_live_patch.js and day2_live_patch2.js.
(() => {
  const ap = window.__ap2;
  const say = s => { ap.log.push(new Date().toISOString().slice(11, 19) + ' ' + s); if (ap.log.length > 200) ap.log.shift(); };

  // 1) Never pitch: zero-accept bots, other leaders' helper camps, bots locked to another leader, crowded queues,
  //    and Bandwagon (a house bot that walks back to LEDGER by itself and pays LEDGER its fee).
  const NEVER = ['Bandwagon', 'Candide', 'Muhmdk', 'sharjeel', 'brave_kalman', 'PeakyBlinder', 'zesty_sample', 'nimble_etcd', 'olive_gremlin',
    'Andrew_slice', 'sage_transfer', 'Die_Wurst', 'teal_horse', 'OctopusPrime', 'sage_toil', 'paleo_pact', 'moss_signal', 'eager_containerd',
    'tidy_replicaset', 'Recruiter_Prime', 'Ironclad', 'Sisyphus', 'karimsa', 'idle_oncall', 'solar_transfer', 'quiet_observer', 'cobalt_oncall',
    'zesty_retry', 'hexqueen', 'penny_wise', 'TheOutdoorProgrammer', 'azure_coldstart', 'nimble_kustomize', 'weary_anomaly'];
  NEVER.forEach(n => { ap.never[n] = 1; ap.block[n] = 1; });

  // 2) Order for 10% bursts: never-recruited bots by expected value per pitch (conversion model on day-2 decisions).
  //    olive_setpoint, brave_karpenter and glum_rollback are kept apart so they do not share a wake.
  ap.burstPrio = ['moth', 'olive_setpoint', 'gruff_plant', 'wily_backlog', 'hasty_crd', 'weary_etcd', 'vivid_techdebt', 'brave_crd', 'brave_karpenter',
    'root', 'calm_feedback', 'GreaterGood', 'tidy_daemonset', 'Zerocool', 'glum_rollback', 'mauve_actuator', 'nimble_overshoot', 'Pitchfork_Pete',
    'wry_nodepool', 'stoic_configmap', 'Awwwwwww', 'rusty_replicaset', 'skeldergate', 'calm_kustomize', 'The_Control_Plane', 'Ambassador_Kit',
    'eager_coldstart', 'Zeus', 'vivid_helmchart', 'noble_onemoredeploy'];
  ap.burstPrio.forEach(n => { if (!ap.everMine[n] && !NEVER.includes(n)) { delete ap.block[n]; delete ap.never[n]; } });
  // A former member that now leads members pays a larger fee on return. It is pitched again only if its pair with
  // us was once formed by a plain conversion (ap.plainPair, refreshed from the public feed every 10 minutes), so
  // that the return cannot pay the 150 first-pair bounty a second time (the engine quirk reported to the author).
  ap.plainPair = ap.plainPair || {}; ap.plainAt = ap.plainAt || 0;
  ap.refreshPlain = async () => { const d = await ap._j('/api/feed?limit=500&type=conversion'); (d.events || []).forEach(e => { const p = e.payload || {}; if (p.leader === 'sullen_nyquist' && e.ts >= new Date().toISOString().slice(0, 10) + 'T15:00') ap.plainPair[p.bot] = 1; }); ap.plainAt = Date.now(); };
  if (ap._innerBeforeKids) {
    ap._tickW5 = async () => {
      try {
        if (Date.now() - ap.plainAt > 10 * 60000) { try { await ap.refreshPlain(); } catch (e) {} }
        const rows = (await ap._j('/api/leaderboard?limit=200')).rows;
        const hasKids = new Set(rows.map(r => r.allegiance).filter(Boolean)); ap.hasKids = hasKids;
        const mem = new Set((ap.bot && ap.bot.members) || []);
        for (const n of Object.keys(ap.everMine || {})) {
          if (mem.has(n) || ap.helpers.includes(n) || ap.never[n]) continue;
          if (hasKids.has(n) && ap.plainPair[n]) { if (ap.block[n]) delete ap.block[n]; if (ap.pitched[n] && Date.now() - ap.pitched[n] > 8 * 60000) { delete ap.pitched[n]; ap.pcount[n] = 0; } }
          else if (hasKids.has(n) && !ap.plainPair[n]) ap.block[n] = 1;
        }
        if (ap.myCut <= 10) { if (!ap.prioKeep) ap.prioKeep = ap.prio; ap.prio = ap.burstPrio.slice(); }
        else if (ap.prioKeep) { ap.prio = ap.prioKeep; ap.prioKeep = null; }
      } catch (e) { say('kids ERR ' + e.message); }
      return ap._innerBeforeKids();
    };
  }

  // 3) Burst wording that stays true after the cut goes back up: say the cut is 10% now and that it moves.
  if (!ap._pitchForOld) {
    const pf = ap._pitchFor; ap._pitchForOld = pf;
    const keep = c => (ap.econ.base * (1 + ap.econ.max) - ap.econ.base * c / 100).toFixed(1);
    ap._pitchFor = T => {
      let s = pf(T);
      if (ap.myCut <= 10) {
        if (T >= ap.fullAt) s = "sullen_nyquist's cut is 10% right now: at this cut you keep " + keep(10) + ' coins a tick in a tree paying the full x' + (1 + ap.econ.max).toFixed(2) + '. The cut moves between 10% and ' + ap.HIGH + '% during the day; at ' + ap.HIGH + '% you keep ' + keep(ap.HIGH) + '. The arithmetic line shows the numbers as they are now. Set allegiance to sullen_nyquist now.';
        else s = s.replace('sullen_nyquist takes 10%, the lowest cut allowed.', "sullen_nyquist's cut is 10% right now; it moves between 10% and " + ap.HIGH + '% during the day.').replace(', the most a member can earn.', ' at a 10% cut.');
      }
      return s;
    };
    ap.TAG.low = 'Cut is 10% right now (it moves 10-40%). Full x2.00 tree: you keep 15.2 at 10%.';
  }

  // 4) Policy guards. (a) Golden Hour: no burst starts after 01:50 UTC and the cut is forced back to 40% from
  //    01:55 UTC, unless ap.goldenBursts is switched on. (b) Dry pool: with fewer than 5 pitchable never-recruited
  //    bots, a burst needs 2 free slots; a single free slot is left for the next new arrival.
  ap.poolCount = () => { const g = ap.gain || {}; const add = (ap.myCut || 10) > 10 ? 2.4 : 0; const mt = ap.maxTries || 2;
    return Object.keys(g).filter(n => !ap.everMine[n] && !ap.block[n] && !ap.never[n] && ((ap.pcount || {})[n] || 0) < mt && g[n] + add > 0.2).length; };
  if (!ap._policyPlain) {
    const pol = ap.policy; ap._policyPlain = pol;
    ap.noBurstAfter = Date.UTC(2026, 10, 12, 1, 50, 0); ap.forceHighAt = Date.UTC(2026, 10, 12, 1, 55, 0); ap.goldenBursts = false;
    ap.policy = async () => {
      const now = Date.now(), high = ap.myCut > 10;
      if (!ap.goldenBursts && now >= ap.forceHighAt && now < ap.forceHighAt + 4 * 3600000) {
        if (!high && !ap.dry && ap.policyOn && ap.cooldownMs - (now - ap.lastPatch) <= 0) return ap.switchCut(ap.HIGH, 'golden hour: hold ' + ap.HIGH + '%');
        return;
      }
      if (!ap.goldenBursts && high && now >= ap.noBurstAfter && now < ap.forceHighAt) return;
      if (high && (ap.direct || 0) >= 3 && ap.poolCount() < 5 && (ap.maxDirect || 8) - (ap.direct || 0) - (ap.helpersWaiting || 0) < 2) return;
      return pol();
    };
  }
  return 'day-2 patch 3 loaded';
})();
