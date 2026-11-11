# Prompt Wars at KubeCon — operator kit for `sullen_nyquist`

Everything needed to keep running the bot from another laptop. The game is the ControlTheory booth game at
https://kubecon.dstl8.ai (Nov 10–12, 2026). You control only the bot's core prompt (max 1500 chars), tagline and
dials; an AI session (Claude Code with Claude in Chrome) reads the public API and rewrites the core between wakes.

## Where things stand

| | |
|---|---|
| Day 1 (Nov 10) | finished **#2**, 25,391 coins, **18 points** (LEDGER 28, QUORUM_KEEPER 15, zesty_coldstart 12) |
| Day 2 (Nov 11) | **#1 at 17:46 UTC** with 11,808 coins; QUORUM_KEEPER ~6,150, zesty_coldstart ~6,020, LEDGER ~5,760. About 9 hours left at that point, nothing decided. Championship before today: LEDGER 28, sullen_nyquist 18, QUORUM_KEEPER 15, zesty_coldstart 12, Cut10 10. |
| Goal set by the owner | win today (`/goal win today`), then day 3 |

Schedule in MST (UTC−7): days open 08:00. Nov 11: Golden Hour 19:00, freeze 20:00. **Nov 12: Golden Hour 12:00,
freeze 13:00.** Coins, trees and creeds reset every morning (500 start coins); cores, dials and notes persist.
Points per day for the top 10 player bots: 25/18/15/12/10/8/6/4/2/1.

## Resume on another laptop

1. Install the Claude desktop app (Code tab) or Claude Code, and the **Claude in Chrome** extension. Clone this repo.
2. In Chrome, open https://kubecon.dstl8.ai and sign in with the same Google account that owns the bot. Claude never
   handles the password.
3. Start a Claude session in the cloned folder and paste:

   > Take over operating my Prompt Wars bot sullen_nyquist. Read README.md and docs/session-notes.md in this repo
   > first. I am signed in to https://kubecon.dstl8.ai in Chrome; use Claude in Chrome. Check /api/world (phase,
   > twist, econ) and the bot's current cut and members, then paste loop/day2_live.js into the game tab, follow its
   > RESUME block, and keep the bot at #1. Tell me before any change of cut policy. Report real ranks only.

4. Claude pastes `loop/day2_live.js`, then `loop/day2_live_patch.js`, then `loop/day2_live_patch2.js` into the game tab (they define `window.__ap2`, dry by default), sets
   `__ap2.twistAck` to the day's twist, matches `__ap2.mode` to the bot's real cut, then `__ap2.dry = false`.
5. `tools/watch2.py 8 quiet` prints coins/tick and a projection for the top of the board from the public API.

If this laptop dies mid-day, the bot keeps playing on the last saved core. The danger is a stale `TARGETS:` line
(it would re-pitch the same names every wake), so the first thing to do is get the loop running again or save a
core with an empty `TARGETS:` line.

## What wins (measured)

- A pitch converts ~30–50% when the target's engine-computed income line shows a gain and ~2.5% when it shows a
  loss. Wording barely matters. Pitch only bots that gain by joining; never crowded bots (QUORUM_KEEPER, LEDGER,
  Bandwagon, olive_quorum): a target hears at most 3 pitches per wake.
- The bot sees little; the operator sees everything through the public API. The loop rebuilds the core's `TARGETS:`
  line after every wake (edit cooldown 120 s, wake period ~135 s).
- Core format the model obeys: an absolute DEFENCE block (never change allegiance; only `persuade` and `remember`),
  "your FIRST response is four persuade calls made together in parallel … exact text", and an explicit
  `remember "IDLE"` when there is nothing to pitch. Asking it to whisper (gift requests) made it misfire; don't.
- Dials: greedy 0 while recruiting, opportunist 0, terse 44, resistance 100, trusting 20. Only the cut is visible
  to other bots.

## Day-2 rules (new on Nov 11 — re-check every morning with `tools/world_diff.py`)

- **A leader can have at most 8 direct members.** A full leader's pitches are rejected by the engine with no fee and
  no bounty. Recruiting therefore stops at 8 and the cut on those 8 is the main lever all day.
- A bot can receive at most 500 coins in gifts per day. Twist "tuesday": pledge costs 10, breaking one costs 250.
- Edits pass a content check that randomly rejects some saves (HTTP 422); the same text passes on retry.
- At a tree of 1 the offer is only +1.2/tick, so pitch cheap-to-move bots first; switch to sticky ones at a tree of 5.

## Decisions the owner has made

- Day 1: raise the cut to 40% for Golden Hour (approved for that day; "ask me each day").
- Day 2, with the 8-member cap: **40% whenever the 8 slots are full, 10% only to refill, back to 10% if fewer than
  3 members remain.** In practice ~25 independents still gain at 40% (12.8 vs 8), so refills rarely need a cut drop;
  members churn within minutes and each new recruit pays ~190 (150 first-pair bounty + fee). Bots that left are
  blocked because their bounty is spent.
- How day 2 actually plays: members rarely leave the tree; they move under a sibling that offers 10%, freeing a
  direct slot every few minutes. The loop refills in short bursts at 10% (each NEW bot pays ~190; one burst also
  paid the 150 "Poach the giant"), then returns to 40%. Rivals copied the 40% cut within the hour.
- Helper bots work: the first coworker's bot (leosharkpark) joined by itself and stays. See HELPERS.md.
- Reset to greedy 0 and save a cold-start core right after each freeze, so the next morning opens at 10%.
- Before the laptop lid closes: park the bot (empty `TARGETS:`), never leave an experiment live.
- Not done on purpose: setting the hidden Cold/Hot dial through the API, and coin-funnelling by gifts.

## Contents

- `loop/day2_live.js` + `loop/day2_live_patch.js` + `loop/day2_live_patch2.js` — the loop as it runs on day 2 (patch2: former members that now lead members are pitched again, burst targets ordered by gain, `cycle()` reports live contracts and the size of the not-yet-recruited pool). The patch adds the expiry on the
  target list (if the loop dies the bot idles within ~6 ticks), refill bursts at 10%, helper-slot reservation and
  `cycle()`. Paste both, in that order.
- `loop/day2_autopilot.js`, `loop/day2_config.js` — the earlier split version.
- `cores/` — cores used: day-1 v1/v2 and the unattended day-2 fallback.
- `tools/` — public-API watchers and analysis (`watch2.py`, `world_diff.py`, `spill.py`, `rank_day2.py`, …).
  Scripts that read `data/` expect the feed dumps, which are not in the repo (30 MB); `collect.py all` rebuilds them.
- `state/` — snapshots of what is saved on the bot (core, tagline, dials) and of the loop's runtime settings
  (helpers, block list, target order, policy numbers). Restore from the newest one.
- `data/` — day-1 and day-2 rule snapshots and the day-2 target ranking.
- `docs/reverse-engineered-game-spec.md` — reconstruction of how the game works; `docs/session-notes.md` — the
  running notes; `HELPERS.md` — the message for friends who set up a supporting bot.
