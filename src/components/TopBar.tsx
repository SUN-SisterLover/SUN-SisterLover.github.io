import { useEffect, useRef, useState } from 'react'
import { Moon, Sun, Monitor, Palette } from 'lucide-react'
import { useLang, type Lang } from '../i18n'
import { useTheme } from '../theme'
import { SITE_CONFIG, type PaletteId } from '../site.config'

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden className={className}>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
    </svg>
  )
}

function LangIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg viewBox="0 0 1152 1024" fill="currentColor" aria-hidden className={className} style={style}>
      <path d="M621.504 669.12L488.64 540.608l1.536-1.472a891.968 891.968 0 0 0 194.304-334.4h153.408V102.4H471.36V0H366.592v102.4H0v101.888h584.96A800.768 800.768 0 0 1 418.944 478.72a800.704 800.704 0 0 1-120.96-171.52H193.28a897.344 897.344 0 0 0 156.032 233.408l-266.624 257.088 74.368 72.64 261.888-256 162.816 159.232 39.744-104.448zM916.416 409.6h-104.832L576 1024h104.704l58.624-153.6h248.768l59.2 153.6H1152l-235.584-614.4v-0.064z m-137.28 358.4L864 546.24 948.864 768h-169.728z" />
    </svg>
  )
}

function PaletteSwatch({ id, active }: { id: PaletteId; active: boolean }) {
  const colors = SITE_CONFIG.colors[id].colors.dark
  return (
    <span
      className={`relative inline-block size-4 rounded-full border transition-transform ${
        active ? 'border-paper scale-110' : 'border-line'
      }`}
      style={{
        background: `linear-gradient(135deg, ${colors.accent}, ${colors.accent2})`,
      }}
    >
      {active && <span className="absolute inset-0 rounded-full ring-2 ring-accent/40" />}
    </span>
  )
}

function PaletteMenu({
  palette,
  setPalette,
  available,
}: {
  palette: PaletteId
  setPalette: (p: PaletteId) => void
  available: readonly PaletteId[]
}) {
  const { pick } = useLang()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClick, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('click', onClick, true)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={pick({ zh: '切换调色板', en: 'Switch palette' })}
        className="text-dim hover:text-paper grid size-8 place-items-center rounded-md border border-transparent transition-colors hover:border-ink-2/20 hover:bg-ink-2/10 press-sm"
      >
        <Palette className="size-4" />
      </button>

      <div
        className={`absolute right-0 top-full mt-2 w-40 origin-top-right overflow-hidden rounded-lg border border-ink-2/20 bg-ink/90 shadow-xl backdrop-blur-md transition-all ${
          open
            ? 'pointer-events-auto scale-100 opacity-100'
            : 'pointer-events-none scale-[0.96] opacity-0'
        }`}
        style={{ transitionDuration: '180ms', transitionTimingFunction: 'var(--ease-out)' }}
      >
        <div className="border-b border-ink-2/20 px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-dim">
          {pick({ zh: '调色板', en: 'Palette' })}
        </div>
        {available.map((id) => (
          <button
            key={id}
            onClick={() => {
              setPalette(id)
              setOpen(false)
            }}
            className={`flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm transition-colors ${
              palette === id
                ? 'bg-accent/10 text-accent'
                : 'text-paper hover:bg-ink-2/10'
            }`}
          >
            <PaletteSwatch id={id} active={palette === id} />
            {pick(SITE_CONFIG.colors[id].label)}
          </button>
        ))}
      </div>
    </div>
  )
}

const THEME_ITEMS: {
  pref: import('../theme').ThemePref
  icon: typeof Sun
  label: { zh: string; en: string }
}[] = [
  { pref: 'system', icon: Monitor, label: { zh: '跟随系统', en: 'System' } },
  { pref: 'light', icon: Sun, label: { zh: '浅色', en: 'Light' } },
  { pref: 'dark', icon: Moon, label: { zh: '深色', en: 'Dark' } },
]

