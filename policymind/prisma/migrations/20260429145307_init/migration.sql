-- CreateEnum
CREATE TYPE "EventAction" AS ENUM ('tool_call', 'policy_deny', 'rollback', 'override');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('success', 'failed');

-- CreateEnum
CREATE TYPE "DataClass" AS ENUM ('PCI', 'PAYMENT', 'PHI', 'PII', 'NONE');

-- CreateEnum
CREATE TYPE "DraftStatus" AS ENUM ('pending', 'accepted', 'edited', 'dismissed');

-- CreateEnum
CREATE TYPE "RuleAction" AS ENUM ('allow', 'deny', 'require_approval');

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "runId" TEXT,
    "planId" TEXT,
    "userId" TEXT,
    "agentId" TEXT,
    "tool" TEXT NOT NULL,
    "action" "EventAction" NOT NULL,
    "status" "EventStatus" NOT NULL,
    "dataClass" "DataClass" NOT NULL DEFAULT 'NONE',
    "input" JSONB NOT NULL,
    "output" JSONB,
    "errorMessage" TEXT,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "executedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "clusterId" TEXT,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventCluster" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "tool" TEXT NOT NULL,
    "action" "EventAction" NOT NULL,
    "dataClass" "DataClass" NOT NULL DEFAULT 'NONE',
    "argShape" JSONB NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "firstSeenAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PolicyDraft" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "clusterId" TEXT NOT NULL,
    "ruleAction" "RuleAction" NOT NULL,
    "ruleTool" TEXT NOT NULL,
    "ruleDataClass" "DataClass" NOT NULL DEFAULT 'NONE',
    "ruleParams" JSONB,
    "ruleId" TEXT NOT NULL,
    "plainEnglish" TEXT NOT NULL,
    "reasoning" TEXT NOT NULL,
    "dryRunMatched" INTEGER NOT NULL DEFAULT 0,
    "dryRunFalsePos" INTEGER NOT NULL DEFAULT 0,
    "basedOnEventIds" TEXT[],
    "status" "DraftStatus" NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedBy" TEXT,

    CONSTRAINT "PolicyDraft_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatifiedPolicy" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "ruleAction" "RuleAction" NOT NULL,
    "ruleTool" TEXT NOT NULL,
    "ruleDataClass" "DataClass" NOT NULL DEFAULT 'NONE',
    "ruleParams" JSONB,
    "ruleId" TEXT NOT NULL,
    "plainEnglish" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "ratifiedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ratifiedBy" TEXT,
    "overrideCount" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RatifiedPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WeeklyDigest" (
    "id" TEXT NOT NULL,
    "orgId" TEXT NOT NULL,
    "weekOf" TIMESTAMP(3) NOT NULL,
    "draftIds" TEXT[],
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WeeklyDigest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_createdAt_idx" ON "AuditEvent"("orgId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_orgId_tool_action_idx" ON "AuditEvent"("orgId", "tool", "action");

-- CreateIndex
CREATE INDEX "AuditEvent_clusterId_idx" ON "AuditEvent"("clusterId");

-- CreateIndex
CREATE INDEX "EventCluster_orgId_lastSeenAt_idx" ON "EventCluster"("orgId", "lastSeenAt");

-- CreateIndex
CREATE UNIQUE INDEX "EventCluster_orgId_signature_key" ON "EventCluster"("orgId", "signature");

-- CreateIndex
CREATE UNIQUE INDEX "PolicyDraft_clusterId_key" ON "PolicyDraft"("clusterId");

-- CreateIndex
CREATE INDEX "PolicyDraft_orgId_status_createdAt_idx" ON "PolicyDraft"("orgId", "status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RatifiedPolicy_draftId_key" ON "RatifiedPolicy"("draftId");

-- CreateIndex
CREATE INDEX "RatifiedPolicy_orgId_active_idx" ON "RatifiedPolicy"("orgId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "WeeklyDigest_orgId_weekOf_key" ON "WeeklyDigest"("orgId", "weekOf");

-- AddForeignKey
ALTER TABLE "AuditEvent" ADD CONSTRAINT "AuditEvent_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EventCluster"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PolicyDraft" ADD CONSTRAINT "PolicyDraft_clusterId_fkey" FOREIGN KEY ("clusterId") REFERENCES "EventCluster"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatifiedPolicy" ADD CONSTRAINT "RatifiedPolicy_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "PolicyDraft"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
