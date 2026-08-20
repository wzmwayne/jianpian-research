# 静态 HTML+JS 化方案评估

> 评估日期: 2026-08-20
> 目标: 将推荐片全流程（搜索→详情→播放→解密→下载转换）封装为静态单页应用（无后端、无代理）

## 一、结论

**可行，且推荐实施。** 决定性前提已实测通过：

| 前提条件 | 实测结果 | 影响 |
|---|---|---|
| API CORS | `Access-Control-Allow-Origin: *`（4 个域名全部放行） | ✅ 浏览器 fetch 直连可用，无需代理 |
| 需要 Referer 头 | 无 Referer 全链路成功 | ✅ fetch 无法自定义 Referer 的限制无影响 |
| 需要签名 | 无签名全链路成功（search/m3u8/密钥/切片） | ✅ 可选加固，非必需 |
| 密钥 IP 绑定 | 浏览器出口 IP 与 m3u8 请求 IP 一致 | ✅ 天然满足 |

## 二、架构设计

```
┌────────────────────────────────────────────────┐
│ index.html  (单文件静态页，无构建步骤)          │
│  ├─ 搜索面板 → search API                      │
│  ├─ 详情面板 → detail API（线路/选集/FTP）      │
│  ├─ 播放器   → hls.js + <video>（在线播放）     │
│  └─ 下载面板 → 解密合并 + 转封装下载            │
├────────────────────────────────────────────────┤
│ 模块：                                        │
│  api.js     fetch 封装 + 可选 MD5 签名（js-md5）│
│  m3u8.js    解析 KEY/切片列表                  │
│  aes.js     Web Crypto API 解密（原生零依赖）  │
│  player.js  hls.js 播放 / 下载合并             │
│  convert.js ffmpeg.wasm 转封装（按需懒加载）   │
└────────────────────────────────────────────────┘
静态托管：任意静态服务器 / GitHub Pages / file:// 均可
```

## 三、模块技术选型

| 模块 | 方案 | 依赖 | 工作量 |
|---|---|---|---|
| API 调用 | `fetch` | 无 | 小 |
| 签名 | `js-md5`（~3KB）或自实现 | 轻量 | 小 |
| m3u8 解析 | 正则/手写解析（~40 行） | 无 | 小 |
| AES-128 解密 | **Web Crypto `SubtleCrypto` AES-CBC** | 浏览器原生 | 中（异步处理） |
| 在线播放 | **hls.js**（自带 AES-128 解密与鉴权 loader） | 单 CDN 引入 | 小 |
| 下载转封装 | **ffmpeg.wasm**（懒加载）或 MP4Box | 单 wasm（约 25MB） | 中 |
| 大文件保存 | Blob+`a[download]`（<1GB）/ File System Access API（流式） | 无 | 中 |

## 四、关键决策点

### 1. 播放：直接走 hls.js（推荐）
源 m3u8 是**标准 AES-128 HLS**，hls.js 原生支持自动下载密钥+解密+播放。
只需把 m3u8 URL 喂给 hls.js，零自研解密即可在线播放。
> 自研 AES 解密仍保留，仅用于「下载为文件」路径。

### 2. 下载转换：ffmpeg.wasm 转封装
解密合并后为 **MPEG-TS 流**（实测 173s/271 切片/17MB）。
- 在线播放：MSE 无法直接喂 .ts → 用 hls.js 播放，不做转封装。
- 保存为 mp4：ffmpeg.wasm 只做 **remux（重封装，不重编码）**，CPU 占用低、速度快。
- 备选：直接保存 `.ts`（VLC/Kodi/ffmpeg 可播），零转换成本。

### 3. 大文件内存
电影级（>1GB）时 Blob 合并会占满内存。
→ 用 File System Access API（`showSaveFilePicker` + `WritableStream`）流式写入，逐片解密写入。

## 五、风险与对策

| 风险 | 对策 |
|---|---|
| ffmpeg.wasm 25MB 加载慢 | 仅下载时按需懒加载，播放路径不加载 |
| 广告/图片域名动态轮询 | 仅影响页面装饰，核心链路（video search/detail/m3u8）不依赖 |
| 密钥 expire 5 分钟过期 | 下载前重新拉 m3u8 获取新鲜密钥 URL |
| 单 IP 高频触发风控 | 可选：前端自动带签名 headers 提升权重（纯 JS 可实现） |
| FTP 下载直链需公网 FTP | 降级为「播放/解密下载」替代路径 |

## 六、建议实施步骤

1. **Phase 1（核心，半天）**：`index.html` 单文件 —— 搜索+详情+列表 UI，fetch 调 API
2. **Phase 2（播放）**：接入 hls.js，一键在线播放任意集
3. **Phase 3（下载）**：Web Crypto 解密 + Blob/FileSystem 合并保存 .ts
4. **Phase 4（转换）**：按需加载 ffmpeg.wasm，.ts→mp4 转封装
5. **Phase 5（可选）**：签名 headers、FTP 直链下载、风控规避

## 七、结论

静态 HTML+JS 方案**无技术障碍**，核心链路（API/m3u8/密钥/切片）全部支持浏览器直连。
唯一较重依赖（ffmpeg.wasm）可懒加载且可降级为保存 .ts 免转换。
预计 1~2 天可交付可用的单文件版本。