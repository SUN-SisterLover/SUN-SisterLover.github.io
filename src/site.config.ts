export type Bilingual = { zh: string; en: string }

export type ThemeColors = {
  ink: string
  ink2: string
  paper: string
  dim: string
  accent: string
  accent2: string
  amber: string
  line: string
  gridLine: string
  strokeFaint: string
}

export type Palette = {
  id: PaletteId
  label: Bilingual
  colors: {
    dark: ThemeColors
    light: ThemeColors
  }
}

export type PaletteId = 'classic' | 'aurora' | 'ember' | 'sakura'

export type LofiVideo = {
  url: string
  title: string
}

export type LofiConfig = {
  /** master switch for the /lofi immersive page */
  enabled: boolean
  /** auto-start playback on entering the /lofi page (subject to browser gesture policy) */
  autoplay: boolean
  wallpapers: {
    /** self-hosted videos with baked-in audio; looped and cycled manually via the player */
    videos: LofiVideo[]
  }
  visualizer: {
    /** master switch for the bar-spectrum visualizer */
    enabled: boolean
    /** number of frequency bars */
    bars: number
  }
  live2d: {
    /** speech bubble lines, picked at random (used by Live2D.tsx dialog tips) */
    tips: string[]
  }
  ambient: {
    /** default effect on first visit: 'rain' | 'snow' | 'particles' */
    default: 'rain' | 'snow' | 'particles'
  }
  pomodoro: {
    /** hide the pomodoro widget on the lofi page by default */
    hidden: boolean
    /** work duration in minutes */
    workMinutes: number
  }
}

export type SiteConfig = {
  brand: {
    name: string
    shortName: string
    titleWord1: string
    titleWord2: string
  }
  colors: Record<PaletteId, Palette>
  githubUrl: string
  nav: {
    showLang: boolean
    showTheme: boolean
    showGithub: boolean
    showLofi: boolean
  }
  background: {
    type: 'none' | 'image'
    url: string
    /** optional rotation list — when non-empty the background cross-fades through these instead of `url` */
    images?: string[]
    /** seconds between background swaps (only when `images` is non-empty) */
    swapSeconds?: number
    overlay: number
    blur: number
    fit: 'cover' | 'contain' | 'repeat'
  }
  audio: {
    home: {
      enabled: boolean
      /** default volume, 0~1 */
      volume: number
      /** playlist: played in order and looped on the homepage */
      tracks: {
        url: string
        title: string
        artist: string
        cover: string
      }[]
    }
  }
  steam: {
    /** master switch for the bottom-right Steam card */
    enabled: boolean
    /** SteamID64, vanity name, or a full steamcommunity.com profile URL */
    steamId: string
    /** polling interval in seconds (min 15; the proxy caches upstream for 60s) */
    refreshSeconds: number
    /** override when the proxy is hosted on another origin */
    apiBase: string
  }
  netease: {
    /** master switch for the NetEase card + player */
    enabled: boolean
    /** your NetEase Cloud Music user ID */
    uid: number
    /** playlist IDs to show as recommended tabs */
    playlistIds: number[]
    /** polling interval in seconds */
    refreshSeconds: number
    /** override when the proxy is hosted on another origin */
    apiBase: string
  }
  bilibili: {
    /** master switch for the Bilibili card on the data wall */
    enabled: boolean
    /** override when the proxy is hosted on another origin */
    apiBase: string
  }
  bangumi: {
    /** master switch for the Bangumi half of the anime card */
    enabled: boolean
    /** override when the proxy is hosted on another origin */
    apiBase: string
  }
  anilist: {
    /** master switch for the AniList half of the anime card */
    enabled: boolean
    /** override when the proxy is hosted on another origin */
    apiBase: string
  }
  stats: {
    /** master switch for the public visit counter shown in the hero */
    enabled: boolean
    /** override when the server is hosted on another origin */
    apiBase: string
  }
  comments: {
    /** master switch for the guestbook and per-article comment threads */
    enabled: boolean
    /** override when the server is hosted on another origin */
    apiBase: string
  }
  grid: {
    enabled: boolean
  }
  lofi: LofiConfig
  hero: {
    showParallax: boolean
    showStats: boolean
    showBadge: boolean
    showUpdated: boolean
    /** show the public all-time / today visit counts */
    showViews: boolean
  }
  strings: {
    zh: Record<string, string>
    en: Record<string, string>
  }
}

