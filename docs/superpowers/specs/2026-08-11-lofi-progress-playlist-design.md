# lofi 播放器增强：进度条 + 歌曲列表面板

## Background

`/lofi` 页面当前播放器（`LofiPlayer`）只有 播放/暂停、上一首/下一首、音量/静音 控制，无法看到播放进度，也无法直接浏览/切换视频曲目。视频配置（`SITE_CONFIG.lofi.wallpapers.videos`）为 `{ url, title }[]`，会持续添加多首，需要一个可见的列表来切换。

用户需求（已确认）：

1. **进度条**：显示当前播放位置，可拖动跳转，显示当前/总时长。
2. **歌曲列表**：右侧可折叠侧边面板，按钮开关，列出所有视频曲目，点击切换，当前曲目高亮并显示播放指示。

## Decisions (brainstorming, 已与用户确认)

1. 进度条做成独立组件 `LofiProgressBar`，放进播放器卡片底部全宽一行。
2. 歌曲列表做成独立组件 `LofiPlaylist`，固定在屏幕右侧、垂直居中、按钮开关（默认收起）。
3. 播放状态 `isPlaying` 与面板开合 `playlistOpen` 收拢到 `LofiAudioContext`，供播放器与列表共享。
4. 切歌后播放状态沿用现有上下首行为：播放中切歌自动续播，暂停时切歌保持暂停（用户未要求"点击即播"）。
5. 不引入第三方播放器库，继续用原生 `<video>` 元素（`VideoWallpaper` 全屏壁纸持有）。

## Architecture

```
LofiAudioContext (新增 isPlaying / playlistOpen + setPlaylistOpen)
 ├─ VideoWallpaper      ← 持有全屏 <video>，mediaRef 指向它
 ├─ LofiPlayer          ← 读 isPlaying；控制行加 ListMusic 按钮开关面板；插入 LofiProgressBar
 │    └─ LofiProgressBar ← 读 mediaRef.current（timeupdate/loadedmetadata），拖动 seek
 └─ LofiPlaylist        ← 读 index/setIndex/isPlaying/playlistOpen；渲染右侧面板
```

### 关键点

- **isPlaying 维护**：`LofiAudioProvider` 内新增 `useEffect`（依赖 `audioVersion`），给 `mediaRef.current` 挂 play/pause 监听并同步 `isPlaying`，cleanup 卸载。`LofiPlayer` 删除本地 `playing` 状态改读 `isPlaying`，其 `needsGesture` 手势降级逻辑保留（可改为 `useEffect` 监听 `isPlaying` 清除手势标记）。
- **进度条**：`input[type=range]` + `accent-amber-400`，与现有音量条一致。拖动中只更新显示（`pointerdown` 标记 scrubbing，`timeupdate` 期间不覆盖滑块值），`pointerup` 时 `el.currentTime = value` 提交 seek，避免长视频反复 seek。时间格式 `H:MM:SS`（≥1h）或 `M:SS`。
- **边界**：`duration` 未就绪（NaN）时禁用拖动；`audioVersion` 变化（切歌/换元素）重挂监听并重置。

## Changes

### `src/components/lofi/LofiAudioContext.tsx`
- 类型新增 `isPlaying: boolean`、`playlistOpen: boolean`、`setPlaylistOpen: Dispatch<SetStateAction<boolean>>`。
- Provider 内新增 `[isPlaying, setIsPlaying]` 与 `[playlistOpen, setPlaylistOpen]` 状态。
- 新增 effect（依赖 `audioVersion`）：挂/卸 `play`/`pause` 监听同步 `isPlaying`，初始值 `!el.paused`。

### `src/components/lofi/LofiPlayer.tsx`
- 删除本地 `playing` 状态，改从 context 读 `isPlaying`；删除 onPlay/onPause 监听（context 已承担），`needsGesture` 用 `useEffect([isPlaying])` 清除。
- 控制行（静音键旁）新增 `ListMusic` 按钮：`setPlaylistOpen(o => !o)`，`aria-expanded`。
- 卡片布局改为纵向：上半原 flex 行（唱片 + 标题 + 控制），下半全宽 `<LofiProgressBar />`。

### `src/components/lofi/LofiProgressBar.tsx`（新建）
- 读 `mediaRef.current`，effect 依赖 `audioVersion` 挂 `timeupdate`/`loadedmetadata`/`durationchange`。
- 渲染 `当前时间 [slider] 总时长`；拖动态 `scrubbing`；禁用时置灰。

### `src/components/lofi/LofiPlaylist.tsx`（新建）
- 读 `SITE_CONFIG.lofi.wallpapers.videos`、`index/setIndex/isPlaying/playlistOpen/setPlaylistOpen`。
- `playlistOpen` 为 false 时不渲染。
- 右侧固定面板：`fixed right-0 top-1/2 -translate-y-1/2`，`w-72 max-w-[80vw] max-h-[70vh] overflow-y-auto`，`rounded-l-2xl border border-white/10 bg-black/40 backdrop-blur-md`。
- 列表行：`title`；当前曲目高亮（琥珀色）；播放中显示跳动的均衡器动画（`isPlaying && 当前`）。点击行 `setIndex(i)`。头部有关闭按钮。
- 无障碍：`role="list"/"listitem"`、按钮 `aria-label`。

### `src/components/LofiPage.tsx`
- 在 `<LofiAudioProvider>` 内、`<LofiVisualizer />` 旁挂载 `<LofiPlaylist />`。

## Assets

- 无新素材。验证"切换"逻辑时可在配置里临时加一条指向同一视频的重复项（不同 `title`），验证后移除。

## Not changing

- `VideoWallpaper`（`<video>` 元素与 `key` 切换机制）、`LofiVisualizer`（频谱）、`LofiAudioContext` 现有字段（`mediaRef/index/setIndex/wantPlayRef/requestPlay/resumeRef/audioVersion/bump`）。
- 主站 BGM、AmbientAnimation、Live2D、Pomodoro、顶部栏。

## Verification

1. `npm run build` 通过，无 TS 错误。
2. 本地 `node server.js` 打开 `/lofi`：
   - 进度条随时间前进，时间显示格式正确（61 分钟视频显示 `1:01:26` 级）；拖动可跳转，拖动中不跳动、松开落点准确。
   - 播放器控制行有列表按钮；点击右侧弹出面板，当前曲高亮，播放中显示均衡器动画；关闭按钮/再点按钮可收起。
   - 配置临时加重复视频项后，列表显示 2 行，点击可切换，标题与进度条随之更新；移除重复项。
3. 无障碍：键盘可操作进度条（原生 range 方向键）与列表按钮。
