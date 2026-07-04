# PolicyMind

> Thesis submission repo — full source in `policymind/`, report and demo video at the root.

The security policy that writes itself.

PolicyMind is the ArmorPolicy feedback loop: every approval, denial, and
rollback your operators tap becomes a labelled training signal. Once a
pattern repeats, an LLM drafts the next ArmorPolicy policy in plain English.
You ratify it with one tap.

## What's in here

Only the four submission deliverables sit at the repository root. The entire
project source code lives inside the `policymind/` folder.

```
project-source-files/
|- README.md                 instructions (this file)
|- Project_Report.pdf        thesis project report
|- demo_video.mp4            video recording of the system running
`- policymind/               entire project source code
   |- src/                   application source (client + server)
   |  |- app/                Next.js App Router pages + API routes
   |  |  |- page.tsx         cockpit dashboard
   |  |  |- agent/           chat-driven live demo (real prompts)
   |  |  |- advisor/         memory-aware policy advisor
   |  |  |- digest/          telegram-card style digest review
   |  |  |- ledger/          ratified policy ledger
   |  |  |- demo/            preset event firing
   |  |  `- api/             server route handlers (events, agent, advisor,
   |  |                      miner, digest, drafts/ratify, drafts/dismiss,
   |  |                      demo/simulate, demo/reset)
   |  |- components/         Panel, Stat, DraftCard, EventStream, LearningCurve
   |  `- lib/                db, signature, miner, drafter, armorpolicy, digest
   |- prisma/                schema.prisma + applied migrations
   |- scripts/               seed.ts, telegram-bot.ts, telegram-send.ts
   |- public/                static assets served by Next.js
   |- docs/                  live-demo.md, TESTING.md
   |- package.json, tsconfig.json, next.config.ts, postcss.config.mjs
   `- .env.example, .gitignore
```

## Architecture

```
ArmorPolicy audit  ->  Event Miner  ->  gpt-5.5 Drafter  ->  Digest UI  ->  ArmorPolicy IAP
   (approve /        (cluster by      (writes "Policy     (web + tg     (mints signed
    deny /            tool, args,      new: ..." in       digest cards   intent token,
    rollback)         dataClass)       plain English)     with diff)     stores plan_id,
                       repeat >= 3 ----------+                            merkle_root,
   ^                                          |                            jwt on draft)
   +-------- new events re-train the drafter -+
```

## Compilation & Execution (Client + Server)

PolicyMind is a single Next.js 16 application that compiles and runs **client**
and **server** together:

- **Client** — App Router pages and React components in `src/app/` and
  `src/components/` (cockpit, agent chat, advisor, digest, ledger, demo).
- **Server** — Next.js API route handlers in `src/app/api/**` plus the Prisma
  data layer in `src/lib/` and `prisma/`.

All commands below run from inside the `policymind/` folder:

```bash
cd policymind
```

### Quick start (development)

```bash
npm install                  # installs deps; postinstall runs `prisma generate`
cp .env.example .env         # then fill in DATABASE_URL, OPENAI_API_KEY, etc.
npx prisma migrate deploy    # apply DB schema
npm run db:seed              # seed background traffic (or db:seed:full for drafts)
npm run dev                  # serves client + server on http://localhost:3000
```

### Production build & run

```bash
npm install
npx prisma migrate deploy
npm run build                # compiles client bundles AND server route handlers
npm run start                # production server on http://localhost:3000
```

### Optional auxiliary server (Telegram digest bot)

```bash
npm run telegram:bot         # long-running Node process, separate terminal
```

The full environment variable reference and live-demo walkthrough are below.

## Setup

### Prerequisites

- Node.js 22+ (or whatever Next 16 supports — check `node --version`)
- A Postgres URL (Neon, Supabase, local — anything with the `postgresql://`
  scheme)
- An OpenAI API key for gpt-5.5
- An ArmorPolicy API key (`ak_live_*`, `ak_test_*`, or `ak_claw_*`) from
  **https://platform.armoriq.ai** under Dashboard -> API Keys (optional —
  the dashboard works without it, but ratifications won't get signed plan
  proofs)

### 1. Install

```bash
cd policymind
npm install
```

The `postinstall` script runs `prisma generate` automatically. If you ever
delete `node_modules` and re-install, the Prisma client gets regenerated
into `node_modules/.prisma/client`. No manual step needed.

