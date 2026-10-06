/**
 * Steam Web API client.
 *
 * Docs: https://developer.valvesoftware.com/wiki/Steam_Web_API
 *       https://partner.steamgames.com/doc/webapi/ISteamUser
 *       https://partner.steamgames.com/doc/webapi/IPlayerService
 *
 * This module runs on the server only: the Steam Web API key is a secret and
 * `api.steampowered.com` sends no CORS headers, so the browser can never call
 * it directly.
 */

const STEAM_HOST = 'https://api.steampowered.com'
const ICON_CDN = 'https://media.steampowered.com/steamcommunity/public/images/apps'
const CAPSULE_CDN = 'https://cdn.cloudflare.steamstatic.com/steam/apps'

/** How long a resolved profile payload stays warm, in ms. */
const PROFILE_TTL = 60_000
/** Hard floor applied even when the client asks for a forced refresh. */
const REFRESH_FLOOR = 15_000
/** Vanity names practically never change owner. */
const VANITY_TTL = 24 * 60 * 60 * 1000

const REQUEST_TIMEOUT = 8_000

/** `personastate` enum from the Steam Web API. */
const PERSONA_STATES = [
  'offline',
  'online',
  'busy',
  'away',
  'snooze',
  'trade',
  'play',
]

export class SteamError extends Error {
  /**
   * @param {string} message
   * @param {number} [status] HTTP status to surface to the browser
   * @param {string} [code] stable machine-readable code
   */
  constructor(message, status = 502, code = 'steam_error') {
    super(message)
    this.name = 'SteamError'
    this.status = status
    this.code = code
  }
}

function apiKey() {
  const key = process.env.STEAM_API_KEY?.trim()
  if (!key) {
    throw new SteamError(
      'STEAM_API_KEY is not configured on the server',
      503,
      'no_api_key',
    )
  }
  return key
}

/**
 * Perform a single Steam Web API call.
 *
 * @param {string} iface   e.g. `ISteamUser`
 * @param {string} method  e.g. `GetPlayerSummaries`
 * @param {string} version e.g. `v0002`
 * @param {Record<string, string | number | boolean | undefined>} params
 * @returns {Promise<any>}
 */
async function call(iface, method, version, params) {
  const url = new URL(`${STEAM_HOST}/${iface}/${method}/${version}/`)
  url.searchParams.set('key', apiKey())
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue
    url.searchParams.set(key, String(value))
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    })
    if (res.status === 401 || res.status === 403) {
      throw new SteamError(
        'Steam rejected the API key (or the data is private)',
        502,
        'forbidden',
      )
    }
    if (res.status === 429) {
      throw new SteamError('Rate limited by Steam', 429, 'rate_limited')
    }
    if (!res.ok) {
      throw new SteamError(`Steam responded with ${res.status}`, 502, 'upstream_error')
    }
    return await res.json()
  } catch (err) {
    if (err instanceof SteamError) throw err
    if (err instanceof Error && err.name === 'AbortError') {
      throw new SteamError('Steam API request timed out', 504, 'timeout')
    }
    throw new SteamError(
      err instanceof Error ? err.message : 'Steam API request failed',
      502,
      'network_error',
    )
  } finally {
    clearTimeout(timer)
  }
}

/**
 * TTL cache that also de-duplicates concurrent misses for the same key.
 *
 * @template T
 * @param {number} ttl
 */
function createCache(ttl) {
  /** @type {Map<string, { value: T, expires: number }>} */
  const entries = new Map()
  /** @type {Map<string, Promise<T>>} */
  const inflight = new Map()

  return {
    /**
     * @param {string} key
     * @param {() => Promise<T>} produce
     * @param {number} [minAge] ignore cached entries younger than this is false;
     *   pass a value to force a refresh once the entry is older than it
     * @returns {Promise<{ value: T, cached: boolean, age: number }>}
     */
    async get(key, produce, minAge) {
      const now = Date.now()
      const hit = entries.get(key)
      if (hit) {
        const age = ttl - (hit.expires - now)
        const stale = minAge === undefined ? hit.expires <= now : age >= minAge
        if (!stale) return { value: hit.value, cached: true, age }
      }

      const pending = inflight.get(key)
      if (pending) return { value: await pending, cached: true, age: 0 }

      const task = produce()
        .then((value) => {
          entries.set(key, { value, expires: Date.now() + ttl })
          return value
        })
        .finally(() => inflight.delete(key))

      inflight.set(key, task)
      return { value: await task, cached: false, age: 0 }
    },
  }
}

const profileCache = createCache(PROFILE_TTL)
const vanityCache = createCache(VANITY_TTL)

const STEAM_ID64 = /^\d{17}$/

/**
 * Accepts a SteamID64, a vanity name, or any steamcommunity.com profile URL and
 * returns the canonical SteamID64.
 *
 * @param {string} input
 * @returns {Promise<string>}
 */
