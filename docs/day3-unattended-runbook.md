# Day 3 unattended: runbook

Day 3 (Thursday 2026-11-12) runs while nobody can touch the bot. Everything is set up the evening before, in one
browser tab on a computer that stays on. Times below are MST (Salt Lake City), with UTC in brackets.

| When | What |
|---|---|
| Wed 20:00 (03:00 UTC Thu) | Day 2 freezes. Do the steps below after this. |
| Thu 07:57 (14:57) | The loop makes its one save before the open: dial to 10%. The fallback core stays on the bot. |
| Thu 08:00 (15:00) | Day 3 opens. The loop starts by itself and replaces the fallback core within 20 seconds. |
| Thu 11:32 (18:32) | Pre-golden refill window: empty slots are filled at 10%, former members included. |
| Thu 11:50 (18:50) | No new burst starts. |
| Thu 11:55 (18:55) | Cut forced to 40% until the freeze. |
| Thu 12:00 (19:00) | Golden Hour. |
| Thu 13:00 (20:00) | Freeze. The loop goes idle. |

The loop takes these times from `/api/world`; the table is what the schedule says today.

Three layers protect the day:

1. `cores/day3_static_core.txt`, saved by hand tonight (fixed 10% cut, 24 targets, each pitched once). The loop
   leaves it in place until it is live. If the tab dies overnight, or the loop cannot go live in the morning, the
   bot plays this core all day.
2. `loop/day3_bundle.js`, pasted tonight. It runs the day from the open.
3. The `EXPIRES` line in every core the loop saves. If the loop dies during the day, the bot stops pitching
   within about six minutes and sits idle at its current cut with the members it has.

The file to paste is version **day3-bundle-2**. The console must answer `pw3 day3-bundle-2 loaded`. If it says
`day3-bundle-1`, the computer has the copy from before the review: get the current file.

## Tonight, after the freeze

### 1. In the day-2 tab, before it is closed: export what the day-2 loop learned

The day-2 loop learned never-pitch names while it ran (bots whose refusals cite their core or their leader). They
exist only in `window.__ap2` of the tab that ran day 2. `loop/day3_bundle.js` does not contain them. Without this
step those bots are pitched again on day 3.

In the console of the day-2 game tab:

```js
copy(JSON.stringify({ never: __ap2.never, block: __ap2.block, everMine: __ap2.everMine || {}, helpers: __ap2.helpers || [], helperNoReserve: __ap2.helperNoReserve || {} }))
```

The text is now on the clipboard. Paste it into a new file `state/day2-lists-export.json` and get that file (or
the text) to the computer of step 2. It is used in step 7.

Also save the loop itself, because part of what ran today was never written to a file (the `_tickW5` chain that
patches 2, 3, 9, 12 and 13 hook into):

```js
copy(JSON.stringify({ fns: Object.fromEntries(Object.keys(__ap2).filter(k => typeof __ap2[k] === 'function').map(k => [k, String(__ap2[k])])), never: Object.keys(__ap2.never), block: Object.keys(__ap2.block), helpers: __ap2.helpers, everMine: Object.keys(__ap2.everMine || {}), plainPair: Object.keys(__ap2.plainPair || {}) }))
```

Paste that into `state/day2-tab-dump.json`. If there is time, read `tick`, `_tickW5` and `_innerBeforeKids` in it
against `liveTick`, `plan` and `decide` of the bundle: a rule that lives only there is not in the bundle.

Then stop the day-2 loop: close that tab, or run
`__ap2.enabled = false; clearInterval(__ap2.timer); clearInterval(__ap2.trivTimer)`. A day-2 loop left open
somewhere could wake up at the open and fight the bundle over the bot. The same goes for any tab in which the
bundle was pasted for a test: run `__pw3.stop()` there or close it. Only one tab may run the loop.

If the bundle is pasted into this same tab (step 7), it takes the lists over from `__ap2` by itself and switches
the day-2 loop off. The export is still worth keeping as a file.

### 2. Pick the computer

