# PolicyMind Testing Guide

Step-by-step test scenarios for the closed loop: audit event in, ratified policy out.

Server is running on **http://localhost:3000**. All curl commands assume that. If your server is on a different port, swap it.

---

## 0. Pre-flight check

Run these first. Each should return HTTP 200.

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/digest
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/ledger
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/demo
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/digest
```

If any return 500, check the dev server log. If 404, the route file is missing.

Verify Postgres is reachable and the schema is up:

```bash
cd /Users/hariharasudhan/Armoriq/hack/policymind
npx prisma db pull --print 2>&1 | head -5     # should print models
```

---

## 1. Empty-state tests

**Goal:** the UI behaves correctly when nothing is in the database.

```bash
# Wipe everything
curl -s -X POST http://localhost:3000/api/demo/reset
# Expected: {"ok":true}

# Confirm digest is empty
curl -s http://localhost:3000/api/digest | python3 -m json.tool | head -20
# Expected:
#   stats.eventCount = 0
#   stats.draftPending = 0
#   stats.ratifiedActive = 0
#   drafts = []
#   ratified = []
```

Now reload these pages in the browser:

| Page | What to look for |
|---|---|
| `/` | All four stat cards show 0. "No drafts yet, the loop is quiet." empty state with "Simulate a deny" button. Live audit stream says nothing. Learning curve says "Waiting for the first week..." |
| `/digest` | "Inbox empty" panel. No draft cards. |
| `/ledger` | Active rules = 0, Drafts dismissed = 0, table shows "No ratified rules yet." |
| `/demo` | Stage presets visible. Console says "ready, pick a preset to fire synthetic events". |

---

## 2. Ingest contract tests

**Goal:** confirm the `/api/events/ingest` endpoint accepts the same shape ArmorPolicy emits.

### 2a. Single event, valid

```bash
curl -s -X POST http://localhost:3000/api/events/ingest \
  -H "content-type: application/json" \
  -d '{
    "tool": "wire_transfer",
    "action": "policy_deny",
    "status": "failed",
    "input": { "vendor": "acme-new", "amount": 750, "currency": "USD" },
    "errorMessage": "operator tapped Deny",
    "runId": "test-run-1",
    "executedAt": "2026-04-29T15:00:00Z"
  }'
# Expected:
#   {"ok":true,"ingested":1,"results":[{"eventId":"...", "clusterId":"...", "count":1}]}
```

### 2b. Batch ingest

```bash
curl -s -X POST http://localhost:3000/api/events/ingest \
  -H "content-type: application/json" \
  -d '[
    {"tool":"send_email","action":"tool_call","status":"success","input":{"to":"alice@armoriq.io"}},
    {"tool":"create_invoice","action":"tool_call","status":"success","input":{"customer":"acme","amount":200}}
  ]'
# Expected: ingested = 2, both results have clusterId = null (success calls do not cluster)
```

### 2c. Invalid input rejected

```bash
curl -s -X POST http://localhost:3000/api/events/ingest \
  -H "content-type: application/json" \
  -d '{"tool":"x"}'
# Expected: HTTP 400, error mentions missing fields
```

### 2d. Action types

Send one of each `action` and confirm only the clusterable ones build clusters:

```bash
for ACTION in tool_call policy_deny rollback override; do
  curl -s -X POST http://localhost:3000/api/events/ingest \
    -H "content-type: application/json" \
    -d "{\"tool\":\"test_$ACTION\",\"action\":\"$ACTION\",\"status\":\"failed\",\"input\":{\"k\":\"v\"}}"
  echo " ($ACTION)"
done
```

Expected: `tool_call` returns `clusterId: null`. The other three return a real `clusterId`.

---

## 3. Cluster threshold tests

**Goal:** confirm the drafter only fires once a pattern repeats 3+ times.

```bash
curl -s -X POST http://localhost:3000/api/demo/reset

# Send 2 denies of the same shape (below threshold)
curl -s -X POST http://localhost:3000/api/demo/simulate \
  -H "content-type: application/json" \
  -d '{"tool":"wire_transfer","count":2}'
