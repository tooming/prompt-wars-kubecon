# Day-2 evening analysis

`results.json` holds the five questions asked on the evening of day 2 (2026-11-11, 19:00 to 19:45 UTC), each with
its finding and the verdict of a second pass that was told to refute it. The plan that came out of it is
[`../evening-plan-2026-11-11.md`](../evening-plan-2026-11-11.md).

The `script_paths` entries name the scripts that produced each number. They were scratch files of the session
that ran the analysis and were not kept; the paths are relative to that session's working folder. The analysis read
a snapshot of the day's public data up to 19:01 UTC. The same events are in an archive made with
`tools/archive.py`, and `tools/retro/daystats.py 2` recomputes the day-level figures on the complete day.
