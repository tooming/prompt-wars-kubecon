// Day-2 evening, 21:59 UTC. Paste AFTER patches 1-6. Follow-up to patch 6 (same step of the core).
// Patch 6 stopped the filler whispers but not every duplicate: with two names listed, the 21:54 UTC wake still made
// three calls (plucky_retry twice). The count is now stated on its own line, written by the loop at each save:
//   TARGETS: a, b
//   CALLS: 2
//   EXPIRES: tick N
(() => {
  const ap = window.__ap2; if (ap._patch7) return 'already';
  const OLD2 = 'Your FIRST response is one persuade call per bot in TARGETS, in parallel, at most the first three. One bot listed means exactly one call. Never two calls to the same bot; never another tool to fill up.';
  const NEW2 = 'Your FIRST response is exactly as many persuade calls as the CALLS line says, in parallel: one to each of the first bots in TARGETS, in order. Never two calls to the same bot; never another tool to fill up.';
  const h = ap._HEAD; if (!h('X').includes(OLD2)) return 'sentence not found';
  ap._patch7 = true; ap._HEAD = p => h(p).replace(OLD2, NEW2);
  // The CALLS line is added at save time, after the TARGETS line, so the loop's own parsing of TARGETS and EXPIRES
  // is unaffected. No CALLS line when TARGETS is empty (the IDLE rule applies).
  const sv = ap._save;
  ap._save = async (bot, core) => {
    try { const m = /\nTARGETS: ([^\n]*)/.exec(core); const names = m ? m[1].split(', ').filter(Boolean) : []; if (names.length && !/\nCALLS: /.test(core)) core = core.replace(/\nTARGETS: ([^\n]*)/, x => x + '\nCALLS: ' + Math.min(3, names.length)); } catch (e) {}
    return sv(bot, core);
  };
  ap.coreMax = 1488;                   // leaves room for the CALLS line under the 1500 limit
  ap.force = true;
  return 'patch 7 loaded';
})();
