import type { Predicate } from 'json-predicate'

export type WorkflowTrigger =
  | {
    type: 'TRIGGER_EVENTBUS'
    topic: string
    predicate?: Predicate
    throttle?: number
    throttleKeyPath?: string
  }
  | {
    type: 'TRIGGER_CRON'
    pattern: string
  }
