import { useState, useEffect, useLayoutEffect, useMemo, useRef } from 'react'
import { LangProvider, useLang } from './i18n'
import { ThemeProvider } from './theme'
import { POSTS } from './data/posts'
import { ScrollTrigger } from './lib/gsap'
import TopBar from './components/TopBar'
import Hero from './components/Hero'
import CommentMarquee from './components/CommentMarquee'
import CommentBoard from './components/CommentBoard'
import TagFilter from './components/TagFilter'
import PostCard from './components/PostCard'
import SearchBar from './components/SearchBar'
import Pagination from './components/Pagination'
import FriendLinks from './components/FriendLinks'
import PostView from './components/PostView'
import Footer from './components/Footer'
import CursorGlow from './components/CursorGlow'
import ScrollProgress from './components/ScrollProgress'
import GridSpotlight from './components/GridSpotlight'
import Background from './components/Background'
import FloatingPlayer from './components/FloatingPlayer'
import FloatingSteam from './components/FloatingSteam'
import FloatingNetease from './components/FloatingNetease'
import FloatingLayer from './components/FloatingLayer'
import TestPage from './components/TestPage'
import LofiPage from './components/LofiPage'
import ManagePage from './components/ManagePage'
import LofiEntry from './components/LofiEntry'
import FloatingBili from './components/FloatingBili'
import FloatingAnime from './components/FloatingAnime'
import { AudioProvider, useBgm } from './components/AudioProvider'
import { SITE_CONFIG } from './site.config'

function isTestRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/+$/, '') === '/test'
}

function isLofiRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/+$/, '') === '/lofi'
}

function isManageRoute(): boolean {
  if (typeof window === 'undefined') return false
  return window.location.pathname.replace(/\/+$/, '') === '/manage'
}

