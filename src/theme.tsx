import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { SITE_CONFIG, type PaletteId, type ThemeColors } from './site.config'

export type ThemePref = 'system' | 'dark' | 'light'
export type Theme = 'dark' | 'light'

const THEME_KEY = 'nagi-blog-theme'
const PALETTE_KEY = 'nagi-blog-palette'
const READY_ATTR = 'data-theme-ready'

const cssVarMap: Record<string, keyof ThemeColors> = {
  '--color-ink': 'ink',
  '--color-ink-2': 'ink2',
  '--color-paper': 'paper',
  '--color-dim': 'dim',
  '--color-accent': 'accent',
  '--color-accent-2': 'accent2',
  '--color-amber': 'amber',
  '--color-line': 'line',
  '--grid-line': 'gridLine',
  '--stroke-faint': 'strokeFaint',
}

const prefersDark = () =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches

function resolveTheme(pref: ThemePref): Theme {
  if (pref === 'system') return prefersDark() ? 'dark' : 'light'
  return pref
}

function applyTheme(palette: PaletteId, theme: Theme) {
  const colors = SITE_CONFIG.colors[palette].colors[theme]
  const root = document.documentElement
  for (const [cssVar, key] of Object.entries(cssVarMap)) {
    root.style.setProperty(cssVar, colors[key])
  }
  root.dataset.theme = theme
  root.dataset.palette = palette
  root.style.colorScheme = theme === 'dark' ? 'dark' : 'light'
}

function markReady() {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      document.documentElement.setAttribute(READY_ATTR, '')
    })
  })
}

type ThemeContextValue = {
  theme: ThemePref
  resolvedTheme: Theme
  setTheme: (t: ThemePref) => void
  palette: PaletteId
  setPalette: (p: PaletteId) => void
  availablePalettes: readonly PaletteId[]
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemePref>(() => {
    try {
      const saved = localStorage.getItem(THEME_KEY)
      if (saved === 'system' || saved === 'light' || saved === 'dark') return saved
    } catch {
      // ignore
    }
    return 'system'
  })

  const [palette, setPaletteState] = useState<PaletteId>(() => {
    try {
      const saved = localStorage.getItem(PALETTE_KEY)
      if (saved && saved in SITE_CONFIG.colors) return saved as PaletteId
    } catch {
      // ignore
    }
    return 'classic'
  })

  const resolvedTheme = resolveTheme(theme)

  useEffect(() => {
    const onPrefChange = () => {
      if (theme === 'system') applyTheme(palette, resolveTheme('system'))
    }
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    mql.addEventListener('change', onPrefChange)
    return () => mql.removeEventListener('change', onPrefChange)
  }, [theme, palette])

  useEffect(() => {
    try {
      localStorage.setItem(THEME_KEY, theme)
      localStorage.setItem(PALETTE_KEY, palette)
    } catch {
      // ignore
    }
    applyTheme(palette, resolvedTheme)
    markReady()
  }, [resolvedTheme, palette])

  const setTheme = (t: ThemePref) => setThemeState(t)
  const setPalette = (p: PaletteId) => setPaletteState(p)

  return (
    <ThemeContext.Provider
      value={{
        theme,
        resolvedTheme,
        setTheme,
        palette,
        setPalette,
        availablePalettes: Object.keys(SITE_CONFIG.colors) as PaletteId[],
      }}
    >
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider')
  return ctx
}
