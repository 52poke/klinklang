import { createContext } from 'react'

// Invalid field text stays local until it parses, but must still block saving and navigation.
export const FieldValidityContext = createContext<(id: string, issue: string | null) => void>(() => { /* Optional outside the workflow editor. */ })
