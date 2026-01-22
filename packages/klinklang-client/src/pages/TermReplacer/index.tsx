import React, { useCallback, useRef, useState } from 'react'
import { Button } from '../../components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '../../components/ui/card'
import { Checkbox } from '../../components/ui/checkbox'
import { Label } from '../../components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../components/ui/select'
import { Separator } from '../../components/ui/separator'
import { Textarea } from '../../components/ui/textarea'

const languages: ReadonlyArray<{ value: string; text: string }> = [
  { value: 'en', text: 'English' },
  { value: 'ja', text: '日本語' },
  { value: 'zh-hans', text: '简体中文' },
  { value: 'zh-hant', text: '繁体中文' }
]

const categories: ReadonlyArray<{ value: string; text: string }> = [
  { value: 'pokemon', text: 'Pokémon' },
  { value: 'ability', text: 'Ability' },
  { value: 'move', text: 'Move' },
  { value: 'item', text: 'Item' },
  { value: 'location', text: 'Location' },
  { value: 'nature', text: 'Nature' },
  { value: 'trainer-type', text: 'Trainer Type' },
  { value: 'warrior', text: 'Warrior' },
  { value: 'character', text: 'Character' }
]

export const TermReplacer: React.FC = () => {
  const [sourceLng, setSourceLng] = useState('en')
  const [targetLng, setTargetLng] = useState('zh-hans')
  const [selectedCategories, setSelectedCategories] = useState<Set<string>>(() => new Set())
  const sourceEl = useRef<HTMLTextAreaElement | null>(null)
  const [result, setResult] = useState('')
  const toggleCategory = useCallback((category: string, checked: boolean): void => {
    setSelectedCategories(current => {
      if (checked) {
        current.add(category)
      } else {
        current.delete(category)
      }
      return new Set(current)
    })
  }, [])
  const toggleAllChecked = useCallback((checked: boolean) => {
    setSelectedCategories(checked ? new Set(categories.map(category => category.value)) : new Set())
  }, [])

  const replace = useCallback(() => {
    const load = async (): Promise<void> => {
      if (sourceEl.current === null || sourceEl.current.value === '') {
        return
      }
      const response = await fetch('/api/terminology/replace', {
        method: 'POST',
        body: JSON.stringify({
          sourceLng,
          resultLng: targetLng,
          categories: Array.from(selectedCategories),
          text: sourceEl.current.value
        }),
        headers: {
          'Content-Type': 'application/json'
        }
      })
      const { text } = await response.json() as { text: string }
      setResult(text)
    }
    load().catch(() => undefined)
  }, [sourceLng, targetLng, selectedCategories])

  return (
    <div className='mx-auto flex w-full max-w-6xl flex-col gap-6'>
      <Card>
        <CardHeader>
          <CardTitle>Terminology Replacer</CardTitle>
        </CardHeader>
        <CardContent className='space-y-4'>
          <div className='grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.5fr)]'>
            <div className='space-y-2'>
              <Label htmlFor='select-from'>From</Label>
              <Select value={sourceLng} onValueChange={setSourceLng}>
                <SelectTrigger id='select-from'>
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
              <Label htmlFor='select-to'>To</Label>
              <Select value={targetLng} onValueChange={setTargetLng}>
                <SelectTrigger id='select-to'>
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
              <Button className='h-10 w-full' onClick={replace}>
                Replace
              </Button>
            </div>
          </div>
          <Separator />
          <div className='grid gap-3 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 xl:grid-cols-6'>
            {categories.map((category) => (
              <label
                key={category.value}
                className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted'
              >
                <Checkbox
                  checked={selectedCategories.has(category.value)}
                  onCheckedChange={(checked) => {
                    toggleCategory(category.value, checked === true)
                  }}
                />
                {category.text}
              </label>
            ))}
            <label className='flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors hover:bg-muted'>
              <Checkbox
                checked={selectedCategories.size === categories.length}
                onCheckedChange={(checked) => {
                  toggleAllChecked(checked === true)
                }}
              />
              Select All
            </label>
          </div>
        </CardContent>
      </Card>

      <div className='grid gap-4 lg:grid-cols-2'>
        <Card>
          <CardHeader>
            <CardTitle>Source</CardTitle>
          </CardHeader>
          <CardContent>
            <Textarea
              id='source-text'
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
            <Textarea id='result-text' rows={12} value={result} readOnly />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
