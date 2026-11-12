# Day 3 unattended: runbook

Day 3 (Thursday 2026-11-12) runs while nobody can touch the bot. Everything is set up the evening before, in one
browser tab on a computer that stays on. Times below are MST (Salt Lake City), with UTC in brackets.

| When | What |
|---|---|
| Wed 20:00 (03:00 UTC Thu) | Day 2 freezes. Do the steps below after this. |
| Thu 07:57 (14:57) | The loop saves its opening core: 10% cut, first targets. |
| Thu 08:00 (15:00) | Day 3 opens. The loop starts by itself. |
| Thu 11:32 (18:32) | Pre-golden refill window: empty slots are filled at 10%, former members included. |
| Thu 11:50 (18:50) | No new burst starts. |
| Thu 11:55 (18:55) | Cut forced to 40% until the freeze. |
| Thu 12:00 (19:00) | Golden Hour. |
| Thu 13:00 (20:00) | Freeze. The loop goes idle. |

The loop takes these times from `/api/world`; the table is what the schedule says today.

Three layers protect the day:

1. `cores/day3_static_core.txt`, saved by hand tonight. If the tab dies overnight, the bot plays this all day
   (fixed 10% cut, 25 targets).
2. `loop/day3_bundle.js`, pasted tonight. It replaces the static core just before the open and runs the day.
3. The `EXPIRES` line in every core the loop saves. If the loop dies during the day, the bot stops pitching
   within about six minutes and sits idle at its current cut with the members it has.

## Tonight, after the freeze

### 1. Pick the computer

It has to stay powered, online and logged in to a desktop session from tonight until Thursday 13:00 MST. Not the
laptop that travels. A desktop Mac at home that you reach with Screen Sharing is the best choice. It needs Google
Chrome and the file `loop/day3_bundle.js` (pull this repo there, or copy the file over).

On the laptop you used today: close the game tab, or run `__ap2.enabled = false; clearInterval(__ap2.timer)` in
its console. A day-2 loop left open somewhere could wake up at the open and fight this one over the bot.

### 2. Keep the computer awake

In Terminal on that computer:

```bash
caffeinate -dimsu -t 93600 &
```

That keeps the display and the system awake for 26 hours. Also, for tonight:

- System Settings > Lock Screen: start screen saver "Never", turn display off "Never", require password "Never".
  Chrome may treat a locked screen or a sleeping display as a hidden window.
- System Settings > General > Software Update > Automatic Updates: switch off installing updates, so the Mac
  does not restart overnight.
- If it is a laptop: on mains power, lid open.
- Do not log out. Disconnecting Screen Sharing is fine.

### 3. Chrome settings

- Settings > Performance: Memory Saver off (or add `kubecon.dstl8.ai` under "Always keep these sites active"),
  Energy Saver off.
- Put the game tab alone in its own window. Leave that window on screen: not minimised, not covered edge to
  edge by another window, not in a full-screen Space you then leave.
- Open `chrome://discards`, find the kubecon.dstl8.ai row, and click "Toggle" in the Auto Discardable column so
  that it shows a cross.
- Ignore any "Relaunch to update" button until Thursday afternoon.
- Optional, before step 4: `defaults write com.google.Chrome NSAppSleepDisabled -bool YES` in Terminal, then quit
  and reopen Chrome. It stops macOS from napping Chrome when its window is not in front.

Why: Chrome slows the timers of a tab it considers hidden to about one a minute, and may unload a tab it wants
memory from. With slow timers the loop still works, only more slowly, and writes `SLOW TIMER` or `TAB HIDDEN` in
its log. An unloaded tab is a dead loop.

### 4. Sign in

Open https://kubecon.dstl8.ai in that window and sign in yourself with the Google account that owns
`sullen_nyquist`. The Bot tab must show `sullen_nyquist`. The loop refuses to save anything to another bot.

### 5. Save the fallback core by hand