It has to stay powered, online and logged in to a desktop session from tonight until Thursday 13:00 MST. Not the
laptop that travels. A desktop Mac at home that you reach with Screen Sharing is the best choice. It needs Google
Chrome, the file `loop/day3_bundle.js` (version day3-bundle-2: pull this repo there once the file is committed,
or copy the file over) and the export from step 1.

### 3. Keep the computer awake

In Terminal on that computer:

```bash
nohup caffeinate -dimsu -t 93600 >/dev/null 2>&1 & disown
pgrep -l caffeinate
```

The first line keeps the display and the system awake for 26 hours and survives a closed Terminal window or a
dropped ssh session. The second must print a line with `caffeinate`. Also, for tonight:

- System Settings > Lock Screen: start screen saver "Never", turn display off "Never", require password "Never".
  Chrome may treat a locked screen or a sleeping display as a hidden window.
- System Settings > General > Software Update > Automatic Updates: switch off installing updates, so the Mac
  does not restart overnight.
- If it is a laptop: on mains power, lid open.
- Do not log out. Disconnecting Screen Sharing is fine.

### 4. Chrome settings

- Settings > Performance: Memory Saver off (or add `kubecon.dstl8.ai` under "Always keep these sites active"),
  Energy Saver off.
- Put the game tab alone in its own window. Leave that window on screen: not minimised, not covered edge to
  edge by another window, not in a full-screen Space you then leave.
- Open `chrome://discards`, find the kubecon.dstl8.ai row, and click "Toggle" in the Auto Discardable column so
  that it shows a cross.
- Ignore any "Relaunch to update" button until Thursday afternoon.
- Optional, before step 5: `defaults write com.google.Chrome NSAppSleepDisabled -bool YES` in Terminal, then quit
  and reopen Chrome. It stops macOS from napping Chrome when its window is not in front.

Why: Chrome slows the timers of a tab it considers hidden to about one a minute, and may unload a tab it wants
memory from. With slow timers the loop still works, only more slowly, and writes `SLOW TIMER` or `TAB HIDDEN` in
its log. An unloaded tab is a dead loop.

### 5. Sign in

Open https://kubecon.dstl8.ai in that window and sign in yourself with the Google account that owns
`sullen_nyquist`. The Bot tab must show `sullen_nyquist`. The loop refuses to save anything to another bot.

### 6. Save the fallback core by hand

