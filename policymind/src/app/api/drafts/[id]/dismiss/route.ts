import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const draft = await prisma.policyDraft.findUnique({ where: { id } });
  if (!draft) return NextResponse.json({ ok: false, error: "draft not found" }, { status: 404 });
  if (draft.status !== "pending") {
    return NextResponse.json({ ok: false, error: `already ${draft.status}` }, { status: 409 });
  }
  const updated = await prisma.policyDraft.update({
    where: { id },
    data: { status: "dismissed", decidedAt: new Date() },
  });
  return NextResponse.json({ ok: true, draft: updated });
}
