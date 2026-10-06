import { useState } from 'react'
import { ExternalLink, Gamepad2, Lock, RefreshCw } from 'lucide-react'
import { useLang, type StringKey } from '../i18n'
import { SITE_CONFIG } from '../site.config'
import {
  formatAgo,
  formatPlaytime,
  useSteamProfile,
  type SteamGame,
} from '../lib/steam'

// Natural, non-linear expand/collapse motion.
// `--ease-drawer` is an iOS-style strong ease-out (expands feel "springy"),
// and we ease IN slower than OUT so a quick hover flick never stutters.
// Animation runs at 0.75x speed → durations are ~1.33x longer than base.
const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '270ms'

/**
 * Failures that mean "there is no Steam proxy here" (static hosting, missing
 * API key). The card removes itself instead of showing a permanent error.
 */
const SILENT_CODES = new Set(['no_api_key', 'bad_response', 'unknown_route'])

export default function FloatingSteam() {
  const cfg = SITE_CONFIG.steam
  const { t, lang } = useLang()
  const [collapsed, setCollapsed] = useState(true)

  const enabled = cfg.enabled && Boolean(cfg.steamId)
  const { data, error, loading, refreshing, refresh } = useSteamProfile(cfg.steamId, {
    enabled,
    intervalMs: Math.max(15, cfg.refreshSeconds) * 1000,
    apiBase: cfg.apiBase,
  })

  if (!enabled) return null
  if (!data && error && SILENT_CODES.has(error.code)) return null

  const profile = data?.profile ?? null
  const inGame = Boolean(profile?.playing)
  const online = (profile?.state ?? 0) > 0

  const dot = inGame
    ? 'bg-accent dot-breathe'
    : online
      ? 'bg-accent'
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
          href={profile?.profileUrl ?? 'https://steamcommunity.com/'}
          target="_blank"
          rel="noreferrer noopener"
          aria-label={t('steam.profileLink')}
          className={`relative size-16 shrink-0 overflow-hidden bg-ink-2 ${
            collapsed ? '-m-px rounded-2xl' : 'rounded-xl border border-ink-2/20'
          }`}
          style={{
            transitionProperty: 'border-radius, border-color',
            transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
            transitionTimingFunction: EASE,
          }}
        >
          {profile?.avatar ? (
            <img src={profile.avatar} alt="" className="size-full object-cover" />
          ) : (
            <span className="grid size-full place-items-center text-accent">
              <Gamepad2 className="size-6" />
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
            // identity slides in *after* the header has begun opening
            transitionDelay: collapsed ? '0ms' : '90ms',
          }}
        >
          <p className="truncate font-mono text-[10px] uppercase tracking-[0.2em] text-dim">
            {t('steam.title')}
          </p>
          <p className="truncate text-sm font-semibold text-paper">
            {profile?.name ?? (loading ? t('steam.loading') : t('steam.error'))}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 truncate font-mono text-[10px] text-dim">
            <span className={inGame || online ? 'text-accent' : ''}>
              {profile
                ? t(`steam.state.${profile.stateText}` as StringKey)
                : error
                  ? t('steam.error')
                  : '—'}
            </span>
            {profile?.level != null && (
              <>
                <span className="text-paper/30">·</span>
                <span>
                  {t('steam.level')} {profile.level}
                </span>
              </>
            )}
            {profile?.country && (
              <>
                <span className="text-paper/30">·</span>
                <span>{profile.country}</span>
              </>
            )}
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
          // body drops open *after* the header, giving a layered reveal
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
              <>
                {data.profile.playing && (
                  <div className="flex items-center gap-2.5 rounded-xl border border-accent/40 bg-accent/10 p-2">
                    <img
                      src={data.profile.playing.capsule}
                      alt=""
                      loading="lazy"
                      onError={hideBrokenImage}
                      className="h-8 w-[68px] shrink-0 rounded object-cover"
                    />
                    <div className="min-w-0">
                      <p className="font-mono text-[9px] uppercase tracking-[0.18em] text-accent">
                        {t('steam.playing')}
                      </p>
                      <p className="truncate text-xs text-paper">
                        {data.profile.playing.name}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-3 divide-x divide-ink-2/[0.15] overflow-hidden rounded-xl border border-ink-2/20 bg-ink-2/[0.08]">
                  <Stat label={t('steam.games')} value={String(data.stats.gameCount)} />
                  <Stat
                    label={t('steam.total')}
                    value={formatPlaytime(data.stats.totalMinutes, lang)}
                  />
                  <Stat
                    label={t('steam.twoWeeks')}
                    value={formatPlaytime(data.stats.twoWeekMinutes, lang)}
                  />
                </div>

                {data.profile.isPrivate && (
                  <p className="flex items-center gap-1.5 font-mono text-[10px] text-dim">
                    <Lock className="size-3 shrink-0" />
                    {t('steam.private')}
                  </p>
                )}

                <GameList
                  title={data.recent.length ? t('steam.recent') : t('steam.top')}
                  games={data.recent.length ? data.recent : data.top}
                  metric={data.recent.length ? 'twoWeeksMinutes' : 'totalMinutes'}
                  emptyLabel={t('steam.noRecent')}
                  lang={lang}
                />
              </>
            )}

            <div className="flex items-center justify-between border-t border-ink-2/20 pt-2">
              <span className="truncate font-mono text-[9px] text-dim">
                {data ? `${t('steam.updated')} ${formatAgo(data.fetchedAt, lang)}` : ''}
              </span>
              <div className="flex shrink-0 items-center gap-1">
                <button
                  onClick={refresh}
                  disabled={refreshing}
                  aria-label={t('steam.refresh')}
                  title={t('steam.refresh')}
                  className="grid size-6 place-items-center rounded text-dim transition-colors hover:text-accent disabled:opacity-40 press-sm"
                >
                  <RefreshCw
                    className={`size-3 ${refreshing ? 'animate-spin-slow' : ''}`}
                  />
                </button>
                <a
                  href={profile?.profileUrl ?? 'https://steamcommunity.com/'}
                  target="_blank"
                  rel="noreferrer noopener"
                  aria-label={t('steam.profileLink')}
                  title={t('steam.profileLink')}
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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-transparent px-1.5 py-1.5 text-center">
      <p className="truncate text-xs font-semibold text-paper">{value}</p>
      <p className="truncate font-mono text-[9px] uppercase tracking-wider text-dim">
        {label}
      </p>
    </div>
  )
}

