import type { User } from '@mudkipme/klinklang-prisma'
import { omit } from 'lodash-es'

export function outputUser (user: User): Omit<User, 'token' | 'wikiId'> & { wikiId: string } {
  return {
    ...omit(user, 'token'),
    wikiId: user.wikiId.toString()
  }
}
