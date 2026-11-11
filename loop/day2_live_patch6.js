// Day-2 evening, 21:48 UTC. Paste AFTER patches 1-5. One change to the core's step 1.
// Why: the old sentence asked for "four persuade calls ... (fewer if fewer are listed)". With one or two names in
// TARGETS the model still made three calls: it repeated a target (three pitches to AlertFatigue at 21:36 UTC,
// 20 duplicate pitches = 300 coins over the day) or padded the wake with a whisper (21:03, 21:27, 21:43 UTC).
// The engine never ran more than three persuades in a wake anyway.
(() => {
  const ap = window.__ap2; if (ap._headOld6) return 'already';
  const OLD = 'Your FIRST response is four persuade calls made together in parallel: the first four bots in TARGETS (fewer if fewer are listed). One call per bot, never two to the same bot.';
  const NEW = 'Your FIRST response is one persuade call per bot in TARGETS, in parallel, at most the first three. One bot listed means exactly one call. Never two calls to the same bot; never another tool to fill up.';
  ap.perWake = 4;                      // keeps the base text at "four", which OLD matches
  const h = ap._HEAD; if (!h('X').includes(OLD)) return 'old sentence not found';
  ap._headOld6 = h; ap._HEAD = p => h(p).replace(OLD, NEW);
  ap.force = true;                     // save at the next cooldown expiry
  return 'patch 6 loaded';
})();
