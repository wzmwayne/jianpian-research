# 荐片 PWA（渐进式网页应用）

静态部署，无后端、无代理，浏览器直连 API。

## 特性

- **搜索**：关键词搜索，历史记录持久化（localStorage）
- **详情**：线路/选集/FTP 下载直链展示
- **播放**：hls.js 在线播放（AES-128 加密流自动解密）
- **下载**：全部切片并发下载（启动即列出每片大小与状态，失败自动重试 3 次）+ 白色总进度条 + 实时速度/剩余时间；双通道解密引擎（Web Crypto 优先，非安全上下文自动降级纯 JS aes.js）+ 保序合并保存 `.ts`
- **转 mp4**：ffmpeg.wasm（最新 0.12，懒加载）`-c copy` 重封装
- **签名**：内置自实现 MD5 签名（默认开启，可关闭），secret 自动获取并持久化
- **PWA**：可安装到桌面/主屏，离线打开应用外壳
- **存储**：全部设置/历史/进度存 localStorage，非内存
- **日志**：下载/转换全过程详细日志（UI 面板 + console）

## UI 规范（本项目强制约束）

- 无圆角（`border-radius: 0`）
- 无渐变
- 无 emoji
- 无第三方图片/图标（图标为本地自绘 SVG）
- 黑白灰配色，跟随系统深色模式

## 部署

任意静态服务器 / GitHub Pages / 本地 `python3 -m http.server 8080`

```bash
cd pwa
python3 -m http.server 8080
# 访问 http://localhost:8080
```

> 提示：Service Worker 与 File System Access 需 HTTPS 或 localhost。

## 文件结构

```
pwa/
├── index.html            # 单页 UI
├── app.js                # 核心逻辑（API/播放/双通道解密/下载/转码/持久化）
├── md5.js                # 自实现 MD5（签名，零依赖）
├── aes.js                # 纯 JS AES-128-CBC 解密（移植 hls.js, MIT）非安全上下文降级
├── lib/
│   ├── hls.min.js        # hls.js 本地化（播放器）
│   └── ffmpeg/           # ffmpeg.wasm 0.12 本地化（转 mp4，懒加载）
│       ├── ffmpeg.min.js / 814.ffmpeg.js / ffmpeg-core.js / ffmpeg-core.wasm
├── sw.js                 # Service Worker（预缓存应用外壳）
├── manifest.webmanifest  # PWA 清单
├── icon.svg              # 本地图标（自绘）
└── README.md
```

## 使用

1. 打开页面即自动从 `/v2/sys/init` 获取签名 secret 并保存。
2. 搜索影片 -> 点选 -> 选线路 -> 选集 -> 自动播放（记录观看进度）。
3. 点「下载本集」保存解密后的 `.ts` 文件；点「下载并转 mp4」经 ffmpeg.wasm 重封装为 mp4（首次会加载 32MB wasm）。
4. 设置面板可关闭签名、改 API 域名、填登录 token。

## 说明

- 解密密钥由 m3u8 自动下发（`#EXT-X-KEY`），无需手动计算。
- 无签名（关闭签名）实测全链路可用，但建议保持默认开启以降低风控概率。
- 浏览器环境 fetch 无法携带 Referer，实测接口无 Referer 亦可用。
- 非 localhost/HTTPS（如局域网 IP）下 `crypto.subtle` 不可用，下载自动降级为纯 JS aes.js（已用 FIPS-197 向量与真实数据验证一致）。