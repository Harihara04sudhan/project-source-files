import { ingestEvent } from "../src/lib/miner";
import { runDrafterBatch } from "../src/lib/drafter";
import { prisma } from "../src/lib/db";

// Seed a realistic week of audit events so the dashboard isn't empty on
// first load. By default we DO NOT run the drafter — drafts should appear
// only when the operator triggers the loop (via /agent, /advisor, or /demo).
// Pass `--with-drafts` (or set SEED_WITH_DRAFTS=1) to also run the drafter
// and pre-populate /digest. Useful for a 2-minute pitch where you want
// drafts visible on the first load.
async function main() {
  const wantDrafts =
    process.argv.includes("--with-drafts") ||
    process.env.SEED_WITH_DRAFTS === "1";
  console.log("[seed] clearing prior demo data");
  await prisma.ratifiedPolicy.deleteMany();
  await prisma.policyDraft.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.eventCluster.deleteMany();
  await prisma.weeklyDigest.deleteMany();

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;

  // Background of legitimate successful tool calls.
  const successPool: Array<{ tool: string; input: Record<string, unknown> }> = [
    { tool: "send_email", input: { to: "alice@armoriq.io", subject: "weekly update" } },
    { tool: "create_invoice", input: { customer: "acme-corp", amount: 200 } },
    { tool: "search_db", input: { table: "users", filter: "id" } },
    { tool: "post_message", input: { channel: "general", text: "deploy ok" } },
  ];
  for (let i = 0; i < 60; i++) {
    const t = successPool[i % successPool.length];
    await ingestEvent({
      tool: t.tool,
      action: "tool_call",
      status: "success",
      input: t.input,
      runId: `r-bg-${i}`,
      executedAt: new Date(now - i * (day / 12)).toISOString(),
      durationMs: 120 + (i % 80),
    });
  }

  // Cluster 1 — wire_transfer denies on new vendors
  for (let i = 0; i < 5; i++) {
    await ingestEvent({
      tool: "wire_transfer",
      action: "policy_deny",
      status: "failed",
      input: {
        vendor: `new-vendor-${i}`,
        amount: 500 + i * 250,
        currency: "USD",
        memo: "consulting",
      },
      errorMessage: "operator tapped Deny",
      runId: `r-wire-${i}`,
      executedAt: new Date(now - (i + 1) * 4 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Cluster 2 — send_email denies with PII attachment
  for (let i = 0; i < 4; i++) {
    await ingestEvent({
      tool: "send_email",
      action: "policy_deny",
      status: "failed",
      input: {
        to: `external+${i}@partners.com`,
        subject: "customer list",
        attachments: ["pii_export.csv"],
        email: `target+${i}@example.com`,
      },
      errorMessage: "operator tapped Deny",
      runId: `r-email-${i}`,
      executedAt: new Date(now - (i + 1) * 6 * 60 * 60 * 1000).toISOString(),
    });
  }

  // Cluster 3 — delete_record rollbacks
  for (let i = 0; i < 3; i++) {
    await ingestEvent({
      tool: "delete_record",
      action: "rollback",
      status: "failed",
      input: { table: "customers", id: `cust-${i}`, reason: "human reverted" },
      errorMessage: "rollback issued by operator",
      runId: `r-del-${i}`,
      executedAt: new Date(now - (i + 1) * 8 * 60 * 60 * 1000).toISOString(),
    });
  }

  if (wantDrafts) {
    console.log("[seed] running drafter batch (--with-drafts)");
    const drafter = await runDrafterBatch();
    console.log("[seed] drafter:", drafter);
  } else {
    console.log(
      "[seed] skipping drafter — drafts will be created when /agent, /advisor, or /demo trigger them",
    );
  }
  console.log("[seed] done");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
