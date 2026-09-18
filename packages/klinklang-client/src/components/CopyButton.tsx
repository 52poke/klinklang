import { Check, Copy } from 'lucide-react'
import React, { useState } from 'react'
import { Button } from './ui/button'

export const CopyButton: React.FC<{ text: string; disabled?: boolean }> = ({ text, disabled = false }) => {
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [error, setError] = useState(false)
  const copied = copiedText === text
  const copy = async (): Promise<void> => {
    setError(false)
    try {
      await navigator.clipboard.writeText(text)
      setCopiedText(text)
    } catch (_cause: unknown) {
      setError(true)
    }
  }
  return (
    <div className='flex items-center gap-2'>
      {error && <span role='status' className='text-xs text-destructive'>Select the result to copy it manually.</span>}
      <Button variant='outline' size='sm' disabled={disabled || text.length === 0} onClick={() => {
        void copy()
      }}>
        {copied ? <Check className='size-4' /> : <Copy className='size-4' />}{copied ? 'Copied' : 'Copy result'}
      </Button>
    </div>
  )
}
