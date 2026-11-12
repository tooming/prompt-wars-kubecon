// Fake browser for the offline tests of loop/day3_bundle.js: a virtual clock with timers the test drives, a Date
// that follows that clock, and a window object the bundle is evaluated in (node:vm). No network, no real timers.
'use strict';
const vm = require('vm');

const realSetImmediate = setImmediate;
// One hop through the macrotask queue: every promise continuation that is ready has run when this resolves.
const flush = () => new Promise(r => realSetImmediate(r));

class Clock {
  constructor(startMs) {
    this.now = startMs; this.timers = new Map(); this.seq = 1; this.thrown = []; this.fired = 0;
    this.throttleMs = 0;          // > 0: the page's interval timers fire only on multiples of this (a hidden, throttled tab)
    this.throttleTimeoutMs = 0;   // > 0: the page's one-shot timers are aligned to multiples of this
  }
  add(fn, ms, every, tag) {
    const id = this.seq++;
    let d = Number(ms); if (!(d >= 0)) d = 0;
    this.timers.set(id, { id, at: this.now + d, fn, every: every ? Math.max(1, d) : 0, tag: tag || '' });
    return id;
  }
  clear(id) { this.timers.delete(id); }
  has(id) { return this.timers.has(id); }
  _align(t) { return t.tag === 'pageI' ? this.throttleMs : t.tag === 'pageT' ? this.throttleTimeoutMs : 0; }
  _due(t) { const a = this._align(t); return a ? Math.ceil(t.at / a) * a : t.at; }
  _next(limit) {
    let best = null, bestAt = 0;
    for (const t of this.timers.values()) { const at = this._due(t); if (at <= limit && (!best || at < bestAt || (at === bestAt && t.id < best.id))) { best = t; bestAt = at; } }
    return best ? { t: best, at: bestAt } : null;
  }
  // Run every timer due up to `limit` (ms since the epoch), in time order, letting promises settle between two timers.
  async runUntil(limit) {
    for (;;) {
      await flush();
      const n = this._next(limit);
      if (!n) break;
      const t = n.t;
      if (n.at > this.now) this.now = n.at;
      if (t.every) t.at = Math.max(t.at + t.every, this._align(t) ? this.now + 1 : 0); else this.timers.delete(t.id);
      this.fired++;
      try { t.fn(); } catch (e) { this.thrown.push({ at: this.now, tag: t.tag, error: e }); }
    }
    if (limit > this.now) this.now = limit;
    await flush();
  }
  run(ms) { return this.runUntil(this.now + ms); }
  // The computer sleeps: time passes, no timer of the page fires; at wake every overdue page timer fires once, late.
  async sleep(ms, keep) {
    await flush();
    const wake = this.now + ms;
    for (const t of this.timers.values()) { if (keep && keep(t)) continue; if (t.at < wake) t.at = wake + (t.every ? 50 : 10); }
    await this.runUntil(wake);
  }
}

function makeDate(clock) {
  const RealDate = Date;
  class FakeDate extends RealDate {
    constructor(...a) { if (a.length === 0) super(clock.now); else super(...a); }
    static now() { return clock.now; }
  }
  return FakeDate;
}

// The window the bundle sees. `fetchImpl(url, init)` is the mocked network; `storage` is a plain object used as
// localStorage; `extra` is copied onto the window (for example a left-over window.__ap2).
function makeWindow(clock, { fetchImpl, storage, extra, hidden }) {
  const consoleLines = [], docListeners = {}, winListeners = {};
  const store = storage || {};
  const win = {
    console: { log: (...a) => consoleLines.push(a.map(String).join(' ')), warn: (...a) => consoleLines.push('WARN ' + a.map(String).join(' ')), error: (...a) => consoleLines.push('ERROR ' + a.map(String).join(' ')) },
    setTimeout: (fn, ms) => clock.add(fn, ms, false, 'pageT'),
    clearTimeout: id => clock.clear(id),
    setInterval: (fn, ms) => clock.add(fn, ms, true, 'pageI'),
    clearInterval: id => clock.clear(id),
    Date: makeDate(clock),
    AbortController,
    fetch: fetchImpl,
    localStorage: {
      getItem: k => Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null,
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; }
    },
    navigator: {
      wakeLock: { request: () => Promise.resolve({ released: false }) },
      locks: { request: (name, cb) => { try { return Promise.resolve(cb()); } catch (e) { return Promise.reject(e); } } }
    },
    document: {
      visibilityState: hidden ? 'hidden' : 'visible',
      addEventListener: (t, f) => { (docListeners[t] = docListeners[t] || []).push(f); },
      removeEventListener: (t, f) => { docListeners[t] = (docListeners[t] || []).filter(x => x !== f); }
    },
    addEventListener: (t, f) => { (winListeners[t] = winListeners[t] || []).push(f); },
    removeEventListener: (t, f) => { winListeners[t] = (winListeners[t] || []).filter(x => x !== f); }
  };
  win.window = win; win.self = win;
  Object.assign(win, extra || {});
  win.__test = { consoleLines, docListeners, winListeners, store };
  return win;
}

// Evaluate the bundle text in the window, as a paste into the DevTools console would.
function paste(win, code, filename) {
  if (!win.__ctx) { Object.defineProperty(win, '__ctx', { value: vm.createContext(win), enumerable: false }); }
  return vm.runInContext(code, win.__ctx, { filename: filename || 'day3_bundle.js' });
}

module.exports = { Clock, makeWindow, paste, flush };
