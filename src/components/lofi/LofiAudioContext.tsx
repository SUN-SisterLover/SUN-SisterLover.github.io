import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'

type LofiAudioCtx = {
  /** the current <video> element backing both the wallpaper and the player */
  mediaRef: React.MutableRefObject<HTMLMediaElement | null>
  /** index into SITE_CONFIG.lofi.wallpapers.videos of the currently shown video */
  index: number
  setIndex: Dispatch<SetStateAction<number>>
  /** whether the shared media element is currently playing */
  isPlaying: boolean
  /** whether the right-side playlist panel is open */
  playlistOpen: boolean
  setPlaylistOpen: Dispatch<SetStateAction<boolean>>
  wantPlayRef: React.MutableRefObject<boolean>
  /** try to start playback (autoplay or click-degrade); safe to call repeatedly */
  requestPlay: () => void
  /** populated by LofiVisualizer; resumes the analyser's AudioContext inside a user gesture */
  resumeRef: React.MutableRefObject<(() => void) | null>
  /** incremented by VideoWallpaper whenever it swaps the <video> element */
  audioVersion: number
  /** notify consumers (LofiVisualizer / LofiPlayer) that mediaRef.current now points to a new element */
  bump: () => void
}

const Ctx = createContext<LofiAudioCtx | null>(null)

export function LofiAudioProvider({ children }: { children: ReactNode }) {
  const mediaRef = useRef<HTMLMediaElement | null>(null)
  const wantPlayRef = useRef(false)
  const resumeRef = useRef<(() => void) | null>(null)
  const [index, setIndex] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playlistOpen, setPlaylistOpen] = useState(false)
  const [audioVersion, setAudioVersion] = useState(0)

  // keep isPlaying in sync with the shared media element; VideoWallpaper bumps
  // audioVersion whenever it swaps the element, so re-attach listeners there
  useEffect(() => {
    const el = mediaRef.current
    if (!el) return
    const onPlay = () => setIsPlaying(true)
    const onPause = () => setIsPlaying(false)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    setIsPlaying(!el.paused)
    return () => {
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [audioVersion])

  const bump = () => setAudioVersion((v) => v + 1)

  const requestPlay = () => {
    wantPlayRef.current = true
    // resume the analyser's AudioContext within this user-gesture call so playback isn't silent
    resumeRef.current?.()
    const el = mediaRef.current
    if (!el) return
    const p = el.play()
    if (p && typeof p.catch === 'function') p.catch(() => {})
  }

  return (
    <Ctx.Provider
      value={{
        mediaRef,
        index,
        setIndex,
        isPlaying,
        playlistOpen,
        setPlaylistOpen,
        wantPlayRef,
        requestPlay,
        resumeRef,
        audioVersion,
        bump,
      }}
    >
      {children}
    </Ctx.Provider>
  )
}

export function useLofiAudio(): LofiAudioCtx {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useLofiAudio must be used within LofiAudioProvider')
  return ctx
}
