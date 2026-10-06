import { useState } from 'react'
import { ExternalLink, RefreshCw, Tv } from 'lucide-react'
import { useLang } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import {
  BILI_SILENT_CODES,
  formatCount,
  useBiliProfile,
} from '../lib/bilibili'
import { formatAgo } from '../lib/steam'
import FloatingPlaceholder from './FloatingPlaceholder'

// Match the floating-card motion used by FloatingPlayer / FloatingSteam.
const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '270ms'

/**
 * Bottom-right Bilibili card, styled exactly like FloatingSteam: a 64px square
 * that expands on hover into an info card with follower/video stats and recent
 * uploads. Hides itself when no identity is configured or the proxy is absent.
 */
export default function FloatingBili() {
  const cfg = SITE_CONFIG.bilibili
  const { t, lang } = useLang()
  const [collapsed, setCollapsed] = useState(true)

  const { data, error, loading, refreshing, refresh, notConfigured } = useBiliProfile({
    enabled: cfg.enabled,
    intervalMs: 120_000,
    apiBase: cfg.apiBase,
  })

  if (!cfg.enabled) return null

  // No identity on the server — show a dimmed placeholder so the card stays visible.
  if (notConfigured) {
    return (
      <FloatingPlaceholder
        icon={<Tv className="size-6" />}
        title={t('datawall.bili.title')}
        hint={t('datawall.configHint')}
      />
    )
  }

  // No proxy here (static hosting) — the card removes itself.
  if (!data && error && BILI_SILENT_CODES.has(error.code)) return null

  const user = data?.user ?? null

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
      {/* ── header: avatar + identity ───────────────────────────── */}
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
          href={user?.spaceUrl ?? 'https://space.bilibili.com/'}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={t('datawall.bili.spaceLink')}
          className={`relative grid size-16 shrink-0 place-items-center overflow-hidden bg-ink-2 ${
            collapsed ? '-m-px rounded-2xl' : 'rounded-xl border border-ink-2/20'
          }`}
          style={{
            transitionProperty: 'border-radius, border-color',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
          }}
        >
          {user?.avatar ? (
            <img src={user.avatar} alt="" className="size-full object-cover" />
          ) : (
            <span className="text-dim grid size-full place-items-center">
              <Tv className="size-6" />
            </span>
          )}
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
          <p className="text-dim truncate font-mono text-[10px] tracking-[0.2em] uppercase">
            {t('datawall.bili.title')}
          </p>
          <p className="text-paper truncate text-sm font-semibold">
            {user?.name ?? (loading ? t('datawall.loading') : t('datawall.bili.title'))}
          </p>
          <p className="text-dim mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10px]">
            {user
              ? `${t('datawall.bili.followers')} ${formatCount(user.followers, lang)}`
              : error
                ? t('datawall.bili.noProxy')
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
              <p className="border-line bg-ink-2/40 text-amber rounded-xl border px-2.5 py-2 font-mono text-[10px] leading-relaxed">
                {error.message}
              </p>
            )}

            {data && user && (
              <>
                <div className="border-ink-2/[0.15] grid grid-cols-3 divide-x divide-ink-2/[0.15] overflow-hidden rounded-xl border border-ink-2/20 bg-ink-2/[0.08]">
                  <Stat label={t('datawall.bili.followers')} value={formatCount(user.followers, lang)} />
                  <Stat label={t('datawall.bili.videos')} value={formatCount(user.videoCount, lang)} />
                  <Stat label={t('datawall.bili.following')} value={formatCount(user.following, lang)} />
                </div>

                {data.recentAvailable ? (
                  data.recent.length > 0 && (
                    <div>
                      <p className="text-dim mb-1.5 font-mono text-[9px] tracking-[0.18em] uppercase">
                        {t('datawall.bili.recent')}
                      </p>
                      <ul className="space-y-1">
                        {data.recent.slice(0, 3).map((video) => (
                          <li key={video.bvid}>
                            <a
                              href={video.url}
                              target="_blank"
                              rel="noreferrer noopener"
                              className="hover:bg-ink-2/10 flex items-center gap-2 rounded-lg p-1 transition-colors duration-200 ease-[var(--ease-out)]"
                            >
                              {video.cover && (
                                <img
                                  src={video.cover}
                                  alt=""
                                  loading="lazy"
                                  onError={hideBrokenImage}
                                  className="h-7 w-[56px] shrink-0 rounded-sm object-cover"
                                />
                              )}
                              <span className="text-paper min-w-0 flex-1 truncate text-[11px]">
                                {video.title}
                              </span>
                              <span className="text-dim shrink-0 font-mono text-[10px]">
                                {formatCount(video.play, lang)}
                              </span>
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                ) : (
                  <p className="text-dim font-mono text-[10px] leading-relaxed">
                    {t('datawall.bili.noCookie')}
                  </p>
                )}
              </>
            )}

            <div className="flex items-center justify-between border-t border-ink-2/20 pt-2">
              <span className="text-dim truncate font-mono text-[9px]">
                {data ? `${t('datawall.updated')} ${formatAgo(data.fetchedAt, lang)}` : ''}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={refresh}
                  disabled={refreshing}
                  aria-label={t('datawall.refresh')}
                  title={t('datawall.refresh')}
                  className="text-dim hover:text-accent disabled:opacity-40 press-sm grid size-6 place-items-center rounded transition-colors"
                >
                  <RefreshCw className={`size-3 ${refreshing ? 'animate-spin-slow' : ''}`} />
                </button>
                <a
                  href={user?.spaceUrl ?? 'https://space.bilibili.com/'}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={t('datawall.bili.spaceLink')}
                  title={t('datawall.bili.spaceLink')}
                  className="text-dim hover:text-accent press-sm grid size-6 place-items-center rounded transition-colors"
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-transparent px-1.5 py-1.5 text-center">
      <p className="text-paper truncate text-xs font-semibold">{value}</p>
      <p className="text-dim truncate font-mono text-[9px] tracking-wider uppercase">{label}</p>
    </div>
  )
}

function hideBrokenImage(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = 'none'
}
