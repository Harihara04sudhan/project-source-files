import { NextResponse } from "next/server";
import { getDashboardStats, getLearningCurve, getRecentEvents, listPendingDigest, listRatifiedPolicies } from "@/lib/digest";

export async function GET() {
  const [drafts, ratified, stats, recent, curve] = await Promise.all([
    listPendingDigest(),
    listRatifiedPolicies(),
    getDashboardStats(),
    getRecentEvents(undefined, 30),
    getLearningCurve(),
  ]);
  return NextResponse.json({ drafts, ratified, stats, recent, curve });
}
