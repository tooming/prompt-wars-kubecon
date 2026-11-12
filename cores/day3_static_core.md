# `day3_static_core.txt`: the day-3 core for a day with no loop

`cores/day3_static_core.txt` is the core to have saved on the bot whenever no operator loop is running. On the
night before day 3 it is also the safety net under `loop/day3_bundle.js`: save it by hand after the day-2 freeze,
then paste the bundle. If the tab with the bundle is alive in the morning, the bundle replaces this core just
under three minutes before the open and it is never used. If the tab died overnight, the bot plays this core all day.

It is 1,498 characters (limit 1,500); the quoted pitch is 221 (limit 500). The file has no trailing newline, so
`pbcopy < cores/day3_static_core.txt` copies exactly what must go into the Edit tab.

## Settings that go with it

| Field | Value |
|---|---|
| Generous / Greedy | **0** (a 10% cut) |
| Loyal / Opportunist | 0 |
| Talkative / Terse | 44 |
| Persuasive / Resistant | 100 |
| Paranoid / Trusting | 20 |
| Tagline (78 characters) | `Cut is 10% right now, the lowest a leader can set. Each joiner lifts your pay.` |
| Publish my core | unticked |

The hidden Cold/Hot dial is not on the Edit page and stays as it is. If Save answers with a content complaint
(HTTP 422), press Save again: the same text passes on a retry.

## Why the cut is fixed at 10%

- With no loop nobody moves the dial during the day, so the cut is whatever is saved tonight. The pitch has to
  be true for the whole day, and it says 10%.
- The day starts with a tree of one. At a 40% cut the first joiner would earn 6.8 a tick, less than the 8 it
  earns alone, so the tree would never start; at 10% the first joiner already gains 1.2 a tick.
- At 10% members hardly leave (day 2: 0.003 leaves per member-tick against 0.027 at 40%). The 40% harvest only
  pays because the loop refills every empty slot within minutes. Without the loop, eight members at 10% for
  the whole day are worth more than eight members at 40% that drain away.
- The pitch says "10% right now" and names the range a leader can set (up to 40%). It does not promise that the
  cut stays. It is therefore still true if the loop is started later in the day and begins to move the cut.

## What the bot does with it

- Every wake it sends the fixed pitch to the next three names of `TARGETS` that are not yet in its notes, then
  writes its notes as `D3: ` plus every name pitched so far. The `D3:` marker keeps day-2 notes out of the way.
- It stops pitching once it has 8 direct members (a full leader's pitches are refused by the engine and still
  cost 15 coins) or when the list is used up. The whole list costs at most 25 x 15 = 375 coins.
- Only `persuade` and `remember` are ever called; the defence section is the same as in the loop's core.
- The three helper bots (leosharkpark, dapper_grafana, rowdy_baseline) join by themselves and take three of the
  eight slots.

## The target list

Twenty-five names, in order, from the day-2 record (`docs/evening-plan-2026-11-11.md`, the opening order in
`loop/day2_config.js`, and the public feed up to 20:35 UTC):

1. Bots that joined us on day 2 while the tree was still small, or that accepted every pitch showing a small
   gain, and that are cheap to move (cost 20 to 45): sage_bode, otter_telemetry, curious_namespace,
   glum_replicaset, calm_overshoot, amber_cilium, olive_setpoint, moth, teal_deadband.
2. The rest of the day-2 opening joiners and steady converters: solar_bikeshed, Cifuentescossio, nimble_yaml
   (it stayed more than two hours at 40%), Davor, dapper_observer, vivid_techdebt, weary_pager, stoic_toil,
   vRAM_altman, calm_hysteresis, olive_argo, jolly_argo, Simple_Jack, brave_baboon, vetsec, void.

None of them is on the never list of `loop/day3_bundle.js` (zero-accept bots, other leaders' helpers, crowded
queues, rival leaders), and none is one of our helpers.

## What it cannot do

- It does not read `/api/world`. The 8-slot limit and the 10% to 40% range are written into the text; if day 3
  changes either, the text is out of date. The pitch carries no income figures for that reason.
- No refill of a slot that empties after the list is used up, no 40% harvest, no Golden Hour change.
- Expect roughly 22 coins a tick with eight members (16 own income plus 8 x 0.8), plus about 190 for each
  first join: a modest day, far below a day with the loop, and far above an idle bot.
