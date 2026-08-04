declare module 'json-predicate' {
  import type { EventPredicate } from '@mudkipme/klinklang-domain'

  export function test (data: unknown, predicate: EventPredicate): boolean
}