function ThemeToggle({ theme, setTheme }: { theme: import('../theme').ThemePref; setTheme: (t: import('../theme').ThemePref) => void }) {
  const { pick } = useLang()
  const current = THEME_ITEMS.find((i) => i.pref === theme) ?? THEME_ITEMS[0]
  const CurrentIcon = current.icon

  return (
    <button
      onClick={() => {
        const idx = THEME_ITEMS.findIndex((i) => i.pref === theme)
        setTheme(THEME_ITEMS[(idx + 1) % THEME_ITEMS.length].pref)
      }}
      aria-label={pick(current.label)}
      title={pick(current.label)}
      className="text-dim hover:text-paper relative grid size-8 place-items-center rounded-md border border-transparent transition-colors hover:border-ink-2/20 hover:bg-ink-2/10 press-sm"
    >
      {THEME_ITEMS.map(({ pref, icon: Icon }) => (
        <Icon
          key={pref}
          className={`absolute size-4 transition-all ${
            pref === theme
              ? 'rotate-0 scale-100 opacity-100'
              : 'rotate-90 scale-50 opacity-0'
          }`}
          style={{ transitionDuration: '220ms', transitionTimingFunction: 'var(--ease-spring)' }}
        />
      ))}
      {/* 当前图标作为可访问性焦点锚点（视觉上被上面的映射覆盖） */}
      <CurrentIcon className="size-4 opacity-0" aria-hidden />
    </button>
  )
}

const LANG_ITEMS: { lang: Lang; label: { zh: string; en: string } }[] = [
  { lang: 'zh', label: { zh: '中文', en: '中文' } },
  { lang: 'en', label: { zh: 'EN', en: 'EN' } },
]

function LanguageToggle({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const { pick } = useLang()
  const current = LANG_ITEMS.find((i) => i.lang === lang) ?? LANG_ITEMS[0]

  return (
    <button
      onClick={() => {
        const idx = LANG_ITEMS.findIndex((i) => i.lang === lang)
        setLang(LANG_ITEMS[(idx + 1) % LANG_ITEMS.length].lang)
      }}
      aria-label={pick(current.label)}
      title={pick(current.label)}
      className="text-dim hover:text-paper relative grid size-8 place-items-center rounded-md border border-transparent transition-colors hover:border-ink-2/20 hover:bg-ink-2/10 press-sm"
    >
      {LANG_ITEMS.map(({ lang: l }) => (
        <LangIcon
          key={l}
          className={`absolute size-4 transition-all ${
            l === lang ? 'rotate-0 scale-100 opacity-100' : 'rotate-90 scale-50 opacity-0'
          }`}
          style={{ transitionDuration: '220ms', transitionTimingFunction: 'var(--ease-spring)' }}
        />
      ))}
      {/* 当前图标作为可访问性焦点锚点（视觉上被上面的映射覆盖） */}
      <LangIcon className="size-4 opacity-0" aria-hidden />
    </button>
  )
}

export default function TopBar() {
  const { lang, setLang } = useLang()
  const { theme, setTheme, palette, setPalette, availablePalettes } = useTheme()
  const { nav, brand, githubUrl } = SITE_CONFIG

  return (
    <header className="border-line bg-ink/80 fixed inset-x-0 top-0 z-40 border-b backdrop-blur-md transition-colors duration-500">
      <div className="mx-auto flex h-14 w-full max-w-7xl items-center justify-between px-4">
        <a
          href="#top"
          className="group flex items-center gap-2.5 font-mono text-sm font-bold tracking-[0.2em] text-paper"
        >
          <span className="bg-gradient-accent inline-block size-3 rounded-sm transition-transform duration-200 ease-[var(--ease-spring)] group-hover:rotate-45" />
          {brand.name}
        </a>
        <div className="flex items-center gap-4 md:gap-5">
          {nav.showLang && <LanguageToggle lang={lang} setLang={setLang} />}
          {nav.showTheme && (
            <>
              <ThemeToggle theme={theme} setTheme={setTheme} />
              <PaletteMenu
                palette={palette}
                setPalette={setPalette}
                available={availablePalettes}
              />
            </>
          )}
          {nav.showGithub && (
            <a
              href={githubUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="GitHub"
              className="text-dim hover:text-paper grid size-8 place-items-center rounded-md border border-transparent transition-colors hover:border-ink-2/20 hover:bg-ink-2/10 press-sm"
            >
              <GithubMark className="size-4" />
            </a>
          )}
        </div>
      </div>
    </header>
  )
}
