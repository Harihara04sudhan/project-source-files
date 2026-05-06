# Live demo flow

The end-to-end story for showing PolicyMind to a customer or prospect: a real
person types a real request, gpt-5.5 picks a real tool, ArmorPolicy decides on
the call, the audit lands in PolicyMind, a draft is written, and one tap
promotes it to a live signed policy.

This document is the script. Follow it top to bottom and the loop closes in
front of the audience in under five minutes.

## Before the demo

Confirm in this order, otherwise the live promotion step will silently fall
back to demo mode and you will not see real `plan_id` / `merkle_root` values.

1. `.env` has all of these set:
   - `DATABASE_URL` (Neon Postgres)
   - `OPENAI_API_KEY` (sk-proj-... or sk-...)
   - `ARMORPOLICY_API_BASE` (`https://api.armoriq.ai` for `ak_live_*` keys, or
     `https://armorpolicy-api.armoriq.ai` for `ak_claw_*`)
   - `ARMORPOLICY_PROXY_BASE` (`https://proxy.armoriq.ai` or
     `https://customer-proxy.armoriq.ai`)
   - `ARMORPOLICY_API_KEY` (your `ak_live_*` or `ak_claw_*` key)

   To get the ArmorPolicy API key, go to **https://platform.armoriq.ai**, sign
   in, and create a key from Dashboard -> API Keys. Copy the value (it starts
   with `ak_live_`, `ak_test_`, or `ak_claw_`) into `ARMORPOLICY_API_KEY`. If
   the key is missing the loop still works, but ratified drafts only land in
   the local PolicyMind ledger and the "ArmorPolicy Proof" badge will read
   DEMO instead of carrying a real `plan_id` and `merkle_root`.
2. Migrations applied and seed data loaded:
   ```bash
   npx prisma migrate deploy
   npm run db:seed
   ```
3. Dev server running:
   ```bash
   npm run dev
   ```
4. Open these tabs in the same browser:
   - http://localhost:3000/             (the cockpit)
   - http://localhost:3000/agent       (the chat console — driver tab)
   - http://localhost:3000/advisor     (the policy advisor — memory chat)
   - http://localhost:3000/digest      (the weekly digest)
   - http://localhost:3000/ledger      (the live policy ledger)

Optional but useful: open `tail -f /tmp/policymind-dev.log` (or wherever you
piped `npm run dev`) on a side monitor so the audience can see API calls
firing in real time.

## The five-minute script

### Beat 1 — establish the loop

Open the cockpit tab. Talk through the four stat cards: audit events, pattern
clusters, drafts pending, live policies. Point at the live audit stream on the
right and the policy ledger at the bottom.

The expected pre-state is:

- **Audit events:** ~70+ (a seeded week of background traffic)
- **Pattern clusters:** 4 (already at or near threshold)
- **Drafts pending:** **0**
- **Live policies:** **0**

The empty digest and empty ledger are the point. Every artifact you'll show
in the next five minutes will be authored from a real interaction the
audience watches — not pre-baked into a seed.

> "There are no policies yet. There are no drafts yet. Every rule you'll see
> is going to write itself from the actions we take in the next five
> minutes. Watch."

### Beat 2 — trigger the first draft from natural language

Switch to the **Agent** tab. Click the first preset:

```
Wire $750 to a new vendor called Acme Industries for consulting services
```

What the audience sees in one card:

- **User prompt** — the natural language request
- **gpt-5.5 picked tool** — `wire_transfer({ amount: 750, vendor: "Acme Industries", currency: "USD", memo: "Consulting services" })`
- **ArmorPolicy verdict** — ALLOWED. There's no rule yet. The call would
  have gone through.
- **Ingested as event** — event id, cluster id, current count
- **drafter fired — created N new drafts** — the seed pre-loaded primed
  clusters at threshold. Every agent call is a chance to drain that queue,
  so the very first prompt also drafts policies for the wire_transfer,
  send_email, and delete_record patterns from the seeded week of traffic.

Talking point: *"That single call did two things. The agent's request would
have shipped money — but more importantly, it woke up the drafter. Watch
the digest."*

### Beat 3 — ratify the first draft

Click the `/digest` link in the card or switch to the **Digest** tab. The
fresh draft sits at the top:

- a `Drafted by Claude` byline and a fresh `policyN` id
- the deny / require-approval action and the tool involved
- a one-line plain-English rule the operator can read in chat
- a diff-style `+ Policy new: ...` proposal
- dry-run match counts (how many past events this rule would have caught)
- expandable reasoning + the underlying events

Click **Show reasoning & events** to read gpt-5.5's explanation. Then click
**Accept policy**.

Switch to the **Ledger** tab. The new rule appears at the top. The
"ArmorPolicy Proof" badge will read DEMO if the live ArmorPolicy key is
missing, or it will carry a real `plan_id` / `merkle_root` /
`intent_reference` / JWT preview if the ArmorPolicy key is configured.

