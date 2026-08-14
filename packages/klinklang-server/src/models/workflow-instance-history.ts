import type { Redis } from 'ioredis'
import { z } from 'zod'

const workflowInstanceStatusSchema = z.object({
  status: z.enum(['pending', 'running', 'failed', 'completed', 'cancelled'])
}).loose()

const getInstanceIds = async (redis: Redis, workflowId: string): Promise<string[]> => (
  await redis.zrevrange(`workflow-instances:${workflowId}`, 0, -1)
)

export async function hasActiveWorkflowInstances (redis: Redis, workflowId: string): Promise<boolean> {
  const instanceIds = await getInstanceIds(redis, workflowId)
  if (instanceIds.length === 0) return false
  const records = await redis.mget(...instanceIds.map(id => `workflow-instance:${workflowId}:${id}`))
  return records.some(record => {
    if (record === null) return false
    try {
      const parsed: unknown = JSON.parse(record)
      const instance = workflowInstanceStatusSchema.safeParse(parsed)
      return !instance.success || instance.data.status === 'pending' || instance.data.status === 'running'
    } catch (error) {
      void error
      return true
    }
  })
}

export async function deleteWorkflowInstanceHistory (redis: Redis, workflowId: string): Promise<void> {
  const indexKey = `workflow-instances:${workflowId}`
  const instanceIds = await getInstanceIds(redis, workflowId)
  const keys = instanceIds.map(instanceId => `workflow-instance:${workflowId}:${instanceId}`)
  await redis.del(indexKey, ...keys)
}
