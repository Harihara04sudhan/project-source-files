import { createHash } from "node:crypto";
import type { DataClass, EventAction } from "@prisma/client";

// Build a stable shape from raw input args so that
// {amount: 500, vendor: "Acme"} and {amount: 700, vendor: "Beta"} cluster together.
// We keep keys, drop values (replacing with placeholders), and bucket numbers.

export type ArgShape = Record<string, unknown>;

const NUMERIC_BUCKETS = [0, 100, 500, 1000, 10_000, 100_000];

function bucketNumber(n: number): string {
  if (!Number.isFinite(n)) return "<num:nan>";
  for (let i = NUMERIC_BUCKETS.length - 1; i >= 0; i--) {
    if (n >= NUMERIC_BUCKETS[i]) return `<num:>=${NUMERIC_BUCKETS[i]}>`;
  }
  return "<num:<0>";
}

function classifyValue(v: unknown): unknown {
  if (v === null || v === undefined) return "<null>";
  if (typeof v === "boolean") return "<bool>";
  if (typeof v === "number") return bucketNumber(v);
  if (typeof v === "string") {
    if (/^\d+$/.test(v)) return bucketNumber(Number(v));
    if (v.length > 64) return "<str:long>";
    if (/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(v)) return "<email>";
    if (/^https?:\/\//.test(v)) return "<url>";
    return "<str>";
  }
  if (Array.isArray(v)) {
    return v.length === 0 ? "<arr:0>" : ["<arr>", classifyValue(v[0])];
  }
  if (typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(obj).sort()) {
      out[k] = classifyValue(obj[k]);
    }
    return out;
  }
  return "<unknown>";
}

export function shapeArgs(input: Record<string, unknown> | undefined | null): ArgShape {
  if (!input) return {};
  return classifyValue(input) as ArgShape;
}

export function clusterSignature(args: {
  tool: string;
  action: EventAction;
  dataClass: DataClass;
  argShape: ArgShape;
}): string {
  const payload = JSON.stringify({
    tool: args.tool,
    action: args.action,
    dataClass: args.dataClass,
    argShape: args.argShape,
  });
  return createHash("sha256").update(payload).digest("hex").slice(0, 32);
}

// Lightweight data-class detector mirroring ArmorPolicy's heuristic.
const PII_KEYS = ["email", "phone", "ssn", "address", "name"];
const PAYMENT_KEYS = ["amount", "card", "iban", "wire", "vendor", "transfer", "stripe"];
const PHI_KEYS = ["diagnosis", "patient", "medical", "prescription", "icd"];
const PCI_KEYS = ["pan", "cardnumber", "card_number", "cvv", "expiry"];

export function detectDataClass(input: Record<string, unknown> | undefined): DataClass {
  if (!input) return "NONE";
  const keys = Object.keys(input).join(" ").toLowerCase();
  const blob = JSON.stringify(input).toLowerCase();
  if (PCI_KEYS.some((k) => keys.includes(k) || blob.includes(k))) return "PCI";
  if (PAYMENT_KEYS.some((k) => keys.includes(k) || blob.includes(k))) return "PAYMENT";
  if (PHI_KEYS.some((k) => keys.includes(k) || blob.includes(k))) return "PHI";
  if (PII_KEYS.some((k) => keys.includes(k) || blob.includes(k))) return "PII";
  return "NONE";
}