export async function resolveSteamId(input) {
  const raw = String(input ?? '').trim()
  if (!raw) throw new SteamError('Missing Steam id', 400, 'bad_request')

  let candidate = raw
  const urlMatch = raw.match(/steamcommunity\.com\/(profiles|id)\/([^/?#]+)/i)
  if (urlMatch) candidate = decodeURIComponent(urlMatch[2])

  if (STEAM_ID64.test(candidate)) return candidate

  if (!/^[\w.-]{2,64}$/.test(candidate)) {
    throw new SteamError('Unrecognised Steam id or vanity name', 400, 'bad_request')
  }

  const { value } = await vanityCache.get(candidate.toLowerCase(), async () => {
    const data = await call('ISteamUser', 'ResolveVanityURL', 'v0001', {
      vanityurl: candidate,
    })
    // success: 1 = resolved, 42 = no match
    if (data?.response?.success !== 1 || !data.response.steamid) {
      throw new SteamError(`No Steam profile named "${candidate}"`, 404, 'not_found')
    }
    return String(data.response.steamid)
  })

  return value
}

/**
 * @param {number} appId
 * @param {string} [iconHash]
 */
function gameImages(appId, iconHash) {
  return {
    icon: iconHash ? `${ICON_CDN}/${appId}/${iconHash}.jpg` : null,
    capsule: `${CAPSULE_CDN}/${appId}/header.jpg`,
  }
}

/** @param {any} game */
function normaliseGame(game) {
  const appId = Number(game.appid)
  return {
    appId,
    name: game.name ?? `App ${appId}`,
    totalMinutes: Number(game.playtime_forever ?? 0),
    twoWeeksMinutes: Number(game.playtime_2weeks ?? 0),
    lastPlayed: game.rtime_last_played ? Number(game.rtime_last_played) : null,
    ...gameImages(appId, game.img_icon_url),
  }
}

/** @param {PromiseSettledResult<any>} result */
function settled(result) {
  return result.status === 'fulfilled' ? result.value : null
}

/**
 * Fetch and aggregate everything the profile card needs.
 *
 * Owned games / recent games / level are all optional: a private profile makes
 * Steam return an empty object rather than an error, and we degrade gracefully
 * instead of failing the whole payload.
 *
 * @param {string} steamId SteamID64
 */
async function fetchProfile(steamId) {
  const [summaryRes, levelRes, ownedRes, recentRes] = await Promise.allSettled([
    call('ISteamUser', 'GetPlayerSummaries', 'v0002', { steamids: steamId }),
    call('IPlayerService', 'GetSteamLevel', 'v0001', { steamid: steamId }),
    call('IPlayerService', 'GetOwnedGames', 'v0001', {
      steamid: steamId,
      include_appinfo: 1,
      include_played_free_games: 1,
    }),
    call('IPlayerService', 'GetRecentlyPlayedGames', 'v0001', {
      steamid: steamId,
      count: 8,
    }),
  ])

  // The summary is the only hard requirement.
  if (summaryRes.status === 'rejected') throw summaryRes.reason

  const player = summaryRes.value?.response?.players?.[0]
  if (!player) {
    throw new SteamError(`No Steam profile for ${steamId}`, 404, 'not_found')
  }

  const visibility = Number(player.communityvisibilitystate ?? 1)
  const state = Number(player.personastate ?? 0)

  const ownedGames = settled(ownedRes)?.response?.games ?? []
  const recentGames = settled(recentRes)?.response?.games ?? []

  const owned = ownedGames.map(normaliseGame)
  const recent = recentGames.map(normaliseGame)

  const totalMinutes = owned.reduce((sum, g) => sum + g.totalMinutes, 0)
  const twoWeekMinutes = recent.reduce((sum, g) => sum + g.twoWeeksMinutes, 0)

  const top = [...owned]
    .sort((a, b) => b.totalMinutes - a.totalMinutes)
    .slice(0, 5)

  return {
    profile: {
      steamId: String(player.steamid),
      name: player.personaname ?? 'Unknown',
      realName: player.realname ?? null,
      avatar: player.avatarfull ?? player.avatarmedium ?? player.avatar ?? null,
      profileUrl: player.profileurl ?? `https://steamcommunity.com/profiles/${steamId}`,
      state,
      stateText: PERSONA_STATES[state] ?? 'offline',
      visibility,
      isPrivate: visibility !== 3,
      createdAt: player.timecreated ? Number(player.timecreated) : null,
      lastLogoff: player.lastlogoff ? Number(player.lastlogoff) : null,
      country: player.loccountrycode ?? null,
      level: settled(levelRes)?.response?.player_level ?? null,
      playing: player.gameid
        ? {
            appId: Number(player.gameid),
            name: player.gameextrainfo ?? `App ${player.gameid}`,
            ...gameImages(Number(player.gameid)),
          }
        : null,
    },
    stats: {
      gameCount: settled(ownedRes)?.response?.game_count ?? owned.length,
      totalMinutes,
      twoWeekMinutes,
      recentCount: recent.length,
    },
    recent: recent.slice(0, 5),
    top,
  }
}

/**
 * Cached entry point used by the HTTP layer.
 *
 * @param {string} input SteamID64 / vanity name / profile URL
 * @param {{ refresh?: boolean }} [options]
 */
export async function getSteamProfile(input, options = {}) {
  const steamId = await resolveSteamId(input)
  const { value, cached, age } = await profileCache.get(
    steamId,
    () => fetchProfile(steamId),
    options.refresh ? REFRESH_FLOOR : undefined,
  )

  return {
    ok: true,
    steamId,
    cached,
    /** seconds since the upstream data was fetched */
    age: Math.round(age / 1000),
    fetchedAt: Date.now() - age,
    ttl: Math.round(PROFILE_TTL / 1000),
    ...value,
  }
}

/** Whether the server is able to talk to Steam at all. */
export function isConfigured() {
  return Boolean(process.env.STEAM_API_KEY?.trim())
}
