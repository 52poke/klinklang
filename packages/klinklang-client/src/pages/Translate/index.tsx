import React, { useCallback, useMemo, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'
import { Textarea } from '../../components/ui/textarea'
import { useUserStore } from '../../store/user'

const languages: ReadonlyArray<{ value: 'en' | 'ja' | 'zh-hans' | 'zh-hant'; text: string }> = [
  { value: 'en', text: 'English' },
  { value: 'ja', text: '日本語' },
  { value: 'zh-hans', text: '简体中文' },
  { value: 'zh-hant', text: '繁体中文' }
]

export const Translate: React.FC = () => {
  const { currentUser } = useUserStore()
  const [sourceLng, setSourceLng] = useState<'en' | 'ja' | 'zh-hans' | 'zh-hant'>('en')
  const [targetLng, setTargetLng] = useState<'en' | 'ja' | 'zh-hans' | 'zh-hant'>('zh-hans')
  const sourceEl = useRef<HTMLTextAreaElement | null>(null)
  const [result, setResult] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const canTranslate = useMemo(() => {
    const groups = currentUser?.groups ?? []
    return groups.includes('sysop') || groups.includes('bot')
  }, [currentUser])

  const translate = useCallback(() => {
    const run = async (): Promise<void> => {
      if (sourceEl.current === null || sourceEl.current.value.trim() === '') {
        setError('Please enter text to translate.')
        return
      }
      setError(null)
      setResult('')
      setLoading(true)

      const response = await fetch('/api/translate/stream', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          sourceLng,
          targetLng,
          text: sourceEl.current.value
        })
      })

      if (!response.ok || response.body === null) {
        setLoading(false)
        setError(`Failed to translate (HTTP ${response.status}).`)
        return
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) {
          break
        }
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed.startsWith('data:')) {
            continue
          }
          const payload = trimmed.slice(5).trim()
          if (payload === '[DONE]') {
            break
          }
          try {
            const data = JSON.parse(payload) as { text?: string; error?: string }
            if (data.error !== undefined) {
              setError('Translation failed.')
              break
            }
            if (data.text !== undefined) {
              setResult(prev => prev + data.text)
            }
          } catch {
            // ignore malformed chunks
          }
        }
      }

      setLoading(false)
    }

    run().catch(() => {
      setLoading(false)
      setError('Translation failed.')
    })
  }, [sourceLng, targetLng])

  return (
    <div className='mx-auto flex w-full max-w-6xl flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>LLM Translation</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.5fr)]'>
            <div className='space-y-2'>
              <Label htmlFor='translate-from'>From</Label>
              <Select
                value={sourceLng}
                onValueChange={(value) => {
                  setSourceLng(value as 'en' | 'ja' | 'zh-hans' | 'zh-hant')
                }}
              >
                <SelectTrigger id='translate-from'>
                  <SelectValue placeholder='Select language' />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((language) => (
                    <SelectItem key={language.value} value={language.value}>
                      {language.text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='space-y-2'>
              <Label htmlFor='translate-to'>To</Label>
              <Select
                value={targetLng}
                onValueChange={(value) => {
                  setTargetLng(value as 'en' | 'ja' | 'zh-hans' | 'zh-hant')
                }}
              >
                <SelectTrigger id='translate-to'>
                  <SelectValue placeholder='Select language' />
                </SelectTrigger>
                <SelectContent>
                  {languages.map((language) => (
                    <SelectItem key={language.value} value={language.value}>
                      {language.text}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className='flex items-end'>
              <Button className='h-10 w-full' onClick={translate} disabled={!canTranslate || loading}>
                {loading ? 'Translating…' : 'Translate'}
              </Button>
            </div>
          </div>
          <Separator />
          {currentUser === null && <div className='text-xs text-muted-foreground'>Log in to use translation.</div>}
          {currentUser !== null && !canTranslate && (
            <div className='text-xs text-muted-foreground'>Translation requires sysop or bot permissions.</div>
          )}
          {error !== null && <div className='text-xs text-destructive'>{error}</div>}
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Source</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              id='translate-source'
              required
              rows={12}
              ref={sourceEl}
            />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Result</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea id='translate-result' rows={12} value={result} readOnly />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
