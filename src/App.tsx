import { useState, useEffect, useMemo } from 'react'
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
  const { lang } = useLang()
  const { setActive, setTrack } = useBgm()
  const [selectedPost, setSelectedPost] = useState<string | null>(null)
  const [activeTag, setActiveTag] = useState<string | null>(null)
  const [testRoute] = useState<boolean>(isTestRoute)
  const [lofiRoute] = useState<boolean>(isLofiRoute)
  const [manageRoute] = useState<boolean>(isManageRoute)

  const allTags = useMemo(
    () => [...new Set(POSTS.flatMap((p) => p.tags))].sort(),
    [],
  )
  const filteredPosts = useMemo(
    () => (activeTag ? POSTS.filter((p) => p.tags.includes(activeTag)) : POSTS),
    [activeTag],
  )

  const post = selectedPost ? POSTS.find((p) => p.id === selectedPost) ?? null : null

  useEffect(() => {
    ScrollTrigger.refresh()
  }, [lang])

  useEffect(() => {
    // The lofi page silences the main-site BGM itself (LofiPage calls
    // setActive(false) on mount). Child effects run before parent effects,
    // so without this guard Shell would re-enable the BGM right after.
    // /manage renders no player at all, so the BGM would be unstoppable there.
    if (lofiRoute || manageRoute) return
    setActive(selectedPost === null)
  }, [selectedPost, setActive, lofiRoute, manageRoute])

  // clear any article track override when the page changes
  useEffect(() => {
    setTrack(null)
  }, [post, setTrack])

  useEffect(() => {
    const postId = window.location.hash.slice(1).split(':')[0]
    if (!postId) return
    if (POSTS.some((p) => p.id === postId)) {
      setSelectedPost(postId)
    }
  }, [])

  useEffect(() => {
    if (selectedPost) {
      window.location.hash = selectedPost
    } else {
      window.location.hash = ''
    }
  }, [selectedPost])

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
                <TagFilter tags={allTags} activeTag={activeTag} onSelect={setActiveTag} />
              </div>
              <div className="border-line border-t" />
              <div className="relative isolate">
                {filteredPosts.map((p) => (
                  <PostCard
                    key={p.id}
                    post={p}
                    onSelect={() => setSelectedPost(p.id)}
                  />
                ))}
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
            </div>
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
