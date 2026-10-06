import { useState } from 'react'
import { ExternalLink, Music, RefreshCw } from 'lucide-react'
import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import { useNeteaseRecord, formatAgo, type NeteaseRecordItem } from '../lib/netease'

// Same animation constants as FloatingSteam — the cards feel like one family.
const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '270ms'

/**
 * Failures that mean "there is no NetEase proxy here" (static hosting, missing
 * dependency). The card removes itself instead of showing a permanent error.
 */
const SILENT_CODES = new Set(['bad_response', 'unknown_route'])

function artistName(item: NeteaseRecordItem) {
  return item.song.artist || 'Unknown'
}

export default function FloatingNetease() {
  const cfg = SITE_CONFIG.netease
  const { t, lang } = useLang()
  const [collapsed, setCollapsed] = useState(true)

  const enabled = cfg.enabled && Boolean(cfg.uid)
  const { data, error, loading, refresh } = useNeteaseRecord(cfg.uid, {
    enabled,
    intervalMs: Math.max(15, cfg.refreshSeconds) * 1000,
  })

  if (!enabled) return null
  if (!data && error && SILENT_CODES.has(error.code)) return null

  const topSong = data?.[0] ?? null
  const hasData = Boolean(data?.length)
  const profileUrl = `https://music.163.com/#/user/home?id=${cfg.uid}`

  const dot = hasData
    ? 'bg-accent dot-breathe'
    : error
      ? 'bg-amber'
      : 'bg-dim'

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => setCollapsed(true)}
      className={`relative z-50 origin-bottom-right scale-[1.2] overflow-hidden rounded-2xl border bg-ink/80 shadow-xl backdrop-blur-md ${
        collapsed ? 'w-16 border-transparent' : 'w-[340px] border-ink-2/20'
      }`}
      style={{
        transitionProperty: 'width, border-color',
        transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
        transitionTimingFunction: EASE,
      }}
    >
      {/* ── header: cover + identity ───────────────────────────── */}
      <div
        className="flex items-stretch"
        style={{
          gap: collapsed ? '0px' : '12px',
          padding: collapsed ? '0px' : '12px',
          transitionProperty: 'gap, padding',
          transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
          transitionTimingFunction: EASE,
        }}
      >
        <a
          href={profileUrl}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={t('netease.profileLink')}
          className={`relative size-16 shrink-0 overflow-hidden bg-ink-2 ${
            collapsed ? '-m-px rounded-2xl' : 'rounded-xl border border-ink-2/20'
          }`}
          style={{
            transitionProperty: 'border-radius, border-color',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
          }}
        >
          {topSong?.song.cover ? (
            <img src={topSong.song.cover} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-accent">
              <Music className="size-6" />
            </span>
          )}

          <span
            className={`absolute bottom-[5px] right-[5px] block size-2.5 rounded-full ring-2 ring-ink ${dot}`}
          />
        </a>

        <div
          className="flex min-w-0 flex-col justify-center overflow-hidden"
          style={{
            width: collapsed ? '0px' : '244px',
            opacity: collapsed ? 0 : 1,
            transform: collapsed ? 'translateX(-10px)' : 'translateX(0px)',
            transitionProperty: 'width, opacity, transform',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
            transitionDelay: collapsed ? '0ms' : '90ms',
          }}
        >
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            {t('netease.title')}
          </p>
          <p className="truncate text-sm font-semibold text-paper">
            {loading
              ? t('netease.loading')
              : hasData
                ? topSong!.song.name
                : t('netease.error')}
          </p>
          <p className="mt-0.5 truncate font-mono text-[10px] text-dim">
            {hasData
              ? artistName(topSong!)
              : error
                ? t('netease.error')
                : '—'}
          </p>
        </div>
      </div>

      {/* ── body: animated open/close via grid-rows ─────────────── */}
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
          <div className="space-y-3 px-3 pb-3">
            {error && !data && (
              <p className="rounded-xl border border-line bg-ink-2/40 px-2.5 py-2 font-mono text-[10px] leading-relaxed text-amber">
                {error.message}
              </p>
            )}

            {data && (
              <div>
                <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
                  {t('netease.recent')}
                </p>
                {data.length === 0 ? (
                  <p className="font-mono text-[10px] text-dim">
                    {t('netease.noRecent')}
                  </p>
                ) : (
                  <ul className="max-h-[180px] space-y-1 overflow-y-auto no-scrollbar">
                    {data.slice(0, 8).map((item) => (
                      <li key={item.song.id}>
                        <a
                          href={`https://music.163.com/#/song?id=${item.song.id}`}
                          target="_blank"
                          rel="noreferrer noopener"
                          className="flex items-center gap-2 rounded-lg p-1 transition-colors duration-200 ease-[var(--ease-out)] hover:bg-ink-2/10"
                        >
                          <img
                            src={item.song.cover}
                            alt=""
                            referrerPolicy="no-referrer"
                            loading="lazy"
                            onError={hideBrokenImage}
                            className="h-7 w-7 shrink-0 rounded-sm object-cover"
                          />
                          <span className="min-w-0 flex-1 truncate text-[11px] text-paper">
                            {item.song.name}
                          </span>
                          <span className="max-w-[80px] shrink-0 truncate font-mono text-[10px] text-dim">
                            {artistName(item)}
                          </span>
                        </a>
                      </li>
                      ))}
                    </ul>
                  )}
              </div>
            )}

            {/* ── footer: timestamp + actions ─────────────────────── */}
            <div className="flex items-center justify-between border-t border-ink-2/20 pt-2">
              <span className="truncate font-mono text-[9px] text-dim">
                {data
                  ? `${t('netease.updated')} ${formatAgo(Date.now(), lang)}`
                  : ''}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={refresh}
                  aria-label={t('netease.refresh')}
                  title={t('netease.refresh')}
                  className="grid size-6 place-items-center rounded text-dim transition-colors hover:text-accent disabled:opacity-40 press-sm"
                >
                  <RefreshCw className="size-3" />
                </button>
                <a
                  href={profileUrl}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={t('netease.profileLink')}
                  title={t('netease.profileLink')}
                  className="grid size-6 place-items-center rounded text-dim transition-colors hover:text-accent press-sm"
                >
                  <ExternalLink className="size-3" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/** NetEase may return no cover for some songs; drop the broken <img>. */
function hideBrokenImage(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = 'none'
}
