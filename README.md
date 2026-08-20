# 荐片 (jianpian) H5 API 逆向研究成果

> 目标站点: `https://h5.jianpianips1.com`（荐片 H5 移动端）
> 研究方法: 爬取全部前端 JS（主包 + 84 个 chunk），逆向域名逻辑与签名算法，并逐接口实测验证。
> 研究日期: 2026-08-20

---

## 1. 域名体系（已实测确认）

| 域名 | 用途 | 来源 |
|---|---|---|
| `https://h5.jianpianips1.com/api` | 全部业务 API（baseURL） | 前端 JS: `window.location.protocol+"//"+window.location.host+"/api"` |
| `https://mv.cuitonghai.com` | m3u8 播放/密钥资源域名 | 详情接口 `source_list` 中返回 |
| `https://video.luojiangping.com` | ts 视频切片 CDN | m3u8 内返回（AWS S3 签名 URL） |
| `https://jianpian.com` | 官方域名 | `/api/v2/sys/init` 返回 `official_domain` |
| 图片/广告域名（动态轮询） | 图片 CDN | `/api/v2/settings/resourceDomainConfig`、`/advertiseDomainConfig` |

## 2. 签名算法（可选，服务端未强制）

实测发现**无签名也可访问全部核心接口**，但为规避风控建议携带：

```
secret = 从 /api/v2/sys/init 获取（当前: 0sD4gjkMdbnsYp5k4K0oB5MGMggyp9UP）
timestamp = int(time.time())
signature = MD5("610" + str(timestamp) + secret)   # hex 小写
```

请求头：
```
version: 610
timestamp: <秒>
signature: <md5hex>
token: <登录token，可空>
```

## 3. 核心接口（搜索→详情→线路→选集→播放/下载 全流程）

| 步骤 | 方法 | 接口 | 说明 |
|---|---|---|---|
| 0 | GET | `/api/v2/sys/init` | 获取 secret / official_domain（无签名） |
| 1 | GET | `/api/v2/search/videoV2?key=关键词&page=1` | 搜索，返回含 `id` 的视频列表 |
| 2 | GET | `/api/video/detailv2?id=视频ID` | 详情，含 `source_list_source`（线路）、`vip_source_list_source`、`ftp_list`（下载）、`episodes_count` |
| 3 | GET | `https://mv.cuitonghai.com{source_list[].url}` | 带签名拉取 m3u8（无签名也可） |
| 4 | GET | `https://mv.cuitonghai.com{EXT-X-KEY URI}` | 提取 AES-128 解密密钥（16字节，无签名） |
| 5 | GET | ts 切片 URL（m3u8 内） | 下载加密切片，用密钥 AES-128-CBC(IV=0) 解密合并 |

## 4. 完整接口清单

见 [`api-endpoints.md`](api-endpoints.md)（148 个接口路径，v1 + v2 两套）。

## 5. 详细工作流与实测示例

见 [`workflow.md`](workflow.md)。

## 6. CLI 工具

脚本: [`jianpian_cli.py`](jianpian_cli.py)（纯 Python3 标准库 + 可选 pycryptodome）

```bash
# 初始化（获取 secret/域名配置）
python3 jianpian_cli.py init

# 搜索
python3 jianpian_cli.py search 太空

# 详情（显示线路、选集、ftp 下载）
python3 jianpian_cli.py detail 554149

# 获取指定集 m3u8 播放地址
python3 jianpian_cli.py m3u8 554149 --episode 1

# 提取 AES 解密密钥
python3 jianpian_cli.py key 554149 --episode 1

# 下载并解密整集合并为 mp4（需 pip install pycryptodome）
python3 jianpian_cli.py download 554149 --episode 1 -o output.mp4
```

## 7. 关键结论

- 完整「搜索→详情→线路→选集→播放/下载」闭环最少只需 **4 个接口**（init/search/detailv2/m3u8）。
- **无需任何手动密钥**：AES 密钥由 m3u8 自动生成，直接提取即可；签名 secret 可选。
- 匿名（无 token）即可使用核心功能；收藏、观看记录、VIP 需登录。
- 密钥/密钥 URL 中 `token/sign/expire/ip` 均由服务器自动生成，直接使用即可；`ip` 绑定请求出口 IP。

## 8. 前端化交付物（PWA）

见 [`pwa/`](pwa/) 目录 —— 静态单页 PWA：

```bash
cd pwa
python3 -m http.server 8080    # 访问 http://localhost:8080
```

- 搜索 / 详情 / 在线播放（hls.js）/ 解密下载（Web Crypto）全功能
- 内置自实现 MD5 签名（默认开启可关闭），secret 自动获取
- 所有设置/历史/进度持久化到 localStorage
- 无圆角、无渐变、无 emoji、无第三方图片（自绘 SVG 图标）

评估报告见 [`static-web-eval.md`](static-web-eval.md)。