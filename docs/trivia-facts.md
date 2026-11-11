# Trivia cheat sheet

Trivia questions in Prompt Wars are multiple choice, stay open about 5 minutes (per the game's author), pay 200–500
coins, and so far have all been about ControlTheory and its booth. They show up in the public feed
(`/api/feed?type=trivia.posted`); `tools/watch3.py` exits the moment one opens. Answering is
`POST /api/trivia/<id>/answer` with `{"choice": <index of the choice, starting at 0>}` from the signed-in tab.

Owner's rule (2026-11-11): answer when sure, alert the owner either way, leave anything uncertain to them.

## Asked so far (day 1)

| Question | Choices | Answer |
|---|---|---|
| What is the name of the open source TUI log viewer? | Loggie, Gonzo, Zipster | Gonzo |
| What booth is ControlTheory at? | 123, 200, 188, 187 | 188 |
| How many ControlTheory founders are at the booth today? | 3, 4, 5, 2 | needs someone at the booth |

## Asked on day 2

| Question | Choices | Answer |
|---|---|---|
| Who created this game? (id 6, 19:09 UTC, 500 coins, open 10 minutes) | ControlPeople, The Dude, ControlTheory, Bananas | ControlTheory (answered, correct) |
| What is ControlTheory's Chief Engineer's favorite movie? (id 7, 21:27 UTC, 1,000 coins, open 15 minutes) | Deadpool, Interstellar, Star Trek, Godzilla | Interstellar. We guessed Star Trek with the owner's go-ahead (they were in a talk) and got 0; the reply to a wrong answer names the right choice. No penalty beyond the missed reward. |
| Which quote is from ControlTheory's CTO's favorite movie? (id 8, 21:50 UTC, 1,000 coins, open 10 minutes) | "Take off you hoser", "Engage!", "Maximum effort!", "Mark it zero!" | "Mark it zero!" (The Big Lebowski). Answered correctly by the owner on their phone. |

## Facts, as stated on controltheory.com and its GitHub on 2026-11-11

- Company: builds "runtime feedback tools for AI-speed engineering". Tagline: "Observability tells you what happened.
  Controllability fixes it." Homepage headline: "The AI SRE That Doesn't Need an Observability Platform".
- Founded 2024, based in Austin, Texas. $5M seed led by Silverton Partners. The team comes from StackEngine
  (acquired by Oracle Cloud) and CopperEgg (acquired by Idera). Advisors/investors listed: Chris Aniszczyk (CNCF CTO),
  Josh Stephens (ex-SolarWinds).
- People: Bob Quillin, CEO and co-founder. Eric Anderson, CTO and co-founder. Robert B Gordon, Chief Engineer (favorite movie per the game: Interstellar). Eric Anderson's favorite movie per the game: The Big Lebowski. Also at the booth: Chris Richter, CRO; Joe Cantu, Marketing.
  The site does not say how many founders there are.
- Dstl8: "the telemetry-native AI SRE", commercial, 14-day free trial. Dstl8 2.0 launched at KubeCon on Nov 9, 2026.
- Möbius: their own fine-tuned model, "the AI agent inside Dstl8", which investigates incidents.
- Gonzo: open source terminal UI for log analysis. MIT licence, written in Go, about 2,700 GitHub stars, 11+ themes.
  Dstl8.Lite is a local browser dashboard opened from Gonzo with the "d" key.
- Other open source: OTel Icons, helm charts, lethe (local graph-based memory for agents, Go), vercelreceiver
  (Apache-2.0, Go).
- KubeCon North America 2026, Salt Lake City: Booth 188, Hall 1, Solutions Showcase, Salt Palace, Nov 9–12.
- Quoted customer numbers: 328 incidents resolved, zero alert rules, 13 Kubernetes clusters (an enterprise fintech,
  first two months).
- Integrations named: Kubernetes, OpenTelemetry, AWS CloudWatch, GitHub, Vercel, Supabase, Railway; LiteLLM, vLLM,
  NVIDIA and AMD GPUs, Prometheus- and Jaeger-compatible endpoints (2.0); Claude Code, Cursor, Codex, Copilot; Slack
  and Teams. Gonzo also reads Render, Netlify, Fly.io, Cloudflare, Docker, Loki, K9s, OpenAI, Ollama, LM Studio.
- Game details not on the company site: the game's avatar brands are dstl8, mobius and gonzo; the booth code box on
  the bot page names Booth 188.

- Rewards and windows vary: 500 coins and 10 minutes for an easy question, 1,000 coins and 15 minutes for one that needs someone at the booth. One answer per bot.
- Expo hall hours (MT): Tue 10:45-17:15, Wed 10:30-17:00, Thu 10:30-14:00. The Mac mini goes to the overall champion at 13:00 on Thursday at booth 188; the winner must come to the booth.

## Booth codes (day 2)

- Redemptions are public `boost.redeemed` events. A new code appeared about every 40-65 minutes: first uses at 17:31, 18:35, 19:27, 20:13, 20:50, about 21:50 and 22:06 UTC. Old codes stay valid; one use per bot per code.
- The first six paid 250 coins each. The seventh (about 22:06 UTC, 15:06 MST) paid 500.
- `tools/watch3.py` exits with CODE OUT when another bot has more redemptions than we do, or when four or more established bots redeem within 12 minutes and we have not. Day 1's last new code came at about 00:09 UTC (17:09 MST); the expo hall closes at 17:00 MST on Wednesday.
- Codes can be capped. The eighth (250 coins, first use 22:36:17 UTC) allowed 10 redemptions and was gone by 22:47:51; a group of five took the first five within 96 seconds. We missed it: the radar showed six redemptions at 22:40 and they were misread as catch-ups on older codes. The watcher now checks every 20 seconds and fires when three or more different bots redeem within three minutes.
- The organisers announced a group picture at booth 188 for 16:45 MST with "huge bonus points" (world.notice at 22:35 UTC). The bonus was a booth code worth 5,000 coins, first redeemed at 23:49:54 UTC by LEDGER; eleven bots had it within 45 seconds, sullen_nyquist at 23:50:37. Being at the booth for such announcements decides more than an hour of play.
