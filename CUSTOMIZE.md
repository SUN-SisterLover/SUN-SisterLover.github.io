# 网站个性化清单（给我标注用）

用法：在每项的 `👉 改成：` 后面填你要的值；不需要改的就写「保留」或直接跳过。
填完告诉我一声，我统一改。已标 ✅ 的是我已经改好的。

---

## 1. 身份与文案

### ✅ 1.1 站名 / 品牌（已改）
位置：`src/site.config.ts` 的 `brand` 块
- name: `喵小浔`（顶栏、页脚显示）
- shortName: `-xun-`（小尺寸屏顶栏显示）
- titleWord1 / titleWord2: `MIAO` / `XIAOXUN`（首页大字标题两行）

👉 改成（如想调整写法，比如英文名、大小写）：

### ✅ 1.2 浏览器标签标题（已改）
位置：`index.html` 的 `<title>` 和 og 标签；`site.config.ts` 里 zh/en 的 `doc.title`
- 当前：`喵小浔 · 笔记`

👉 改成：

### 1.3 首页副标题 / 标语
位置：`site.config.ts` → `strings.zh` / `strings.en`
- `hero.kicker`: `Blog`
- `hero.badge`: `Game · Engine · Dream`（名字下方的小徽章行）
- `hero.sub`: 中文 `个人作品集` / 英文 `Just a sub title meow~`

👉 改成：

### 1.4 GitHub 链接
位置：`site.config.ts` → `githubUrl`
- 当前：`https://github.com/SUN-SisterLover`（原作者的）

👉 改成：

---

## 2. 外观

### 2.1 首页背景图
位置：`site.config.ts` → `background`
- 当前：默认 `/bg.jpg`，每 12 秒轮播 `/miku-wallpapers/` 里的 3 张初音壁纸
- 换法：把图片丢进 `public/`，改这里的路径；`images` 列表清空就不轮播

👉 改成（图片文件名/是否轮播）：

### 2.2 配色主题
位置：`site.config.ts` → `colors`，共 4 套：classic(黄绿) / aurora(极光蓝) / ember(暖橙) / sakura(粉)
- 当前：4 套都保留，右上角可切换

👉 改成（删哪套/留哪套/调颜色）：

### 2.3 顶栏按钮
位置：`site.config.ts` → `nav`
- 当前：语言切换 ✅ / 主题切换 ✅ / GitHub 按钮 ✅ / Lofi 入口 ✅

👉 改成（要关掉哪个）：

---

## 3. 媒体功能

### 3.1 首页背景音乐
位置：`site.config.ts` → `audio.home`
- 当前：开启，音量 0.2，曲目 `public/audio/main.mp3`（原作者的歌）
- 换法：替换 `public/audio/` 里的 mp3，或改 tracks 列表

👉 改成（换歌/关闭/调音量）：

### 3.2 Lofi 沉浸页（/lofi）
位置：`site.config.ts` → `lofi`
- 当前：开启，自动播放 `public/lofi/videos/video-01.mp4`，带频谱可视化 + Live2D 小人 + 环境特效(雨/雪/粒子) + 番茄钟
- live2d 的对话气泡文案在 `lofi.live2d.tips`（目前是 6 句中文鸡汤）

👉 改成（关闭/换视频/改气泡文案）：

---

## 4. 文章相关

### 4.1 文章列表显示方式
- 当前：56 篇按日期排序（index 01-56），标签来自你 Hexo 时代的 tags

👉 有要隐藏的文章吗（写文件名即可，我加 `hidden: true`）：

### 4.2 其他想调整的
👉 自由发挥：

---

## 备注（不用填）
- B站/Steam/追番/网易云/评论等数据卡：已全部关闭（需自架服务器才能用，想开告诉我）
- favicon：目前是代码生成的绿色小方块，想换图片 favicon 把文件丢 `public/` 告诉我
- 每篇文章的英文标题/摘要是我批量翻译的，改 `posts/*.md` 里对应字段后跑 `npm run update` 生效
