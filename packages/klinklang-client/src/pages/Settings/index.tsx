import { Trash2 } from 'lucide-react'
import React, { useCallback, useRef } from 'react'
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
  const domainEl = useRef<HTMLInputElement | null>(null)
  const { currentUser, fetchCurrentUser } = useUserStore()

  const fediConnect = useCallback(async () => {
    if (domainEl.current === null || domainEl.current.value === '') {
      return
    }
    const response = await fetch('/fedi/login', {
      method: 'POST',
      body: JSON.stringify({ domain: domainEl.current.value }),
      headers: {
        'Content-Type': 'application/json'
      }
    })
    if (response.status !== 200) {
      await response.text()
      return
    }
    const { redirectURL } = await response.json() as { redirectURL: string }
    location.href = redirectURL
  }, [])

  const deleteFediAccount = useCallback(async (id: string) => {
    const response = await fetch(`/api/fedi-account/${id}`, {
      method: 'DELETE'
    })
    if (response.status >= 300 || response.status < 200) {
      await response.text()
      return
    }
    await fetchCurrentUser()
  }, [fetchCurrentUser])

  return (
    <div className='mx-auto flex max-w-5xl flex-col gap-4'>
      <div className='grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]'>
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
                placeholder='Your instance domain'
                className='sm:max-w-xs'
              />
              <Button
                onClick={() => {
                  fediConnect().catch(() => undefined)
                }}
              >
                Connect
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
