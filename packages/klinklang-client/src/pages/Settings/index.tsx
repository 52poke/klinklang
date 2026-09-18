import { Trash2 } from 'lucide-react'
import React, { useCallback, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle
} from '../../components/ui/card'
import { Input } from '../../components/ui/input'
import { useUserStore } from '../../store/user'

export const Settings: React.FC = () => {
  const [error, setError] = useState<string | null>(null)
  const [connecting, setConnecting] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const domainEl = useRef<HTMLInputElement | null>(null)
  const { currentUser, fetchCurrentUser } = useUserStore()

  const fediConnect = useCallback(async () => {
    if (connecting || currentUser === null) return
    const domain = domainEl.current?.value.trim() ?? ''
    if (domain.length === 0) { setError('Enter your instance domain.'); return }
    setConnecting(true)
    setError(null)
    try {
      const response = await fetch('/fedi/login', {
        method: 'POST', body: JSON.stringify({ domain }), headers: { 'Content-Type': 'application/json' }
      })
      if (!response.ok) throw new Error(`Unable to connect (HTTP ${response.status}). Check your instance domain and try again.`)
      const { redirectURL } = await response.json() as { redirectURL: string }
      location.href = redirectURL
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to connect. Please try again.')
    } finally {
      setConnecting(false)
    }
  }, [connecting, currentUser])

  const deleteFediAccount = useCallback(async (id: string) => {
    if (deleting !== null) return
    setDeleting(id)
    setError(null)
    try {
      const response = await fetch(`/api/fedi-account/${id}`, { method: 'DELETE' })
      if (!response.ok) throw new Error(`Unable to remove account (HTTP ${response.status}). Please try again.`)
      await fetchCurrentUser()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Unable to remove account. Please try again.')
    } finally {
      setDeleting(null)
    }
  }, [deleting, fetchCurrentUser])

  return (
    <div className='mx-auto flex max-w-5xl flex-col gap-4'>
      <h1 className='text-2xl font-semibold tracking-tight'>Settings</h1>
      {error !== null && <p role='alert' className='rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive'>{error}</p>}
      {currentUser === null && <p className='text-sm text-muted-foreground'>Log in to manage linked accounts.</p>}
      <div className={`grid gap-4 ${(currentUser?.fediAccounts.length ?? 0) > 0 ? 'md:grid-cols-2' : ''}`}>
        {(currentUser?.fediAccounts.length ?? 0) > 0 && (
          <Card>
            <CardHeader>
              <CardTitle>Linked ActivityPub accounts</CardTitle>
            </CardHeader>
            <CardContent className='space-y-2'>
              {currentUser?.fediAccounts.map((account) => (
                <div
                  key={account.subject}
                  className='flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm'
                >
                  <div className='truncate'>{account.subject}</div>
                  <Button
                    variant='ghost'
                    size='icon'
                    onClick={() => {
                      deleteFediAccount(account.id).catch(() => undefined)
                    }}
                    disabled={deleting !== null}
                    aria-label={`Remove ${account.subject}`}
                  >
                    <Trash2 className='h-4 w-4' />
                  </Button>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
        <Card>
          <CardHeader>
            <CardTitle>Link to a new ActivityPub account</CardTitle>
          </CardHeader>
          <CardContent>
            <div className='flex flex-col gap-3 sm:flex-row sm:items-center'>
              <Input
                ref={domainEl}
                aria-label='Instance domain'
                disabled={connecting || currentUser === null}
                autoCapitalize='none'
                placeholder='Your instance domain'
                className='sm:max-w-xs'
              />
              <Button
                disabled={connecting || currentUser === null}
                onClick={() => {
                  fediConnect().catch(() => undefined)
                }}
              >
                {connecting ? 'Connecting…' : 'Connect'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