Edit tab (https://kubecon.dstl8.ai/#/edit):

- Core: everything in `cores/day3_static_core.txt` (`pbcopy < cores/day3_static_core.txt`, then paste over the
  old text). If a name from the step-1 export is in its `TARGETS` line, take it out first (step 8 shows this in
  the `fallbackCore` field).
- Tagline: `Cut is 10% right now, the lowest a leader can set (the most is 40%).`
- Dials: Generous/Greedy 0, Loyal/Opportunist 0, Talkative/Terse 44, Persuasive/Resistant 100,
  Paranoid/Trusting 20. "Publish my core" unticked.
- Save. If it complains about the content, press Save again.

`cores/day3_static_core.md` explains this core.

### 7. The one paste, then the import

1. Copy the bundle: `pbcopy < loop/day3_bundle.js`.
2. In the game tab press Cmd+Option+J (DevTools console).
3. If Chrome prints a warning about pasting, type `allow pasting` and press Enter.
4. Paste, press Enter.

The console answers `pw3 day3-bundle-2 loaded. Run:  await __pw3.cycle()` and a few lines that start with
`[pw3]`. Nothing is saved to the bot at this point.

5. Import the day-2 lists (not needed if this is the day-2 tab and the console printed
   `imported from the day-2 loop: ...`). Type `__pw3.importDay2(`, paste the text of
   `state/day2-lists-export.json`, type `)` and press Enter:

   ```js
   __pw3.importDay2({"never":{...},"block":{...},"everMine":{...},"helpers":[...],"helperNoReserve":{}})
   ```

   The answer lists `neverPitchAdded`, `noSecondPitchAdded` and `helpersAdded`. It is kept in this browser
   (localStorage), so a later paste of the bundle keeps it. How the names are sorted: a name with the day-2
   never flag and a block is never pitched; a name with the flag only, or one that the bundle's own target
   lists name and that was a member on day 2, keeps the day-2 meaning (one pitch a day, never as a former
   member). A single name by hand: `__pw3.never('its_name')`.

Pasting the bundle again later is safe: the new copy stops the old one and keeps what it has learned.

Paste after the freeze. Pasted while a day is still running, the bundle takes that day over at once.

### 8. Check that it is armed

```js
JSON.parse(await __pw3.cycle())
```

Open the object the console prints and check:

| Field | Must be |
|---|---|
| `v` | `"day3-bundle-2"` |
| `armed` | `true` |
| `signedIn` | `true` |
| `bot` | `"sullen_nyquist"` |
| `phase` | `"frozen"` |
| `nextOpenInMin` | the minutes left until Thursday 08:00 MST |
| `openingCore` | `"will be saved 170 s before the open"` |
| `fallbackCore` | `"on the bot (24 targets, no expiry): it stays in place until the first live tick"` |
| `timeSource` | `"day_window.next_open_at"` (or `"CONFIG fallback"` if the game serves no open time) |
| `helpers` | leosharkpark, dapper_grafana, rowdy_baseline, plus any helper found by tagline or imported |
| `neverBuiltIn` | `54` |
| `neverLearned` | the names step 7 added as never-pitch (empty only if the day-2 loop learned none) |
| `noSecondPitch` | dapper_observer, sage_daemonset, plus any the import added |
| `lastError` | empty |

If `armed` is false: `signedIn` false means the tab is not signed in (or is signed in as another bot);
`phase` null means `/api/world` did not answer (network).

If `fallbackCore` says the core lists never-pitch or helper names: take those names out of the `TARGETS` line in
the Edit tab, save, and run the check again. If you leave it, the loop replaces the core with its own opening
core at 07:57 (which expires at tick 8), and the all-day safety net of layer 1 is gone.

Optional: `console.log(await __pw3.preview())` prints what the 07:57 save will do. With the fallback core on
the bot it says that the core stays and shows the tagline it will set. Below that it prints the core the loop
would otherwise save: cut 10%, the pitch "The arithmetic line shows what you would earn with me: my cut is 10%
right now; it moves between 10% and 40% during the day. ...", three to five names, `CALLS: 3`, `EXPIRES: tick 8`.

A friend's new helper bot that is not in the list: `__pw3.addHelper('its_name')`.

In Terminal: `pgrep -l caffeinate` must still print a line.

### 9. Leave it

You may close DevTools; the loop lives in the page. Do not reload the tab, do not navigate away from
kubecon.dstl8.ai (moving between the game's own pages is fine), do not close the window.

### 10. Before boarding, from your phone

Open https://kubecon.dstl8.ai/api/bots/sullen_nyquist in the phone's browser.

- After 07:57 MST: `tagline` reads `Cut is 10% right now. A leader can set 10% to 40%; this is the lowest.` and
  `cut_pct` is 10. The loop is alive and has made its save before the open.
- After 08:01: `tagline` reads `Cut is 10% right now (it moves 10-40%). Each bot that joins lifts your pay.` The
  loop is live and has replaced the fallback core.
- If the tagline is still the one from step 6 (`... the lowest a leader can set (the most is 40%).`), the loop is
  not running and the bot plays the fallback core. Nothing can be fixed from a phone. With Screen Sharing and a
  few minutes: look at the tab, sign in again if it shows the sign-in page, and repeat steps 7 and 8.
- After 08:05: `members` fills up, and `cut_pct` turns 40 once all eight slots are taken.

## What the loop does while you fly

- Opens at 10%, pitches three bots a wake from the opening order, keeps one slot free for each helper bot
  that has not joined yet (for 15 minutes), and goes to 40% when the slots are full for the first time. If
  they are still not full after 30 minutes, or nobody is left to pitch, it moves on to the burst rules.
- At 40% it pitches new arrivals and independent former members; when slots stay empty it drops to 10% for a
  refill burst (8 minutes, 12 at most) under the same rules as on the evening of day 2.
- Reads base income, tree bonus, slot limit, pitch price, edit cooldown and the Golden Hour and freeze times
  from `/api/world` on every tick. A new twist or changed value is written to the log as `RULES changed` and
  the loop carries on with the new numbers. If one pitch costs more than 100 coins it lists no targets. A
  phase name it does not know counts as open while the game still serves a freeze time ahead.
- The two member thresholds of the cut policy (3 and 5 with eight slots) follow the served slot limit.
  **With no slot limit at all (the day-1 rules) it recruits at 10% all day and goes to 40% only for the Golden
  Hour.** That is what day 1 did; it is the owner's call. To have the day-2 burst rules run on 99 slots instead,
  set `noLimitLow: false` in CONFIG before the paste (or `__pw3.cfg.noLimitLow = false` after it).
- Writes every pitch from the bot's real cut, so the text is true when it is saved. From 28 minutes before the
  Golden Hour the 10% pitch adds that the cut will be 40% through the Golden Hour, to the freeze. On a day when
  the dial maps differently (greedy 0 does not give 10%) the pitch states only the cut of the moment until a rise
  to the high cut has been seen to work.
- Never pitches the never list, the helpers, or a former member whose first join was not a plain conversion. A
  bot that carries members (its join would be a schism, which the engine does not record as a pair) is only
  listed in a list that expires before a second wake can come, so a late save cannot pitch it twice. If a return
  pays the first-pair bounty again anyway, that bot is not pitched again, and if its pair was a plain conversion
  no former member is pitched again that day.
- If the leaderboard cannot be read it chooses no new targets and leaves the saved list to run out, but still
  changes the cut when the slots are full (the members come from `/api/bot`) and for the Golden Hour.
- Retries a save refused by the content check (HTTP 422: after 20, 20, 40, 80, then 120 s), waits out the edit
  cooldown (HTTP 429), backs off on any other refusal (20, 40, 80, 160 s), abandons a request after 15 seconds,
  and restarts its own timer if no tick finished for 3 minutes.
- Sends about 15 requests a minute, with peaks of about 22: four reads every 20 seconds, the saves, and at most four
  optional reads a minute (leader profiles, the public feed every ten minutes, trivia every five). The day-2
  loop sent about 30 a minute with peaks of 70. Before the open it reads `/api/world` once a minute, every 20
  seconds in the last four minutes.

## Where it differs from the day-2 loop on purpose

- Leader profiles: day 2 read every leader's cut every 4 minutes. The bundle reads the leaders of the next
  targets every 4 minutes and the others in turn as the request budget allows, so a rival leader's cut can be
  up to about 20 minutes old.
- The save before the open leaves the hand-saved fallback core in place; day 2 was started by hand at the open.
- "New arrival" (pitched first once the tree is full) means a bot that was not on the board at the open. Day 2
  counted every independent bot outside its order lists.
- The first list of a burst is the ordinary plan for 10% (day 2 wrote free slots + 2 names by burst index, for
  one cooldown), and the save that raises the cut lists only bots that gain 4.5 or more at 40% (day 2 listed
  bots gaining 0.2 for one cooldown).
- A save refused by the content check is retried with a growing wait (day 2: every 20 s).
- With an awaited helper, the 40% list is the free slots not kept for a helper (day 2 took two names off per
  helper at 40% as well, which listed nobody for a second free slot).
- Single-wake lists for bots that carry members, the reaction to a repeated bounty, the pre-golden wording, the
  blind mode, the unknown-phase rule, the thresholds that follow the slot limit and the no-limit rule are new.

## What it does not do

- It does not answer trivia or redeem booth codes. A trivia question is logged as `TRIVIA is open`. Day 2
  paid 500 to 1,000 coins per question and 5,000 for the booth photo code; without you those are lost.
- It does not survive a closed or reloaded tab, a signed-out session, a sleeping computer or a lost network.
- It does not invent strategy. If day 3 changes how cuts or trees work in a way the rules above do not cover,
  it keeps applying them to the new numbers.
- It does not react to the game's idle flag. If `/api/bot` marks the bot as quiet with reduced income, the log
  says `IDLE PENALTY` and `cycle()` shows `idle` and `incomePct`; nothing else changes.
- It never asks the bot for a tool other than `persuade` and `remember`, never touches a dial other than
  Generous/Greedy, and never raises its request rate.

## How to stop it

In the console of the game tab:

- `__pw3.stop()` stops all timers. The saved target list expires within about six ticks and the bot idles.
- `await __pw3.park()` stops and saves an empty target list at once. `park(40)` or `park(10)` also sets the cut.
- `__pw3.resume()` starts it again.

Closing the tab also stops it; Chrome may ask "Leave site?" first.

Every tunable (cuts, time limits, lists, helper names) is in the CONFIG block at the top of
`loop/day3_bundle.js`, one comment per item, and live on `__pw3.cfg`.

## After landing

1. Phone: https://kubecon.dstl8.ai (leaderboard) and https://kubecon.dstl8.ai/api/bots/sullen_nyquist
   (`rank`, `coins`, `cut_pct`, `members`). Report the rank the board shows.
2. On the computer, in the game tab's console:

   ```js
   JSON.parse(await __pw3.cycle())   // phase, cut, direct, today {saves, s422, switches, recruits, bounties, left, errs}
   console.log(__pw3.tail(300))      // the log
   copy(__pw3.tail(600))             // the log to the clipboard; paste it into state/day3-log.txt
   ```

3. Lines worth reading in the log:

   | Line | Meaning |
   |---|---|
   | `OPENING CORE saved` | the 07:57 save happened (it says whether the fallback core stayed in place) |
   | `NEW DAY 3` | the loop saw the open and cleared its day state |
   | `RULES changed` | what day 3 changed in `/api/world` |
   | `unknown phase` | the game served a phase name the loop does not know, and how it was treated |
   | `CUT 10% -> 40%`, `CUT 40% -> 10%` | every cut change with its reason |
   | `RECRUIT`, `LEFT` | joins (fee, bounty) and leaves |
   | `NEVER <bot>` | a bot whose refusal cited its core or its leader; never pitched again |
   | `HELPER ... reservation is released` | a helper bot did not join |
   | `the leaderboard cannot be read` | the loop ran blind for a while (no new targets) |
   | `the greedy dial did not move the cut` | a cut change had no effect; the policy paused |
   | `IDLE PENALTY` | the game marked the bot as quiet |
   | `TRIVIA is open` | a question the loop could not answer |
   | `WATCHDOG`, `SLOW TIMER`, `TAB HIDDEN` | the tab was stuck, throttled or hidden |
   | `NOT SIGNED IN`, `WRONG ACCOUNT` | the session was lost or belongs to another bot |
   | `NOTE: ... paid the first-pair bounty again` | a repeat bounty arrived that the loop did not arrange; should not appear. After it the loop stops pitching that bot, or all former members |
   | `WARNING: the own feed shows no pitch to` | the own feed showed no pitch events; the loop went by the bot's notes, its wake events, or time |
   | `WARNING: OUR BOT NOW FOLLOWS` | the bot's own allegiance was changed |

4. If the day is still open and the loop is dead (console says `__pw3` is not defined, or `lastTickAgoS` keeps
   growing): sign in if needed and paste the bundle again. It reads today's joins from the public feed before
   it pitches anyone, so the plain-pair rule still holds. If that is not possible, do not save the static core
   as it is: it would pitch its list from the top, members and former members included. Save it with the
   `TARGETS` line cut down to names that were not members today, or with the line empty.
5. After the freeze: `__pw3.stop()`, stop `caffeinate` (`killall caffeinate`), put the Lock Screen, Software
   Update and Chrome Performance settings back, and sign out of the game if the computer is shared.
