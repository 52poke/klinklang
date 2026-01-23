-- Add definition column with a safe default for existing rows
ALTER TABLE "Workflow" ADD COLUMN "definition" JSONB;

UPDATE "Workflow"
SET "definition" = '{}'::jsonb
WHERE "definition" IS NULL;

ALTER TABLE "Workflow" ALTER COLUMN "definition" SET NOT NULL;