# Inspect the response: drafter.created should be []

# Send 1 more (now total = 3)
curl -s -X POST http://localhost:3000/api/demo/simulate \
  -H "content-type: application/json" \
  -d '{"tool":"wire_transfer","count":1}'
```

Wait, the simulate endpoint always runs the drafter at the end, so the second call should produce a draft.

```bash
# Confirm one draft exists
curl -s http://localhost:3000/api/digest \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print('drafts:', len(d['drafts']))"
# Expected: drafts: 1
```

---

## 4. OpenAI drafter quality tests

**Goal:** the drafted plain-English rule should reflect the actual cluster, not boilerplate.

```bash
curl -s -X POST http://localhost:3000/api/demo/reset

# Three different patterns
curl -s -X POST http://localhost:3000/api/demo/simulate -H "content-type: application/json" \
  -d '{"tool":"wire_transfer","count":3,"vendor":"new-vendor","amount":900}' > /dev/null
curl -s -X POST http://localhost:3000/api/demo/simulate -H "content-type: application/json" \
  -d '{"tool":"send_email","count":4}' > /dev/null
curl -s -X POST http://localhost:3000/api/demo/simulate -H "content-type: application/json" \
  -d '{"tool":"delete_record","count":3}' > /dev/null

# Inspect the drafts
curl -s http://localhost:3000/api/digest \
  | python3 -c "
