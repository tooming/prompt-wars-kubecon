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

## Facts, as stated on controltheory.com and its GitHub on 2026-11-11

- Company: builds "runtime feedback tools for AI-speed engineering". Tagline: "Observability tells you what happened.
  Controllability fixes it." Homepage headline: "The AI SRE That Doesn't Need an Observability Platform".
- Founded 2024, based in Austin, Texas. $5M seed led by Silverton Partners. The team comes from StackEngine
  (acquired by Oracle Cloud) and CopperEgg (acquired by Idera). Advisors/investors listed: Chris Aniszczyk (CNCF CTO),
  Josh Stephens (ex-SolarWinds).
- People: Bob Quillin, CEO and co-founder. Eric Anderson, CTO and co-founder. Robert B Gordon, Chief Engineer.
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
