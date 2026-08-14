import {
  workflowRevisionChangeKindSchema,
  workflowRevisionMetadataSchema,
  workflowRevisionSchema,
  workflowSnapshotSchema,
  type WorkflowDiffChange,
  type WorkflowRevision as WorkflowRevisionData,
  type WorkflowRevisionChangeKind,
  type WorkflowRevisionMetadata,
  type WorkflowSnapshot
} from '@mudkipme/klinklang-domain'
import type {
  Prisma,
  PrismaClient,
  Workflow,
  WorkflowRevision as WorkflowRevisionRecord
} from '@mudkipme/klinklang-prisma'

interface RevisionOptions {
  changeKind: WorkflowRevisionChangeKind
  createdById?: string | null
  sourceWorkflowId?: string | null
  sourceRevision?: number | null
}

export class WorkflowVersionConflictError extends Error {
  public constructor (options?: ErrorOptions) {
    super('Workflow was updated by another request', options)
    this.name = 'WorkflowVersionConflictError'
  }
}

export function toWorkflowSnapshot (
  workflow: Pick<Workflow, 'name' | 'isPrivate' | 'enabled' | 'triggers' | 'definition'>
): WorkflowSnapshot {
  return workflowSnapshotSchema.parse({
    name: workflow.name,
    isPrivate: workflow.isPrivate,
    enabled: workflow.enabled,
    triggers: workflow.triggers,
    definition: workflow.definition
  })
}

export function toWorkflowRevisionMetadata (revision: WorkflowRevisionRecord): WorkflowRevisionMetadata {
  return workflowRevisionMetadataSchema.parse({
    workflowId: revision.workflowId,
    revision: revision.revision,
    changeKind: workflowRevisionChangeKindSchema.parse(revision.changeKind),
    sourceWorkflowId: revision.sourceWorkflowId,
    sourceRevision: revision.sourceRevision,
    createdById: revision.createdById,
    createdAt: revision.createdAt.toISOString()
  })
}

export function toWorkflowRevision (revision: WorkflowRevisionRecord): WorkflowRevisionData {
  return workflowRevisionSchema.parse({
    ...toWorkflowRevisionMetadata(revision),
    snapshot: toWorkflowSnapshot(revision)
  })
}

function revisionCreateData (
  workflow: Workflow,
  options: RevisionOptions
): Prisma.WorkflowRevisionUncheckedCreateInput {
  return {
    workflowId: workflow.id,
    revision: workflow.currentRevision,
    name: workflow.name,
    isPrivate: workflow.isPrivate,
    enabled: workflow.enabled,
    triggers: workflow.triggers as Prisma.InputJsonValue,
    definition: workflow.definition as Prisma.InputJsonValue,
    changeKind: options.changeKind,
    sourceWorkflowId: options.sourceWorkflowId ?? null,
    sourceRevision: options.sourceRevision ?? null,
    createdById: options.createdById ?? null
  }
}

export async function createVersionedWorkflow (
  prisma: PrismaClient,
  snapshot: WorkflowSnapshot,
  userId: string | null,
  options: RevisionOptions
): Promise<Workflow> {
  return await prisma.$transaction(async transaction => {
    const workflow = await transaction.workflow.create({
      data: {
        name: snapshot.name,
        isPrivate: snapshot.isPrivate,
        enabled: snapshot.enabled,
        triggers: snapshot.triggers as Prisma.InputJsonValue,
        definition: snapshot.definition as unknown as Prisma.InputJsonValue,
        userId
      }
    })
    await transaction.workflowRevision.create({
      data: revisionCreateData(workflow, options)
    })
    return workflow
  })
}

export async function updateVersionedWorkflow (
  prisma: PrismaClient,
  workflow: Workflow,
  snapshot: WorkflowSnapshot,
  options: RevisionOptions
): Promise<Workflow> {
  try {
    return await prisma.$transaction(async transaction => {
      const updated = await transaction.workflow.update({
        where: {
          id: workflow.id,
          currentRevision: workflow.currentRevision
        },
        data: {
          name: snapshot.name,
          isPrivate: snapshot.isPrivate,
          enabled: snapshot.enabled,
          triggers: snapshot.triggers as Prisma.InputJsonValue,
          definition: snapshot.definition as unknown as Prisma.InputJsonValue,
          currentRevision: { increment: 1 }
        }
      })
      await transaction.workflowRevision.create({
        data: revisionCreateData(updated, options)
      })
      return updated
    })
  } catch (error) {
    const code = error !== null && typeof error === 'object' && 'code' in error
      ? error.code
      : undefined
    if (code === 'P2002' || code === 'P2025') {
      throw new WorkflowVersionConflictError({ cause: error })
    }
    throw error
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => (
  value !== null && typeof value === 'object' && !Array.isArray(value)
)

const appendPath = (path: string, segment: string): string => (
  `${path}/${segment.replaceAll('~', '~0').replaceAll('/', '~1')}`
)

export function diffWorkflowSnapshots (before: WorkflowSnapshot, after: WorkflowSnapshot): WorkflowDiffChange[] {
  const changes: WorkflowDiffChange[] = []

  const visit = (
    path: string,
    previous: unknown,
    next: unknown,
    presence = { previous: true, next: true }
  ): void => {
    if (!presence.previous) {
      changes.push({ path, kind: 'added', after: next })
      return
    }
    if (!presence.next) {
      changes.push({ path, kind: 'removed', before: previous })
      return
    }
    if (Object.is(previous, next)) {
      return
    }
    if (Array.isArray(previous) && Array.isArray(next)) {
      const length = Math.max(previous.length, next.length)
      for (let index = 0; index < length; index += 1) {
        visit(appendPath(path, String(index)), previous[index], next[index], {
          previous: index in previous,
          next: index in next
        })
      }
      return
    }
    if (isRecord(previous) && isRecord(next)) {
      const keys = new Set([...Object.keys(previous), ...Object.keys(next)])
      for (const key of Array.from(keys).sort()) {
        visit(appendPath(path, key), previous[key], next[key], {
          previous: key in previous,
          next: key in next
        })
      }
      return
    }
    changes.push({ path, kind: 'changed', before: previous, after: next })
  }

  visit('', before, after)
  return changes
}