import json,sys
d=json.load(sys.stdin)
for x in d['drafts']:
    print(f\"{x['ruleId']:8} {x['ruleAction']:18} {x['ruleTool']:16} dataClass={x['ruleDataClass']}\")
    print(f\"  plain: {x['plainEnglish']}\")
    print(f\"  reason: {x['reasoning'][:120]}\")
    print()
"
```

What to look for:
- `wire_transfer` should detect `dataClass = PAYMENT` (because of the amount/vendor keywords)
- `send_email` with PII attachments should detect `dataClass = PII`
- `delete_record` rollback should pick `ruleAction = require_approval`, not `deny`
- The `plainEnglish` should be a real sentence under 140 chars, not the local fallback boilerplate ("Pattern repeated N times. Drafting locally because...")

If you see "Drafting locally because the LLM was unavailable" in the reasoning, the OpenAI key is not set or the call failed. Fix:

```bash
echo $OPENAI_API_KEY | head -c 10   # should print sk-... not empty
```

---

## 5. Ratify flow tests

**Goal:** accepting a draft promotes it into the live ledger.

```bash
# Grab the first pending draft
DRAFT_ID=$(curl -s http://localhost:3000/api/digest \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['drafts'][0]['id'])")
echo "Draft to ratify: $DRAFT_ID"

# Ratify
curl -s -X POST http://localhost:3000/api/drafts/$DRAFT_ID/ratify \
  -H "content-type: application/json" \
  -d '{"ratifiedBy":"test-operator"}'

# Expected: ok:true. promotion.mode = "demo" (because ARMORPOLICY_API_BASE is unset).

# Confirm the draft moved out of pending and into ratified
curl -s http://localhost:3000/api/digest | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('pending drafts:', len(d['drafts']))
print('ratified rows:', len(d['ratified']))
for r in d['ratified']:
    print(f\"  {r['ruleId']} {r['ruleAction']} {r['ruleTool']} -> {r['plainEnglish']}\")
"
```

Negative cases:

```bash
# Same draft twice should fail
curl -s -X POST http://localhost:3000/api/drafts/$DRAFT_ID/ratify -H "content-type: application/json" -d '{}'
# Expected: HTTP 409, error "draft already accepted"

# Non-existent draft
curl -s -X POST http://localhost:3000/api/drafts/does-not-exist/ratify -H "content-type: application/json" -d '{}'
# Expected: HTTP 404, "draft not found"
```

### 5a. Ratify with edits

```bash
DRAFT_ID=$(curl -s http://localhost:3000/api/digest \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['drafts'][0]['id'])")

curl -s -X POST http://localhost:3000/api/drafts/$DRAFT_ID/ratify \
  -H "content-type: application/json" \
  -d '{
    "ratifiedBy": "test-operator",
    "edited": {
      "ruleAction": "require_approval",
      "plainEnglish": "Custom override: require approval for all wire transfers."
    }
  }'

# Confirm: status="edited", plainEnglish reflects your override
```

---

## 6. Dismiss flow tests

```bash
# Make a fresh draft
curl -s -X POST http://localhost:3000/api/demo/reset
curl -s -X POST http://localhost:3000/api/demo/simulate -H "content-type: application/json" -d '{"tool":"send_email","count":3}'

DRAFT_ID=$(curl -s http://localhost:3000/api/digest \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['drafts'][0]['id'])")

curl -s -X POST http://localhost:3000/api/drafts/$DRAFT_ID/dismiss
# Expected: ok:true, status="dismissed"

# Should not appear in pending OR ratified
curl -s http://localhost:3000/api/digest | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('pending:', len(d['drafts']), '/ ratified:', len(d['ratified']))
"
# Expected: pending: 0 / ratified: 0
```

---

## 7. Cluster-signature tests

**Goal:** confirm similar but different events still cluster together (the whole point of the "shape" detector).

```bash
curl -s -X POST http://localhost:3000/api/demo/reset

# Three wire transfers with DIFFERENT amounts and vendor names but SAME shape
for i in 1 2 3; do
  curl -s -X POST http://localhost:3000/api/events/ingest \
    -H "content-type: application/json" \
    -d "{\"tool\":\"wire_transfer\",\"action\":\"policy_deny\",\"status\":\"failed\",\"input\":{\"vendor\":\"vendor-$i\",\"amount\":$((500 + i*200)),\"currency\":\"USD\"},\"runId\":\"r$i\"}"
  echo
done

# Trigger the drafter
curl -s -X POST http://localhost:3000/api/miner/run

# Should produce ONE draft (single cluster), not three
curl -s http://localhost:3000/api/digest | python3 -c "
import json,sys
d=json.load(sys.stdin)
print('clusters with drafts:', len(d['drafts']))
print('total events:', d['stats']['eventCount'])
"
# Expected: 1 draft, 3 events
```

Now confirm a different shape produces a separate cluster:

```bash
# Different tool entirely
curl -s -X POST http://localhost:3000/api/events/ingest \
  -H "content-type: application/json" \
  -d '{"tool":"wire_transfer","action":"policy_deny","status":"failed","input":{"recipient":"someone@bank.com","note":"test"}}'
# (different keys = different shape)

curl -s http://localhost:3000/api/miner/run
curl -s http://localhost:3000/api/digest | python3 -c "import json,sys; print('clusters:', json.load(sys.stdin)['stats']['clusterCount'])"
# Expected: 2 clusters
```

---

## 8. Data-class detection tests

**Goal:** the heuristic in `lib/signature.ts` correctly tags PCI / PAYMENT / PHI / PII.

```bash
curl -s -X POST http://localhost:3000/api/demo/reset

# PAYMENT
curl -s -X POST http://localhost:3000/api/events/ingest -H "content-type: application/json" \
  -d '{"tool":"x","action":"policy_deny","status":"failed","input":{"amount":100,"vendor":"v"}}'

# PII
curl -s -X POST http://localhost:3000/api/events/ingest -H "content-type: application/json" \
  -d '{"tool":"x","action":"policy_deny","status":"failed","input":{"email":"a@b.c","name":"x"}}'

# PCI
curl -s -X POST http://localhost:3000/api/events/ingest -H "content-type: application/json" \
  -d '{"tool":"x","action":"policy_deny","status":"failed","input":{"card_number":"4111","cvv":"123"}}'

# PHI
curl -s -X POST http://localhost:3000/api/events/ingest -H "content-type: application/json" \
  -d '{"tool":"x","action":"policy_deny","status":"failed","input":{"diagnosis":"flu","patient":"id"}}'

# Inspect
curl -s http://localhost:3000/api/digest | python3 -c "
import json,sys
d=json.load(sys.stdin)
for e in d['recent']:
    print(f\"{e['tool']:6} {e['dataClass']:8} input={e['input']}\")
"
```

Expected dataClass column: PAYMENT, PII, PCI, PHI in that order.

---

## 9. UI smoke tests (manual)

Open each page in the browser and confirm:

### `/` Cockpit
- [ ] Hero section: title with green-to-violet gradient on "writes itself", blinking caret.
- [ ] "Tap deny on stage" button is visible. Click it - within 2-3 seconds a green toast appears.
- [ ] Four stat cards show numeric values in the JetBrains Mono font.
- [ ] Draft cards have a violet header strip "Drafted by Claude".
- [ ] Clicking the chevron on a draft card expands the reasoning + sample events.
- [ ] Clicking "Accept policy" plays the slide-out animation, then card re-renders below in the ledger.
- [ ] Live audit stream on the right scrolls automatically as events come in (5s polling indicator pulses).
- [ ] Learning curve renders two SVG paths (green line for allowed, red line for denied), with day labels along the X axis.

### `/digest`
- [ ] Header reads "telegram / @PolicyMindBot / weekly digest".
- [ ] "Run drafter now" button on the right works - clicking it returns within ~3s.
- [ ] Cards stack vertically, just like a Telegram chat.

### `/ledger`
- [ ] All ratified rules appear in the table.
- [ ] Action badges color correctly: red for `deny`, amber for `require_approval`, green for `allow`.
- [ ] Override count column shows numbers, turns amber when >= 5.

### `/demo`
- [ ] Three preset rows are clickable.
- [ ] Clicking a preset writes lines into the right-side console (timestamped, color-coded).
- [ ] "Reset everything" button works and the toast confirms.
- [ ] "Open digest" button at the bottom navigates correctly.

### Cross-cutting
- [ ] No emojis as icons (all icons are SVG from lucide).
- [ ] All clickable elements show a pointer cursor on hover.
- [ ] Hover states change color with a smooth ~150ms transition.
- [ ] Focus rings appear when tabbing through buttons.
- [ ] At narrow widths (375px, 768px) layouts do not break or scroll horizontally.
- [ ] No console errors in the browser DevTools.

---

## 10. Live polling test

**Goal:** the cockpit picks up new events without a manual reload.

1. Open `/` in the browser.
2. In a terminal, run:
   ```bash
   curl -s -X POST http://localhost:3000/api/demo/simulate \
     -H "content-type: application/json" \
     -d '{"tool":"wire_transfer","count":3,"vendor":"polling-test"}'
   ```
3. Within 5 seconds, the dashboard stat counts should update and a new draft card should slide in.
4. Click the "polling" pill in the hero - the indicator dot turns gray and updates pause.

---

## 11. Reseed for the demo

To get back to the rich starting state with three example drafts:

```bash
cd /Users/hariharasudhan/Armoriq/hack/policymind
npm run db:seed
```

This wipes everything and re-creates 60 background success events plus three deliberate clusters (wire transfers, PII emails, delete rollbacks). Useful before any live demo.

---

## 12. Performance / scale spot check

Send 100 events at once:

```bash
for i in $(seq 1 100); do
  curl -s -X POST http://localhost:3000/api/events/ingest \
    -H "content-type: application/json" \
    -d "{\"tool\":\"bulk_test\",\"action\":\"tool_call\",\"status\":\"success\",\"input\":{\"i\":$i}}" > /dev/null &
done
wait
```

Expected: all complete within a few seconds. Visit `/` and confirm `eventCount` jumped by 100.

---

## 13. Telegram bot tests

The bot **@fresh_test_aiq_bot** is wired up. Two pieces have to be running:

1. **Next.js dev server** (`npm run dev` on port 3000)
2. **Polling worker** (`npm run telegram:bot` in a second terminal)

If you ever see `Conflict: terminated by other getUpdates`, another machine is polling the same token. Stop those workers, or call:

```bash
curl -s "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/close"
```

then restart the worker.

### 13a. First-touch registration (`/start`)

1. In Telegram, search **@fresh_test_aiq_bot**.
2. Send `/start`.
3. **Expected:** the bot replies with a "Subscribed." card and the help text.
4. Verify the row landed in Postgres:
   ```bash
   npx tsx -e "import {prisma} from './src/lib/db';(async()=>{const s=await prisma.telegramSubscriber.findMany();console.log(s);await prisma.\$disconnect();})()"
   ```
   You should see one row with your `chatId`, `username`, `firstName`.

### 13b. Pull the digest into Telegram

In the same chat, send `/digest`.
- If pending drafts exist: each one arrives as a separate card with the proposed `Policy new: …`, dry-run stats, and three inline buttons (`Accept policy`, `Dismiss`, `View in dashboard`).
- If no drafts: bot replies with the "No drafts pending" message and a hint to try `/simulate`.

### 13c. The slide-7 demo: deny once, watch policy land

In Telegram send:
```
/simulate
```
or
```
/simulate wire_transfer
```

**Expected sequence within ~3 seconds:**
1. Bot replies "Simulated 3 wire-transfer denies. Drafter created 1 new draft."
2. A second message arrives — the actual draft card with Accept / Dismiss / View buttons.

This is the deck's "deny once on stage, watch the policy write itself" moment, in chat.

### 13d. One-tap ratify

Tap **Accept policy** on a draft card.
- Bot replies *to the same message*, replacing the card with a green "POLICY RATIFIED" message that includes the `policyN` id and a link to the ledger.
- Inline keyboard disappears.
- Open `http://localhost:3000/ledger` in the browser — the rule is there.

### 13e. Dismiss

Tap **Dismiss** on another draft.
- Card replaces itself with "DRAFT DISMISSED" copy.
- Visit `http://localhost:3000/digest` — that draft no longer appears.
- Visit `/ledger` — no rule was added.

### 13f. Other commands

| Command | Expected |
|---|---|
| `/policies` (or `/ledger`) | List of all live ratified rules with their plain-English summaries |
| `/help` | Help card with bot username and dashboard URL |
| `/reset` | Clears all events, drafts, ratified rules, draft-message links. Replies with "Reset" confirmation. |
| Anything else (e.g. `/foo`) | "Unknown command. Try /help." |

### 13g. Auto-push from the web app

This proves the bidirectional bridge works.

1. Make sure you've sent `/start` to the bot at least once (so your chat is subscribed).
2. In a browser, open `http://localhost:3000/demo`.
3. Click "Wire transfer to a new vendor".
4. **Within ~3 seconds**, a draft card appears in your Telegram chat — pushed by the simulate endpoint.
5. Inspect the simulate response:
   ```bash
   curl -s -X POST http://localhost:3000/api/demo/simulate \
     -H "content-type: application/json" \
     -d '{"tool":"wire_transfer","count":3}' | python3 -m json.tool
   ```
   You should see a `telegram` block: `{"chats": 1, "messages": 1}` (or however many subscribed chats / drafts).

### 13h. Manual broadcast

Push every pending draft to every subscribed chat:

```bash
curl -s -X POST http://localhost:3000/api/telegram/deliver \
  -H "content-type: application/json" -d '{}'
# Expected: {"ok":true,"mode":"broadcast","drafts":N,"chats":M,"messages":N*M}
```

Push to one specific chat (replace with your chatId from 13a):

```bash
curl -s -X POST http://localhost:3000/api/telegram/deliver \
  -H "content-type: application/json" -d '{"chatId":"123456789"}'
```

### 13i. Send any message via the bot (debug helper)

```bash
npx tsx scripts/telegram-send.ts <yourChatId> "test message"
```

Useful when verifying the token works without the worker running.

### 13j. Common issues

| Symptom | Cause | Fix |
|---|---|---|
| Worker logs "Conflict" repeatedly | Another polling client is alive on the same token | Stop the other client; or `curl .../close` then restart worker |
| Bot replies "Unknown command" to `/start` | The slash got auto-replaced by smart quotes | Type `/start` literally |
| `/simulate` works but no Telegram message arrives | Your chat hasn't been registered yet | Send `/start` first |
| `429 Too Many Requests: retry after N` | You've called `close` too many times | Just wait — long-polling works regardless |

---

## 15. What is NOT yet built

These are scoped out of the current build. Decide whether you need them before the final demo.

| Feature | Status | Where it would go |
|---|---|---|
| Slack mirror of the digest | not built | needs Slack app + signing secret |
| False-positive auto-relax run | hooks exist (`miner.findPoliciesNeedingRelax`) but no scheduled re-drafting yet | add to the cron that calls `runDrafterBatch` |
| Real ArmorPolicy promotion | wired but inactive (no `ARMORPOLICY_API_BASE` set) | set the env var pointing at your IAP endpoint |
| Inline draft editing in the UI | button is disabled | hook up a small form modal in `DraftCard.tsx` |
| Multi-org isolation | code uses `POLICYMIND_ORG_ID` env, not auth | replace with real session/api-key once wired |

---

## 16. Quick "did anything regress" smoke

When in doubt, run this one-liner. It exercises the full loop and prints a single line summarizing health.

```bash
( curl -s -X POST http://localhost:3000/api/demo/reset > /dev/null && \
  curl -s -X POST http://localhost:3000/api/demo/simulate -H "content-type: application/json" -d '{"tool":"smoke_test","count":3}' > /dev/null && \
  ID=$(curl -s http://localhost:3000/api/digest | python3 -c "import json,sys; print(json.load(sys.stdin)['drafts'][0]['id'])") && \
  curl -s -X POST http://localhost:3000/api/drafts/$ID/ratify -H "content-type: application/json" -d '{}' > /dev/null && \
  curl -s http://localhost:3000/api/digest | python3 -c "
import json,sys
d=json.load(sys.stdin)
ok = d['stats']['eventCount']>=3 and d['stats']['ratifiedActive']>=1 and d['stats']['draftPending']==0
print('SMOKE:', 'PASS' if ok else 'FAIL', d['stats'])
" )
```

Expected: `SMOKE: PASS {...}`.

---

## Appendix: payload reference

### POST /api/events/ingest

```json
{
  "tool": "string (required)",
  "action": "tool_call | policy_deny | rollback | override (required)",
  "status": "success | failed (required)",
  "input": { "...": "...required object..." },
  "dataClass": "PCI | PAYMENT | PHI | PII | NONE (optional, auto-detected)",
  "output": "any (optional)",
  "errorMessage": "string (optional)",
  "runId": "string (optional)",
  "planId": "string (optional)",
  "userId": "string (optional)",
  "agentId": "string (optional)",
  "durationMs": 0,
  "executedAt": "ISO 8601 (optional, defaults to now)",
  "orgId": "string (optional, defaults to demo-org)"
}
```

May also be sent as a JSON array for batch ingest.

### POST /api/drafts/:id/ratify

```json
{
  "ratifiedBy": "string (optional)",
  "edited": {
    "ruleAction": "allow | deny | require_approval (optional)",
    "ruleTool": "string (optional)",
    "ruleDataClass": "PCI | PAYMENT | PHI | PII | NONE (optional)",
    "ruleParams": { "...": "..." },
    "plainEnglish": "string (optional)"
  }
}
```

If `edited` is omitted, the draft is accepted as-is. If present, the draft is marked `edited` and the override fields replace the originals before promotion.

### POST /api/demo/simulate

```json
{
  "tool": "wire_transfer (default)",
  "count": 3,
  "vendor": "new-vendor-acme (default)",
  "amount": 750
}
```

Emits `count` synthetic deny events with the same shape, then runs the drafter once.
