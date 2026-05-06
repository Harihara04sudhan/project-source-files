import { NextResponse } from "next/server";
import { probeArmorPolicy } from "@/lib/armorpolicy";

// Sanity-check connectivity and auth against the configured ArmorPolicy API
// base. Hits each candidate policy path with a tiny POST and reports which
// returned 2xx, which auth'd correctly (vs 401/403), and which 404'd.
export async function GET() {
  const result = await probeArmorPolicy();
  return NextResponse.json(result);
}

export async function POST() {
  const result = await probeArmorPolicy();
  return NextResponse.json(result);
}
