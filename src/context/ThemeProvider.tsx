import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { applySavedTheme, effectiveTheme, toggleTheme, type Theme } from '@/lib/theme'

type ThemeContextValue = {
  theme: Theme
  toggle: () => void
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light')

  useEffect(() => {
    applySavedTheme()
    setTheme(effectiveTheme())
  }, [])

  const value: ThemeContextValue = {
    theme,
    toggle: () => setTheme(toggleTheme()),
  }

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
