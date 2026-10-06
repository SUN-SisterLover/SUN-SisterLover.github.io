# 部署到自有服务器

本博客是「前端 SPA + Express 服务端代理」结构。**部署到自有服务器**（而非 GitHub Pages）后，所有依赖服务端代理的功能才会完整可用：

| 功能 | GitHub Pages（纯静态） | 自有服务器 |
|------|:---:|:---:|
| 文章 / 主题 / lofi / 壁纸 | ✅ | ✅ |
| 右下角 B站卡 | ❌（自动隐藏） | ✅ |
| 右下角追番卡（Bangumi + AniList） | ❌（自动隐藏） | ✅ |
| Steam 状态卡 | ❌（自动隐藏） | ✅ |
| 网易云播放器 | ⚠️（部分） | ✅ |

## 1. 服务器前置

- **Linux VPS**（推荐 Ubuntu 22.04+），1 核 1G 起步即可
- **Node.js 20+**（含 `npm`）
- 一个**域名**（可选，但强烈推荐，用于 HTTPS）

安装 Node 20：

```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # 应 ≥ 20.x
```

## 2. 拉取代码并安装

```bash
git clone https://github.com/Kita-kirakiradokidoki/mikudayo-kirakiradokidoki.git
cd mikudayo-kirakiradokidoki
npm ci
```

## 3. 配置 `.env`

复制 `.env.example` 为 `.env`（若不存在），填入密钥。密钥**只存在服务端**，不会打进前端 bundle：

```bash
# Steam 状态卡必需（申请：https://steamcommunity.com/dev/apikey）
STEAM_API_KEY=你的key

# 网易云高清音质（可选，登录网易云网页版后复制完整 cookie）
NETEASE_COOKIE=你的网易云cookie

# B站最近投稿（可选，无此项时 B站卡隐藏投稿列表但其余正常）
# 获取：浏览器登录 bilibili.com → 开发者工具 → Application → Cookies → 复制 SESSDATA=...; bili_jct=...
BILI_COOKIE=SESSDATA=xxx; bili_jct=xxx

# ── 数据墙账号身份 ───────────────────────────────
# B站 UID（space.bilibili.com/546195 → 546195）
BILI_UID=你的B站UID
# Bangumi 用户名（bgm.tv/user/你的名字）
BANGUMI_USERNAME=你的Bangumi用户名
# AniList 用户名（anilist.co/user/你的名字）
ANILIST_USERNAME=你的AniList用户名
```

## 4. 配置站点

### 账号身份（`.env`，见第 3 节）

数据墙三源的身份放服务端 `.env`：`BILI_UID`、`BANGUMI_USERNAME`、`ANILIST_USERNAME`。
改账号只需改 `.env` 并重启服务，**不需要重新构建前端**。

### 站点开关（`src/site.config.ts`）

前端配置只控制开关与代理路径，不含账号：

- `steam.steamId` / `netease.uid` —— 仍在前端配置（SteamID 为公开信息）
- `bilibili.enabled` / `bangumi.enabled` / `anilist.enabled` —— 各浮动卡开关

> 未配置 `.env` 身份时，对应浮动卡自动隐藏（与 Steam 卡在无 key 时的行为一致）。

## 5. 构建并启动

```bash
npm run build
# 前台启动（测试）：
node server.js
```

访问 `http://你的服务器IP:3000/`，首页右下角应显示 B站 / 追番 / Steam 三张浮动卡（hover 展开）。

> **这条自检只在配好 Nginx 之前做。** 第 10 节要求 3000 端口不对公网开放，而这条自检恰恰要从外部直连 3000，两者是有冲突的。正确顺序：先按本节直连 3000 确认进程能起、页面能开，**随即关掉 3000 的公网入口**（`sudo ufw deny 3000`，或云安全组只放行 80/443），再进第 7 节配 Nginx，此后一律通过域名访问。验证完不关，等于把第 10 节说的「伪造 `X-Real-IP` 绕过限流」的口子一直敞着。

## 6. 用 PM2 常驻

```bash
sudo npm install -g pm2
pm2 start server.js --name nagi-blog
pm2 save
pm2 startup   # 按提示执行输出命令，开机自启
```

常用：`pm2 logs nagi-blog`、`pm2 restart nagi-blog`、`pm2 monit`。

> **必须保持 fork 模式、`instances=1`。** 访问统计把计数放在进程内存里再落盘，多个实例会各写各的、互相覆盖。不要给这个应用加 `-i`（cluster 模式）。

## 7. Nginx 反向代理 + HTTPS

1. 把域名 A 记录解析到服务器 IP。
2. 安装 Nginx 与证书：

```bash
sudo apt-get install -y nginx certbot python3-certbot-nginx
```

3. 新建 `/etc/nginx/sites-available/nagi-blog`：

```nginx
server {
    listen 80;
    server_name blog.example.com;   # 换成你的域名

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # 允许播放器/进度条等长连接
        proxy_read_timeout 300s;
    }
}
```

```bash
sudo ln -s /etc/nginx/sites-available/nagi-blog /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d blog.example.com   # 自动配 HTTPS
```

4. 若 `site.config.ts` 中 `apiBase` 需要指向完整域名，可改为 `https://blog.example.com/api/...`；默认 `'/'` 相对路径在同域部署下无需改动。

## 8. 上线验证清单

