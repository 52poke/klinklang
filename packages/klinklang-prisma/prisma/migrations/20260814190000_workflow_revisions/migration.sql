-- Keep Workflow as the live record so existing reads and triggers continue to work.
ALTER TABLE "Workflow"
ADD COLUMN "currentRevision" INTEGER NOT NULL DEFAULT 1;

-- Store full immutable snapshots. The composite key avoids requiring a UUID
-- extension while backfilling existing installations.
CREATE TABLE "WorkflowRevision" (
    "workflowId" UUID NOT NULL,
    "revision" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "isPrivate" BOOLEAN NOT NULL,
    "enabled" BOOLEAN NOT NULL,
    "triggers" JSONB NOT NULL,
    "definition" JSONB NOT NULL,
    "changeKind" TEXT NOT NULL,
    "sourceWorkflowId" UUID,
    "sourceRevision" INTEGER,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkflowRevision_pkey" PRIMARY KEY ("workflowId", "revision")
);

-- Every pre-existing workflow starts at revision 1 without changing its live data.
INSERT INTO "WorkflowRevision" (
    "workflowId",
    "revision",
    "name",
    "isPrivate",
    "enabled",
    "triggers",
    "definition",
    "changeKind",
    "createdAt"
)
SELECT
    "id",
    1,
    "name",
    "isPrivate",
    "enabled",
    "triggers",
    "definition",
    'CREATE',
    "createdAt"
FROM "Workflow";

CREATE INDEX "WorkflowRevision_workflowId_createdAt_idx"
ON "WorkflowRevision"("workflowId", "createdAt");

ALTER TABLE "WorkflowRevision"
ADD CONSTRAINT "WorkflowRevision_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Legacy Action rows should not prevent deleting their owning workflow.
ALTER TABLE "Action"
DROP CONSTRAINT "Action_workflowId_fkey";

ALTER TABLE "Action"
ADD CONSTRAINT "Action_workflowId_fkey"
FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
