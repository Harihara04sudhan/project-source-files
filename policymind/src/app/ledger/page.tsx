import { TopBar } from "@/components/TopBar";
import { Panel } from "@/components/Panel";
import { Stat } from "@/components/Stat";
import { listRatifiedPolicies } from "@/lib/digest";
import { prisma } from "@/lib/db";
import { FileCheck, ShieldCheck, AlertTriangle, Hash } from "lucide-react";
import { Badge } from "@/components/Badge";

export const dynamic = "force-dynamic";

export default async function LedgerPage() {
  const orgId = process.env.POLICYMIND_ORG_ID ?? "demo-org";
  const [rows, totalRatified, dismissed, edited] = await Promise.all([
    listRatifiedPolicies(orgId),
    prisma.ratifiedPolicy.count({ where: { orgId, active: true } }),
    prisma.policyDraft.count({ where: { orgId, status: "dismissed" } }),
    prisma.policyDraft.count({ where: { orgId, status: "edited" } }),
  ]);
  return (
    <>
      <TopBar />
      <main className="mx-auto max-w-[1200px] flex-1 space-y-6 px-6 py-8">
        <header>
          <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--text-dim)]">
            <FileCheck className="size-3.5 text-[color:var(--accent)]" />
            ratified policy ledger
          </div>
          <h1 className="mt-1 text-[26px] font-semibold tracking-tight text-[color:var(--text)]">
            Live policies, with provenance
          </h1>
          <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-[color:var(--text-muted)]">
            Every active rule. Where it came from, when it was ratified, how often it&apos;s been overridden. Click a row to see the original draft and the events that produced it.
          </p>
        </header>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Stat label="Active rules" value={totalRatified} tone="accent" icon={<ShieldCheck className="size-4" />} />
          <Stat label="Drafts dismissed" value={dismissed} tone="neutral" icon={<AlertTriangle className="size-4" />} />
          <Stat label="Drafts edited" value={edited} tone="violet" icon={<Hash className="size-4" />} />
        </div>

        <Panel title="Active rules" subtitle="Enforcing now">
          <div className="overflow-x-auto">
            <table className="min-w-full font-mono text-[12.5px]">
              <thead>
                <tr className="border-b border-[color:var(--line)] text-left text-[10px] uppercase tracking-[0.16em] text-[color:var(--text-dim)]">
                  <th className="px-4 py-2.5">Rule</th>
                  <th className="px-4 py-2.5">Action</th>
                  <th className="px-4 py-2.5">Tool</th>
                  <th className="px-4 py-2.5">Class</th>
                  <th className="px-4 py-2.5">Plain English</th>
                  <th className="px-4 py-2.5">ArmorPolicy proof</th>
                  <th className="px-4 py-2.5 text-right">Overrides</th>
                  <th className="px-4 py-2.5 text-right">Ratified</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[color:var(--line)]">
                {rows.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-4 py-10 text-center text-xs text-[color:var(--text-dim)]">
                      No ratified rules yet. Accept a draft from the digest.
                    </td>
                  </tr>
                ) : (
                  rows.map((r) => (
                    <tr key={r.id} className="hover:bg-[color:var(--bg-2)]">
                      <td className="px-4 py-3 text-[color:var(--violet)]">{r.ruleId}</td>
                      <td className="px-4 py-3">
                        <Badge
                          tone={
                            r.ruleAction === "deny"
                              ? "danger"
                              : r.ruleAction === "require_approval"
                                ? "warn"
                                : "accent"
                          }
                        >
                          {r.ruleAction.replace("_", " ")}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-[color:var(--text)]">{r.ruleTool}</td>
                      <td className="px-4 py-3 text-[color:var(--text-muted)]">{r.ruleDataClass}</td>
                      <td className="max-w-md whitespace-normal break-words px-4 py-3 font-sans text-[color:var(--text)]/90">
                        {r.plainEnglish}
                      </td>
                      <td className="px-4 py-3">
                        {r.promotionMode === "live" && r.armorIntentRef ? (
                          <div className="flex flex-col gap-0.5">
                            <Badge tone="accent" className="!w-fit">
                              <ShieldCheck className="size-3" /> live · signed
                            </Badge>
                            <span
                              className="text-[10px] text-[color:var(--text-dim)]"
                              title={`merkle ${r.armorMerkleRoot ?? ""}`}
                            >
                              {r.armorIntentRef.slice(0, 22)}…
                            </span>
                          </div>
                        ) : (
                          <Badge tone="neutral">demo</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={r.overrideCount >= 5 ? "text-[color:var(--warn)]" : "text-[color:var(--text-muted)]"}>
                          {r.overrideCount}×
                        </span>
                      </td>
                      <td suppressHydrationWarning className="px-4 py-3 text-right text-[color:var(--text-dim)]">{new Date(r.ratifiedAt).toLocaleDateString("en-GB")}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Panel>
      </main>
    </>
  );
}