### 2. Environment

Copy `.env.example` to `.env` and fill it in:

```bash
cp .env.example .env
```

Minimum required to boot the dashboard, agent, and advisor:

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST/DBNAME?sslmode=require"
OPENAI_API_KEY="sk-..."
POLICYMIND_BASE_URL="http://localhost:3000"
POLICYMIND_ORG_ID="demo-org"
POLICYMIND_CLUSTER_THRESHOLD=3
POLICYMIND_OVERRIDE_RELAX_THRESHOLD=5
```

For the live ArmorPolicy promotion path (so ratified drafts mint real signed
intent tokens at IAP and `/agent` plans show up in the platform dashboard),
also set:

```
# ak_live_*  -> ArmorPolicy API base = api.armoriq.ai
# ak_claw_*  -> ArmorPolicy API base = armorpolicy-api.armoriq.ai
ARMORPOLICY_API_BASE="https://api.armoriq.ai"
ARMORPOLICY_PROXY_BASE="https://proxy.armoriq.ai"
ARMORPOLICY_API_KEY="ak_live_..."
ARMORPOLICY_USER_ID="policymind-demo-user"
ARMORPOLICY_AGENT_ID="policymind-drafter"
ARMORPOLICY_CONTEXT_ID="default"
```

Get your `ak_live_*` (or `ak_test_*` / `ak_claw_*`) key from
**https://platform.armoriq.ai** -> Dashboard -> API Keys. The SDK
auto-routes to the right backend based on the prefix, so the URLs above
only need to match the prefix family.

If `ARMORPOLICY_API_KEY` is missing, the dashboard, agent, and advisor all
still work — verdicts come purely from PolicyMind's local ledger. Ratified
rows just lose their signed `plan_id` / `merkle_root` proof.

For Telegram digest cards (**optional** — only needed for `npm run telegram:bot`):

```
TELEGRAM_BOT_TOKEN=""
TELEGRAM_BOT_USERNAME=""
```

### 3. Database

Apply migrations and seed the demo data:

```bash
npx prisma migrate deploy
npm run db:seed
```

By default the seed only writes background traffic (~70 events, 4 primed
clusters) and **leaves the digest empty**. Drafts get authored from real
interactions with `/agent`, `/advisor`, or `/demo`. To pre-cook three
drafts so they're already in `/digest` on first load (handy for a
two-minute pitch), use `npm run db:seed:full` instead.

### 4. Run

```bash
npm run dev
```

Open http://localhost:3000.

## Troubleshooting

### `Failed to load external module @prisma/client ... Cannot find module '.prisma/client/default'`

The Prisma client wasn't generated (or was wiped when `node_modules` was
deleted). Fix:

```bash
npx prisma generate
```

This shouldn't happen normally — the `postinstall` script runs `prisma
generate` after every `npm install`. If you removed `node_modules` and
ran `npm install --ignore-scripts`, run the command above manually.

### `/digest` is empty after `npm run db:seed`

That's intentional with the new seed. The drafter doesn't run at seed
time — drafts appear when you trigger them via `/agent`, `/advisor`, the
"Run drafter now" button on `/digest`, or `npm run db:seed:full`.

### Verdicts on `/agent` say "ALLOWED — No matching PolicyMind rule"

PolicyMind's ledger is empty. Ratify a draft first (Beat 3 in
`docs/live-demo.md`) and then re-run the prompt — it will be DENIED by
your ratified rule.

### Plans not showing up at platform.armoriq.ai

You're probably looking at the wrong org. Different `ak_live_*` keys can
belong to different orgs. Verify with:

```bash
curl -sS -X POST https://api.armoriq.ai/iap/sdk/token \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $ARMORPOLICY_API_KEY" \
  -d '{"user_id":"x","agent_id":"x","context_id":"default","plan":{"goal":"probe","steps":[{"action":"noop","mcp":"x","params":{}}]},"expires_in":30}' \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print('org_id:',d.get('org_id'))"
