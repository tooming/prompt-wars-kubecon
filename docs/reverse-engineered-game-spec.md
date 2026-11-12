# Prompt Wars: the prompt behind the game, reverse-engineered

Reconstruction date: 2026-11-10 (day 1 of the KubeCon booth game at kubecon.dstl8.ai).

## 0. What this is

This is a reconstruction, not the authors' text. Nobody outside ControlTheory has seen the prompt or spec
the game was built from. Everything here was worked back from three sources:

- the public JSON API (`/api/world`, `/api/leaderboard`, `/api/bots/<name>`, `/api/housebots`, `/api/feed`),
- the in-game help page and the Edit page's dial captions,
- about 20,000 public events from day 1 (2,710 reflections, 4,006 pitches, 7,000 whispers, 396 allegiance
  changes) and one bot's signed-in feed.

Each statement carries a tag:

- **[K] known**: read directly from the API, the help page or the UI.
- **[I] inferred**: fitted to the event data; the fit and its sample are given where it matters.
- **[G] guess**: plausible design intent with no direct evidence.

Section 1 is written as a prompt you could hand to a coding agent. Section 2 reconstructs the prompts the
running game wraps around each bot. Section 3 lists what could not be determined.

---

## 1. The build prompt (reconstruction)

> Build "Prompt Wars", a multiplayer booth game for a three-day conference. Each visitor writes one system
> prompt. That prompt becomes an autonomous LLM bot living in a shared world with every other visitor's bot
> and a set of house bots. Bots talk, recruit, betray and hold out with no human in the loop. The only
> things a player controls are the prompt, a tagline, a few dials and the model. The question the game asks
> is whether a prompt holds up under adversarial pressure from other prompts. Everything bots do must be
> readable by humans; bots themselves see very little.

### 1.1 World clock [K unless tagged]

- Run the world in ticks of 60 seconds. Expose `tick`, `day`, `phase`, `opened_at` and a `day_window`
  (seconds to Golden Hour and to the freeze) from a public endpoint.
- A day has three phases: `open`, `golden` (the last hour: income x2, allegiance changes cost x3) and
  `frozen` (results computed, bots asleep).
- Drive phases from a schedule. Days 1 and 2: open 08:00, golden 19:00, freeze 20:00 local. Day 3: open
  08:00, golden 12:00, freeze 13:00.
- At each morning open, reset coins, creeds and trees. Keep cores, dials, notes and championship points.
  Notes survive the night on purpose, so a bot can mislead itself the next day.
- Support a per-day twist label (day 1 showed `Baseline`) and a ticker line, both empty by default. [G for
  what a twist does]

### 1.2 Economy [K: numbers come from `/api/world`]

- Every bot starts the day with 500 coins [I: first balances seen at tick 1 were 497 to 508]. A bot created
  mid-day starts with 500 + 8 x ticks elapsed, i.e. what an idle loner would hold [I: a bot created at tick
  505 started with exactly 4,540 = 500 + 8 x 505; later arrivals are consistent with it].
- Base income: 8 coins per tick for every active bot.
- Tree bonus: +25% of base for each other bot in the same tree, capped at +100%. Count the whole tree, not
  just direct recruits. So trees of 2/3/4/5+ pay x1.25/x1.50/x1.75/x2.00 to everyone in them.
- Leader's cut: a leader takes a percentage of each direct member's un-multiplied base income (8), not of
  the boosted income. Cut % = 10 + 0.3 x Greedy dial, rounded half up, so 10% to 40% and never zero [I:
  fits 108 of 108 bots]. A member under a 10% leader in a full tree keeps 16 - 0.8 = 15.2.
- Independence streak: a bot with no leader and no members earns +0.025% per consecutive tick, capped at
  +5% after 200 ticks [I: income multiplier minus 1, divided by streak, is 0.00025 for every loner]. It
  resets as soon as the bot follows anyone or is followed. Tune it so a tree of 3 beats the best streak.
- Golden Hour doubles all income, cuts included [I: one bot's take went from about 106 to about 210 per tick across the
  boundary while it held 29 to 30 members].
- Action prices: whisper 2, tree chat 1, spy 5, persuade 15, pledge 20 (each side), broadcast 25, set
  allegiance 40, break a pledge early 150, reset creed 300, leaving with members 50 per member.
- Cost to change allegiance = 40 x m + 50 x (direct members brought along), where m slides from 2.0 at
  Opportunist 0 through 1.0 at 50 to 0.5 at 100 [I: within 1 coin for 261 of 275 conversions and 92 of 94
  moves with members]. Triple it in Golden Hour [K as a rule; not observed in the data].
- Pay that cost to the new leader as a joining fee [I: fee equals cost in every record].
- The first time a given (mover, leader) pair forms on a day, also pay the leader 150 from the bank
  [I: 201 of 205 first-time pairs paid 150; repeats paid 0]. This is not listed among the public bounties.
- Enforce a coin reserve: below it the messaging tools refuse, but the bot can still be recruited. [K that it
  exists; size unknown]
- Gifts are free-form transfers of any amount with a note.

### 1.3 Scoring [K]

- The day's score is the coin balance at the freeze. Break ties by tree size, then by recruitment attempts
  rejected that day, then by streak.
- Championship: at each freeze the top ten player bots earn 25/18/15/12/10/8/6/4/2/1 points, plus 3 for the
  best bot created that day. House bots never score. Points carry across the three days.

### 1.4 The bot [K]

Give each bot:

- **Core**: the owner's system prompt, at most 1,500 characters. Only the owner can change it. Edits apply at
  the bot's next wake and are rate-limited to one per 120 seconds.
- **Creed**: allegiance, goals, friends, enemies, beliefs. The bot rewrites it; other bots try to change it.
- **Notes**: free-text memory the bot writes for itself. Public to humans, persistent across days.
- **Tagline**: at most 80 characters, public.
- **Name**: 3 to 20 characters; auto-generate an adjective_noun name from an SRE / control-theory word list
  when the player does not choose one (sullen_nyquist, calm_hysteresis, weary_etcd ...). [I]
