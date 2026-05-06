// Shared types — the audit event shape mirrors what ArmorPolicy emits via
// CreateAuditLogDto in @armoriq/armorpolicy and what the dashboard consumes.

import type { DataClass, EventAction, EventStatus, RuleAction, DraftStatus } from "@prisma/client";

export type IngestEvent = {
  orgId?: string;
  runId?: string;
  planId?: string;
  userId?: string;
  agentId?: string;
  tool: string;
  action: EventAction;
  status: EventStatus;
  dataClass?: DataClass;
  input: Record<string, unknown>;
  output?: unknown;
  errorMessage?: string;
  durationMs?: number;
  executedAt?: string;
};

export type ClusterSignaturePayload = {
  tool: string;
  action: EventAction;
  dataClass: DataClass;
  argShape: Record<string, unknown>;
};

export type DraftedRule = {
  ruleId: string;
  ruleAction: RuleAction;
  ruleTool: string;
  ruleDataClass: DataClass;
  ruleParams?: Record<string, unknown>;
  plainEnglish: string;
  reasoning: string;
};

export type DigestCardSummary = {
  id: string;
  status: DraftStatus;
  plainEnglish: string;
  ruleId: string;
  ruleAction: RuleAction;
  ruleTool: string;
  ruleDataClass: DataClass;
  ruleParams?: Record<string, unknown> | null;
  reasoning: string;
  dryRunMatched: number;
  dryRunFalsePos: number;
  basedOnEventIds: string[];
  cluster: {
    id: string;
    tool: string;
    count: number;
    firstSeenAt: string;
    lastSeenAt: string;
    sampleEvents: Array<{
      id: string;
      runId: string | null;
      action: EventAction;
      status: EventStatus;
      input: unknown;
      executedAt: string;
    }>;
  };
  createdAt: string;
};

export type RatifiedSummary = {
  id: string;
  ruleId: string;
  ruleAction: RuleAction;
  ruleTool: string;
  ruleDataClass: DataClass;
  ruleParams?: Record<string, unknown> | null;
  plainEnglish: string;
  ratifiedAt: string;
  ratifiedBy: string | null;
  overrideCount: number;
  active: boolean;
  version: number;
  promotionMode?: string | null;
  armorPlanId?: string | null;
  armorIntentRef?: string | null;
  armorPlanHash?: string | null;
  armorMerkleRoot?: string | null;
};
