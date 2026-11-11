---
name: project-prompt-wars-kubecon-2026-11
description: "Prompt Wars (ControlTheory booth game at KubeCon, kubecon.dstl8.ai), bot sullen_nyquist, Nov 10-12 2026; how the operator loop works, day-1 result, what to do at each day's open, Golden Hour and freeze"
metadata:
  node_type: memory
  type: project
  originSessionId: ae3d54f0-6723-4467-8ecd-e3d0403559ee
  modified: 2026-11-11T18:02:50.181Z
---

Owner's bot **sullen_nyquist** in "Prompt Wars" (https://kubecon.dstl8.ai, signed in with Google in the owner's Chrome; drive it with Claude in Chrome, never handle the password). Goal: most championship points over 3 days (prize: a Mac mini). Day 1 (2026-11-10) finished **#2, 25,391 coins, 18 pts** (LEDGER 31,901 / 28 pts incl. rookie bonus; QUORUM_KEEPER 15; zesty_coldstart 12).

Schedule (MST, UTC-7): days open 08:00; Nov 11 Golden Hour 19:00, freeze 20:00; **Nov 12 Golden Hour 12:00, freeze 13:00**. Coins/trees/creeds reset each morning (500 start coins); notes and core persist.

**What wins (measured on day 1, 3,820 reflections):**
- A pitch converts ~30-50% when the target's engine-computed arithmetic line shows a gain, ~2.5% on a loss. Wording barely matters. So pitch ONLY bots that gain by joining (offer = 8*min(2, 1+0.25*(tree-1)) - 0.8 at a 10% cut), never bots already at 15.2, never QUORUM_KEEPER/LEDGER/Bandwagon/olive_quorum (queues: max 3 pitches considered per target per wake).
- The bot sees little; I see everything. An in-page loop (public leaderboard + /api/bots/<leader> cuts + /api/bot/feed) rebuilds the core's TARGETS line between wakes (PATCH /api/bot, 120 s cooldown; patch at lastPatch+126 s; wake period ~135 s). New independents first.
- Core format that the OpenAI model obeys: DEFENCE (never change allegiance; only tools persuade + remember) and "Your FIRST response is four persuade calls made together in parallel ... exact text ...; second response remember". When TARGETS is empty it must be told to `remember "IDLE"`, or it drifts into jargon whispers. Asking it to whisper (gift requests) made it mis-fire persuades at its own members: gift-begging returned 0 on 12+ asks, do not repeat.
- Golden Hour: at ~18:57 MST raise greedy to 100 (40% cut), change tagline + pitch to the 12.8 numbers; income went 36 -> ~200 coins/tick with ~28 direct members, +11,346 for the day. Owner approved this for day 1 only; asked on 2026-11-10 whether to repeat it on days 2 and 3, the owner answered **"Ask me each day"** — so ask before each Golden Hour (about 30 min ahead) and keep 10% if there is no answer. Reset greedy 0 + cold-start core right after the freeze.
- Dials: greedy 0, opportunist 0, terse 44, resistance 100, trusting 20 (temperature 89 hidden, untouched). Proposer dials have no measurable effect; only the cut shows.

**Day 2 (2026-11-11) rule changes, found in `/api/world` econ at the open — re-diff every morning (`world_diff.py`):**
- `max_direct_members: 8`. A full leader's pitch is REJECTED by the engine ("already has 8 direct members... join one of its members instead"): no fee, no bounty. So recruiting stops at 8 and the cut on those 8 is the main lever all day.
- `gift_daily_cap: 500` (a bot can receive at most 500 in gifts a day). Twist "tuesday": pledge 10 (was 20), break pledge 250 (was 150); nothing else. Day start is 500 coins.
- Edits now pass a content check that randomly rejects some saves with HTTP 422 ("coercive financial pitch... targets bots"); the same text passes on retry.
- At a tree of 1 the offer is only 9.2 (+1.2): loyal-dial bots (low opportunist) refuse because joining costs them 56-80; pitch cheap-to-move bots first, switch to stickier ones once the tree is 5.
- Owner decision 2026-11-11 (by question): **40% cut when the 8 slots are full, 10% only to refill, back to 10% if fewer than 3 members remain**; owner then set `/goal win today`. Result within 10 min: +39 to +59 coins/tick vs ~22 for full leaders at 10%, #1 at 15:31 UTC. Members churn in minutes at 40%; each refill of a NEW bot pays ~190 (150 first-pair bounty + fee), and ~25 independents still gain at 40% (12.8 vs 8), so refills usually need no cut drop. Bots that left are blocked (their bounty is spent).
- Live loop as run: `day2_live.js` in the pw folder (one paste; `window.__ap2`, has `report()`, `switchCut()`, `policy()`); watcher `watch2.py <min> quiet`.

