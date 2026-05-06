import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function POST() {
  await prisma.ratifiedPolicy.deleteMany();
  await prisma.policyDraft.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.eventCluster.deleteMany();
  await prisma.weeklyDigest.deleteMany();
  return NextResponse.json({ ok: true });
}