function Shell() {
  const { lang, t } = useLang()
  const { setActive } = useBgm()
  const [selectedPost, setSelectedPost] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [testRoute] = useState<boolean>(isTestRoute)
  const [lofiRoute] = useState<boolean>(isLofiRoute)
  const [manageRoute] = useState<boolean>(isManageRoute)

  const allTags = useMemo(
    () => [...new Set(POSTS.flatMap((p) => p.tags))].sort(),
    [],
  )
  // newest first — index order is chronological (oldest first)
  const sortedPosts = useMemo(() => [...POSTS].sort((a, b) => b.date.localeCompare(a.date)), [])
  const filteredPosts = useMemo(() => {
    let list = activeTag ? sortedPosts.filter((p) => p.tags.includes(activeTag)) : sortedPosts
    const q = query.trim().toLowerCase()
    if (q) {
      list = list.filter((p) =>
        [p.title.zh, p.title.en, p.excerpt.zh, p.excerpt.en, p.tags.join(' '), p.body.zh, p.body.en]
          .join('\n')
          .toLowerCase()
          .includes(q),
      )
    }
    return list
  }, [sortedPosts, activeTag, query])

  const PAGE_SIZE = 5
  const totalPages = Math.max(1, Math.ceil(filteredPosts.length / PAGE_SIZE))
  const pagedPosts = filteredPosts.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  useEffect(() => {
    setPage(1)
  }, [query, activeTag])

  const post = selectedPost ? POSTS.find((p) => p.id === selectedPost) ?? null : null

  useEffect(() => {
    ScrollTrigger.refresh()
  }, [lang])

  useEffect(() => {
    // The BGM keeps playing across navigation (home <-> posts) — only the
    // lofi and manage pages silence it. The lofi page calls setActive(false)
    // itself on mount; child effects run before parent effects, so without
    // this guard Shell would re-enable the BGM right after. /manage renders
    // no player at all, so the BGM would be unstoppable there.
    if (lofiRoute || manageRoute) return
    setActive(true)
  }, [setActive, lofiRoute, manageRoute])

  useEffect(() => {
    const postId = window.location.hash.slice(1).split(':')[0]
    if (!postId) return
    if (POSTS.some((p) => p.id === postId)) {
      setSelectedPost(postId)
    }
  }, [])

  useEffect(() => {
    // replaceState keeps the shareable #post-id URL without the browser's
    // fragment navigation — assigning location.hash (especially '') scrolls
    // the page to the top
    window.history.replaceState(
      null,
      '',
      selectedPost ? `#${selectedPost}` : window.location.pathname + window.location.search,
    )
  }, [selectedPost])

  // remember where the reader was on the list and return them there
  const savedScrollRef = useRef(0)
  const restoreScrollRef = useRef(false)
  const openPost = (id: string) => {
    savedScrollRef.current = window.scrollY
    restoreScrollRef.current = true
    setSelectedPost(id)
  }
  useLayoutEffect(() => {
    if (!post && restoreScrollRef.current) {
      restoreScrollRef.current = false
      window.scrollTo(0, savedScrollRef.current)
    }
  }, [post])

  if (lofiRoute && SITE_CONFIG.lofi.enabled) {
    return <LofiPage />
  }

  if (manageRoute) {
    return (
      <div className={`${SITE_CONFIG.grid.enabled ? 'bg-blueprint' : ''} min-h-[100dvh]`}>
        <Background />
        <ManagePage onExit={() => (window.location.pathname = '/')} />
      </div>
    )
  }

  if (testRoute) {
    return (
      <div className="min-h-[100dvh]">
        <Background />
        <TestPage onExit={() => (window.location.pathname = '/')} />
        <FloatingLayer>
          <FloatingPlayer />
          <FloatingNetease />
          <FloatingSteam />
        </FloatingLayer>
      </div>
    )
  }

  const layout = (
    <>
      <TopBar />
      <main>
        {post ? (
          <PostView post={post} onBack={() => setSelectedPost(null)} />
        ) : (
          <>
            <Hero />
            <CommentMarquee />
            <div id="posts" className="mx-auto w-full max-w-7xl px-4 pb-16 md:pb-28">
              <div className="border-line border-t pt-6">
                <div className="mb-4 max-w-md">
                  <SearchBar value={query} onChange={setQuery} />
                </div>
                <TagFilter tags={allTags} activeTag={activeTag} onSelect={setActiveTag} />
              </div>
              <div className="border-line border-t" />
              <div className="relative isolate">
                {pagedPosts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onSelect={() => openPost(p.id)}
                  />
                ))}
                {filteredPosts.length === 0 && (
                  <p className="text-dim py-12 text-center font-mono text-xs tracking-[0.15em]">
                    {t('search.empty')}
                  </p>
                )}
                <div
                  aria-hidden
                  className="pointer-events-none absolute inset-0 -z-[1] bg-ink-2/[0.04]"
                  style={{
                    backdropFilter: 'blur(14px)',
                    WebkitBackdropFilter: 'blur(14px)',
                    maskImage:
                      'linear-gradient(to right, #000 0%, rgba(0,0,0,0.55) 30%, transparent 72%)',
                    WebkitMaskImage:
                      'linear-gradient(to right, #000 0%, rgba(0,0,0,0.55) 30%, transparent 72%)',
                  }}
                />
              </div>
              <Pagination page={page} total={totalPages} onChange={setPage} />
            </div>
            <FriendLinks />
            <CommentBoard />
          </>
        )}
      </main>
      <Footer />
    </>
  )

  return (
    <div className={`${SITE_CONFIG.grid.enabled ? 'bg-blueprint' : ''} min-h-[100dvh]`}>
      <Background />
      {layout}
      <FloatingLayer>
        <FloatingPlayer />
        <FloatingNetease />
        <FloatingSteam />
        <FloatingBili />
        <FloatingAnime />
        <LofiEntry />
      </FloatingLayer>
      <GridSpotlight />
      <ScrollProgress />
      <CursorGlow />
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <AudioProvider>
          <Shell />
        </AudioProvider>
      </LangProvider>
    </ThemeProvider>
  )
}