export const SITE_CONFIG: SiteConfig = {
  brand: {
    name: '喵小浔',
    shortName: '-xun-',
    titleWord1: 'MIAO',
    titleWord2: 'XIAOXUN',
  },

  colors: {
    classic: {
      id: 'classic',
      label: { zh: '经典', en: 'Classic' },
      colors: {
        dark: {
          ink: '#0f0f17',
          ink2: '#14141f',
          paper: '#f5f5f0',
          dim: '#a0a0b0',
          accent: '#d4ff1f',
          accent2: '#4ff0b7',
          amber: '#ffb347',
          line: 'rgb(245 245 240 / 0.15)',
          gridLine: 'rgb(245 245 240 / 0.06)',
          strokeFaint: 'rgb(245 245 240 / 0.22)',
        },
        light: {
          ink: '#fcfcf7',
          ink2: '#f4f4ee',
          paper: '#111118',
          dim: '#6b6b78',
          accent: '#84a300',
          accent2: '#5a9b6e',
          amber: '#d48400',
          line: 'rgb(17 17 24 / 0.18)',
          gridLine: 'rgb(17 17 24 / 0.07)',
          strokeFaint: 'rgb(17 17 24 / 0.2)',
        },
      },
    },

    aurora: {
      id: 'aurora',
      label: { zh: '极光', en: 'Aurora' },
      colors: {
        dark: {
          ink: '#081018',
          ink2: '#0d1a25',
          paper: '#f0f7fa',
          dim: '#8aa0ad',
          accent: '#2dd4bf',
          accent2: '#60a5fa',
          amber: '#fbbf24',
          line: 'rgb(240 247 250 / 0.16)',
          gridLine: 'rgb(240 247 250 / 0.07)',
          strokeFaint: 'rgb(240 247 250 / 0.24)',
        },
        light: {
          ink: '#f4f9fb',
          ink2: '#e8f1f5',
          paper: '#0a151c',
          dim: '#5a7280',
          accent: '#0d9488',
          accent2: '#2563eb',
          amber: '#b45309',
          line: 'rgb(10 21 28 / 0.16)',
          gridLine: 'rgb(10 21 28 / 0.07)',
          strokeFaint: 'rgb(10 21 28 / 0.22)',
        },
      },
    },

    ember: {
      id: 'ember',
      label: { zh: '余烬', en: 'Ember' },
      colors: {
        dark: {
          ink: '#120a0a',
          ink2: '#1e1212',
          paper: '#faf2ef',
          dim: '#b89a94',
          accent: '#fb923c',
          accent2: '#f87171',
          amber: '#fcd34d',
          line: 'rgb(250 242 239 / 0.16)',
          gridLine: 'rgb(250 242 239 / 0.07)',
          strokeFaint: 'rgb(250 242 239 / 0.24)',
        },
        light: {
          ink: '#fff8f5',
          ink2: '#f7ece7',
          paper: '#1a0f0d',
          dim: '#8b6f6a',
          accent: '#c2410c',
          accent2: '#dc2626',
          amber: '#a16207',
          line: 'rgb(26 15 13 / 0.16)',
          gridLine: 'rgb(26 15 13 / 0.07)',
          strokeFaint: 'rgb(26 15 13 / 0.22)',
        },
      },
    },

    sakura: {
      id: 'sakura',
      label: { zh: '樱色', en: 'Sakura' },
      colors: {
        dark: {
          ink: '#120a12',
          ink2: '#1e1420',
          paper: '#faf2f8',
          dim: '#c6a8be',
          accent: '#f472b6',
          accent2: '#a78bfa',
          amber: '#fde047',
          line: 'rgb(250 242 248 / 0.16)',
          gridLine: 'rgb(250 242 248 / 0.07)',
          strokeFaint: 'rgb(250 242 248 / 0.24)',
        },
        light: {
          ink: '#fcf6fa',
          ink2: '#f5ecf2',
          paper: '#1a0f18',
          dim: '#8f6f87',
          accent: '#db2777',
          accent2: '#7c3aed',
          amber: '#a16207',
          line: 'rgb(26 15 24 / 0.16)',
          gridLine: 'rgb(26 15 24 / 0.07)',
          strokeFaint: 'rgb(26 15 24 / 0.22)',
        },
      },
    },
  },

  githubUrl: 'https://github.com/SUN-SisterLover',

  nav: {
    showLang: true,
    showTheme: true,
    showGithub: true,
    showLofi: true,
  },

  background: {
    type: 'image',
    url: '/bg.jpg',
    images: [
      '/miku-wallpapers/miku-sunrise.jpg',
      '/miku-wallpapers/miku-eyepatch.jpg',
      '/miku-wallpapers/miku-sunrise2.jpg',
    ],
    swapSeconds: 12,
    overlay: 0.5,
    blur: 0,
    fit: 'cover',
  },

  audio: {
    home: {
      enabled: true,
      volume: 0.2,
      tracks: [
        {
          url: '/audio/main.mp3',
          title: 'インパアフェクシオン・ホワイトガアル',
          artist: 'ツミキ/月乃',
          cover: '/audio/main.webp',
        },
      ],
    },
  },

  steam: {
    enabled: true,
    // SteamID64 / 自定义 URL 名 / 完整主页链接都可以
    steamId: '76561199023640449',
    refreshSeconds: 60,
    apiBase: '/api/steam',
  },

  netease: {
    enabled: false,
    uid: 0,  // 替换为你的网易云音乐用户 ID
    playlistIds: [],  // 替换为你的推荐歌单 ID 列表
    refreshSeconds: 60,
    apiBase: '/api/netease',
  },

  bilibili: {
    enabled: true,
    apiBase: '/api/bilibili',
  },

  bangumi: {
    enabled: true,
    apiBase: '/api/bangumi',
  },

  anilist: {
    enabled: true,
    apiBase: '/api/anilist',
  },

  stats: {
    enabled: false,
    apiBase: '/api/stats',
  },

  comments: {
    enabled: false,
    apiBase: '/api/comments',
  },

  grid: {
    enabled: false,
  },

  hero: {
    showParallax: true,
    showStats: true,
    showBadge: true,
    showUpdated: true,
    showViews: true,
  },

  lofi: {
    enabled: true,
    autoplay: true,
    wallpapers: {
      // videos with baked-in audio (音画一体); drop files into public/lofi/videos/ and add a line here
      videos: [
        { url: '/lofi/videos/video-01.mp4', title: 'Video 01' },
      ],
    },
    visualizer: {
      enabled: true,
      bars: 28,
    },
    live2d: {
      tips: [
        '今天也要加油哦。',
        '戴上耳机，沉下来。',
        '休息一下，喝口水吧。',
        '慢慢来，比较快。',
        '窗外在下雨，很适合读书。',
        '专注的每一分钟都算数。',
        '想聊天的话，点我一下。',
      ],
    },
    ambient: {
      default: 'rain',
    },
    pomodoro: {
      hidden: true,
      workMinutes: 25,
    },
  },

  strings: {
    zh: {
      'doc.title': '喵小浔',
      'hero.kicker': 'Blog',
      'hero.badge': 'Game · Engine · Dream',
      'hero.sub': '个人作品集',
      'hero.readMore': '阅读文章',
      'meta.posts': '文章',
      'meta.tags': '标签',
      'meta.updated': '更新于',
      'meta.views': '访问',
      'meta.today': '今日',
      'post.readMore': '阅读全文',
      'post.back': '返回首页',
      'post.published': '发布于',
      'post.tags': '标签',
      'post.audio': '音频',
      'post.toc': '目录',
      'audio.play': '播放音乐',
      'audio.pause': '暂停音乐',
      'steam.title': 'Steam 动态',
      'steam.loading': '正在连接 Steam…',
      'steam.error': '暂时拿不到 Steam 数据',
      'steam.private': '该资料为私密状态',
      'steam.playing': '正在游玩',
      'steam.recent': '最近两周',
      'steam.top': '游玩最多',
      'steam.noRecent': '最近两周没有游玩记录',
      'steam.level': '等级',
      'steam.games': '游戏',
      'steam.total': '总时长',
      'steam.twoWeeks': '两周',
      'steam.refresh': '立即刷新',
      'steam.profileLink': '打开 Steam 主页',
      'steam.updated': '更新于',
      'steam.state.offline': '离线',
      'steam.state.online': '在线',
      'steam.state.busy': '忙碌',
      'steam.state.away': '离开',
      'steam.state.snooze': '打盹',
      'steam.state.trade': '想交易',
      'steam.state.play': '想玩游戏',
      'netease.title': '网易云音乐',
      'netease.loading': '正在连接…',
      'netease.error': '暂时拿不到数据',
      'netease.playing': '正在听',
      'netease.recent': '最近在听',
      'netease.noRecent': '最近没有听歌记录',
      'netease.refresh': '立即刷新',
      'netease.profileLink': '打开网易云主页',
      'netease.updated': '更新于',
      'netease.search': '搜索歌曲或歌手…',
      'netease.noResults': '没有找到相关歌曲',
      'netease.playlists': '推荐歌单',
      'netease.lyrics': '歌词',
      'netease.noLyrics': '暂无歌词',
      'datawall.refresh': '立即刷新',
      'datawall.updated': '更新于',
      'datawall.loading': '正在连接…',
      'datawall.configHint': '未配置数据源，请在服务器 .env 配置后刷新',
      'datawall.bili.title': 'Bilibili',
      'datawall.bili.noProxy': 'B站代理未配置，无法获取数据',
      'datawall.bili.spaceLink': '打开 B站 主页',
      'datawall.bili.followers': '粉丝',
      'datawall.bili.videos': '视频',
      'datawall.bili.following': '关注',
      'datawall.bili.recent': '最近投稿',
      'datawall.bili.noCookie': '服务端未配置 BILI_COOKIE，最近投稿列表暂不可用',
      'datawall.anime.title': '追番 · Anime',
      'datawall.anime.doing': '在看',
      'datawall.anime.collect': '看过',
      'datawall.anime.wish': '想看',
      'datawall.anime.score': '均分',
      'datawall.anime.watching': '正在追看',
      'datawall.anime.total': '总数',
      'datawall.anime.current': '追番中',
      'datawall.anime.hours': '小时',
      'datawall.anime.favourites': '最爱',
      'comments.title': '留言板',
      'comments.empty': '还没有留言，来当第一个吧~',
      'comments.name': '昵称',
      'comments.namePlaceholder': '怎么称呼你？',
      'comments.body': '留言',
      'comments.bodyPlaceholder': '说点什么…',
      'comments.submit': '发送',
      'comments.sending': '发送中…',
      'comments.sent': '发送成功，谢谢！',
      'comments.count': '留言',
      'comments.loadFailed': '暂时无法加载留言',
      'comments.sendFailed': '发送失败，请稍后重试',
      'comments.tooFast': '发得太快了，请等一分钟再试',
      'comments.tooLong': '内容太长了',
      'comments.needNameAndBody': '昵称和留言都要填哦',
      'footer.tagline': '咕咕嘎嘎？',
      'footer.built': '使用 React · GSAP · Tailwind · Bun 构建。',
      'lofi.title': '深夜自习室',
      'lofi.subtitle': '戴上耳机 沉下来',
      'lofi.back': '返回博客',
      'lofi.ambient.rain': '雨',
      'lofi.ambient.snow': '雪',
      'lofi.ambient.particles': '星',
      'lofi.play': '播放',
      'lofi.pause': '暂停',
      'lofi.next': '下一首',
      'lofi.prev': '上一首',
      'lofi.mute': '静音',
      'lofi.unmute': '取消静音',
      'lofi.pomodoro': '番茄钟',
      'lofi.pomodoro.start': '开始',
      'lofi.pomodoro.pause': '暂停',
      'lofi.pomodoro.reset': '重置',
    },
    en: {
      'doc.title': '喵小浔',
      'hero.kicker': 'Blog',
      'hero.badge': 'Game · Engine · Dream',
      'hero.sub': 'Just a sub title meow~',
      'hero.readMore': 'Read posts',
      'meta.posts': 'posts',
      'meta.tags': 'tags',
      'meta.updated': 'updated',
      'meta.views': 'views',
      'meta.today': 'today',
      'post.readMore': 'Read more',
      'post.back': 'Back to home',
      'post.published': 'Published',
      'post.tags': 'Tags',
      'post.audio': 'Audio',
      'post.toc': 'Contents',
      'audio.play': 'Play music',
      'audio.pause': 'Pause music',
      'steam.title': 'Steam activity',
      'steam.loading': 'Connecting to Steam…',
      'steam.error': 'Steam data unavailable',
      'steam.private': 'This profile is private',
      'steam.playing': 'Now playing',
      'steam.recent': 'Last 2 weeks',
      'steam.top': 'Most played',
      'steam.noRecent': 'Nothing played in the last 2 weeks',
      'steam.level': 'Level',
      'steam.games': 'games',
      'steam.total': 'total',
      'steam.twoWeeks': '2 weeks',
      'steam.refresh': 'Refresh now',
      'steam.profileLink': 'Open Steam profile',
      'steam.updated': 'updated',
      'steam.state.offline': 'Offline',
      'steam.state.online': 'Online',
      'steam.state.busy': 'Busy',
      'steam.state.away': 'Away',
      'steam.state.snooze': 'Snooze',
      'steam.state.trade': 'Looking to trade',
      'steam.state.play': 'Looking to play',
      'netease.title': 'NetEase Music',
      'netease.loading': 'Connecting…',
      'netease.error': 'Data unavailable',
      'netease.playing': 'Now playing',
      'netease.recent': 'Recently played',
      'netease.noRecent': 'No recent plays',
      'netease.refresh': 'Refresh now',
      'netease.profileLink': 'Open NetEase profile',
      'netease.updated': 'updated',
      'netease.search': 'Search songs or artists…',
      'netease.noResults': 'No songs found',
      'netease.playlists': 'Playlists',
      'netease.lyrics': 'Lyrics',
      'netease.noLyrics': 'No lyrics available',
      'datawall.refresh': 'Refresh now',
      'datawall.updated': 'updated',
      'datawall.loading': 'Connecting…',
      'datawall.configHint': 'Source not configured — set it in the server .env and refresh',
      'datawall.bili.title': 'Bilibili',
      'datawall.bili.noProxy': 'Bilibili proxy not configured',
      'datawall.bili.spaceLink': 'Open Bilibili profile',
      'datawall.bili.followers': 'followers',
      'datawall.bili.videos': 'videos',
      'datawall.bili.following': 'following',
      'datawall.bili.recent': 'Recent uploads',
      'datawall.bili.noCookie': 'Server has no BILI_COOKIE; recent uploads unavailable',
      'datawall.anime.title': 'Anime',
      'datawall.anime.doing': 'watching',
      'datawall.anime.collect': 'completed',
      'datawall.anime.wish': 'planned',
      'datawall.anime.score': 'avg',
      'datawall.anime.watching': 'Now watching',
      'datawall.anime.total': 'total',
      'datawall.anime.current': 'current',
      'datawall.anime.hours': 'hours',
      'datawall.anime.favourites': 'Favourites',
      'comments.title': 'guestbook',
      'comments.empty': 'No comments yet — be the first!',
      'comments.name': 'name',
      'comments.namePlaceholder': 'What should we call you?',
      'comments.body': 'comment',
      'comments.bodyPlaceholder': 'Say something…',
      'comments.submit': 'send',
      'comments.sending': 'sending…',
      'comments.sent': 'Sent. Thank you!',
      'comments.count': 'comments',
      'comments.loadFailed': 'Comments are unavailable right now',
      'comments.sendFailed': 'Could not send. Please try again.',
      'comments.tooFast': 'Too fast — please wait a minute',
      'comments.tooLong': 'That is too long',
      'comments.needNameAndBody': 'Both a name and a comment are required',
      'footer.tagline': 'I am a PlaceHolder',
      'footer.built': 'Built with React · GSAP · Tailwind · Bun.',
      'lofi.title': 'Lo-fi Study Room',
      'lofi.subtitle': 'Put on headphones, sink in',
      'lofi.back': 'Back to blog',
      'lofi.ambient.rain': 'Rain',
      'lofi.ambient.snow': 'Snow',
      'lofi.ambient.particles': 'Stars',
      'lofi.play': 'Play',
      'lofi.pause': 'Pause',
      'lofi.next': 'Next',
      'lofi.prev': 'Previous',
      'lofi.mute': 'Mute',
      'lofi.unmute': 'Unmute',
      'lofi.pomodoro': 'Pomodoro',
      'lofi.pomodoro.start': 'Start',
      'lofi.pomodoro.pause': 'Pause',
      'lofi.pomodoro.reset': 'Reset',
    },
  },
}
