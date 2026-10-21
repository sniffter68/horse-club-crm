import { createContext } from 'react'
export const CatalogEditContext = createContext<{ id: string; onClose: () => void } | null>(null)
