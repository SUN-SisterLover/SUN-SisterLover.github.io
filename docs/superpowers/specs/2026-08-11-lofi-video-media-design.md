# lofi 模式媒体层改造：独立音视频 → 带音轨高清视频

## Background

lofi 模式当前是「3 个静音壁纸 mp4 + 5 首独立 mp3」两套媒体体系：

- `VideoWallpaper.tsx`：渲染 3 个 **muted** 循环视频（rain/night/fireplace），固定每 50 秒（`swapSeconds`）淡入淡出轮换；
- `LofiPlayer.tsx`：用独立 `<audio>` 播放 5 首 mp3（track-01~05），提供完整控制（播放/暂停、上下首、音量、静音）；
- `LofiVisualizer.tsx`：通过共享 `LofiAudioContext` 里的 `audioRef`（HTMLAudioElement）做 Web Audio 频谱分析。

用户将弃用全部现有素材，改用自己提供的高清视频——**音画一体（音轨已适配画面）**、多个且会持续添加。需要视频直接成为唯一媒体源，循环播放即可。

## Decisions (brainstorming, 已与用户确认)

1. 删除独立 mp3 音频体系，视频自带音轨；
2. 保留完整播放控制（播放/暂停、上一首/下一首、音量、静音），改为作用于 `<video>`；
3. 当前视频 `loop` 循环播放；上一首/下一首 = 手动切换视频（不做固定时间自动轮换）；
4. 保留频谱视觉器，改接 `<video>` 元素；
5. 移除 `swapSeconds` 固定轮换；
6. `autoplay` 开关从 `lofi.audio.autoplay` 提升为顶层 `lofi.autoplay`（`lofi.audio` 整体删除）。

## Architecture

统一媒体上下文：`LofiAudioContext` 共享的媒体元素从 `<audio>` 换为 `<video>`，播放器直接驱动当前视频。**index 状态上提到 context**，让壁纸渲染层与控制层共享。

```
LofiPage
 └─ LofiAudioProvider              ← index / goTo / mediaRef / requestPlay / bump
     ├─ VideoWallpaper             ← 渲染 videos[index] 的 <video>（全屏壁纸），ref→mediaRef
     ├─ LofiPlayer                 ← 播放/暂停/上下首/音量/静音，读 index 显示 title
     └─ LofiVisualizer             ← createMediaElementSource(mediaRef.current) 频谱
```

### 关键点

- **`<video>` 不设 `muted`**（要出声）。浏览器会拦截有声 autoplay → 复用 LofiPlayer 已有的 `needsGesture` 机制：首次 `el.play()` 被拒则显示「点击开启音乐」按钮，用户点击后 `requestPlay()`（手势内 resume AudioContext + play）。
- **`createMediaElementSource(video)`** 接受 `HTMLMediaElement`，video 是其子类，频谱逻辑不改；但该调用会接管视频音频输出，音量仍由 video 的 `volume`/`muted` 属性生效。
- **bump / audioVersion**：VideoWallpaper 每次（重新）挂载视频元素时 `bump()`，通知 LofiVisualizer 重新 attach、LofiPlayer 重新尝试播放。
- **每次只渲染一个 `<video>`**（`key={current.url}` 切视频时重建元素），去掉静态多视频与定时轮换。

## Changes

### `src/site.config.ts`
- `lofi.audio`（含 `tracks`）整体删除；新增顶层 `lofi.autoplay: boolean`。
- `lofi.wallpapers.videos`：`string[]` → `{ url: string; title: string }[]`，如：
  ```ts
  videos: [
    { url: '/lofi/videos/video-01.mp4', title: 'Video 01' },
  ],
  ```
- 移除 `lofi.wallpapers.swapSeconds`。
- 同步更新 `SiteConfig` 类型定义（`LofiTrack` 等类型区）。

### `src/components/lofi/LofiAudioContext.tsx`
- `audioRef` → `mediaRef`，类型 `HTMLMediaElement | null`。
- 新增 `index: number`、`setIndex: Dispatch<SetStateAction<number>>`，Provider 内部持有。
- 其余（`wantPlayRef`/`resumeRef`/`audioVersion`/`bump`/`requestPlay`）不变。

### `src/components/lofi/VideoWallpaper.tsx`
- 渲染 `videos[index % videos.length]` 的单个 `<video>`：`loop playsInline`、`preload="auto"`，不 muted。
- `key={current.url}` 强制切视频重建元素。
- effect 中 `mediaRef.current = videoRef.current` 并 `bump()`；cleanup 置空。
- 需 `useLofiAudio()` → VideoWallpaper 必须移入 `LofiAudioProvider` 内。

### `src/components/lofi/LofiPlayer.tsx`
- 数据源：`lofi.wallpapers.videos`（`{ url, title }`），不再读 `lofi.audio.tracks`。
- 播放/暂停/音量/静音作用于 `mediaRef.current`（video）。
- 上一首/下一首：`setIndex(i => (i + delta + len) % len)`。
- `el.loop = true`（由 VideoWallpaper 的 video 属性承担，LofiPlayer 不再创建媒体元素）。
- 保留 `needsGesture`、`hasMountedRef`、`autoplay` 尝试逻辑（读 `SITE_CONFIG.lofi.autoplay`）。
- UI：去掉 artist 行，只显示 `current.title`。

### `src/components/lofi/LofiVisualizer.tsx`
- `audioRef` → `mediaRef`；其余频谱逻辑不动。

### `src/components/LofiPage.tsx`
- `<VideoWallpaper />` 移入 `<LofiAudioProvider>` 内（最顶部），以使用 context。

## Assets

- 新目录 `public/lofi/videos/`，用户放入高清视频（mp4）。
- 删除 `public/lofi/audio/`（5 mp3）与旧 `public/lofi/wallpapers/`（3 静音 mp4）——删除前与用户二次确认。
- 用户视频未就绪时：配置留占位数组，代码改造先行。

## Not changing

- `withBase()` 路径包裹（`src/lib/base.ts`）。
- Live2D、AmbientAnimation、Pomodoro、i18n 文案、TopBar。
- `LofiAudioProvider` Provider 结构、`LofiPage` 布局框架。

## Verification

1. `npm run build` 通过，无 TS 错误。
2. `npm run dev` → `/lofi`：视频循环播放有声；播放/暂停、上下首、音量、静音正常；频谱随音轨跳动；主站 BGM 被抑制；无固定 50 秒轮换。
3. 部署：`dist/lofi/videos/` 包含视频，`server.js` 可访问。
