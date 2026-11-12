// tabcheck.js v2: run with javascript_tool in the supervisor's LOOP TAB: the only tab in this session's Claude tab
// group, title "KEEP THIS TAB - pw3 loop (supervisor)", url https://kubecon.dstl8.ai/ . The day-3 loop (window.__pw3)
// lives in that tab's page memory: NEVER navigate, reload or close it. Returns one JSON string.
const o = { tab: document.title.slice(0, 40), vis: document.visibilityState, focused: document.hasFocus() };
if (!window.__pw3) o.loop = 'NO __pw3 IN THIS TAB: the loop is gone (tab reloaded or replaced). Re-arm per SUPERVISOR.md.';
else {
  let c = null;
  try { c = JSON.parse(await __pw3.cycle()); } catch (e) { o.cycleErr = String((e && e.message) || e).slice(0, 120); try { c = JSON.parse(__pw3.status()); } catch (e2) {} }
  if (c) {
    for (const k of ['v', 'armed', 'stopped', 'signedIn', 'bot', 'phase', 'day', 'tick', 'nextOpenInMin', 'openingCore', 'fallbackCore', 'cut', 'mode', 'firstFull', 'direct', 'helpersWaiting', 'helpersReleased',
      'coins', 'rank', 'list', 'calls', 'hold', 'goldenInMin', 'freezeInMin', 'preGolden', 'noBurst', 'forced40', 'lastSaveAgoS', 'idle', 'incomePct', 'cutUnconfirmed', 'boardUnreadable',
      'ticksOk', 'lastTickAgoS', 'watchdogRestarts', 'requestsLastMin', 'tabHidden', 'lastError', 'today']) if (c[k] !== null && c[k] !== undefined && c[k] !== '' && !(Array.isArray(c[k]) && !c[k].length)) o[k] = c[k];
    o.helpers = c.helpers;
  }
  const hot = /CUT |RECRUIT|LEFT|NEVER|HELPER|WATCHDOG|SLOW TIMER|TAB HIDDEN|NOT SIGNED|WRONG ACCOUNT|TRIVIA|RULES|NEW DAY|OPENING CORE|IDLE PENALTY|WARNING|NOTE:|ERR |unknown phase|cannot be read|did not move|STOPPED|RESUMED|GOLDEN|golden|contract/;
  const log = String(__pw3.tail(300)).split('\n');
  o.logHot = log.filter(l => hot.test(l)).slice(-12).map(l => l.slice(0, 210));
  o.logLast = log.slice(-2).map(l => l.slice(0, 180));
}
// tripwire: writes to the loop's snapshot key by ANOTHER tab (= a second copy of the loop is alive somewhere)
const ol = window.__otherLoop;
o.otherLoop = !ol ? 'TRIPWIRE MISSING (tab was reloaded?)' : ol.length ? ol.length + ' writes by another tab, last ' + Math.round((Date.now() - ol[ol.length - 1]) / 1000) + ' s ago: A SECOND LOOP IS ALIVE' : 'none seen';
try {
  const b = await (await fetch('/api/bot', { credentials: 'include' })).json();
  const core = b.core || '', line = re => ((core.match(re) || [''])[0]).slice(0, 200);
  o.api = { rank: b.rank, coins: b.coins, cut: b.cut_pct, greedy: b.sliders && b.sliders.greedy, members: (b.members || []).map(m => m.name || m), idle: b.idle, incomePct: b.income_pct, editCount: b.edit_count,
    allegiance: b.allegiance || '', tagline: b.tagline, coreAgeS: b.core_updated_at ? Math.round((Date.now() - Date.parse(b.core_updated_at)) / 1000) : null, targets: line(/TARGETS:[^\n]*/), expires: line(/EXPIRES[^\n]*/) };
} catch (e) { o.botErr = String(e).slice(0, 80); }
// The extension blocks output that looks like cookie or query-string data ("a=b; c=d", "a=b&c=d"): neutralise it.
JSON.stringify(o).replace(/=/g, ':').replace(/;/g, ',').replace(/&/g, '+')
