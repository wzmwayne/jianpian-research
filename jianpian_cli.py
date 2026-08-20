#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
jianpian_cli.py - 荐片 (jianpian) H5 API 命令行工具

覆盖完整闭环：搜索 -> 详情 -> m3u8 -> 密钥 -> 解密下载
依赖：Python3 标准库；解密/下载需 `pip install pycryptodome`

用法示例：
  python3 jianpian_cli.py init
  python3 jianpian_cli.py search 太空
  python3 jianpian_cli.py detail 554149
  python3 jianpian_cli.py m3u8 554149 --episode 1
  python3 jianpian_cli.py key 554149 --episode 1
  python3 jianpian_cli.py download 554149 --episode 1 -o out.mp4
"""

import argparse
import hashlib
import json
import os
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API_BASE = "https://h5.jianpianips1.com/api"
DEFAULT_SECRET = "0sD4gjkMdbnsYp5k4K0oB5MGMggyp9UP"
VERSION = "610"
UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15"
REFERER = "https://h5.jianpianips1.com/"

SECRET = DEFAULT_SECRET
TOKEN = ""
USE_SIGN = True


def _md5(s):
    return hashlib.md5(s.encode()).hexdigest()


def _headers(sign=True):
    h = {
        "User-Agent": UA,
        "Referer": REFERER,
        "Accept": "*/*",
    }
    if sign:
        ts = str(int(time.time()))
        h["version"] = VERSION
        h["timestamp"] = ts
        h["signature"] = _md5(VERSION + ts + SECRET)
        if TOKEN:
            h["token"] = TOKEN
    return h


def _http_get(url, sign=None, binary=False, timeout=20):
    if sign is None:
        sign = USE_SIGN
    req = urllib.request.Request(url, headers=_headers(sign))
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()
    except urllib.error.URLError as e:
        return 0, str(e).encode()


def _get_json(url, sign=None):
    code, body = _http_get(url, sign=sign)
    if code != 200:
        raise RuntimeError(f"HTTP {code}: {body[:200].decode('utf-8', 'ignore')}")
    return json.loads(body.decode("utf-8", "ignore"))


def api(path, params=None):
    url = API_BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)
    return _get_json(url)


# ---------------------------------------------------------------- commands

def cmd_init(args):
    """获取系统初始化配置（secret / official_domain）"""
    global SECRET
    data = _get_json(API_BASE + "/v2/sys/init", sign=False)["data"]
    SECRET = data.get("secret") or SECRET
    print(json.dumps(data, ensure_ascii=False, indent=2))
    print(f"\n[secret] {SECRET}")
    print(f"[official_domain] {data.get('official_domain')}")


def cmd_search(args):
    """搜索视频，参数为关键词"""
    data = api("/v2/search/videoV2", {"key": args.keyword, "page": args.page})
    items = data.get("data") or []
    if not items:
        print("无结果"); return
    for it in items:
        print(f"{it['id']:<8} {it.get('title')}  ({it.get('original_name') or ''})  {it.get('score') or ''}分  {it.get('year') or ''}")
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))


def cmd_detail(args):
    """视频详情：线路、选集、FTP 下载直链"""
    data = api("/video/detailv2", {"id": args.id})["data"]
    print(f"标题: {data.get('title')}  评分: {data.get('score')}  总集数: {data.get('episodes_count')}")
    srcs = data.get("source_list_source") or []
    print(f"\n播放线路 ({len(srcs)}):")
    for line in srcs:
        eps = line.get("source_list") or []
        print(f"  [{line.get('name')}]  集数:{len(eps)}")
        for ep in eps:
            epn = (ep.get("source_name") or "").ljust(8)
            print(f"    {epn} id={ep.get('id')}  {ep.get('url')}")
    ftps = data.get("ftp_list") or []
    print(f"\nFTP 下载 ({len(ftps)}):")
    for f in ftps:
        print(f"  {f.get('title')}: {f.get('url')}")
    if args.json:
        print(json.dumps(data, ensure_ascii=False, indent=2))


def _find_episode(data, episode):
    """在详情数据中按集号查找 m3u8 URL，返回 (线路名, 集名, url)"""
    lines = data.get("source_list_source") or []
    for line in lines:
        for ep in line.get("source_list") or []:
            name = ep.get("source_name") or ""
            if episode is None:
                return line.get("name"), name, ep.get("url")
            nums = re.findall(r"\d+", name) or [str(ep.get("id") or "")]
            if nums and int(nums[0]) == episode:
                return line.get("name"), name, ep.get("url")
    raise RuntimeError(f"未找到第 {episode} 集")


def _get_source_m3u8(video_id, episode):
    """根据 video_id + 集号 返回源 m3u8 完整 URL"""
    data = api("/video/detailv2", {"id": video_id})["data"]
    line_name, ep_name, url = _find_episode(data, episode)
    return url


def _fetch_m3u8(m3u8_url):
    code, body = _http_get(m3u8_url)
    if code != 200:
        raise RuntimeError(f"m3u8 HTTP {code}: {body[:200].decode('utf-8','ignore')}")
    text = body.decode("utf-8", "ignore")
    base = m3u8_url.rsplit("/", 1)[0]
    return text, base


def cmd_m3u8(args):
    """获取指定集的 m3u8 内容"""
    url = args.url if args.url else _get_source_m3u8(args.id, args.episode)
    print(f"m3u8: {url}\n")
    text, _ = _fetch_m3u8(url)
    print(text)


def cmd_key(args):
    """提取 AES-128 解密密钥"""
    url = args.url if args.url else _get_source_m3u8(args.id, args.episode)
    text, base = _fetch_m3u8(url)
    m = re.search(r'#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"', text)
    if not m:
        print("m3u8 中未找到 AES-128 密钥行（可能为明文流）"); return
    key_url = "https://mv.cuitonghai.com" + m.group(1)
    print("密钥 URL:", key_url)
    code, body = _http_get(key_url, sign=False)
    if code != 200:
        raise RuntimeError(f"密钥 HTTP {code}: {body[:200].decode('utf-8','ignore')}")
    print(f"\n密钥 (hex): {body.hex()}")
    print(f"密钥 (字节数): {len(body)}")
    return body


def cmd_download(args):
    """下载并解密整集，合并为 mp4（需 pycryptodome）"""
    try:
        from Crypto.Cipher import AES
    except ImportError:
        sys.exit("缺少依赖，请先执行: pip install pycryptodome")

    url = args.url if args.url else _get_source_m3u8(args.id, args.episode)
    text, base = _fetch_m3u8(url)

    key = None
    m = re.search(r'#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"', text)
    if m:
        key_url = "https://mv.cuitonghai.com" + m.group(1)
        print("解密密钥:", key_url)
        code, kbody = _http_get(key_url, sign=False)
        if code != 200:
            raise RuntimeError(f"密钥 HTTP {code}")
        key = kbody

    segs = re.findall(r'^([^\n#][^\n]*\.ts(?:\?[^\n]*)?)$', text, re.M)
    if not segs:
        segs = re.findall(r'https?://[^\s]+\.ts[^\s]*', text)

    out = args.output or f"video_{args.id}_ep{args.episode or 1}.mp4"
    total = len(segs)
    print(f"切片数量: {total} -> {out}\n")

    with open(out, "wb") as f:
        for i, seg in enumerate(segs, 1):
            if seg.startswith("/"):
                seg = "https://mv.cuitonghai.com" + seg
            code, body = _http_get(seg, sign=False)
            if code != 200:
                print(f"[warn] 切片 {i} HTTP {code}，跳过"); continue
            if key:
                try:
                    body = AES.new(key, AES.MODE_CBC, b"\x00" * 16).decrypt(body)
                    body = body[:-body[-1]] if body else body  # PKCS7
                except Exception as e:
                    print(f"[warn] 切片 {i} 解密失败: {e}"); continue
            f.write(body)
            print(f"\r  {i}/{total}", end="", flush=True)
    print(f"\n完成: {out} ({os.path.getsize(out)} bytes)")


# ---------------------------------------------------------------- main

def main():
    p = argparse.ArgumentParser(prog="jianpian_cli", description="荐片 H5 API CLI")
    p.add_argument("--secret", default=DEFAULT_SECRET, help="签名 secret（默认自动获取）")
    p.add_argument("--token", default="", help="登录 token（可选）")
    p.add_argument("--no-sign", action="store_true", help="禁用签名 headers")
    p.add_argument("--json", action="store_true", help="输出原始 JSON")
    sub = p.add_subparsers(dest="cmd", required=True)

    s = sub.add_parser("init", help="获取 secret 与域名配置")
    s.set_defaults(func=cmd_init)

    s = sub.add_parser("search", help="搜索视频")
    s.add_argument("keyword")
    s.add_argument("-p", "--page", type=int, default=1)
    s.set_defaults(func=cmd_search)

    s = sub.add_parser("detail", help="视频详情（线路/选集/ftp）")
    s.add_argument("id", type=int)
    s.set_defaults(func=cmd_detail)

    for name, fn in (("m3u8", cmd_m3u8), ("key", cmd_key), ("download", cmd_download)):
        s = sub.add_parser(name, help={"m3u8": "获取 m3u8", "key": "提取 AES 密钥", "download": "解密下载"}[name])
        s.add_argument("id", type=int, nargs="?", help="视频 ID")
        s.add_argument("--episode", type=int, default=None, help="集号")
        s.add_argument("-u", "--url", default=None, help="直接指定 m3u8 URL（跳过 id 查找）")
        s.add_argument("-o", "--output", default=None, help="输出文件（download 用）")
        s.set_defaults(func=fn)

    args = p.parse_args()
    global SECRET, TOKEN, USE_SIGN
    if args.secret:
        SECRET = args.secret
    TOKEN = args.token
    USE_SIGN = not args.no_sign
    try:
        args.func(args)
    except RuntimeError as e:
        sys.exit(f"错误: {e}")


if __name__ == "__main__":
    main()