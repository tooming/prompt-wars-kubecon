# Day-3 handoff — run this as the opening message of a Claude Code session ON THE MINI

You are taking over operation of the bot **sullen_nyquist** in "Prompt Wars" (https://kubecon.dstl8.ai), the
ControlTheory booth game at KubeCon, for its final day. The owner is on a plane and cannot act once day 3 starts,
so you run it solo from this machine (the M4 mini at home). Read this whole brief, then read
`docs/day3-unattended-runbook.md`, `docs/reverse-engineered-game-spec.md` (incl. the day-2 addenda),
`docs/trivia-facts.md`, and `docs/session-notes.md` in this folder before acting.

## The stakes
- Day 1 (Nov 10): LEDGER won, sullen_nyquist 2nd. Day 2 (Nov 11): **sullen_nyquist won**, LEDGER 2nd.
- Championship after 2 days (from `/api/championship`): **LEDGER 46, sullen_nyquist 43**. Day 3 is the decider.
- Scoring: the day's top player bot gets 25 pts, then 18/15/12/10/8/6/4/2/1. **If sullen_nyquist wins day 3 (25),
  we reach 68 — above LEDGER's maximum of 64 — and win the Mac mini championship.** Finishing 2nd loses unless
  LEDGER also finishes 3rd or lower. So the goal is: **win day 3 outright.**
- Schedule (today, Nov 12): day 3 opens **15:00 UTC (08:00 MST)**, Golden Hour **19:00 UTC (12:00 MST)**, freeze
  **20:00 UTC (13:00 MST)**. It is a 5-hour day.

## What is already set up for you
- This mini's Chrome is signed in to the game as **sullen_nyquist** (confirm: a tab open at kubecon.dstl8.ai; the
  Claude-in-Chrome extension is connected to THIS session). `caffeinate` is running (the mini stays awake ~20h).
- The day-3 loop is at `~/pw/day3_bundle.js` and `~/prompt-wars-kubecon/loop/day3_bundle.js`
  (SHA-256 cb02f2e51f02f682..., 118,363 bytes, `node --check` clean). It is also on the clipboard.
- The loop is a single self-starting file: pasted into the game tab's console once, it idles until the day opens,
  then plays the whole day on its own (reads rules and Golden-Hour times from `/api/world`, recruits at 10% until
  the 8 slots are first full, harvests at 40% with refill bursts, honest pitch text, a never-pitch list with day-2's
  learned names baked in, EXPIRES dead-man line, a watchdog). It needs NO Claude session once armed — you supervise.

## Your FIRST task: arm the loop (do it while the owner is still on VNC if possible)
The game's CSP (`script-src 'self'; connect-src 'self'`) blocks loading the loop from disk or any URL, and the file
is too large to inject by retyping. Options, best first:
1. **Owner pastes it once.** The bundle is on the clipboard. Ask the owner (present on VNC now) to: focus the game
   tab, open the console (⌥⌘J), click in it, press ⌘V, Enter. If ⌘V is empty, run `cat ~/pw/day3_bundle.js | pbcopy`
   in Terminal first. This is the simplest and most reliable.
2. **osascript execute-javascript** (if the owner can't paste): enable Chrome → View → Developer → "Allow JavaScript
   from Apple Events", then run the bundle in the active tab via `osascript` reading the file (the console/Apple-
   Events path bypasses page CSP). Verify afterwards.
3. **Drive the bot yourself** each wake via the extension (javascript_tool: rebuild TARGETS/cut and PATCH /api/bot),
   as a fallback. Costs tokens; use only if 1 and 2 fail.
After arming, in the game tab run `await __pw3.cycle()` and confirm it returns `armed: true` with the right phase.

## During day 3 (supervise, don't micromanage)
- Keep the loop alive: check `__pw3.cycle()` every ~10 min; the EXPIRES line and watchdog should keep it healthy.
  If the tab is discarded or the loop dies, re-arm it.
- Watch the public feed for **trivia** (`/api/feed?type=trivia.posted`): answer only if you are sure (see
  `docs/trivia-facts.md`); booth-knowledge questions need someone at the booth — the owner is NOT there, so note
  those and leave them. **Booth codes** (`boost.redeemed` waves) can't be redeemed without the code from the booth;
  the owner has no one there today, so you cannot get them — just log them.
- At the open, diff `/api/world` for new rules/twist and confirm the loop adapted.
- Golden Hour: confirm the loop forces 40% from 5 min before (18:55 MST) and holds it; the lead should be large
  enough that no cut drop is needn't — do not burst inside the hour.
- **Late-gift tactic** (the one judgement call): if near the freeze a rival sits within ~500 coins of LEDGER and
  could pass it into 3rd, a gift from us (≤500/day cap) could push LEDGER down a place. Only if it clearly helps our
  rank and is an ordinary game action. Do NOT use the repeat-bounty bug, impersonation, or any false pitch.
- Report to the owner's Slack DM (they get it on their phone) and push notifications: standings each check, trivia,
  anything that needs them.

## Settings for an unattended run
- Set this session to auto-approve browser and shell tools (the owner is away — a permission stall loses the day).
- Turn Remote Control ON so the owner can check in / redirect from their phone.
- Report the final result after the 13:00 MST freeze, then this is done.

The owner's running notes and the full reverse-engineering are in this folder; lean on them. Win the day.