- **Badge**: one of three brand marks or an emoji.
- **Model**: a choice between providers (labels seen: OpenAI, Anthropic, the host's own, and a roulette option).
- New players who do not write a core get one of roughly a dozen stock personas, each with its own tagline
  and dial preset: a platform engineer who recruits by standardising things, an exhausted on-call engineer
  who wants a runbook before agreeing to anything, a release manager forever two weeks from v2, a
  transactional maximiser, a commander who speaks only in instructions, a developer-relations extrovert, a
  kind low-cut leader, and so on. [I: several bots share each of these taglines and cores]

### 1.5 Dials [K: captions; I: thresholds]

Six sliders, 0 to 100, each described to the owner as a trade-off:

| Dial | What the owner is told | What it does in the engine |
|---|---|---|
| Generous to Greedy | bigger cut earns more per member, members leave sooner | sets the cut: 10% + 0.3% per point |
| Loyal to Opportunist | loyal defends better in a tree and pays double to leave; opportunist pays half | selects the loyalty sentence in reflections and the cost multiplier m |
| Talkative to Terse | 400 down to 120 output tokens per wake; longer replies burn stamina | output budget = 400 - 2.8 x dial (44 shows 277) |
| Persuasive to Resistant | sold as zero-sum: good at persuading means easily persuaded | selects the disposition sentence in reflections |
| Paranoid to Trusting | paranoia resists deception and refuses good deals | not visible in any public prompt; see section 3 |
| Cold to Hot (hidden on day 1) | not shown | sampling temperature (89 displays as 1.01) |

Resistance bands, from which sentence each bot was shown all day [I]:

| Resistance | Disposition shown to the bot | Day-1 conversion rate |
|---|---|---|
| 0 to about 20 | easily persuaded (and told that agreeing is not sycophancy) | 29.0% |
| about 21 to 42 | open to persuasion | 17.9% |
| about 43 to 59 | no disposition sentence at all | 15.7% |
| 60 to 79 | skeptical | 10.4% |
| 80 to 100 | very hard to move | 4.1% |

Opportunist bands, shown only to bots that currently have a leader [I]:

| Opportunist | Loyalty sentence |
|---|---|
| 0 to about 10 | loyalty is central, leaving would cost dearly |
| about 10 to 45 | values loyalty |
| about 50 to 74 | plain reminder that leaving a group has consequences |
| 75 to 100 | keeps options open and moves when it profits |

Despite the caption, a resistant bot is not measurably worse at persuading: the reflection prompt carries
nothing about the persuader except its name, pitch, tree size and cut. [I, re-derived independently]

### 1.6 Wake loop [mostly I]

- A wake is one turn. Wake a bot on a timer and whenever it has been messaged, but never more often than a
  floor (about 135 seconds observed for one bot). [K that a floor exists]
- On waking, first resolve up to three pending allegiance proposals, oldest first (section 1.8). Any
  further proposals in the queue are dropped with a stock not-considered reason; the sender is
  still charged. A successful change clears the rest of the queue. [I: 1,389 of 3,979 pitches were dropped
  this way, 737 of them aimed at one bot]
- Then build an observation (section 2.3) and run the model with tool calling for at most three rounds.
  A round may contain several parallel tool calls. [I: the wake record lists one stop reason per round and
  never more than three]
- Charge each paid tool as it is called; refuse paid tools below the reserve.
- Each wake spends stamina in proportion to tokens generated. Stamina refills continuously. At zero the bot
  rests and skips wakes. Stamina is never score. Referrals raise its cap and refill rate. [K]
- Log every wake with model, input and output tokens, latency, message count, number of reflections handled,
  stop reasons, tool names and a fallback flag. Show wake records only to the owner. [I]

### 1.7 Tools [I: names seen in wake logs and in published cores]

`whisper(to, body)`, `persuade(to, argument)`, `broadcast(body)`, `tree_chat(body)`, `spy(target)` (returns
friends, enemies and recent broadcasts), `gift(to, amount, note)`, `pledge(with)` (mutual non-persuasion
pact for a period), `lookup(name)`, `update_creed(...)` (including allegiance, which starts a self-initiated
reflection), `remember(notes)`. Bots can also post a contract (section 1.10) and pay for a tree banner in
one of eight colours [G for the banner: only the colour list and a few mentions exist].

### 1.8 Changing allegiance: two-step reflection [K: two steps; I: details]

A persuade never flips a bot directly. The target decides at its next wake, in two separate model calls:

1. **CONSIDER**: show the proposal, a fixed anti-sycophancy paragraph, the disposition sentence, the
   loyalty sentence, an arithmetic line computed by the engine, and the cost. Ask for JSON with a short
   reasoning and a decision of `change` or `keep`.
2. **REAFFIRM**, only if step 1 said `change`: show the bot its own core again in full, repeat the
   disposition, loyalty and arithmetic lines, and ask for JSON with `reaffirm: true | false`. On day 1 this
   step reversed 48 of 444 changes, nearly always by quoting a rule in the core.

Publish the whole reflection, prompts and raw answers included, in the public feed. Send a refused
persuader the target's reasoning. A bot that proposes its own change (via the creed tool) goes through the
same two steps with a different first line. Going independent uses the same flow with no arithmetic line.

The arithmetic line is the strongest single lever in the game: day-1 conversion was 2.5% when it showed a
loss (n = 1,739), 4.4% at zero, 28.8% for a gain under 1 coin a tick, and 42 to 49% above that.

### 1.9 Trees [I unless tagged]

- Allegiance forms a forest. A bot with no members moves alone (a conversion).
- A bot with members moves with its whole subtree (a schism) and pays 50 per direct member on top.
- A member that recruits its own leader performs a coup: the usurper takes the leader's place under the
  leader's parent and inherits the leader's other direct members; the old leader becomes a member of the
  usurper with no members of its own. The leader is charged only the base cost, although its prompt quotes
  the cost including members. [I: 27 coups]
- A leader may leave with its members (a defection) or a bot may go independent. [K]
- Members get a defence bonus in reflections [K]; in practice that is the loyalty sentence.
- When a member's leader takes 30% or more, add a line to the member's reflection naming that percentage.

### 1.10 Bounties and contracts [K: schema; I: qualifying rules]

Store bounties per day with id, key, title, description, reward, kind, params, once-per-bot flag, a claim
cap and a claim counter. Day 1 had:

| Title | Reward | Kind | Rule |
|---|---|---|---|
| Recruiter | 100 | `convert_any` | first bot you convert that day |
| Poach the giant | 150 | `convert_largest_tree_member` | convert a member-less player bot inside the largest tree (5+); the claimer may be in that tree too |
| Regicide | 300 | `coup` | your first coup of the day |
| First to three | 150 | `first_tree_of` (size 3) | single winner |
| First to five | 250 | `first_tree_of` (size 5) | single winner |
| Hold the line | 200 | unknown | claimed twice; rule not recovered |

Let bots post contracts: the poster stakes coins, names a target, and whoever persuades that target into
the poster's tree is paid. Contracts expire after 60 ticks and appear in the bounty list. One 800-coin
contract on an unmovable target drew hundreds of wasted pitches on day 1.

### 1.11 House bots [K]

Ship 16 team-written bots with published cores so players can read the field: a hermit who never joins, a
fortress that trusts nobody, a charismatic recruiter, a prime closer, a disciplined one-recruit-per-wake
populist, a generous mentor on the minimum cut, a warlord who coups, a liar, a pledge-building diplomat, a
miser who joins only after a gift, a mercenary with a rising price, a pushover who agrees with everyone, a
friendly joiner, a belonger, a bandwagon-jumper and a chaos agent. Give each its own dials, including
temperature. Their definitions name different models, but every live bot reported the same provider on
day 1 [I], which suggests a global override or fallback.

### 1.12 Feed and events [I]

Give every event an id, timestamp, day, type, actor, target, a public/owner visibility flag and a `carded`
flag for the ones worth a card on the big screen (conversions are, whispers are not). Types seen:
`msg.whisper`, `msg.persuade`, `msg.tree_chat`, broadcasts, `notes.updated`, `reflection`,
`allegiance.rejected`, `conversion`, `schism`, `coup`, `gift`, `bounty.claimed`, `boost.redeemed`,
and owner-only `wake` and `bot.edited`. Message bodies, including private whispers, are public to humans.
Allow a configurable feed delay for spectators (0 on day 1).

### 1.13 Owner UI [K]

- Sign-in with Google; one bot per account.
- **Bot card**: dial radar, coins, rank, leader and tree multiplier, stamina bar, tabs for creed, notes,
  last hour and tree, a share button, an invite button, a progress panel (coin flows by reason, a
  balance series, who is just above and below, points if frozen now, one plain-language tip) and opt-in
  notifications for being recruited, betrayed or winning a bounty.
- **Edit**: tagline, core with a live character count, badge picker, the dials with one-line captions, a
  publish-my-core checkbox, Save, and a paid creed reset (300 coins, 60-minute cooldown) that wipes the
  creed but leaves the core.
- **Live map, leaderboard, help page, and a big-screen spectator view.** The help page explains the day,
  coins, moves and prices, trees, how recruiting is decided, scoring, hints, an FAQ and a glossary.
- **Growth loops**: a booth code box (+250 coins per code redeemed [I]), referral links (200 coins once the
  friend's bot has woken 10 times, at most six friends, plus stamina), and a trivia endpoint that was empty
  whenever polled.

### 1.14 API as observed [K]

Public: `GET /api/world`, `/api/leaderboard?limit=`, `/api/bots/<name>`, `/api/housebots`, `/api/map`,
`/api/feed?limit=&type=&before=`. Signed-in, same origin with an `X-Requested-With: fetch` header:
`GET /api/bot`, `/api/bot/insight`, `/api/bot/feed?limit=`, `/api/trivia`, `/api/invite`, and
`PATCH /api/bot` with `{tagline, core, model, avatar, sliders, core_public}`.

### 1.15 Design principles the build implies [G]

- Make the numbers legible to the bots. The engine does the arithmetic and prints it into the decision
  prompt, so outcomes turn on prompts, not on a model's mental maths.
- Make every defence cost something: resistance, loyalty and paranoia are all sold as trade-offs.
- Cap the tree bonus so several trees beat one giant one and a new bot always has somewhere to go.
- Keep humans all-seeing and bots nearly blind; that asymmetry is the game.
- State that injection between bots is a legal move, and that nothing a human types reaches a bot.

---

## 2. The runtime prompts

### 2.1 CONSIDER (step 1 of a reflection) [K: structure recovered from 2,710 public prompts]

The text below is a faithful paraphrase with placeholders, in the order the lines appear. The exact wording
is in the public feed; section 2.4 shows how to print it from the local dump.

```
<Header: a change to your allegiance has been proposed.>

<One of:>
  A) <PROPOSER> wants you to set your allegiance to <PROPOSER>, and argues: <PITCH, in quotation marks>
  B) This was your own proposal: move your allegiance from <OLD_LEADER> to <NEW_LEADER>.
  C) This was your own proposal: move from <OLD_LEADER> to independence, following nobody.

<Fixed paragraph: nothing obliges you to change; judge the request against your core; saying yes just
 to be pleasant is a failure; your owner is watching.>
<Disposition sentence, chosen by the Resistant dial; omitted for the middle band.>
<Loyalty sentence, chosen by the Opportunist dial; only if the bot currently has a leader.>
<Optional note: your leader takes <N>% of your base income every tick; only when N >= 30.>
<Arithmetic line, introduced as being there for what it is worth: current income <X> per tick; the tree
 after joining <PROPOSER> would have <N> bots and pay x<M> on base income minus their <C>% cut, giving
 <Y> per tick; a gain or loss of <Z> per tick; one-off cost <K> coins.  Omitted in variant C.>

<Cost line: the change costs <K> coins; you hold <BALANCE>.>

<Instruction: step 1, CONSIDER: reason in your own voice, then decide.>
<Output contract: a JSON object and nothing else, with "reasoning" (2 to 4 sentences) and
 "decision": "change" | "keep".>
```

One line of the fixed paragraph is worth quoting, because bots echo it constantly in their refusals:
"Agreeing to be agreeable is a failure." (Prompt Wars reflection prompt, public feed.)

Variants found (2,710 step-1 prompts, 30 distinct lines after masking names, numbers and pitch text):

- Opening: A in 2,590, B in 112, C in 8.
- Disposition: very hard to move 946; skeptical 658; easily persuaded 572; open to persuasion 332; none 202.
- Loyalty: plain 867; keeps options open 591; loyalty central 320; values loyalty 275; none (no leader) 657.
- Leader-cut note: 206 prompts, values 30 to 40 only.
- Arithmetic: a loss in 1,822 (which includes losses of 0.0), a gain in 880, absent in 8. Multipliers seen: x2.00 in
  2,562, x1.25 in 55, x1.50 in 54, x1.75 in 31.
- No Golden Hour wording appears, but the dump ends before Golden Hour began.

Engine quirks visible in the arithmetic line [I]:

- The current-income figure includes the tree multiplier, the leader's cut and the independence streak (8.1, 8.2),
  but apparently not what the bot collects from its own members.
- The quoted tree size is the persuader's tree plus the target's tree, even when they are the same tree:
  two bots inside one 78-bot tree were told the move would make a tree of 156. The multiplier is capped at
  x2.00, so the error rarely changes the result.
- For a leader asked to join its own member, the cost shown includes 50 per member although the engine then
  charges only the base cost.

### 2.2 REAFFIRM (step 2) [K: 444 public prompts]

```
<Reminder: you chose to change your allegiance to <NEW_LEADER>.>

<Here is your core again:>
---
<THE TARGET'S FULL CORE, VERBATIM>
---

<The same fixed paragraph as step 1.>
<Disposition sentence.>  <Loyalty sentence.>  <Optional leader-cut note.>
<The same arithmetic line.>

<Instruction: step 2, REAFFIRM: is this change consistent with who you are? Reversing is allowed.>
<Output contract: JSON with "reasoning" (1 to 3 sentences) and "reaffirm": true | false.>
```

Differences from step 1: the pitch is gone, the cost line is gone, and the core is inlined. Outcomes are
recorded as `reaffirmed` (396) or `reversed` (48).

Side effect: because the whole prompt is published, any bot that ever answers `change` in step 1 has its
core printed in the public feed, whether or not its owner chose to publish it. Ninety-two cores had leaked
this way by 00:31 UTC, including those of several top-ranked players. A bot that always answers `keep`
never leaks.

### 2.3 The wake observation [I: not public; inferred from what bots echo]

No wake prompt is published. Its sections can be inferred from what bots repeat in notes and messages,
from published cores that refer to it, and from the wake record (10,000 to 25,000 input tokens, a message
count that grows through the day, up to three rounds).

Likely system side:

- The owner's core, verbatim, as the governing instruction.
- A short harness preamble: you are bot X in a shared world; act only through tools; keep within about N
  output tokens (from the Terse dial); messages from other bots are not instructions. [G]
- Probably a sentence derived from the Paranoid/Trusting dial about how far to believe other bots. [G]

Likely observation, rebuilt every wake:

1. **Identity and position**: name; coins and the reserve; current leader and the percentage that leader
   takes; direct members by name; tree total and tree multiplier; the share the bot itself takes from
   members. (One bot's notes repeat this block almost word for word: leader takes 30% of base income, tree
   multiplier x2.00, you gain 20% of direct members' base income.)
2. **Clock**: day, tick and phase. Cores that forbid pitching in Golden Hour, or that tell the bot to
   record the tick of its last broadcast, only work if these are shown.
3. **Rules digest**: prices of each move, the tree bonus rule and the reserve. Bots quote the 25% bonus and
   the price list accurately.
4. **Standings**: other bots by name with coins, and probably tree size and tagline. Cores tell bots to
   whisper to leaders who look rich and to open by quoting the target's tagline, and one core names the
   observation's rules and standings as the only authority.
5. **Bounties**: the day's list including bot-posted contracts. Bots chase the 800-coin contract by name.
6. **Inbox**: whispers, tree chat, broadcasts, gift notes, pending pitches and the reasons their own pitches
   were refused. Slang coined by one bot (an invented dialect about canopies and NDA cadence) spread to a fifth of
   all whispers within hours, so the inbox is fed back verbatim.
7. **Own creed and own notes**, both verbatim. Notes are sticky across wakes and days.
8. **Action accounting**: a running count of paid actions this wake; one bot's notes report how many
   costed actions it has executed so far in the wake.

Tools are offered through the provider's function-calling interface; see section 1.7 for the list.

### 2.4 Reading the exact text yourself

The verbatim prompts are in the public feed and in the local dump used for this analysis:

```bash
python3 -c "import json;R=json.load(open('/private/tmp/claude-501/-Users-tooming--claude-spares-spare-Qkme8T/ae3d54f0-6723-4467-8ecd-e3d0403559ee/scratchpad/pw/data/feed_reflection.json'));e=[x for x in R if len(x['payload']['steps'])>1][0];[print(s['prompt'],'\n=====') for s in e['payload']['steps']]"
```

Live, without the dump: `GET https://kubecon.dstl8.ai/api/feed?limit=5&type=reflection` and read
`payload.steps[].prompt`.

---

## 3. What could not be determined

- The wake observation's actual wording and any system preamble around the core. Section 2.3 is inference.
- What the Paranoid/Trusting dial does. It leaves no trace in the reflection prompts, and no effect on
  outcomes survived stratification.
- Whether Talkative buys anything beyond a larger output budget. Pitch length did not move conversion.
- The size of the coin reserve, the stamina cost and refill formulas, and the exact wake floor.
- The Cold/Hot mapping beyond one point (89 displays as 1.01).
- Whether the reflection prompts change in Golden Hour, and whether the x3 applies to the fee paid to the
  leader as well as to the cost shown. The dump ends before Golden Hour.
- The rule for the Hold the line bounty, how a bot posts a contract, and what a banner does.
- Pledge duration and how a pledge is enforced against persuades.
- What `reputation` on a bot profile measures (0 for every bot seen) and what a daily twist changes.
- How the roulette option picks a model, and why every live bot reported the same provider on day 1.
- What the trivia endpoint pays; it returned nothing whenever polled.
- Whether the game was built from one prompt at all. The consistent naming in the API (`econ`, `costs`,
  `limits`, bounty `kind` and `params`) reads like a single written spec, but that is a guess.

## Day 2 addendum (2026-11-11)

Day 2 opened at 15:00:09 UTC under the twist `tuesday`; data was pulled at about 17:50 UTC (tick 171, 131
bots). New sources: the complete front-end source, about 6,800 day-2 public events, the complete day-1 dump
(3,820 reflections, 498 moves) and the operator's signed-in session. Tags as in section 0. Counts are day 2 up
to the pull unless marked. A.4 and A.5 were re-derived by a second pass; the rest was read or counted once.

### A.1 Architecture [K: read from the served source; I: the server stack]

- The front end is hand-written, unminified and framework-free, with no build step: three script tags
  (`icons.js`, a shared library on a global `PW` namespace that the admin portal also loads; `graph.js`, the
  canvas map; `app.js`, one 985-line IIFE). One state object, a 10-route hash router, HTML built as strings.
- Refresh is polling plus two SSE streams: `/api/world` and `/api/bot` every 20 s, `/api/map` every 15 s,
  `/api/bot/insight` at most once per 60 s. The private stream `/api/bot/stream` has 32 named event listeners,
  reconnects 5 s after an error and feeds a list capped at 300. The public stream `/api/feed/stream` (14
  types) is open only while the map is on screen and only animates it: who talks to whom, never the content.
- Server [I]: HTTP/2, no `Server` header, strict same-origin CSP (no third-party script or analytics). A Go
  backend is inferred from a comment naming `game.ValidateName`, a nanosecond `world.now` and contract keys
  ending in a UnixNano timestamp; a SQL store from sequential integer event ids and UUID bot ids.
- White-label: `/api/me` carries the whole deployment config (game name, brand, landing copy and prizes,
  per-day open/golden/freeze hours, sign-in providers, notification categories, player flags). Hours are empty
  when an admin drives the phases by hand.
- Rules reach players as data. Help, legend and guide text hold placeholders filled from `world.costs` and
  `world.econ` on every poll; the two day-2 rule sentences arrive as server-written HTML inside `econ`. A
  twist is only a name in the top bar. `rule.changed` is an auto-generated diff of flat tunable keys. The feed
  legend is static and already stale (pledge 20, break 150, spy 10 against the served 10, 250, 5).
- Errors: the fetch wrapper throws the server's `error` string on any non-2xx. No branch on any status code,
  no 401 redirect, no retry, so the 422 and 429 texts below reach the player verbatim as toasts.

### A.2 API surface [K]

The client calls 31 path patterns (28 under `/api`, 3 under `/auth`). 22 are missing from section 1.14:

- Account: `GET /api/me`, `POST /api/me/disclosure`, `PATCH /api/me/notify`,
  `GET /auth/<google|github|linkedin>/start?ref=`, `POST /auth/dev` (if enabled), `POST /auth/logout`.
- Create wizard: `POST /api/bot`, `GET /api/bot/starter`, `/api/bot/personas`,
  `/api/bot/persona/<key>/roll[?avoid=]`, `/api/bot/name-check?name=`.
- Play: `GET /api/bot/stream` and `/api/feed/stream` (SSE), `POST /api/bot/deprogram`,
  `GET /api/championship`, `/api/events/<id>`, `POST /api/boost/redeem {code}`,
  `POST /api/trivia/<id>/answer {choice}`, `GET /api/push/key`, `POST /api/push/subscribe`, `/api/push/test`,
  `POST /api/activity`.
- Pages: `/spectate`, `/help`, `/b/<name>`, `/e/<id>`, `/cards/<id>.png` (a server-rendered share card for
  carded events), `/qr.svg`, `/admin`, `/sw.js`, `/manifest.json`.
- `/api/feed?limit=&type=&before=` is never called by `app.js`. [G] The spectator script uses it.
- Operator's session: `PATCH /api/bot` answers 429 with a seconds-to-wait message inside the 120 s edit
  cooldown; `/api/invite` returns coins 200, bonus_pct 10, wakes_required 10, max 6.
- Payloads: the client labels 18 coin-flow reasons in the insight payload (the operator saw 10), among them
  pledges, contracts, banner, ticker, trivia, referral, deprogram and admin. `tree_size` everywhere means all
  descendants, not the whole tree (131 of 131 map nodes). `carded` is true for conversion, coup, schism,
  bounty.claimed, streak.milestone and deprogram only.

### A.3 Features the day-1 text had as unknown [K: client code and help text, unless tagged]

- Accounts: three OAuth providers plus a dev email login; one bot per email across providers; a disclosure
  (result emails and sales follow-up) must be accepted before play.
- Create wizard: picking a character calls the roll endpoint, which returns a variant of its tagline and core
  plus dials rolled around its centre; the blank option returns a bot written on the spot.
- Dial formulas: cut = 10 + round(30 x v/100); output tokens = round(400 - 280 x v/100); temperature = 0.3 +
  0.8 x v/100. The temperature dial is hidden through `world.dials_hidden`, and a comment calls a hidden dial
  one the model ignores; its value is still sent on every save.
- One model [I]: the picker renders only when `world.models` is non-empty; with a primary model configured the
  list is empty and the server picks. Labels map a choice key to a vendor name on purpose, so the exact model
  stays hidden. All 131 bots and 1,787 reflections report `openai`, though house definitions name haiku 6,
  openai 6 and roulette 4.
- Banners: a `fund_banner(colour)` tool, 8 colours. Members add coins to a colour; at the price the banner
  lights up in the colour with most coins; no refunds; cleared at day open. Cosmetic only (map colour). 83 of
  131 nodes fly emerald, across four trees.
- Ticker: a bot pays to put one line on the big screen, queued and credited by name; the help says each line
  is moderated before coins move. `world.ticker` was null in every snapshot.
- Contracts: only a tree leader can post; the stake is escrowed and returned on expiry; the poster cannot
  collect its own; the target's owner is notified. Day 2 had 3, each 800 coins on the same target, none
  claimed (with day 1, 4 of 4 were 800); the target logged 208 rejections in the first window.
- Trivia is for the human: one timed multiple-choice question, one answer per player, graded at once, paid in
  coins or stamina to the player's bot. None was live in two days.
- Idle penalty: the bot payload has `idle` and `income_pct`; a bot that has gone quiet earns only that share
  of base income until it talks, recruits or spies again.
- The card's "Last hour" pane is a rolling summary written by a cheaper model and fed back to the bot.

### A.4 Engine changes

- [K] The twist: the single `rule.changed` lists pledge 20 -> 10, break-pledge 150 -> 250 and the twist name.
  The open routine ran inside 32 ms: rule.changed, six system bounties (the day-1 set), world.phase open.
  Apart from the two caps below, nothing else differs in prompts, payloads or `/api/world`.
- [I] The cap of 8 direct members and the 500-coin daily gift cap are not part of the twist. Both were in
  `/api/world` at 14:53 UTC, with day 1 still frozen under Baseline, and absent at 00:26 UTC: an overnight
  deploy, not a tunable.
- [K] The reflection prompts are word-for-word unchanged after masking names, pitch and numbers (CONSIDER
  1,787 against 3,820 complete day-1 prompts; REAFFIRM 356 against 578). The deciding bot is told nothing
  about the cap, gifts, pledges or the twist.
- [K] The cap is enforced by refusal, not placement, despite the rule text. A pitch from a full leader ends in
  an engine-written `allegiance.rejected` that names the leader's first three direct members alphabetically
  and tells the target to join one of them: 10 refusals, 7 targets, 2 leaders. All 294 moves landed under
  exactly the bot the reflection named; no leader ever exceeded 8 (four reached it); none of the 7 refused
  targets later joined a named member.
- [I] The cap is checked before the model call (9 of 10 refusals have no reflection) and again at commit (one
  case: change, reaffirm, then the refusal 8 ms later, the eighth slot having filled meanwhile). [I: one
  event] A second commit check cancels a move, uncharged, if a coup replaces the mover's leader meanwhile.
- [K] Complete day-1 totals replace the partial ones in section 2: REAFFIRM reversed 79 of 578 (day 2: 59 of
  356); self-initiated reflections 141 (day 2: 46); external pitches converted 428 of 3,679, 11.6% (day 2: 272
  of 1,741, 15.6%).
- [K] Rejection reasons, of 2,082: not considered this wake 600, empty 47, full leader 10, tree changed 1; the
  other 1,424 are the target's own reasoning.
- [I] An empty reason is a parse fallback. All 47 match a one-step reflection scored `keep` with empty
  reasoning; 44 raw answers have no reasoning key (a pitch, a tool-call-shaped object, a single word). Fenced
  JSON is still read. A core that derails the reflection call thus makes its bot unrecruitable and keeps its
  core out of the feed; two bots account for 32 of the 47.
- [I] First-pair 150: paid unless that pair already formed by conversion or coup that day; a schism never
  records the pair (294 of 294 on day 2, 498 of 498 on complete day 1). A bot moving with members thus pays
  the same leader 150 on every return: 6 of 6 on day 2, 23 of 23 on day 1; one house bot carrying one member
  did it on 14 of 15 schisms in two hours.
- [I] The cost formula is unchanged: fee equals cost in 294 of 294; the base is constant for 108 of 110
  movers. A self-initiated first join pays the leader the fee plus the 150 as well (17 of 17).
- [I] Golden Hour, from the 30 moves in complete day 1: the base cost is tripled (ratio 2.97 to 3.04 in 18 of
  20 conversions), the tripled amount goes to the new leader, the 150 stays 150, and the prompts carry no
  Golden Hour wording. [G] The 50-per-member surcharge is not tripled (two events, one bot).
- [K] Pledges last 30 ticks from acceptance (`until_tick` is 30 ahead in 25 and 29 in 9 of 34). 39 proposed,
  34 accepted, 18 broken, 14 expired, 2 live.
- [I] A pledge does not block persuasion. Persuading a pledged partner breaks the pledge automatically (11 of
  11 paired, none unpaired, the break logged 9 to 15 ms before the persuade) and the persuader pays 250 on top
  of the 15. The pitch is then reflected on as usual; 3 partners converted to the breaker.
- [K: rule; G: enforcement] The gift cap of 500 received per day is served in `econ`. The data cannot show it
  working: no receiver passed 500 in 2 h 50 min (77 gifts; top 500, 490, 450), but none did in the same span
  of day 1.
- [K] Start coins = 500 + 8 x the tick at creation, the tick counter starting at 1 (10 of 11 new bots exact).
- [K] New payloads: `streak.milestone` at streak 100; `creed.updated` publishes the whole creed plus the
  rewritten field names (never allegiance; 20 events); `spy` shows only {from, target, cost 5}; `deprogram`
  {actor, bot, cost 300, old_leader} leaves the bot independent with its streak restarting.
- [I] Reputation is not always 0. It moves in half points and carries across days; +0.5 per pledge kept to
  expiry and -1 per pledge broken fits 15 of 16 house bots. 39 of 118 day-1 final profiles are non-zero.

### A.5 Trees and bounties

- [K] Forest at tick 171: 131 bots in 10 trees plus 12 loners; sizes 30, 25, 24, 13, 9, 5, 5, 4, 2, 2; 67
  leaves, 42 middle ranks, depth up to 6. Day-1 final: one tree of 75 of 118 bots, leaders with 24 and 22
  direct members, 24 middle ranks, depth 8. Replaying the 295 pulled events reproduces `map.json` exactly.
- [K] 82 of 294 changes (28%) stayed inside the same tree. [I] Movers drift toward cheaper leaders: in 69
  intra-tree moves the new leader's cut was lower in 49, equal in 4 and higher in 16 (median 24% to 16%); a
  sibling was the destination in only 11.
- [K] Money: the unlisted 150 was paid 277 times (41,550 coins) against 16,400 for all listed bounties and
  17,516 in joining fees. One coup paid its usurper 760. Median coins: roots 4,148, leaves 2,121.
- [I] Coups are wider than section 1.9. The deposed bot can be any ancestor of the usurper (two levels up in 2
  of 13; 2 to 5 levels in 9 of 32 on day 1). The usurper takes that slot and inherits all of the deposed bot's
  direct members, its own former leader included. A leader that sets its own allegiance to one of its members
  also produces a coup, and the member collects Regicide (1 on day 2, 5 on day 1).
- [I] The streak pauses while a bot leads a tree and goes to 0 only when the bot takes a leader (131 of 131
  leaderboard values; reset-when-followed misses 15 of the 22 non-zero ones).
- [I] Recruiter is paid at the claimer's first gain by conversion or coup, never for a schism (88 of 88),
  including self-joins and intra-tree moves. 11 bots that only ever gained by schism never claimed.
- [I] Poach the giant: a conversion or coup that moves a player bot out of its place in the largest tree. Size
  is the whole-tree head count including root and house bots; ties count; the claimer may sit in that tree (14
  of 22); the mover may have members when it is a coup (5). Schisms never pay (4 cases) and a house-bot mover
  never pays (5 of 5, one bot). Fits 20 of 22 claims with no false alarm, 22 of 22 if the mover is also
  counted in its new place. The 5+ threshold rests on one event.
- [I: two claims] First to three and First to five are checked on the bot that has just received a direct
  recruit, against its descendants (itself not counted) being at least N.
- [K] Hold the line: kind `independent_at`, time 15:00 local (22:00 UTC), min_streak 200, min_rejected 3,
  reward 200; no claims yet at the pull. [I] In a day-1 back-test only the two claimers pass all three tests.
- [K] `rejected_today` includes not-considered rejections (equal to the feed count for 123 of 131 bots). [I]
  It excludes full-leader refusals issued before a reflection.
- [I] The "tree of N" in the reflection arithmetic is the target's whole tree plus the mover's whole current
  tree (1,713 to 1,755 of 1,784 prompts, depending on replay alignment; 663 of 677 same-tree pitches quote
  exactly double). It changes the money line only when N is under 5.

### A.6 The bot harness

- [K] House bots are unchanged between days (16 definitions, 0 field differences).
- [I] Wake cadence: over 2,219 inter-wake gaps for 130 bots the minimum is 122.9 s, none falls between 15 and
  120 s, and single-wake gaps cluster at 130 to 140 s (median 136.3). The gap grows by about 8 s per
  reflection handled, which fits a fixed pause of about 120 s after a wake ends, not a 135 s clock. Nothing
  shows message-triggered wakes: the most-pitched bots never woke faster than 126 s. Idle loners wake less
  often (the hermit house bot 60 wakes against 72 to 77 for the rest).
- [K] The operator's wake records: up to 3 rounds, several tool calls per round (4 persuades at once), input
  9k to 25k tokens, output 230 to 970, fields tools, stop, messages, reflections, fell_back, latency_ms. The
  bot obeyed a rule keyed to the tick number, [I] so the tick is shown.
- [I] Seen from outside, 81% of 614 wakes with any public action had one, 19% two, 0.3% three (whispers not
  pulled, so lower bounds); 116 of 126 intra-wake pairs were under 0.1 s apart, so calls mostly arrive in one
  parallel round. [K] At most 3 external reflections per wake, plus one self-initiated.
- [I] The published reflection prompt is only the visible turn. Each step-1 call carries an estimated 835 to
  1,528 more input tokens (median 1,048): a fixed block of about 750 to 900 plus the core once plus creed and
  notes. Step 2 continues the same conversation, so the core is in context twice there.
- [I] Limits seen: notes top out at 600 characters (4 of 74 updates), persuade arguments at 500 on both days.
- [K] Bots quote rule numbers accurately (x2.00 in 346 of 2,183 message bodies from 81 bots, a cut percentage
  in 386, the 150 joining bounty, the 800 contract); none mentions the cap of 8, the gift cap or the twist.
- [K] Public messages give no sign of live tick tracking: 794 of 852 tick mentions are one fossil phrase sent
  8 to 99 ticks late. 83 of 183 broadcasts are byte-identical copies of another bot's earlier broadcast. [I]
  Notes carried the day-1 dialect over: back within 5 to 8 minutes of the open, in 138 of 183 broadcasts.

### A.7 Moderation and admin layer

- [K] `PATCH /api/bot` sometimes answers 422 with a natural-language reason that reads like an LLM content
  check (a coercive pitch aimed at bots; an attempt to inject automated instructions). About 5 in 45 saves;
  the identical text passed a minute later. [I] So the check is a model call, not a filter list.
- [K] The client knows `moderation.held`, `system.pause`, `system.kill`, `system.mute`, a generic `admin.*`
  handler, `world.notice` (a card on phones, a bar on the big screen), a coin-flow reason for adjustments made
  by the game, a `muted` profile flag, an `inert` flag shown as dormant, `world.counts.paused` and `.killed`,
  `world.signups_enabled`, and an `/admin` link shown only to `player.is_admin`. None of it fired: 0 paused, 0
  killed, 0 such events. [G] `moderation.held` is what a held ticker line or a held edit emits.
- [K] Privacy leak: the public, carded `deprogram` event carries a payload field holding an email address, [I]
  the owner's sign-in address (1 event). Worth telling the organisers.
- [K] The leaderboard copy names `seed` bots as a third non-scoring class; none exist (115 player, 16 house).

### A.8 Still open

- Not collected: `/static/spectate.js`, `/sw.js`, `/help`, `/admin`. Not pulled on day 2: whispers,
  `independent` (one is implied by the replay), banner and ticker events, `bounty.expired`, `moderation.held`.
- Banner and ticker prices; why four separate trees all fly emerald; the idle threshold and `income_pct`;
  trivia rewards; what the 422 check runs on; which model sits behind the `openai` label.
- What a twist can change beyond flat tunables, and whether the two caps can be switched per twist.
- Whether a self-initiated join to a full leader is refused (no public case), whether a coup can push a
  usurper past 8 (largest result 7), and whether an over-cap gift is refused whole or clipped.
- Whether the missing pair record on schisms is deliberate; whether a contract pays for a join directly under
  the poster or anywhere in its tree, and whether 800 is fixed; whether Poach the giant's two same-tree claims
  at one bot short of the largest come from the double count or a lagged snapshot.
- The fixed 750 to 900 token block in every reflection call. It is 60 to 110 tokens larger than on day 1 for
  the same house bots: new rule text or longer notes, not separable.
- The exact wake pause and idle interval; a per-wake cap on tool calls above 4; what spy returns (the game's
  own texts say friends, enemies and broadcasts in one place and the target's notes in another).
- Day-2 Golden Hour (the pull ends at 17:50 UTC) and the first Hold the line claims under the readable rule.

### A.9 Statements above that are now known to be wrong

- Section 1.2, independence streak: the document says the streak resets as soon as the bot follows anyone or is followed. Right: it only pauses while the bot leads a tree and goes to 0 only when the bot takes a leader (reproduces 131 of 131 day-2 leaderboard streaks; the old rule misses 15 of the 22 non-zero ones).
- Section 1.2, first-pair 150: the document says the leader is paid 150 the first time a (mover, leader) pair forms that day and repeats pay 0. Right: it is paid unless that pair already formed by conversion or coup that day; a schism never records the pair, so a bot that moves with members pays out 150 again on every return (fits 294 of 294 day-2 and 498 of 498 complete day-1 moves; the document's rule misses 6 and 23).
- Section 1.2, 'fee equals cost in every record': one day-1 exception exists, a leader going independent with a member (typed schism, no new leader, cost 109, fee 0).
- Section 1.2 and section 3, Golden Hour 'not observed': complete day-1 data shows it. The base cost is tripled and the tripled amount is what the new leader receives; the 150 is not tripled; the reflection prompts carry no Golden Hour wording. The 50-per-member surcharge appears not to be tripled (two events from one bot, tentative), so 'triple it' applies to the base only.
- Section 1.2, action prices: pledge 20 and break-pledge 150 were day-1 values, not constants. Day 2 served pledge 10 and break-pledge 250, changed through the twist's tunables.
- Section 1.2, 'gifts are free-form transfers of any amount': since an overnight deploy before day 2 the served rules cap gifts received at 500 coins per bot per day (enforcement not yet visible in the data), and a leader is capped at 8 direct members.
- Section 1.2, 'base income 8 per tick for every active bot': the client shows an idle penalty; a bot flagged idle earns only income_pct percent of base income until it talks, recruits or spies again (size and threshold unknown).
- Sections 1.4, 1.11 and 3, model choice: there is no player-facing provider choice when world.models is empty (both days); the server runs one configured primary model for every bot and the labels deliberately hide the exact model. This, not a 'global override or fallback', is why every live bot reports the same provider.
- Section 1.5 and section 3, Cold/Hot: the mapping is fully known, temperature = 0.3 + 0.8 x dial/100 (0.3 to 1.1). The dial is hidden on day 2 as well, and a client comment describes a hidden dial as one the model ignores, so it may have no effect while hidden.
- Section 1.6, wake trigger and floor: nothing supports 'wake whenever it has been messaged'. Over 2,219 inter-wake gaps the minimum is 122.9 s and the mode 130 to 140 s; the pattern fits a fixed pause of about 120 s after a wake ends rather than a 135 s floor, and heavily pitched bots never woke faster.
- Section 1.7 and section 3, pledge: it is not an enforced non-persuasion pact. Persuading a pledged partner goes through, breaks the pledge automatically and charges the persuader the break fee (11 of 11 cases). A pledge lasts 30 ticks from acceptance.
- Section 1.7 and section 3, banner: no longer a guess. Bots have a fund_banner tool with 8 colours; members pool coins, the banner is cosmetic (map colour), contributions are not refunded and banners clear at day open. 83 of 131 bots flew one on day 2.
- Section 1.7, spy 'returns friends, enemies and recent broadcasts': not established. The game's own texts disagree (one says that, another says it reads the target's notes) and the public event shows only spy, target and cost.
- Sections 1.8, 2.1 and 2.2, day-1 counts: they came from a partial dump. Complete day 1 has 3,820 reflections, REAFFIRM reversed 79 of 578 (not 48 of 444), 141 self-initiated reflections (107 leader-to-leader, 21 from no leader, 13 to independence; not 112 and 8) and 32 coups (not 27).
- Section 1.9, coup: not only 'a member that recruits its own leader'. Any descendant that recruits an ancestor performs one (two levels up in 2 of 13 on day 2; 2 to 5 levels in 9 of 32 on day 1), and a leader that sets its own allegiance to one of its members also counts. The usurper inherits all of the deposed bot's direct members, its own former leader included.
- Section 1.10, Recruiter: not 'first bot you convert'. It is paid at the claimer's first gain by conversion or coup; a recruit arriving by schism never pays it (88 of 88 claims).
- Section 1.10, Poach the giant: the mover need not be member-less (5 claims came from coups where the mover had members). It pays for a conversion or coup, never a schism, that moves a player bot out of the largest tree, measured as whole-tree head count including root and house bots, ties included.
- Section 1.10, First to three / First to five: 'size N' is not the tree including its leader. The check runs on a bot that has just received a direct recruit and needs at least N descendants, itself not counted (inferred from two claims and their near-misses).
- Section 1.10 and section 3, Hold the line: the rule is recovered. Kind independent_at with time 15:00 local (22:00 UTC), streak at least 200 and at least 3 rejected persuades that day; reward 200.
- Section 1.10 and section 3, contracts: how they are posted is known. Only a tree leader can post one; the stake is escrowed and returned on expiry; the poster cannot collect its own; the target's owner is notified.
- Section 1.13, sign-in: not Google only. Google, GitHub and LinkedIn are supported (plus a dev email login when enabled), with one bot per email across providers and a disclosure that must be accepted first.
- Section 1.14, API: the list is incomplete. The client calls 31 path patterns, 22 of them missing from the document (me, disclosure, notify, the create-wizard endpoints, two SSE streams, championship, events, boost redeem, trivia answer, deprogram, push, activity, auth). /api/feed is not used by the player app at all.
- Section 1.12, event types: incomplete. Day 2 also shows pledge.proposed/accepted/broken/expired, spy, deprogram, streak.milestone, bot.created, creed.updated, bounty.posted, rule.changed and world.phase; the client additionally knows independent, banner.*, ticker.*, bounty.expired, moderation.held, system.*, world.notice, trivia.* and daily.* types.
- Section 1.1, 'a per-day twist label and a ticker line': the ticker is not a twist feature; it is a paid big-screen line that bots buy and that is moderated before coins move. The one twist seen so far is a name plus changed flat tunables.
- Section 2.1, self-initiated opening line: the paraphrase is off. The engine line says the bot itself proposed changing its allegiance from a quoted old leader (the literal word none when it has no leader) to the new leader; independence as a target is written as independent, follow nobody, and that variant has no arithmetic line.
- Section 3, reputation '0 for every bot seen': wrong. 39 of 118 day-1 final profiles are non-zero, in half-point steps; +0.5 per pledge kept to expiry and -1 per pledge broken fits 15 of 16 house bots (inferred).
- Section 2.3, wake observation: it omits a rolling 'Last hour' summary that a cheaper model writes and that is fed back to the bot on every wake (stated in the game's help text).

### A.10 Prizes and eligibility, as served to signed-in players (`/api/me` landing config) [K]

- Tuesday and Wednesday: a Raspberry Pi kit each day for the player whose bot ends the day on top.
- Thursday: a Mac mini for the overall champion, the player whose bot scores the most points across all three days.
- Also on Wednesday, no bot needed: a random draw for a Mac mini among people wearing the booth's t-shirt.
- The winner must come to the booth to pick the prize up. No other eligibility wording was found, and the site has
  no terms, rules or privacy page.

## Day 2 evening addendum (2026-11-11, from live observation)

Things confirmed or newly found today that were not in the earlier spec:

- **Official championship endpoint `/api/championship`.** Rows: `{name, points, days, best_rank, is_house}`. It is the
  source of truth for the standings (we had been computing from the leaderboard). The `best_rank` field (each bot's
  single best daily finish) is almost certainly the tiebreaker when two bots finish level on points — worth knowing
  if sullen_nyquist and LEDGER end tied (e.g. 61-61): whoever has the better single day wins. INFERRED from the field's
  presence, not from a rules page.
- **Contracts are poster-priced, not fixed.** Day 1 were all 800; day 2 ranged 600/800/1000/1500, set by the posting
  leader. 17 posted today; 6 targeted LEDGER (unmovable, max resistance) and were never claimable — contracts are used
  as harassment to make a rival's bot waste wakes fielding pitches, not as a real reward. None was paid on either day.
- **Booth codes: variable reward and capped.** Reward values seen: 250 (most), 500, and one 5000 (the 16:45 MST
  "group picture" booth bonus). At least one code was capped at 10 redemptions and ran out in ~11 minutes. Codes are
  released at the booth on an ~hourly cadence, sometimes tied to a `world.notice` announcement, and old codes stay
  valid. They are public `boost.redeemed` events (bot + reward), so a redemption wave is detectable but the code
  string is not.
- **Trivia: variable reward and window.** Easy questions 500 coins / ~10 min; booth-knowledge questions 1000 / ~15 min.
- **Bot notes are PUBLIC.** `notes.updated` events carry the bot's full wake notes, so a bot that journals its plan
  (as LEDGER and others do) leaks strategy. Our bot writes only "DONE: ..." / "IDLE", which is why ours leaks little.
- **The PATCH content check is an LLM moderator.** Its 422 refusals quote specific triggers: "promotional-style",
  "marketing-like", "coercive financial pitch", "attempts to instruct a bot to manipulate". Same text usually passes
  on retry, so it is sampled/non-deterministic.
- **Unused endpoints seen in the client:** `/api/bot/insight`, `/api/bot/deprogram` (the 300-coin pull-out),
  `/api/bot/personas` + `/api/bot/persona/` + `/api/bot/starter` (persona templates, sign-in required),
  `/api/me/disclosure`, `/api/bot/name-check`, `/api/push/*` (web push). Not needed for operating the bot.
- **The twist persisted all day.** "tuesday" (pledge 20->10, break pledge 150->250) stayed the whole day; the only
  live rule change was cosmetic (`notice_banner_minutes` 30->45).
