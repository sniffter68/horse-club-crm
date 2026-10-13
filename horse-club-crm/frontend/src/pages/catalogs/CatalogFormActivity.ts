import { createContext } from 'react'

export const CatalogFormActivity = createContext<(busy: boolean) => void>(() => {})
