import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { promoteDraftToLive } from "@/lib/armorpolicy";
import { z } from "zod";

const bodySchema = z
  .object({
    ratifiedBy: z.string().optional(),
    edited: z
      .object({
        ruleAction: z.enum(["allow", "deny", "require_approval"]).optional(),
        ruleTool: z.string().optional(),
        ruleDataClass: z.enum(["PCI", "PAYMENT", "PHI", "PII", "NONE"]).optional(),
        ruleParams: z.record(z.string(), z.any()).nullable().optional(),
        plainEnglish: z.string().optional(),
      })
      .optional(),
  })
  .optional();

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  let body: z.infer<typeof bodySchema> = undefined;
  try {
    if (req.headers.get("content-length") !== "0") {
      const json = await req.json();
      const parsed = bodySchema.safeParse(json);
      if (!parsed.success) {
        return NextResponse.json({ ok: false, error: parsed.error.flatten() }, { status: 400 });
      }
      body = parsed.data;
    }
  } catch {
    body = undefined;
  }

  const draft = await prisma.policyDraft.findUnique({ where: { id } });
  if (!draft) {
    return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });
  }
  if (draft.status !== "pending") {
    return NextResponse.json(
      { ok: false, error: `draft already ${draft.status}` },
      { status: 409 },
    );
  }

  const edited = body?.edited;
  const finalDraft = await prisma.policyDraft.update({
    where: { id },
    data: {
      status: edited ? "edited" : "accepted",
      decidedAt: new Date(),
      decidedBy: body?.ratifiedBy ?? null,
      ...(edited
        ? {
            ruleAction: edited.ruleAction ?? draft.ruleAction,
            ruleTool: edited.ruleTool ?? draft.ruleTool,
            ruleDataClass: edited.ruleDataClass ?? draft.ruleDataClass,
            ruleParams: (edited.ruleParams ?? draft.ruleParams ?? {}) as object,
            plainEnglish: edited.plainEnglish ?? draft.plainEnglish,
          }
        : {}),
    },
  });

  const promotion = await promoteDraftToLive(finalDraft);

  // Always record in the local ratified ledger so the demo works without
  // ArmorPolicy being reachable. If a live promotion failed, we mark the row
  // as inactive so it's clear in the UI.
  const ratified = await prisma.ratifiedPolicy.create({
    data: {
      orgId: finalDraft.orgId,
      draftId: finalDraft.id,
      ruleAction: finalDraft.ruleAction,
      ruleTool: finalDraft.ruleTool,
      ruleDataClass: finalDraft.ruleDataClass,
      ruleParams: (finalDraft.ruleParams ?? {}) as object,
      ruleId: finalDraft.ruleId,
      plainEnglish: finalDraft.plainEnglish,
      ratifiedBy: body?.ratifiedBy ?? null,
      active: promotion.ok,
      promotionMode: promotion.mode,
      armorPlanId: promotion.planId ?? null,
      armorIntentRef: promotion.intentReference ?? null,
      armorPlanHash: promotion.planHash ?? null,
      armorMerkleRoot: promotion.merkleRoot ?? null,
    },
  });

  return NextResponse.json({ ok: true, draft: finalDraft, ratified, promotion });
}
