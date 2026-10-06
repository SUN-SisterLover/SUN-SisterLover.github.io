import { useState, type ReactNode } from 'react'
import { useLang } from '../i18n'

// Match the floating-card motion used by FloatingPlayer / FloatingSteam.
const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '270ms'

/**
 * Dimmed floating card shown while a data source has no identity configured in
 * the server `.env`. Keeps the same 64px-icon / hover-expand interaction as the
 * real cards so the feature stays visible; turns into real data once configured.
 */
export default function FloatingPlaceholder({
  icon,
  title,
  hint,
}: {
  icon: ReactNode
  title: string
  hint: string
}) {
  const { pick } = useLang()
  const [collapsed, setCollapsed] = useState(true)

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`relative z-50 origin-bottom-right scale-[1.2] overflow-hidden rounded-2xl border bg-ink/80 shadow-xl opacity-60 backdrop-blur-md ${
        collapsed ? 'w-16 border-transparent' : 'w-[316px] border-ink-2/20'
      }`}
      style={{
        transitionProperty: 'width, border-color, opacity',
        transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
        transitionTimingFunction: EASE,
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
          <span
            className={`grid size-16 shrink-0 place-items-center bg-ink-2 text-dim ${
              collapsed ? 'rounded-2xl' : 'rounded-xl border border-ink-2/20'
            }`}
            style={{
              transitionProperty: 'border-radius, border-color',
              transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
              transitionTimingFunction: EASE,
            }}
          >
            {icon}
          </span>

          <div
            className="flex min-w-0 flex-col justify-center overflow-hidden"
            style={{
              width: collapsed ? '0px' : '212px',
              opacity: collapsed ? 0 : 1,
              transform: collapsed ? 'translateX(-10px)' : 'translateX(0px)',
              transitionProperty: 'width, opacity, transform',
              transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
              transitionTimingFunction: EASE,
              transitionDelay: collapsed ? '0ms' : '60ms',
            }}
          >
            <p className="text-dim truncate font-mono text-[10px] tracking-[0.2em] uppercase">
              {title}
            </p>
            <p className="text-dim truncate text-sm font-semibold">{title}</p>
            <p className="text-dim mt-0.5 truncate font-mono text-[10px]">
              {pick({ zh: '待配置', en: 'not configured' })}
            </p>
          </div>
        </div>

        {/* ── body: hint (grid-rows reveal) ─────────────────────── */}
        <div
          className="grid"
          style={{
            gridTemplateRows: collapsed ? '0fr' : '1fr',
            opacity: collapsed ? 0 : 1,
            transitionProperty: 'grid-template-rows, opacity',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
            transitionDelay: collapsed ? '0ms' : '120ms',
          }}
        >
          <div className="overflow-hidden">
            <p className="text-dim px-1 font-mono text-[10px] leading-relaxed">{hint}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
