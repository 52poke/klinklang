import Router from '@koa/router'
import { CustomState, CustomContext } from '../lib/context'
import Workflow from '../models/workflow'

const workflowRouter = new Router<CustomState, CustomContext>({ prefix: '/api/workflow' })

workflowRouter.get('/', async (ctx) => {
  const offset = ctx.query.offset !== undefined ? parseInt(ctx.query.offset, 10) : 0
  const limit = ctx.query.limit !== undefined ? Math.max(parseInt(ctx.query.limit, 10), 200) : 20
  const workflows = await Workflow.findAll({ offset, limit })
  ctx.body = {
    workflows
  }
})

workflowRouter.post('/:workflowId/trigger', async (ctx) => {
  const workflow = await Workflow.findByPk(ctx.params.workflowId)
  if (workflow === null || workflow === undefined) {
    ctx.throw(404, new Error('WORKFLOW_NOT_FOUND'))
    return
  }
  const instance = await workflow.createInstance()
  ctx.body = {
    workflow,
    instance
  }
})

export default workflowRouter
