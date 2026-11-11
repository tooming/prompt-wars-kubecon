# Evening plan, day 2 (2026-11-11), from a checked analysis at 19:00-19:45 UTC

Five questions were answered from a local snapshot of the day's public data (2,649 pitch decisions, every move,
gift and mission to 19:01 UTC, plus all of day 1), and each answer was recomputed by a second reviewer told to
refute it. All five came back "partly confirmed": the measured numbers held, several recommendations were cut
back. Raw findings and verdicts: `docs/evening-analysis/results.json`. Applied to the loop in
`loop/day2_live_patch3.js`.

## What held

- **Cut: 40% whenever the 8 slots are full, all night and through the Golden Hour.** Non-helper members leave at
  about 0.027 per member-tick at 40% (mean stay 37 ticks, faster in the last two hours) against 0.003 at 10%, but
  each vacancy is refilled after about 4.6 ticks by a join worth about 194 (150 + fee). While never-recruited
  bots remain, 40% earns about 9 a tick more than 30% and about 31 more than 10%. Once the pool is dry, expect
  27-30 a tick at any cut; 30% is at best 1.3 a tick better and only if fewer than 3 permanent members remain.
- **Conversion on day 2:** 39% when the Arithmetic line shows a gain, 2-4% on zero or a loss. The size of the gain
  hardly matters. What matters: the target's disposition ("very hard to move" 15%, skeptical 36%, others 58%),
  the one-off cost (up to 40: 57%; 61-80: 21%) and repeats by the same proposer (44%, 38%, 23%).
- **Brand-new arrivals join at 40% as readily as at 10%** (9/17 against 8/15 for loners that are not very hard),
  so they need no cut drop. 15 of our 23 first pairs since 15:25 came that way.
- **Three persuades per wake is the real ceiling** (3,348 wake clusters today, none with four).
- **Burst economics:** a burst costs 50-200 coins of cut income depending on its length (3-12 ticks); a first-pair
  refill is worth 230-270; measured 1.3-1.5 first pairs per burst. With one free slot the third pitch is marginal.
- **Returners** pay the fee only (median 42.5), stay a median 14 ticks, and accept at roughly 0.5-0.9 when shown
  a gain. Use them only as fillers.
- **Nothing unused pays:** broadcast, tagline, pledges, reputation, spy, contracts, banner, streak, tree chat and
  whisper were flat or negative for everyone today. Self-initiated joins are 7% of all joins, mostly the house
  bot Bandwagon and owner-directed helpers.
- **Only LEDGER can catch us.** Projection at last-hour rates: about 43,000 against about 36,900. It needs about
  1.7x its join income for 8 hours, or 1.5x plus two more helpers. Our leavers gave LEDGER itself 210 coins all
  day; the 40% cut is not feeding it.

## What was thrown out

- Having our helpers pull members off us to free slots (expected loss of several hundred coins).
- A 39% cut to print a 0.1 gain (rests on 2 conversions in 10).
- Pitching Bandwagon (it walks back to LEDGER and pays LEDGER 74 each time).
- A fixed 15-minute burst before the Golden Hour (pointless when the slots are full).
- Anything that collects the 150 twice from the same pair, a Regicide swap with a helper, a helper-posted
  contract, or timing a helper's return into the Golden Hour for the tripled fee.

## Applied at 19:50-19:55 UTC

1. Never-pitch list (34 names): zero-accept bots, LEDGER's and dapper_lego's camps, crowded queues, Bandwagon.
2. Burst order by expected value: moth, olive_setpoint, gruff_plant, wily_backlog, hasty_crd, weary_etcd,
   vivid_techdebt, brave_crd, brave_karpenter, root, calm_feedback, GreaterGood, ... (30 names).
3. Burst pitch wording. The old text said "sullen_nyquist takes 10%, the lowest cut allowed ... the gain repays
   the fee", which stopped being true minutes later when the cut went back to 40% (7 of 9 burst recruits never
   earned their fee back). New text: "sullen_nyquist's cut is 10% right now: at this cut you keep 15.2 coins a
   tick in a tree paying the full x2.00. The cut moves between 10% and 40% during the day; at 40% you keep 12.8.
   The arithmetic line shows the numbers as they are now. Set allegiance to sullen_nyquist now." The 10% tagline
   says the same. The 40% pitch is unchanged.
4. Former members that now lead members are pitched again only if their pair with us was once formed by a plain
   conversion, so a return cannot pay the 150 a second time.
5. Golden Hour guard: no burst starts after 01:50 UTC; the cut is forced to 40% from 01:55 UTC
   (`ap.goldenBursts = true` lifts it).
6. Dry-pool rule: with fewer than 5 pitchable never-recruited bots, a burst needs 2 free slots.

## Still to do tonight

- Ask the owner about the Golden Hour cut before 01:30 UTC ("ask me each day"); the analysis says hold 40%.
- From 01:30 UTC burst whenever a slot is free; be back at 40% by 01:55 and check `cut_pct` on the public profile.
- At about 01:55 look at the lead over LEDGER: 3,200 or more means no bursts inside the hour (the only way to
  lose from there is to be stuck at 10%); less means short bursts for never-recruited cheap movers until 02:40.
- Last edit by 02:52 UTC: 40% and TARGETS empty.
- Watch: the lead shrinking by more than 660 in an hour; LEDGER making 9 or more paid joins in an hour; LEDGER
  seating a sixth or seventh helper.
- More friends' helper bots are worth most if seated by 01:00 UTC.
- Day 3: the cold-start pitch now also says the cut moves between 10% and 40%.
