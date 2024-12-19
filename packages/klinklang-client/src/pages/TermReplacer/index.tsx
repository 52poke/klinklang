import {
  Button,
  Checkbox,
  Container,
  Divider,
  FormControl,
  FormControlLabel,
  Grid2,
  InputLabel,
  MenuItem,
  Select,
  TextField
} from '@mui/material'
import React, { useCallback, useRef, useState } from 'react'

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
      if (!checked) {
        current.delete(category)
      } else {
        current.add(category)
      }
      return new Set(current)
    })
  }, [])
  const toggleAllChecked = useCallback((checked: boolean) => {
    setSelectedCategories(!checked ? new Set() : new Set(categories.map(category => category.value)))
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
    load().catch(console.log)
  }, [sourceLng, targetLng, selectedCategories])

  return (
    <Container>
      <Grid2 container my={2} spacing={2}>
        <Grid2 size={{ xs: 6, sm: 5 }}>
          <FormControl fullWidth>
            <InputLabel id='label-from'>From</InputLabel>
            <Select
              labelId='label-from'
              label='From'
              value={sourceLng}
              onChange={(e) => {
                setSourceLng(e.target.value)
              }}
            >
              {languages.map((language) => (
                <MenuItem key={language.value} value={language.value}>{language.text}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid2>
        <Grid2 size={{ xs: 6, sm: 5 }}>
          <FormControl fullWidth>
            <InputLabel id='label-to'>To</InputLabel>
            <Select
              labelId='label-to'
              label='To'
              value={targetLng}
              onChange={(e) => {
                setTargetLng(e.target.value)
              }}
              fullWidth
            >
              {languages.map((language) => (
                <MenuItem key={language.value} value={language.value}>{language.text}</MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 2 }}>
          <Button size='large' variant='contained' fullWidth onClick={replace}>Replace</Button>
        </Grid2>
      </Grid2>

      <Grid2 container my={2} spacing={2}>
        {categories.map((category) => (
          <Grid2 size={{ xs: 6, sm: 3, md: 2 }} key={category.value}>
            <FormControlLabel
              control={
                <Checkbox
                  checked={selectedCategories.has(category.value)}
                  onChange={e => {
                    toggleCategory(category.value, e.target.checked)
                  }}
                  name={category.value}
                />
              }
              label={category.text}
            />
          </Grid2>
        ))}
        <Grid2 size={{ xs: 12, sm: 3, md: 2 }}>
          <FormControlLabel
            control={
              <Checkbox
                checked={selectedCategories.size === categories.length}
                onChange={e => {
                  toggleAllChecked(e.target.checked)
                }}
              />
            }
            label='Select All'
          />
        </Grid2>
      </Grid2>

      <Divider />

      <Grid2 container my={2} spacing={2}>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            label='Source'
            required
            multiline
            fullWidth
            rows={10}
            inputRef={sourceEl}
          />
        </Grid2>
        <Grid2 size={{ xs: 12, sm: 6 }}>
          <TextField
            label='Result'
            disabled
            multiline
            fullWidth
            rows={10}
            value={result}
          />
        </Grid2>
      </Grid2>
    </Container>
  )
}