Talking point: *"That ratification just minted a signed intent token at
ArmorPolicy's IAP. The plan hash and Merkle root are now in the audit
chain. This rule is enforced on the very next tool call."*

### Beat 4 — close the loop visibly

Back to the **Agent** tab. Click the same wire transfer preset again:

```
Wire $750 to a new vendor called Acme Industries for consulting services
```

This time the verdict is **DENIED** by the rule you ratified ninety
seconds ago. The agent's call is blocked. The audience just watched the
loop close end-to-end: nothing → draft → live → enforced.

### Beat 5 — show a clean call passing (contrast)

Same tab. Click the **Internal email** preset:

```
Send Alice a weekly status update email
```

ALLOWED. gpt-5.5 even builds a real email body. PolicyMind only proposes
rules where the operators have shown a pattern — routine traffic isn't
disrupted.

### Beat 6 — show the advisor (memory chat)

If the audience is more interested in *how do I decide what policy to add* than
*how does the closed loop work*, switch to the **Advisor** tab instead of (or
in addition to) the cluster-drafted flow.

Talking point: *"Sometimes you don't want to wait for three repeats. You
already know the pattern is dangerous. The advisor lets you talk it through.
It already knows your live policies, recent denies, and the patterns
brewing — it's not a generic chatbot."*

Click any of the five starter cards. Recommended for a first run:

> A junior engineer almost emailed a customer list to an external partner
> yesterday. ArmorPolicy didn't catch it because the policy is too narrow.
> What should we tighten?

The advisor responds in two ways depending on the scenario:

1. **It proposes a draft** — a "Proposed draft &middot; policyN" card appears
   below the assistant message with the rule, the action pill (deny /
   require approval), the tool, the data class, and a "Review &amp; ratify
   in /digest" link. Click through to ratify it the normal way.
2. **It refuses to draft a duplicate** — if your scenario is already covered
   by a live policy, the advisor points at the existing ruleId and explains
   why a new rule would be redundant. (This is intentional and worth
   calling out: "It won't blindly file drafts.")

Continue the conversation — the thread persists across tabs. Try asking
follow-ups like:

```
What's the single highest-leverage rule we don't have yet?
```
```
Which of our live policies do operators override most often?
```

Drafts filed by the advisor land on `/digest` with the same `[Advisor-proposed]`
reasoning prefix so it's clear how they were authored. They ratify through the
exact same path as cluster-drafted rules.

Talking point: *"Two ways to grow the policy set. The agent loop catches what
operators repeatedly tap deny on. The advisor catches what the operator can
already articulate. Both file the same shape of draft."*

## Reset between demos

```bash
curl -X POST http://localhost:3000/api/demo/reset
npm run db:seed
```

This wipes drafts, clusters, events, and ratified policies, then reloads
the canonical week of background traffic. After the reset you start at
**0 drafts / 0 live policies** so every artifact in the demo gets authored
in front of the audience.

If you want the older "drafts already pre-cooked" behavior (handy for a
two-minute pitch where you don't want the buildup), use:

```bash
npm run db:seed:full
```

That re-runs the cluster drafter at seed time and lands 3 drafts in
`/digest` on first load.

## Useful presets to keep on hand

| Prompt | Expected tool | Expected verdict (with seed data) |
|---|---|---|
| Wire $750 to a new vendor called Acme Industries for consulting services | wire_transfer | DENIED (policy4) |
| Email the customer list to external+partner@partners.com | send_email | DENIED (policy2 PII) |
| Delete customer record cust-42 from the customers table | delete_record | APPROVAL\_NEEDED (policy3) |
| Send Alice a weekly status update email | send_email | ALLOWED |
| Search the users table for anyone signed up this week | search_db | ALLOWED |
| Post a deploy notification to the engineering channel | post_message | ALLOWED |
| Create an invoice for Acme Corp for $200 | create_invoice | ALLOWED |

## What to point at if someone asks "where is the ArmorPolicy integration"

Open [`src/lib/armorpolicy.ts`](../src/lib/armorpolicy.ts). The relevant pieces:

- `buildPolicyUpdatePlan(draft)` — the `{ goal, steps: [{ action: "policy_update", ... }] }`
  shape sent into ArmorPolicy IAP
- `promoteDraftToLive(draft)` — `POST ${API_BASE}/iap/sdk/token` with the
  `X-API-Key` header, returns `plan_id`, `plan_hash`, `intent_reference`,
  `merkle_root`, `jwt_token`
- `probeArmorPolicy()` — health-check the proxy and mint a no-op token to
  validate the API key end-to-end

The agent run path that turns a chat prompt into an ingested event is in
[`src/app/api/agent/run/route.ts`](../src/app/api/agent/run/route.ts).
