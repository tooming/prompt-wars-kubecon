# Prompt Wars at KubeCon NA 2026: the `sullen_nyquist` kit

Prompt Wars was ControlTheory's booth game at KubeCon North America 2026 (Salt Lake City, November 10 to 12,
https://kubecon.dstl8.ai). Every player wrote one system prompt, and the prompts played each other as bots for
three days: recruiting, refusing and betraying with no human in the loop.

This repository is everything that ran the bot `sullen_nyquist`: the prompts, the operator loop that rewrote them
between the bot's wakes, the tools, the notes written during the event, and what was worked out about the game
afterwards. The game is over; nothing here is running.

| | Finish | Coins | Points |
|---|---|---|---|
| Day 1, Nov 10 | 2nd | 25,391 | 18 |
| Day 2, Nov 11 | **1st** | 47,475 | 25 |
| Day 3, Nov 12 (finale, points tripled) | 7th | 15,328 | 18 |
| Championship | **4th** of 223 player bots | | 61 |

## Start here

- [`docs/retrospective.md`](docs/retrospective.md): the wrap-up. The game in one page, how the kit played it, the
  three days, the finale in numbers, the repeat join bounty, lessons, and a fair-play ledger.
- [`docs/reverse-engineered-game-spec.md`](docs/reverse-engineered-game-spec.md): how the game works, reconstructed
  from the public API, the client and the complete public feed.
- [`docs/day3-notes.md`](docs/day3-notes.md): the finale as it happened, hour by hour.
- [`docs/operator-runbook.md`](docs/operator-runbook.md): how the bot was operated, as this README stood during
  the event.

## What is in the repository

| Path | What |
|---|---|
| `cores/` | The prompts that were on the bot: the day-1 cores, the day-2 fallback and the day-3 static core with its notes. |
| `loop/` | The operator loop. `day2_live.js` and its thirteen patches are what was pasted into the game tab on day 2. `day3_bundle.js` is the single self-starting file that ran day 3 unattended; `day3_bundle_chat.js` is the same with the idle fix. |
| `tools/` | Watchers and analysis scripts used during the event (`watch*.py`, `radar.py`, `world_diff.py`, `rank_day2.py` and others); `tools/day3/` holds the supervisor's watchers for the unattended day. |
| `tools/test/` | Offline tests of the day-3 loop: a fake browser, a fake game server and 87 scenarios, plus a mutation check. |
| `tools/archive.py`, `tools/retro/` | The pull of the complete public record, and the scripts that print every number quoted in the retrospective and the spec. |
| `data/` | Rule snapshots of the three days, the official daily placements, the final championship table and the day-2 target ranking. |
| `state/` | What was saved on the bot and in the loop at 17:46 UTC on day 2, and the loop's log of day 3. |
| `docs/` | Besides the four documents above: the day-2 evening plan and the analysis behind it, the runbook for the unattended day, the session notes, and the trivia fact sheet. |
| `HELPERS.md` | The message sent to friends who set up a supporting bot. |
| `MINI_SESSION_PROMPT.md` | The handoff brief for the session that supervised day 3. |

## Running things

The tests need Node and nothing else (run here with Node 22). They read recorded day-2 snapshots from
`tools/test/fixtures/`.

```bash
node tools/test/day3_bundle.test.js
node tools/test/day3_review_fixes.test.js
node tools/test/mutation_check.js /tmp/pw-mutants
```

The first runs 63 scenarios with 2,088 assertions against `loop/day3_bundle.js`, the second 24 more scenarios, and
the third breaks the loop in 23 ways and checks that the tests notice each one.

The numbers in the two main documents come from the game's public feed. `tools/archive.py` pulls it into
`archive/` (about 430,000 events; git-ignored, because it holds other players' messages) for as long as the game's
site still serves it. With an archive in place:

```bash
python3 tools/retro/daystats.py 3     # per-day counts
python3 tools/retro/finale.py 3       # coin sources, repeat join bounties, the static counterfactual
python3 tools/retro/templates.py      # the decision prompts of the three days compared
python3 tools/test/make_fixtures.py   # rebuilds tools/test/fixtures from the archive
```

`tools/test/make_fixtures.py` says at its top which fixture values are exact and which are stand-ins.

## Licence

MIT, see `LICENSE`.
