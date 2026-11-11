// Day-2 evening, 22:25 UTC. Paste AFTER patches 1-8.
// Why: the 22:06-22:21 UTC burst sent 9 pitches and none was accepted. Four went to bots whose own instructions
// bind them to another leader (zesty_coldstart's and jolly_bode's helpers; one was pitched twice) and four to bots
// with the "very hard to move" disposition. The loop now learns from each refusal, once a minute:
//   - reasoning that cites its core, creed or loyalty to a leader  -> never pitch that bot again
//   - "very hard to move" in the prompt                            -> no retry
(async () => {
  const ap = window.__ap2; if (ap._patch9) return 'already';
  ap._patch9 = true;
  const say = s => { ap.log.push(new Date().toISOString().slice(11, 19) + ' ' + s); if (ap.log.length > 200) ap.log.shift(); };
  ['teal_coldstart', 'wary_containerd', 'crimson_toil', 'olive_sidecar', 'wary_logline', 'tidy_feedback'].forEach(n => { ap.never[n] = 1; ap.block[n] = 1; });
  ap._learnAt = 0; ap.learned = ap.learned || {};
  const LOYAL = /(core|creed)[^.]{0,80}(must|requires|dictates|directive)|must (remain|follow|stay)|remain(s)? loyal|loyal to|committed to|never change allegiance|refuse any (pitch|allegiance)/i;
  ap.learn = async () => {
    const f = await ap._j('/api/bot/feed?limit=80'); const evs = f.events || f; let k = 0;
    for (const e of evs) {
      if (e.type !== 'reflection') continue; const p = e.payload || {};
      if (p.proposer !== 'sullen_nyquist' || p.change) continue;
      const n = p.bot; if (!n || ap.learned[e.id]) continue; ap.learned[e.id] = 1;
      const st = (p.steps || [])[0] || {}; const pr = st.prompt || '', why = st.reasoning || '';
      if (!ap.never[n] && LOYAL.test(why)) { ap.never[n] = 1; ap.block[n] = 1; k++; say('NEVER ' + n + ' (its instructions bind it to its leader)'); }
      else if (/very hard to move/i.test(pr)) { ap.pcount[n] = Math.max(ap.pcount[n] || 0, ap.maxTries || 2); k++; }
    }
    return k;
  };
  const inner9 = ap._tickW5;
  ap._tickW5 = async () => {
    try { if (Date.now() - ap._learnAt > 60000) { ap._learnAt = Date.now(); await ap.learn(); } } catch (e) { say('learn ERR ' + e.message); }
    return inner9();
  };
  const k = await ap.learn(); ap._learnAt = Date.now();
  return 'patch 9 loaded, learned from ' + k + ' refusals';
})();