```

Make sure you're logged into platform.armoriq.ai with the account that
owns that `org_id`.

### Reset everything between demos

```bash
curl -X POST http://localhost:3000/api/demo/reset
npm run db:seed
```

Plus clear browser localStorage on `/agent` and `/advisor` (or click the
**Clear** button on each page header).

## Pages

| Path | What it shows |
|---|---|
| `/`        | Cockpit. Stat cards, draft list, live audit stream, learning curve, ratified policy table. |
| `/agent`   | Chat-driven live demo. Type a request, watch gpt-5.5 pick a tool, see the ArmorPolicy verdict, watch PolicyMind ingest the audit. Conversation persists across tabs; clear it from the conversation header. |
| `/advisor` | Memory-aware policy advisor. A chat that knows your live policies, top clusters, recent denies, and pending drafts. Describe a workflow, a near-miss, or ask for a posture review and gpt-5.5 reasons about what to add. When a concrete new rule clearly improves posture it files a draft via `propose_policy_draft` that lands directly on `/digest`. Refuses to file near-duplicates of live policies. Five built-in starters cover new workflows, near-misses, relax-a-rule, posture reviews, and incidents. Thread persists in localStorage. |
| `/digest`  | Telegram-style weekly digest card. The "tap to ratify" surface. Drafts land here whether they came from the cluster drafter, the agent loop, or the advisor. |
| `/ledger`  | Ratified policies with provenance. Click a row to drill into the original draft and underlying events. |
| `/demo`    | Preset event firing. Useful for canned stage demos. |

## Live demo script

For a customer-facing run-through, follow [`policymind/docs/live-demo.md`](policymind/docs/live-demo.md).
It is the five-minute script: which tab to open, which prompt to type, what
the audience sees on each card.

## Wiring real ArmorPolicy events

ArmorPolicy already calls `verificationService.createAuditLog` with this shape
on every `before_tool_call` policy block and every `after_tool_call` success.
Forward those payloads to PolicyMind:

```ts
fetch(`${POLICYMIND_BASE}/api/events/ingest`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    tool: event.toolName,
    action: "policy_deny",   // or tool_call / rollback / override
    status: "failed",
    input: event.params,
    runId: ctx.runId,
    planId: cached.planId,
    executedAt: new Date().toISOString(),
  }),
});
```

## How the agent demo works

`/agent` is not a presentation prop — it is a working slice of the loop.
Every prompt:

1. Hits `POST /api/agent/run`
2. Calls gpt-5.5 with six tool definitions (wire_transfer, send_email,
   create_invoice, delete_record, search_db, post_message)
3. Looks up `RatifiedPolicy` for the chosen tool + detected data class
4. Returns ALLOWED, DENIED, or APPROVAL_NEEDED with the matched rule id and
   plain-English reason
5. Calls `ingestEvent` so the cluster count actually moves
6. If the cluster count crosses `POLICYMIND_CLUSTER_THRESHOLD`, runs the
   drafter — a new card lands on `/digest` while the audience is still
   reading the previous one

## How the advisor works

`/advisor` is the second way drafts get filed — instead of waiting for a
cluster to repeat three times, an operator describes a scenario in natural
language and the advisor proposes a rule on the spot.

Every message:

1. Hits `POST /api/advisor/chat` with the full thread history
2. The route gathers org context: top 30 live policies, top 8 clusters by
   repeat count, the last 10 operator-denied events, and any pending drafts
3. That context is injected into the system prompt so gpt-5.5 reasons about
   *your* posture, not a generic security policy
4. gpt-5.5 has one tool: `propose_policy_draft({ rule_action, rule_tool,
   rule_data_class, plain_english, reasoning })`. When a concrete new rule
   clearly improves the posture, it calls the tool and a real draft lands on
   `/digest`. When the user is exploring or asking for an explanation, it
   responds in plain text without calling the tool.
5. The advisor refuses to file near-duplicates of existing live policies — if
   you describe a problem already covered, it points at the existing rule.

Drafts proposed by the advisor are flagged with a `[Advisor-proposed]` prefix
in the reasoning text and are anchored to a synthetic placeholder cluster
(since they don't come from an observed pattern). They ratify through the
same `/api/drafts/[id]/ratify` path as cluster-drafted rules and mint the
same signed intent token at `/iap/sdk/token`.

## Tech stack

- Next.js 16 (App Router, Turbopack) + TypeScript
- Tailwind CSS v4 + Framer Motion + Lucide
- Prisma 6 + Neon Postgres
- OpenAI SDK (drafter and agent both use gpt-5.5; ANTHROPIC_API_KEY also
  supported via env swap)
- IBM Plex Sans + JetBrains Mono
