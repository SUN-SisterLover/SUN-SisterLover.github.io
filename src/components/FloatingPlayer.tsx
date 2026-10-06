import { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, Music, Volume2, VolumeX, Search } from 'lucide-react'
import { useBgm } from './AudioProvider'
import { SITE_CONFIG } from '../site.config'
import { useLang } from '../i18n'
import {
  fetchNeteaseSearch,
  fetchNeteaseSongUrl,
  fetchNeteasePlaylist,
  type NeteaseSong,
  type NeteasePlaylist,
} from '../lib/netease'

function fmt(t: number) {
  if (!isFinite(t) || t < 0) t = 0
  const m = Math.floor(t / 60)
  const s = Math.floor(t % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

const EASE = 'var(--ease-drawer)'
const DURATION_IN = '450ms'
const DURATION_OUT = '350ms'
const DEBOUNCE_MS = 400

export default function FloatingPlayer() {
  const { t } = useLang()
  const {
    available,
    playing,
    toggle,
    currentTime,
    duration,
    seek,
    volume,
    setVolume,
    muted,
    toggleMute,
    meta,
    setTrack,
    showLocalBgm,
  } = useBgm()

  const cfg = SITE_CONFIG.netease
  const neteaseEnabled = cfg.enabled

  const [collapsed, setCollapsed] = useState(true)
  const [searchKw, setSearchKw] = useState('')
  const [searchResults, setSearchResults] = useState<NeteaseSong[]>([])
  const [searching, setSearching] = useState(false)

  // Track focus + IME composition so the card stays open while typing CJK
  const inputFocusedRef = useRef(false)
  const composingRef = useRef(false)

  // playlist state
  const [playlists, setPlaylists] = useState<NeteasePlaylist[]>([])
  const [activePlaylistIdx, setActivePlaylistIdx] = useState(0)
  const [playlistSongs, setPlaylistSongs] = useState<NeteaseSong[]>([])
  const [loadingPlaylist, setLoadingPlaylist] = useState(false)

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // load initial playlists
  useEffect(() => {
    if (!neteaseEnabled || cfg.playlistIds.length === 0) return
    let cancelled = false
    const load = async () => {
      setLoadingPlaylist(true)
      const results = await Promise.allSettled(
        cfg.playlistIds.map((id) => fetchNeteasePlaylist(id)),
      )
      if (cancelled) return
      const loaded = results
        .filter((r): r is PromiseFulfilledResult<NeteasePlaylist> => r.status === 'fulfilled')
        .map((r) => r.value)
      setPlaylists(loaded)
      setLoadingPlaylist(false)
    }
    void load()
    return () => { cancelled = true }
  }, [neteaseEnabled, cfg.playlistIds])

  // when active playlist changes, show its tracks
  useEffect(() => {
    if (playlists.length > 0 && activePlaylistIdx < playlists.length) {
      setPlaylistSongs(playlists[activePlaylistIdx].tracks)
    }
  }, [playlists, activePlaylistIdx])

  // debounced search
  const doSearch = useCallback(
    (kw: string) => {
      if (!kw.trim()) {
        setSearchResults([])
        return
      }
      setSearching(true)
      fetchNeteaseSearch(kw, 20)
        .then(setSearchResults)
        .catch(() => setSearchResults([]))
        .finally(() => setSearching(false))
    },
    [],
  )

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      // Don't search while IME composition is in progress (pinyin etc.)
      if (composingRef.current) return
      doSearch(searchKw)
    }, DEBOUNCE_MS)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [searchKw, doSearch])

  const playSong = useCallback(
    async (song: NeteaseSong) => {
      // Prime the audio context while we still have the user gesture,
      // otherwise autoplay policy may block play() after the async fetch.
      try { new Audio().play()?.catch(() => {}) } catch {}

      try {
        // Try from highest to lowest quality (official API priority order)
        let url = await fetchNeteaseSongUrl(song.id, 999000)   // 无损
        if (!url) url = await fetchNeteaseSongUrl(song.id, 320000)  // 极高
        if (!url) url = await fetchNeteaseSongUrl(song.id, 128000)  // 标准
        // Fallback to the public preview URL (no auth required)
        if (!url) url = `https://music.163.com/song/media/outer/url?id=${song.id}`
        setTrack({
          title: song.name,
          artist: song.artist,
          cover: song.cover,
          url,
        })
      } catch {
        // Last resort: try the public URL directly
        setTrack({
          title: song.name,
          artist: song.artist,
          cover: song.cover,
          url: `https://music.163.com/song/media/outer/url?id=${song.id}`,
        })
      }
    },
    [setTrack],
  )

  // Determine which track list to show
  const displaySongs: NeteaseSong[] = searchKw.trim() ? searchResults : playlistSongs
  const showList = neteaseEnabled && !collapsed

  // When NetEase is off AND local BGM is available, show local player
  const showLocal = !neteaseEnabled && showLocalBgm

  if (!showLocal && !neteaseEnabled) return null
  if (!available && !neteaseEnabled) return null

  const pct = duration > 0 ? (currentTime / duration) * 100 : 0

  return (
    <div
      onMouseEnter={() => setCollapsed(false)}
      onMouseLeave={() => {
        // Don't collapse while the search input is focused (e.g. typing CJK)
        if (!inputFocusedRef.current) setCollapsed(true)
      }}
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
        {/* ── top row: cover + info (always visible) ────────────── */}
        <div className="flex items-stretch" style={{ gap: collapsed ? '0px' : '12px' }}>
          <button
            onClick={toggle}
            aria-label={playing ? '暂停' : '播放'}
            className={`relative size-16 shrink-0 overflow-hidden bg-ink-2 press-md ${
              collapsed ? 'rounded-2xl' : 'rounded-xl border border-ink-2/20'
            }`}
            style={{
              transitionProperty: 'border-radius, border-color',
              transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
              transitionTimingFunction: EASE,
            }}
          >
            {meta.cover ? (
              <img src={meta.cover} alt="" referrerPolicy="no-referrer" className="size-full object-cover" />
            ) : (
              <span className="grid size-full place-items-center text-accent">
                <Music className="size-6" />
              </span>
            )}

            {/* collapsed progress bar */}
            {collapsed && (
              <span className="absolute inset-x-[5px] bottom-[5px] block h-[3px] rounded-full bg-black/40">
                <span
                  className="bg-gradient-accent block h-full rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </span>
            )}
          </button>

          {/* info panel */}
          <div
            className="flex min-w-0 flex-col overflow-hidden"
            style={{
              width: collapsed ? '0px' : '212px',
              height: collapsed ? '0px' : 'auto',
              opacity: collapsed ? 0 : 1,
              transform: collapsed ? 'translateX(-10px)' : 'translateX(0px)',
              transitionProperty: 'width, height, opacity, transform',
              transitionDuration: collapsed ? DURATION_OUT : DURATION_IN,
              transitionTimingFunction: EASE,
              transitionDelay: collapsed ? '0ms' : '60ms',
            }}
          >
            <p className="truncate font-mono text-xs tracking-wide text-paper">
              {meta.title}
            </p>
            {meta.artist && (
              <p className="truncate font-mono text-[10px] text-dim">{meta.artist}</p>
            )}

            {/* progress bar */}
            <div className="mt-1.5 flex items-center gap-2">
              <span className="w-8 text-right font-mono text-[10px] text-dim">
                {fmt(currentTime)}
              </span>
              <input
                type="range"
                min={0}
                max={duration || 0}
                step={0.1}
                value={currentTime}
                onChange={(e) => seek(Number(e.target.value))}
                className="h-1 flex-1"
                aria-label="播放进度"
              />
              <span className="w-8 font-mono text-[10px] text-dim">
                {fmt(duration)}
              </span>
            </div>

            {/* play + volume controls */}
            <div className="mt-1.5 flex items-center justify-center gap-3">
              <button
                onClick={toggle}
                aria-label={playing ? '暂停' : '播放'}
                className="bg-gradient-accent grid size-8 shrink-0 place-items-center rounded-full text-ink shadow-lg transition-transform duration-150 ease-[var(--ease-out)] hover:scale-105 active:scale-95"
              >
                {playing ? (
                  <Pause className="size-3.5" />
                ) : (
                  <Play className="size-3.5 translate-x-[1px]" />
                )}
              </button>

              <div className="flex min-w-0 items-center gap-1.5">
                <button
                  onClick={toggleMute}
                  aria-label={muted ? '取消静音' : '静音'}
                  className={`shrink-0 transition-colors press-sm ${
                    muted ? 'text-amber' : 'text-dim hover:text-paper'
                  }`}
                >
                  {muted ? <VolumeX className="size-3" /> : <Volume2 className="size-3" />}
                </button>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={volume}
                  onChange={(e) => setVolume(Number(e.target.value))}
                  className="h-1 w-14"
                  aria-label="音量"
                />
                <span className="w-6 shrink-0 font-mono text-[10px] text-dim">
                  {Math.round(volume * 100)}%
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── expanded section: search + song list (NetEase only) ── */}
        {showList && (
          <div className="flex flex-col gap-2 overflow-hidden">
            {/* search bar */}
            <div className="flex items-center gap-2 rounded-lg border border-ink-2/20 bg-ink-2/40 px-2.5 py-1.5">
              <Search className="size-3.5 shrink-0 text-dim" />
              <input
                type="text"
                value={searchKw}
                onChange={(e) => setSearchKw(e.target.value)}
                onCompositionStart={() => { composingRef.current = true }}
                onCompositionEnd={(e) => {
                  composingRef.current = false
                  setSearchKw((e.target as HTMLInputElement).value)
                }}
                onFocus={() => {
                  inputFocusedRef.current = true
                  setCollapsed(false)
                }}
                onBlur={() => { inputFocusedRef.current = false }}
                placeholder={t('netease.search')}
                className="flex-1 bg-transparent font-mono text-[11px] text-paper placeholder:text-dim/60 outline-none"
              />
              {searching && (
                <span className="size-3 shrink-0 animate-spin rounded-full border-2 border-accent border-t-transparent" />
              )}
            </div>

            {/* playlist tabs (only when not searching) */}
            {!searchKw.trim() && playlists.length > 0 && (
              <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
                {playlists.map((pl, idx) => (
                  <button
                    key={pl.id}
                    onClick={() => setActivePlaylistIdx(idx)}
                    className={`shrink-0 rounded-full px-2.5 py-1 font-mono text-[10px] transition-colors press-sm ${
                      idx === activePlaylistIdx
                        ? 'bg-accent/20 text-accent'
                        : 'bg-ink-2/40 text-dim hover:text-paper'
                    }`}
                  >
                    {loadingPlaylist ? '…' : pl.name}
                  </button>
                ))}
              </div>
            )}

            {/* song list */}
            <div className="max-h-[200px] overflow-y-auto no-scrollbar -mx-1">
              {displaySongs.length === 0 ? (
                <p className="px-1 py-4 text-center font-mono text-[10px] text-dim">
                  {searchKw.trim()
                    ? t('netease.noResults')
                    : loadingPlaylist
                      ? t('netease.loading')
                      : t('netease.noResults')}
                </p>
              ) : (
                <ul className="space-y-0.5">
                  {displaySongs.map((song) => (
                    <li key={song.id}>
                      <button
                        onClick={() => { void playSong(song) }}
                        className="flex w-full items-center gap-2.5 rounded-lg px-1.5 py-1.5 text-left transition-colors duration-200 ease-[var(--ease-out)] hover:bg-ink-2/10 press-sm"
                      >
                        <img
                          src={song.cover}
                          alt=""
                          referrerPolicy="no-referrer"
                          loading="lazy"
                          className="size-8 shrink-0 rounded object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none'
                          }}
                        />
                        <span className="min-w-0 flex-1 truncate text-[11px] text-paper">
                          {song.name}
                        </span>
                        <span className="max-w-[90px] shrink-0 truncate font-mono text-[10px] text-dim">
                          {song.artist}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