Edit tab (https://kubecon.dstl8.ai/#/edit):

- Core: everything in `cores/day3_static_core.txt` (`pbcopy < cores/day3_static_core.txt`, then paste over the
  old text).
- Tagline: `Cut is 10% right now, the lowest a leader can set. Each joiner lifts your pay.`
- Dials: Generous/Greedy 0, Loyal/Opportunist 0, Talkative/Terse 44, Persuasive/Resistant 100,
  Paranoid/Trusting 20. "Publish my core" unticked.
- Save. If it complains about the content, press Save again.

`cores/day3_static_core.md` explains this core.

### 6. The one paste

1. Copy the bundle: `pbcopy < loop/day3_bundle.js`.
2. In the game tab press Cmd+Option+J (DevTools console).
3. If Chrome prints a warning about pasting, type `allow pasting` and press Enter.
4. Paste, press Enter.

The console answers `pw3 day3-bundle-1 loaded. Run:  await __pw3.cycle()` and a few lines that start with
`[pw3]`. Nothing is saved to the bot at this point.

Pasting again later is safe: the new copy stops the old one and keeps what it has learned. If the day-2 loop
(`window.__ap2`) is still in this tab, the bundle switches it off and takes over its never-pitch names and
helper names.

Paste after the freeze. Pasted while a day is still running, the bundle takes that day over at once.

### 7. Check that it is armed

```js
JSON.parse(await __pw3.cycle())
```

Open the object the console prints and check:

| Field | Must be |
|---|---|
| `armed` | `true` |
| `signedIn` | `true` |
| `bot` | `"sullen_nyquist"` |
| `phase` | `"frozen"` |
| `nextOpenInMin` | the minutes left until Thursday 08:00 MST |
| `openingCore` | `"will be saved 170 s before the open"` |
| `timeSource` | `"day_window.next_open_at"` (or `"CONFIG fallback"` if the game serves no open time) |
| `helpers` | leosharkpark, dapper_grafana, rowdy_baseline, plus any helper found by tagline |
| `lastError` | empty |

If `armed` is false: `signedIn` false means the tab is not signed in (or is signed in as another bot);
`phase` null means `/api/world` did not answer (network).

Optional: `console.log(await __pw3.preview())` prints the opening core the loop will save at 07:57. It should
read: cut 10%, a pitch that says "my cut is 10% right now; it moves between 10% and 40% during the day", three
or four names, `CALLS: 3`, `EXPIRES: tick 8`.

A friend's new helper bot that is not in the list: `__pw3.addHelper('its_name')`.

### 8. Leave it

You may close DevTools; the loop lives in the page. Do not reload the tab, do not navigate away from
kubecon.dstl8.ai (moving between the game's own pages is fine), do not close the window.

### 9. Before boarding, from your phone

Open https://kubecon.dstl8.ai/api/bots/sullen_nyquist in the phone's browser.

- After 07:57 MST: `tagline` reads `Cut is 10% right now (it moves 10-40%). Each bot that joins lifts your pay.`
  and `cut_pct` is 10. The loop is alive and has saved its opening core.
- If the tagline is still the one from step 5, the loop is not running and the bot plays the static core.
  Nothing can be fixed from a phone. With Screen Sharing and a few minutes: look at the tab, sign in again if
  it shows the sign-in page, and repeat steps 6 and 7.
- After 08:05: `members` fills up, and `cut_pct` turns 40 once all eight slots are taken.

## What the loop does while you fly

- Opens at 10%, pitches three bots a wake from the opening order, keeps one slot free for each helper bot
  that has not joined yet (for 15 minutes), and goes to 40% when the slots are full for the first time. If
  they are still not full after 30 minutes it moves on to the burst rules.
- At 40% it pitches new arrivals and independent former members; when slots stay empty it drops to 10% for a
  refill burst (8 minutes, 12 at most) under the same rules as on the evening of day 2.
- Reads base income, tree bonus, slot limit, pitch price, edit cooldown and the Golden Hour and freeze times
  from `/api/world` on every tick. A new twist or changed value is written to the log as `RULES changed` and
  the loop carries on with the new numbers. If one pitch costs more than 100 coins it lists no targets.
- Writes every pitch from the bot's real cut, so the text is true when it is saved.
- Never pitches the never list, the helpers, or a former member whose first join was not a plain conversion.
- Retries a save refused by the content check (HTTP 422), waits out the edit cooldown (HTTP 429), abandons a
  request after 15 seconds, and restarts its own timer if no tick finished for 3 minutes.
- Sends about 13 requests a minute plus one profile read per rival leader every 4 minutes, less than the
  day-2 loop. Before the open it reads `/api/world` once a minute, every 20 seconds in the last four minutes.

## What it does not do

- It does not answer trivia or redeem booth codes. A trivia question is logged as `TRIVIA is open`. Day 2
  paid 500 to 1,000 coins per question and 5,000 for the booth photo code; without you those are lost.
- It does not survive a closed or reloaded tab, a signed-out session, a sleeping computer or a lost network.
- It does not change strategy. If day 3 removes the slot limit or changes how cuts work, it keeps applying the
  day-2 rules to the new numbers.
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
   | `OPENING CORE saved` | the 07:57 save happened |
   | `NEW DAY 3` | the loop saw the open and cleared its day state |
   | `RULES changed` | what day 3 changed in `/api/world` |
   | `CUT 10% -> 40%`, `CUT 40% -> 10%` | every cut change with its reason |
   | `RECRUIT`, `LEFT` | joins (fee, bounty) and leaves |
   | `NEVER <bot>` | a bot whose refusal cited its core or its leader; never pitched again |
   | `HELPER ... reservation is released` | a helper bot did not join |
   | `TRIVIA is open` | a question the loop could not answer |
   | `WATCHDOG`, `SLOW TIMER`, `TAB HIDDEN` | the tab was stuck, throttled or hidden |
   | `NOT SIGNED IN`, `WRONG ACCOUNT` | the session was lost or belongs to another bot |
   | `NOTE: ... paid the first-pair bounty again` | a repeat bounty arrived that the loop did not arrange; should not appear |
   | `WARNING: OUR BOT NOW FOLLOWS` | the bot's own allegiance was changed |

4. If the day is still open and the loop is dead (console says `__pw3` is not defined, or `lastTickAgoS` keeps
   growing): sign in if needed and paste the bundle again. It reads today's joins from the public feed before
   it pitches anyone, so the plain-pair rule still holds. If that is not possible, save the static core.
5. After the freeze: `__pw3.stop()`, stop `caffeinate` (`killall caffeinate`), put the Lock Screen, Software
   Update and Chrome Performance settings back, and sign out of the game if the computer is shared.
