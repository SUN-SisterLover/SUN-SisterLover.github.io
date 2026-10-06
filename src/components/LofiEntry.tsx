import { useState } from 'react'
import { Disc3, ArrowRight } from 'lucide-react'
import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { withBase } from '../lib/base'

// Match the floating-card motion used by FloatingPlayer / FloatingSteam.
const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '270ms'

/**
 * Bottom-right entry to the /lofi immersive page, styled as one of the
 * floating cards (FloatingPlayer / FloatingSteam): a 64px square icon that
 * expands on hover into an info card with an "enter lo-fi" button. Mounted
 * inside FloatingLayer so it stacks with the other bottom-right widgets.
 */
export default function LofiEntry() {
  const { pick } = useLang()
  const [collapsed, setCollapsed] = useState(true)

  if (!SITE_CONFIG.lofi.enabled) return null

  const enter = withBase('/lofi')

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`relative z-50 origin-bottom-right scale-[1.2] overflow-hidden rounded-2xl border bg-ink/80 shadow-xl backdrop-blur-md ${
        collapsed ? 'w-16 border-transparent' : 'w-[316px] border-ink-2/20'
      }`}
      style={{
        transitionProperty: 'width, border-color',
        transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
        transitionTimingFunction: EASE,
        borderWidth: collapsed ? '0px' : '1px',
      }}
    >
      <div
        className="flex flex-col"
        style={{
          gap: collapsed ? '0px' : '8px',
          padding: collapsed ? '0px' : '10px',
          transitionProperty: 'gap, padding',
          transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
          transitionTimingFunction: EASE,
        }}
      >
        {/* ── header: icon + identity ───────────────────────────── */}
        <div className="flex items-stretch" style={{ gap: collapsed ? '0px' : '12px' }}>
          <a
            href={enter}
            aria-label={pick({ zh: '进入 lofi 自习室', en: 'Enter lo-fi study room' })}
            className={`relative grid size-16 shrink-0 place-items-center overflow-hidden bg-ink-2 text-dim transition-colors hover:text-paper ${
              collapsed ? 'rounded-2xl' : 'rounded-xl border border-ink-2/20'
            }`}
            style={{
              transitionProperty: 'border-radius, border-color',
              transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
              transitionTimingFunction: EASE,
            }}
          >
            <Disc3 className="size-6" />
          </a>

          <div
            className="flex min-w-0 flex-col justify-center overflow-hidden"
            style={{
              width: collapsed ? '0px' : '212px',
              opacity: collapsed ? 0 : 1,
              transform: collapsed ? 'translateX(-10px)' : 'translateX(0px)',
              transitionProperty: 'width, opacity, transform',
              transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
              transitionTimingFunction: EASE,
              // identity slides in *after* the header has begun opening
              transitionDelay: collapsed ? '0ms' : '60ms',
            }}
          >
            <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
              {pick({ zh: 'Lofi 沉浸空间', en: 'Lo-fi room' })}
            </p>
            <p className="truncate text-sm font-semibold text-paper">
              {pick({ zh: '深夜自习室', en: 'Study Room' })}
            </p>
            <p className="mt-0.5 truncate font-mono text-[10px] text-dim">
              {pick({ zh: '戴上耳机 沉下来', en: 'Put on headphones, sink in' })}
            </p>
          </div>
        </div>

        {/* ── body: enter button (grid-rows reveal) ─────────────── */}
        <div
          className="grid"
          style={{
            gridTemplateRows: collapsed ? '0fr' : '1fr',
            opacity: collapsed ? 0 : 1,
            transitionProperty: 'grid-template-rows, opacity',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
            // button drops open *after* the header, giving a layered reveal
            transitionDelay: collapsed ? '0ms' : '120ms',
          }}
        >
          <div className="overflow-hidden">
            <a
              href={enter}
              className="bg-gradient-accent flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs font-semibold text-ink shadow-lg transition-transform duration-150 ease-[var(--ease-out)] hover:scale-[1.02] active:scale-95"
            >
              <Disc3 className="size-3.5" />
              {pick({ zh: '点击进入 lofi', en: 'Enter lo-fi' })}
              <ArrowRight className="size-3.5" />
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}
