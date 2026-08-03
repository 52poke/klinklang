export interface AuthenticatedUser {
  id: string
  name: string
  wikiId: bigint
  groups: string[]
  createdAt: Date
  updatedAt: Date
  fediAccounts: Array<{
    id: string
    subject: string
  }>
}

export interface PublicUser extends Omit<AuthenticatedUser, 'wikiId'> {
  wikiId: string
}

export function outputUser (user: AuthenticatedUser): PublicUser {
  return {
    id: user.id,
    name: user.name,
    wikiId: user.wikiId.toString(),
    groups: user.groups,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
    fediAccounts: user.fediAccounts.map(account => ({
      id: account.id,
      subject: account.subject
    }))
  }
}