- [ ] 首页 200，文章可读，主题/语言切换正常
- [ ] 右下角显示 B站 / 追番 / Steam 浮动卡（与 Player / Lofi 同款交互）
- [ ] B站卡：配置了 `BILI_UID` → hover 展开显示头像/粉丝/视频数；未配置 → 卡自动隐藏
- [ ] 追番卡：配置了 `BANGUMI_USERNAME` / `ANILIST_USERNAME` → hover 展开显示统计；未配置 → 卡自动隐藏
- [ ] 配置了 `BILI_COOKIE` → B站卡显示最近投稿列表
- [ ] Steam 卡：在线状态与时长正常（不再是"代理未配置"）
- [ ] 网易云播放器可搜索/播放
- [ ] 单张卡故障不影响其他卡（可在某卡 `enabled` 置 false 验证）
- [ ] 首页 Hero 统计行显示「访问 / 今日」两个数字，且刷新后 +1
- [ ] `curl -s localhost:3000/api/stats/summary` 返回 `{"ok":true,...}`
- [ ] 首页留言板可发可显：提交后立即出现在列表顶部，刷新后仍在
- [ ] 文章页留言只出现在该文章下，首页留言板看不到它
- [ ] `curl -s localhost:3000/api/comments` 返回 `{"ok":true,"comments":[...]}`
- [ ] `/manage` 输入 `.env` 里的 `COMMENTS_ADMIN_KEY` 能列出并删除留言

## 9. 访问统计数据

首页 Hero 的「访问 / 今日」由 `server/stats.mjs` 提供，计数写在项目根目录的
`data/stats.json`：

```json
{ "total": 12345, "today": 67, "date": "2026-10-05", "updatedAt": "..." }
```

- 该文件是**运行时数据**，不在 `dist/` 内，`npm run build` 不会覆盖它；已在 `.gitignore` 中。
- 计数先记在进程内存，最多每 1.5 秒合并写一次盘；`pm2 stop` / `pm2 restart` 会先落盘再退出，**正常重启不丢数据**。
- 只有 `kill -9` 或断电才会丢最多 1.5 秒的计数。
- **迁移或重装服务器时必须单独备份 `data/stats.json`**，否则访问量归零。
- 「今日」按北京时间（固定 +08:00）计算，与服务器时区无关。
- 想清零重来：`rm data/stats.json && pm2 restart nagi-blog`。

## 10. 访客留言

首页留言板与文章评论区由 `server/comments.mjs` 提供，留言写在 `data/comments.json`。

- 与 `data/stats.json` 一样属于运行时数据：不在 `dist/` 内，`npm run build` 不覆盖，已在 `.gitignore` 中，**迁移服务器时需单独备份**。
- 若在同一台机器上同时跑 `npm run dev` 和 `npm start`，两个进程各持有一份 `data/comments.json` 的内存副本，写盘是「最后落盘者覆盖」，一边新增的留言可能被另一边抹掉——开发时建议不要同时跑。
- 访客留言**立即公开**，无审核。发现垃圾留言用下方管理页删除。
- 管理页：访问 `你的网址/manage`，输入 `.env` 里的 `COMMENTS_ADMIN_KEY`。
- 未配置 `COMMENTS_ADMIN_KEY` 时删除接口关闭（返回 503），留言提交与展示照常。
- 基础防护：同 IP 每分钟 1 条；昵称 1–24 字、正文 1–500 字；隐藏的蜜罐字段 `website`。
- 蜜罐**不拦截、不报错**：被填时接口照常返回 200，只是不写入任何留言 —— 让只读状态码的脚本以为投递成功了。所以它不是一道"挡住"的闸，而是一次伪装；真正的兜底是上面的限流。
- 蜜罐与限速有先后：**限速排在读 body 之前**，因此一个本分钟内已经发过留言的 IP 去填蜜罐，拿到的是 429 而不是 200 —— 只有还有限速额度的 IP 才走得到蜜罐。
- 列表最多显示最近 200 条。

限流按访客 IP 计算，IP 取自 Nginx 写入的 `X-Real-IP`，服务端无条件信任这个头——这只在第 7 节的 Nginx 反代之后成立（那里用 `$remote_addr` 覆盖该头，客户端伪造的值会被丢弃）。
所以 3000 端口**必须只对本机开放、绝不能暴露到公网**：一旦访客能直连，他自带一个 `X-Real-IP` 就能绕过每分钟 1 条的限制。
注意 `server.js` 默认监听 `0.0.0.0`（所有网卡），拦住直连靠的是防火墙 / 云安全组（如 `ufw deny 3000`，或安全组只放行 80/443、让 Nginx 从 `127.0.0.1:3000` 回源），而不是监听地址本身。

## 常见问题

- **右下角某张卡不显示**：对应 `.env` 身份变量未设置（`BILI_UID` / `BANGUMI_USERNAME` / `ANILIST_USERNAME`），未配置时卡自动隐藏；填好后 `pm2 restart nagi-blog` 即可。
- **B站卡显示「代理未配置」**：站点没走 `server.js`（如仍部署在 Pages），或 `bilibili.enabled` 为 false。
- **Bangumi 卡超时**：服务器到 `api.bgm.tv` 网络不通。确认服务器可 `curl https://api.bgm.tv/v0/users/sai`（网关/防火墙是否放行）。
- **Steam 卡隐藏**：`STEAM_API_KEY` 未配置，或账号隐私为私密。
- **首页看不到「访问 / 今日」**：静态托管（Pages）没有 `/api`，这两个数字会自动隐藏；或者 `stats.enabled` / `hero.showViews` 被置为 false。此时其余页面完全正常，浏览器控制台不会有报错。
- **访问量归零了**：`data/stats.json` 丢失（换服务器、重装、或误删目录）。该文件需单独备份。
- **更新部署**：`git pull && npm run build && pm2 restart nagi-blog`；只改了 `.env` 账号 → `pm2 restart nagi-blog` 即可（无需重新构建）。