function GameList({
  title,
  games,
  metric,
  emptyLabel,
  lang,
}: {
  title: string
  games: SteamGame[]
  metric: 'twoWeeksMinutes' | 'totalMinutes'
  emptyLabel: string
  lang: 'zh' | 'en'
}) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[9px] uppercase tracking-[0.18em] text-dim">
        {title}
      </p>
      {games.length === 0 ? (
        <p className="font-mono text-[10px] text-dim">{emptyLabel}</p>
      ) : (
        <ul className="space-y-1">
          {games.slice(0, 3).map((game) => (
            <li key={game.appId}>
              <a
                href={`https://store.steampowered.com/app/${game.appId}/`}
                target="_blank"
                rel="noreferrer noopener"
                className="flex items-center gap-2 rounded-lg p-1 transition-colors duration-200 ease-[var(--ease-out)] hover:bg-ink-2/10"
              >
                <img
                  src={game.capsule}
                  alt=""
                  loading="lazy"
                  onError={hideBrokenImage}
                  className="h-7 w-[60px] shrink-0 rounded-sm object-cover"
                />
                <span className="min-w-0 flex-1 truncate text-[11px] text-paper">
                  {game.name}
                </span>
                <span className="shrink-0 font-mono text-[10px] text-dim">
                  {formatPlaytime(game[metric], lang)}
                </span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Steam has no capsule art for some appids; drop the broken <img>. */
function hideBrokenImage(event: React.SyntheticEvent<HTMLImageElement>) {
  event.currentTarget.style.display = 'none'
}