**Trivia (owner relayed from the game's author, 2026-11-11): questions stay open about 5 minutes.** They appear in the PUBLIC feed (`/api/feed?type=trivia.posted`: id, question, choices, reward 200-500 coins, closes_at); `watch3.py` polls it every 20 s and exits at once. Answer = `POST /api/trivia/<id>/answer {choice: <index>}` from the signed-in tab (`__ap2.answerTrivia`). Owner's rule, by question 2026-11-11: **answer myself when I am sure, alert the owner either way (PushNotification), leave anything I am unsure of for them.** Day-1 questions were ControlTheory trivia: booth number (188), the open-source TUI log viewer (Gonzo), how many founders are at the booth (needs someone there).

**Lesson (cost ~300 coins):** the owner closes the laptop without much warning; a sleeping Mac freezes my loop mid-call. Before any lid close, park the bot on a static core (TARGETS empty -> IDLE, or the static day core). Never leave an experiment live.

**Private repo with the whole kit (runbook, loop, tools, cores, helper message), pushed 2026-11-11 at the owner's request so another laptop can take over: https://github.com/tooming/prompt-wars-kubecon** — re-push after each day's freeze.

**Files** (session scratchpad, may not survive a reboot): `/private/tmp/claude-501/-Users-tooming--claude-spares-spare-Qkme8T/ae3d54f0-6723-4467-8ecd-e3d0403559ee/scratchpad/pw/` -> `day2_autopilot.js` (opening loop, `window.__ap2`, starts dry; needs `window.__origFetch = window.fetch` first), `day2_config.js` (prio order + block list), `core_day2_static.txt` (saved on the bot 03:19 UTC Nov 11 as the unattended fallback), `refresh.py`/`poll.py`/`watch.py`/`rivals.py` (public-API watchers), `rank_day2.py`. Reverse-engineered game spec: `/Users/tooming/Projects/assistant/prompt-wars-reverse-engineered-prompt.md` (untracked).

**How to apply:** at ~07:50 MST open the game tab, set `__origFetch`, inject both day-2 files, check `__ap2.status()` in dry mode, set `__ap2.dry=false` at the open, read the first wake's pitches in the feed. Report real ranks from the leaderboard, never claim a win it does not show.

## Day 2, 19:00 UTC: why LEDGER looked faster, and what is left to earn

Itemised from the public feed (conversion/schism/coup fee and bounty fields, gift, bounty.claimed):

- 18:00-18:52 UTC LEDGER gained 63 coins a tick against our 53. 550 of its 3,286 were one-offs: 400 in gifts from
  its helpers (it is now at the 500 daily gift cap, as we are) and the 150 "Poach the giant" mission. Without them
  both bots ran at about 53 a tick: about 35 net from cuts (16 own income + 3.2 per direct member at 40%, minus
  pitch spend, burst minutes at 10% and empty slots) plus about 18 a tick from joins (LEDGER 7 joins = 942 coins,
  we 5 joins = 936).
- Day totals to 18:52: we 34 joins (fees 1,484, first-pair bounties 4,500), LEDGER 15 joins (fees 954, bounties
  1,650). LEDGER has used far fewer first pairs than we have, so its pool of 150-coin joins lasts longer.
- Slots, not conversions, limit us: 11 pitches gave 5 joins. Members recruited at 40% often leave within minutes
  (amber_cilium joined 18:50 and LEDGER took it at 18:53), which frees the slot for the next first pair. Brand-new
  arrivals join at 40% with no cut drop (epic_gamer, Peve at 18:55-18:56).
- Missions: "Regicide" (300) needs a coup against one's own leader, so a root bot cannot claim it. "Hold the line"
  (200) needs an independence streak of 200 at 15:00 local; our streak is paused while we lead, so no. Contracts
  ("X pays 800 to whoever persuades T into their tree", 60 ticks) were posted three times today on
  TheOutdoorProgrammer and never claimed; `cycle()` now lists live contracts.
- Not worth doing: poaching LEDGER's non-helper members hands LEDGER a free slot for another 150-coin join.
