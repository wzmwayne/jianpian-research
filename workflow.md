# 完整工作流（实测验证）

> 所有接口均经实测。示例使用真实数据：视频 `554149`（太空先锋 / The Right Stuff），第 01 集 source_id `56505`。

## 总览

```
init ──► search ──► detail ──► m3u8 ──► key ──► ts 解密合并
 (secret)   (video_id)  (source_id)  (KEY行)   (AES key)   (mp4)
```

## 1. 初始化：获取 secret

```http
GET https://h5.jianpianips1.com/api/v2/sys/init
```

响应（实测）：
```json
{
  "code": 1,
  "msg": "请求成功",
  "data": {
    "secret": "0sD4gjkMdbnsYp5k4K0oB5MGMggyp9UP",
    "official_domain": "https://jianpian.com",
    "websiteConfig": { ... }
  }
}
```

## 2. 搜索

```http
GET https://h5.jianpianips1.com/api/v2/search/videoV2?key=太空&page=1
```

- 参数名是 **`key`**（非 `wd`）。
- 响应 `data` 为数组，元素含 `id`（视频 ID）、`title`、`mask`（封面）、`original_name`、`actors`、`year` 等。
- 实测搜索"太空"返回 10 条，含 `554149`（太空先锋, 8.0 分）。

## 3. 详情（线路/选集/下载）

```http
GET https://h5.jianpianips1.com/api/video/detailv2?id=554149
```

响应关键字段（实测）：
```json
{
  "data": {
    "id": 554149,
    "title": "太空先锋",
    "episodes_count": 7,
    "source_list_source": [
      { "source_name": "无尽线", "source_url": "www.xxxx.com", "url": "/api/v2/vip/normal/56505/index.m3u8", "episodes": 7 }
    ],
    "vip_source_list_source": [ ... ],
    "ftp_list": [
      { "title": "太空先锋第01集.mp4", "url": "ftp://a.gbl.114s.com:20320/0442/太空先锋第01集.mp4" }
    ],
    "download_vip": "https://h5.jianpianips1.com/...." 
  }
}
```

- `source_list_source[].url` = 播放 m3u8 相对路径（拼接 `https://mv.cuitonghai.com`）。
- `ftp_list` = FTP 下载直链（测试环境端口不通，未验证内容）。

## 4. 获取 m3u8

```http
GET https://mv.cuitonghai.com/api/v2/vip/normal/56505/index.m3u8
```

带签名（可选，无签名实测同样 200）：
```
version: 610
timestamp: 1787215179
signature: <MD5("610"+ts+secret)>
```

响应（实测）：
```m3u8
#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:10
#EXT-X-MEDIA-SEQUENCE:0
#EXT-X-KEY:METHOD=AES-128,URI="/api/v2/vip/regular/secrets/56505?expire=1787215480&token=f4b049e77bb5595b102230c987a1d6fa&ip=117.151.29.225&sign=48e37f738c95f16be66ee663daaeea9475096ec934d73d2d538654c8e136a3bc"
#EXTINF:9.44,
https://video.luojiangping.com/jpdata/vip_secrets/554149/56505/segment_000.ts?X-Amz-Algorithm=...
#EXTINF:9.44,
https://video.luojiangping.com/jpdata/vip_secrets/554149/56505/segment_001.ts?X-Amz-Algorithm=...
...（全部切片）
#EXT-X-ENDLIST
```

## 5. 提取 AES-128 密钥

从 m3u8 正则提取：`#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"`

```http
GET https://mv.cuitonghai.com/api/v2/vip/regular/secrets/56505?expire=...&token=...&ip=...&sign=...
```

- **无需签名 headers**，普通 UA 直接 GET 即可（实测带/不带签名均 200）。
- 响应为 **16 字节二进制**：`fd 1b 69 60 df f9 72 2b 52 29 87 11 83 80 c4 72`
- 多次拉取 key **恒定不变**；`expire`/`sign` 会变，`token`/`ip` 固定，`ip` 绑定出口 IP。

## 6. 解密合并 ts

```python
from Crypto.Cipher import AES
key = bytes.fromhex("fd1b6960dff9722b522987118380c472")
iv  = b"\x00" * 16                    # IV 为全 0
cipher = AES.new(key, AES.MODE_CBC, iv)
plain = cipher.decrypt(ts_bytes)      # 去掉 PKCS7 padding
```

- 按 m3u8 中切片顺序下载 → 逐个解密 → 二进制拼接 → `.mp4`。
- 切片 URL 为 AWS S3 预签名 URL，直接 GET 即可，无需额外鉴权。

## 边界与注意

- `expire` 有效期约 5 分钟（实测 +301 秒），超时需要重新拉 m3u8 获取新的密钥 URL。
- 无签名/匿名单 IP 高频请求可能触发风控，建议按签名逻辑带 headers + 代理 IP 池。
- FTP 下载直链在无公网 FTP 端口的网络环境不可达。