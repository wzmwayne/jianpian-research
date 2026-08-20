/* app.js - 荐片 PWA 核心逻辑
 * 存储策略：所有设置/历史/进度均持久化到 localStorage；大文件下载流式写盘（优先 File System Access，降级 Blob）。
 * 依赖：md5.js（签名）、lib/hls.min.js（播放）。 */
(function () {
  "use strict";

  var $ = function (id) { return document.getElementById(id); };

  // ---------- 日志系统（UI 多行 + console） ----------
  function log(msg, isError) {
    var line = "[" + new Date().toLocaleTimeString() + "] " + msg;
    if (isError) console.error(line); else console.log(line);
    var box = $("log");
    if (!box) return;
    box.classList.remove("hide");
    var div = document.createElement("div");
    div.textContent = line;
    box.appendChild(div);
    while (box.children.length > 200) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
  }

  function showLogPane() {
    var box = $("log");
    box.classList.remove("hide");
    box.scrollIntoView({ behavior: "smooth", block: "center" });
  }
  var LS = {
    key: "jp_app_settings_v1",
    load: function () {
      try { return JSON.parse(localStorage.getItem(LS.key)) || {}; }
      catch (e) { return {}; }
    },
    save: function (obj) { localStorage.setItem(LS.key, JSON.stringify(obj)); }
  };
  var HIST_KEY = "jp_app_history_v1";

  var cfg = LS.load();

  // ---------- 配置 ----------
  function defaults() {
    cfg.sign = cfg.sign !== false;                 // API 签名默认开启
    cfg.signDownload = cfg.signDownload === true; // 下载签名默认关闭
    cfg.downloadThreads = Math.min(50, Math.max(1, Number(cfg.downloadThreads) || 20));
    cfg.preload = cfg.preload === true;       // 预加载默认关闭
    cfg.secret = cfg.secret || "";
    cfg.token = cfg.token || "";
    cfg.api = cfg.api || "https://h5.jianpianips1.com/api";
  }
  defaults();

  function persistCfg() { LS.save(cfg); }

  // ---------- 签名 headers ----------
  function headers() {
    var h = {
      "Accept": "*/*"
    };
    if (cfg.sign) {
      var ts = String(Math.floor(Date.now() / 1000));
      var secret = cfg.secret || "";
      h["version"] = "610";
      h["timestamp"] = ts;
      h["signature"] = md5("610" + ts + secret);
      if (cfg.token) h["token"] = cfg.token;
    }
    return h;
  }

  async function api(path, params) {
    var url = cfg.api + path;
    if (params) {
      var qs = Object.keys(params).map(function (k) {
        return encodeURIComponent(k) + "=" + encodeURIComponent(params[k]);
      }).join("&");
      url += "?" + qs;
    }
    var r = await fetch(url, { headers: headers() });
    if (!r.ok) throw new Error("HTTP " + r.status);
    return r.json();
  }

  async function ensureSecret() {
    if (cfg.secret) return cfg.secret;
    try {
      var j = await fetch(cfg.api + "/v2/sys/init").then(function (r) { return r.json(); });
      if (j && j.data && j.data.secret) {
        cfg.secret = j.data.secret;
        persistCfg();
      }
    } catch (e) { /* 离线时忽略，使用空 secret（服务端未强制） */ }
    return cfg.secret;
  }

  // ---------- 历史（localStorage 持久化） ----------
  function getHist() {
    try { return JSON.parse(localStorage.getItem(HIST_KEY)) || {}; }
    catch (e) { return {}; }
  }
  function setHist(h) { localStorage.setItem(HIST_KEY, JSON.stringify(h)); }

  function pushSearch(kw) {
    var h = getHist();
    h.searches = (h.searches || []).filter(function (s) { return s !== kw; });
    h.searches.unshift(kw);
    if (h.searches.length > 10) h.searches.length = 10;
    setHist(h);
    renderHistory();
  }

  function saveProgress(vid, ep, time) {
    var h = getHist();
    h.progress = h.progress || {};
    var p = h.progress[String(vid)];
    if (!p || p.ep !== ep) return; // 只有选集记录过该集才更新进度秒数
    p.time = time;
    p.ts = Date.now();
    setHist(h);
  }

  // 仅在点击选集时记录历史（视频 + 选集 + 进度起点）
  function recordPlay(vid, epId) {
    var h = getHist();
    h.videos = h.videos || {};
    h.videos[String(vid)] = {
      id: vid,
      title: (curDetail && curDetail.title) || "",
      score: (curDetail && curDetail.score) || ""
    };
    h.progress = h.progress || {};
    h.progress[String(vid)] = { ep: epId, time: 0, ts: Date.now() };
    setHist(h);
    renderWatch();
  }

  function rememberVideo(v) {
    var h = getHist();
    h.videos = h.videos || {};
    h.videos[String(v.id)] = { id: v.id, title: v.title || "", score: v.score || "" };
    setHist(h);
    renderWatch();
  }

  function renderWatch() {
    var h = getHist();
    var vids = h.videos || {};
    var prog = h.progress || {};
    var box = $("watch");
    var list = Object.keys(vids)
      .map(function (id) {
        var v = vids[id];
        var p = prog[id];
        return { id: id, v: v, p: p, ts: (p && p.ts) || 0 };
      })
      .sort(function (a, b) { return b.ts - a.ts; })
      .slice(0, 10);
    box.classList.toggle("hide", !list.length);
    if (!list.length) return;
    box.innerHTML = "";
    var h2 = document.createElement("div");
    h2.textContent = "最近观看";
    h2.style.fontSize = "14px";
    h2.style.fontWeight = "600";
    box.appendChild(h2);
    list.forEach(function (it) {
      var b = document.createElement("button");
      b.style.width = "100%";
      b.style.textAlign = "left";
      b.style.marginTop = "4px";
      var txt = it.v.title || ("视频 " + it.id);
      if (it.p && it.p.ep) txt += "  (进度 集" + it.p.ep + ")";
      b.textContent = txt;
      b.addEventListener("click", function () {
        var id = Number(it.id);
        var savedEp = it.p && it.p.ep;
        var savedTime = (it.p && it.p.time) || 0;
        if (curDetail && curDetail.id === id) {
          if (savedEp) { resumeEp(savedEp, savedTime); return; }
          showDetailPane();
          return;
        }
        openDetail({ id: id, title: it.v.title, score: it.v.score }, function () {
          if (savedEp) resumeEp(savedEp, savedTime);
        });
      });
      box.appendChild(b);
    });
  }

  // 历史恢复：切到对应集并续播
  function resumeEp(epId, time) {
    var lines = curDetail.source_list_source || [];
    var found = null;
    var lineIdx = 0;
    lines.some(function (l, li) {
      return (l.source_list || []).some(function (e) {
        if (e.id === epId) { found = e; lineIdx = li; return true; }
        return false;
      });
    });
    if (found) {
      if (curLineIdx !== lineIdx) {
        curLineIdx = lineIdx;
        renderTabs(lines);
      }
      playEp(found, false, time);
      showDetailPane();
    }
  }

  function showDetailPane() {
    $("detail").classList.remove("hide");
    $("list").classList.add("hide");
  }

  function renderHistory() {
    var h = getHist();
    var box = $("history");
    box.classList.toggle("hide", !h.searches || !h.searches.length);
    if (!h.searches || !h.searches.length) return;
    box.innerHTML = "";
    var lbl = document.createElement("span");
    lbl.className = "muted";
    lbl.textContent = "历史: ";
    box.appendChild(lbl);
    h.searches.forEach(function (kw) {
      var b = document.createElement("button");
      b.textContent = kw;
      b.style.margin = "2px";
      b.addEventListener("click", function () {
        $("q").value = kw;
        doSearch(kw);
      });
      box.appendChild(b);
    });
  }

  // ---------- 搜索 ----------
  async function doSearch(kw) {
    kw = (kw || "").trim();
    if (!kw) return;
    pushSearch(kw);
    var list = $("list");
    list.innerHTML = '<div class="status">搜索中...</div>';
    try {
      var j = await api("/v2/search/videoV2", { key: kw, page: 1 });
      var items = j.data || [];
      list.innerHTML = "";
      if (!items.length) { list.innerHTML = '<div class="status">无结果</div>'; return; }
      items.forEach(function (it) {
        var d = document.createElement("div");
        d.className = "item";
        var t = document.createElement("div");
        t.className = "title";
        t.textContent = it.title + (it.score ? "  " + it.score + "分" : "");
        var m = document.createElement("div");
        m.className = "meta";
        m.textContent = [it.year, it.original_name, (it.actors || []).slice(0, 3).join(" / ")].filter(Boolean).join("  |  ");
        d.appendChild(t); d.appendChild(m);
        d.addEventListener("click", function () { openDetail(it); });
        list.appendChild(d);
      });
    } catch (e) {
      list.innerHTML = '<div class="status">搜索失败: ' + e.message + "</div>";
    }
  }

  // ---------- 详情 ----------
  var curDetail = null;
  var curLineIdx = 0;
  var curEp = null;

  async function openDetail(v, onReady) {
    curLineIdx = 0; curEp = null;
    $("detail").classList.remove("hide");
    $("list").classList.add("hide");
    $("dTitle").textContent = v.title;
    $("dMeta").textContent = "";
    var j;
    try {
      j = await api("/video/detailv2", { id: v.id });
    } catch (e) {
      $("dMeta").textContent = "加载失败: " + e.message;
      return;
    }
    var data = j.data || {};
    curDetail = data;
    $("dMeta").textContent =
      [data.title, data.score ? data.score + "分" : "", data.year, data.episodes_count ? data.episodes_count + "集" : ""].filter(Boolean).join("  |  ");

    renderTabs(data.source_list_source || []);
    renderFtp(data.ftp_list || []);
    if (onReady) onReady(data);
  }

  function renderTabs(lines) {
    var box = $("dTabs");
    box.innerHTML = "";
    var h2 = document.createElement("h2");
    h2.textContent = "线路 (" + lines.length + ")";
    box.appendChild(h2);
    var t = document.createElement("div");
    t.className = "tabs";
    lines.forEach(function (line, i) {
      var b = document.createElement("button");
      b.textContent = line.name || ("线路" + (i + 1));
      if (i === curLineIdx) b.classList.add("active");
      b.addEventListener("click", function () {
        curLineIdx = i;
        renderTabs(lines);
        renderEps();
      });
      t.appendChild(b);
    });
    box.appendChild(t);
    renderEps();
  }

  function renderEps() {
    var lines = (curDetail.source_list_source || []);
    var line = lines[curLineIdx] || {};
    var eps = line.source_list || [];
    var box = $("dEps");
    box.innerHTML = "";
    var h2 = document.createElement("h2");
    h2.textContent = "选集 (" + eps.length + ")";
    box.appendChild(h2);
    var g = document.createElement("div");
    g.className = "epgrid";
    eps.forEach(function (ep) {
      var b = document.createElement("button");
      b.textContent = (ep.source_name || "").replace("第", "").replace("集", "") || ep.id;
      if (curEp && curEp.id === ep.id) b.classList.add("active");
      b.addEventListener("click", function () { playEp(ep, true); });
      g.appendChild(b);
    });
    box.appendChild(g);
  }

  function renderFtp(ftps) {
    var box = $("dFtp");
    box.innerHTML = "";
    if (!ftps || !ftps.length) return;
    var h2 = document.createElement("h2");
    h2.textContent = "FTP 下载";
    box.appendChild(h2);
    var div = document.createElement("div");
    div.className = "muted";
    ftps.forEach(function (f) {
      var p = document.createElement("div");
      p.textContent = (f.title || "") + ": " + (f.url || "");
      div.appendChild(p);
    });
    box.appendChild(div);
  }

  // ---------- 播放 ----------
  var hls = null;
  // 确保 mux.js 已加载（本地播放转封装依赖），未加载则动态注入
  function ensureMuxjs() {
    if (window.muxjs) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = "lib/mux.js";
      s.onload = resolve;
      s.onerror = function () { reject(new Error("mux.js 加载失败")); };
      document.head.appendChild(s);
    });
  }
  async function playEp(ep, record, resumeTime) {
    curEp = ep;
    renderEps();
    $("player").classList.remove("hide");
    $("player").scrollIntoView({ behavior: "smooth", block: "center" });
    var st = $("playerStatus");
    var video = $("video");
    var url = ep.url;

    // 仅在点选集时记录历史（进度秒数归零）
    var vid = curDetail && curDetail.id;
    if (vid && record) recordPlay(vid, ep.id);

    if (hls) { try { hls.destroy(); } catch (e) {} hls = null; }

    // 预加载模式：播放走本地存储（已存 TS 分片经 mux.js 转封装为 fMP4 喂 MSE），不走网络
    if (cfg.preload === true) {
      try { await ensureMuxjs(); } catch (e) {}
    }
    var useLocal = cfg.preload === true &&
      !!(window.MediaSource && window.muxjs && (function () {
        try { return MediaSource.isTypeSupported('video/mp4') || MediaSource.isTypeSupported('video/mp4; codecs="avc1.64001f,mp4a.40.2"') || MediaSource.isTypeSupported('video/mp4; codecs="avc1.42E01E,mp4a.40.2"'); } catch (e) { return false; }
      })());
    if (useLocal) {
      stopLocalPlayback();
      video.removeAttribute("src");
      try { video.load(); } catch (e) {}
      st.textContent = "预加载模式：开始预加载，前 5 块完成后才可手动播放";
      updateStoredInfo();
      preloadCurrent(); // 同步置 pre，之后 initLocalPlayback 接管本地取流
      if (vid) {
        video.addEventListener("timeupdate", function () {
          saveProgress(vid, ep.id, Math.floor(video.currentTime));
        });
      }
      return;
    }
    if (cfg.preload === true) {
      showLogPane();
      var mimes = ['video/mp4', 'video/mp4; codecs="avc1.64001f,mp4a.40.2"', 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4; codecs="avc1.4d401f,mp4a.40.2"', 'video/mp2t', 'video/webm; codecs="vp9,vorbis"'];
      var sup = [];
      for (var si = 0; si < mimes.length; si++) {
        var r = false;
        try { r = MediaSource.isTypeSupported(mimes[si]); } catch (e) {}
        sup.push(mimes[si] + "=" + r);
      }
      log("诊断: UA=" + navigator.userAgent, true);
      log("诊断: MediaSource=" + !!window.MediaSource + " muxjs=" + !!window.muxjs + " 支持列表: " + sup.join(" | "), true);
      log("本地播放组件不可用（需 video/mp4 MSE），降级为在线 HLS", true);
    }

    // 在线模式（原逻辑）
    updateStoredInfo();
    st.textContent = "加载播放: " + (url || "");
    var resumed = false;
    var tryResume = function () {
      if (resumeTime > 0 && !resumed) {
        resumed = true;
        try { video.currentTime = resumeTime; } catch (e) {}
      }
    };

    if (window.Hls && window.Hls.isSupported()) {
      hls = new Hls({ maxBufferLength: 60 });
      hls.loadSource(url);
      hls.attachMedia(video);
      hls.on(Hls.Events.ERROR, function (evt, data) {
        if (data.fatal) { st.textContent = "播放错误: " + data.type + " / " + data.details; }
      });
      hls.on(Hls.Events.MANIFEST_PARSED, function () { video.play().catch(function () {}); tryResume(); });
    } else if (video.canPlayType("application/vnd.apple.mpegurl")) {
      video.src = url;
      video.play().catch(function () {});
      video.addEventListener("loadedmetadata", tryResume);
    } else {
      st.textContent = "浏览器不支持 HLS 播放，请使用下载功能";
    }

    // 仅当该集已被选集记录过才更新进度秒数
    if (vid) {
      video.addEventListener("timeupdate", function () {
        saveProgress(vid, ep.id, Math.floor(video.currentTime));
      });
    }
  }

  // ---------- 下载（双通道解密 + 日志 + 合并） ----------
  function parseM3u8(text) {
    var keyUri = null;
    var m = text.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)"/);
    if (m) keyUri = m[1];
    var segs = [];
    var durs = [];
    var curDur = 0;
    text.split(/\r?\n/).forEach(function (l) {
      l = l.trim();
      var dm = l.match(/^#EXTINF:([\d.]+)/);
      if (dm) { curDur = parseFloat(dm[1]); return; }
      if (l && l.charAt(0) !== "#" && /\.ts(?:\?|$)/.test(l)) {
        segs.push(l);
        durs.push(curDur);
        curDur = 0;
      }
    });
    var totalDur = 0;
    for (var i = 0; i < durs.length; i++) totalDur += durs[i];
    return { keyUri: keyUri, segs: segs, durs: durs, totalDur: totalDur };
  }

  function resolveUrl(base, u) {
    if (/^https?:/i.test(u)) return u;
    if (u.charAt(0) === "/") {
      var m = base.match(/^https?:\/\/[^/]+/);
      if (m) return m[0] + u;
      return u;
    }
    return base.replace(/\/[^/]*$/, "/") + u;
  }

  function signH(sign) {
    var h = { "Accept": "*/*" };
    if (sign) {
      var hs = headers();
      for (var k in hs) h[k] = hs[k];
    }
    return h;
  }

  async function fetchBuf(url, sign) {
    var r = await fetch(url, { headers: signH(sign) });
    if (!r.ok) throw new Error("HTTP " + r.status + " " + url);
    return await r.arrayBuffer();
  }

  // 获取媒体列表：自动跟随 master playlist（多码率）跳转到首个媒体 m3u8
  // 是否带签名由设置 cfg.signDownload 决定（默认关，避免 CORS 预检）
  async function fetchMediaPlaylist(url) {
    var buf = await fetchBuf(url, cfg.signDownload);
    var text = new TextDecoder().decode(buf);
    var m = text.match(/#EXT-X-STREAM-INF:([^\r\n]*)[\r\n]+\s*([^\s\r\n]+)/);
    var hops = 0;
    while (m && hops < 5) {
      var child = resolveUrl(url, m[2]);
      log("多码率跳转: " + child);
      buf = await fetchBuf(child, cfg.signDownload);
      text = new TextDecoder().decode(buf);
      m = text.match(/#EXT-X-STREAM-INF:([^\r\n]*)[\r\n]+\s*([^\s\r\n]+)/);
      url = child;
      hops++;
    }
    return { url: url, text: text };
  }

  function hasWebCrypto() {
    return !!(window.crypto && window.crypto.subtle && window.crypto.subtle.importKey);
  }

  // 双通道解密：Web Crypto 优先，非安全上下文自动降级纯 JS aes.js
  // keyRaw: ArrayBuffer(16), data: ArrayBuffer(16倍数) -> Uint8Array(去填充)
  async function decryptSegData(keyRaw, data) {
    if (hasWebCrypto()) {
      var k = await crypto.subtle.importKey("raw", keyRaw, { name: "AES-CBC" }, false, ["decrypt"]);
      var out = await crypto.subtle.decrypt({ name: "AES-CBC", iv: new Uint8Array(16) }, k, data);
      return new Uint8Array(out);
    }
    return aesCbcDecrypt(new Uint8Array(keyRaw), new Uint8Array(data), new Uint8Array(16));
  }

  // ---------- 下载会话（支持中断/增量续下/重置） ----------
  var dl = null; // { ctrl, mode, data, running, promise }

  // 解析 m3u8 + 密钥 + 预取全部切片大小，并建立进度显示；返回下载上下文 data
  async function prepareDownload() {
    if (!curEp || !curEp.url) throw new Error("请先选择要下载的集");
    var url = curEp.url;
    log("下载: " + url);
    log("解密引擎: " + (hasWebCrypto() ? "Web Crypto (crypto.subtle)" : "纯 JS (aes.js 降级)"));

    log("读取 m3u8...");
    var mp = await fetchMediaPlaylist(url);
    url = mp.url;
    var pl = parseM3u8(mp.text);
    if (!pl.segs.length) throw new Error("m3u8 无切片");
    var N = pl.segs.length;
    log("m3u8 解析: 切片 " + N + " 个, AES-128 key: " + (pl.keyUri ? "是" : "无"));

    var keyRaw = null;
    if (pl.keyUri) {
      var keyUrl = resolveUrl(url, pl.keyUri);
      log("获取密钥: " + keyUrl.slice(0, 80));
      keyRaw = await fetchBuf(keyUrl, cfg.signDownload);
      var keyHex = new Uint8Array(keyRaw).reduce(function (a, b) { return a + b.toString(16).padStart(2, "0"); }, "");
      log("密钥: " + keyHex + " (" + keyRaw.byteLength + " 字节)");
    }

    // 不做 HEAD 预取：大量分片时 HEAD 请求过多易触发限流/超时
    // 大小仅在切片下载响应头/完成时校准，进度与剩余时间按分片计数计算
    var sizes = new Array(N).fill(0);
    var totalSize = 0;

    var parts = new Array(N); // 按切片索引保序
    var st = {
      bytes: new Array(N).fill(0),
      sizes: sizes,
      retry: new Array(N).fill(0),
      dead: new Array(N).fill(false),
      done: { n: 0 },
      failed: { n: 0 },
      totalSize: totalSize
    };
    var prog = startProg(N, st, parts);
    idbPutMeta(curEp.id, N).catch(function () {}); // 记录总片数，供点集时显示 x/N
    return { url: url, pl: pl, keyRaw: keyRaw, N: N, parts: parts, st: st, prog: prog, epId: curEp.id };
  }

  // 下载单个切片：流式读取 + 失败自动重试（AbortError 不重试，直接抛出中断）
  function downloadOne(data, ctrl, i) {
    var url = data.url, pl = data.pl, keyRaw = data.keyRaw;
    var st = data.st, parts = data.parts, prog = data.prog;
    var segUrl = resolveUrl(url, pl.segs[i]);
    var MAX_RETRY = 3;
    function attempt(n) {
      return fetch(segUrl, { headers: signH(cfg.signDownload), signal: ctrl.signal }).then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        var cl = Number(r.headers.get("Content-Length")) || 0;
        if (cl && !st.sizes[i]) st.sizes[i] = cl; // 响应头补充大小（非预取）
        prog.refresh(i);
        var reader = r.body.getReader();
        var chunks = [];
        var len = 0;
        function pump() {
          return reader.read().then(function (d) {
            if (d.done) {
              return chunks.length === 1 ? chunks[0].buffer : concatChunks(chunks, len);
            }
            chunks.push(d.value);
            len += d.value.length;
            st.bytes[i] += d.value.length;
            prog.refresh(i);
            return pump();
          });
        }
        return pump().then(function (buf) {
          var p = keyRaw ? decryptSegData(keyRaw, buf) : Promise.resolve(new Uint8Array(buf));
          return p.then(function (data2) {
            parts[i] = data2;
            st.done.n++;
            if (!st.sizes[i]) st.sizes[i] = st.bytes[i]; // 校准真实大小
            // 下载的分片同样永久保存到浏览器存储（下载与预加载共用）
            if (data.epId) {
              idbPut(data.epId, i, data2).catch(function (e) {
                log("存储切片 " + i + " 失败: " + e.message, true);
              });
            }
            prog.refresh(i);
          });
        });
      }, function (err) {
        if (err && err.name === "AbortError") throw err; // 用户中断，不重试
        if (n < MAX_RETRY) {
          st.retry[i] = n + 1;
          prog.refresh(i);
          log("切片 " + i + " 失败, 重试 " + (n + 1) + "/" + MAX_RETRY + ": " + err.message, true);
          return attempt(n + 1);
        }
        st.dead[i] = true;
        st.failed.n++;
        prog.refresh(i);
        log("切片 " + i + " 失败: " + err.message, true);
      });
    }
    return attempt(0);
  }

  // 线程池：各 worker 动态领取剩余任务（已完成/失败片跳过），负载自动均衡
  async function runDownload(data, ctrl, T) {
    var N = data.N, st = data.st, parts = data.parts, prog = data.prog;
    T = Math.min(Math.max(1, T || 20), N);
    var remaining = [];
    for (var i = 0; i < N; i++) if (!parts[i]) remaining.push(i);
    if (!remaining.length) {
      prog.done();
      return mergeResult(data);
    }
    log("线程池: " + T + " 并发, 下载剩余 " + remaining.length + " 片 (失败自动重试 3 次)...");
    var nextIdx = { n: 0 };
    function worker() {
      return new Promise(function (res) {
        (function loop() {
          if (ctrl.signal.aborted) return res();
          if (nextIdx.n >= remaining.length) return res();
          var idx = remaining[nextIdx.n++];
          downloadOne(data, ctrl, idx).then(function () {
            if (ctrl.signal.aborted) return res();
            loop();
          });
        })();
      });
    }
    var workers = [];
    for (var w = 0; w < T; w++) workers.push(worker());
    await Promise.all(workers);
    if (ctrl.signal.aborted) throw new DOMException("aborted", "AbortError");
    prog.done();
    var okCount = N - st.failed.n;
    log("下载完成: " + okCount + "/" + N + " 片成功, 失败 " + st.failed.n + " 片");
    if (!okCount) throw new Error("所有切片下载失败");
    return mergeResult(data);
  }

  function mergeResult(data) {
    var merged = new Blob(data.parts.filter(Boolean));
    return { name: (curDetail && curDetail.title ? curDetail.title : "video") +
                  "_" + ((curEp.source_name || "").trim() || curEp.id),
             blob: merged, failed: data.st.failed.n, total: data.N };
  }

  // 下载显示：启动即列出全部切片 + 白色总进度条 + 速度/剩余 + 每片实时状态
  function startProg(N, st, parts) {
    var box = $("dlprog");
    var totalFill = box.querySelector(".pbar.total .fill");
    var statEl = $("dlstat");
    var list = $("dlsegs");
    list.innerHTML = "";
    var segEls = new Array(N);
    for (var i = 0; i < N; i++) {
      var d = document.createElement("div");
      d.className = "seg";
      d.textContent = "切片 " + i + ": 等待";
      list.appendChild(d);
      segEls[i] = d;
      if (parts[i]) d.style.display = "none"; // 续下时已完成片直接隐藏
    }
    box.classList.remove("hide");
    var last = 0, smooth = 0;
    var startTime = Date.now(); // 起始时间，用于按分片估算剩余时间
    var samples = []; // {ts, tb} 速度采样窗口（约 2s）
    function fmtSize(b) { return (b / 1048576).toFixed(1) + " MB"; }
    function fmtTime(s) {
      if (s < 60) return s + "s";
      return Math.floor(s / 60) + "m" + (s % 60) + "s";
    }
    function sumBytes() {
      var tb = 0;
      for (var j = 0; j < N; j++) tb += st.bytes[j];
      return tb;
    }
    // 已下载字节口径：已完成切片校准大小总和 + 正在下载切片已下载字节总和
    function downloadedTotal() {
      var d = 0;
      for (var j = 0; j < N; j++) {
        d += parts[j] ? (st.sizes[j] || st.bytes[j]) : st.bytes[j];
      }
      return d;
    }
    // 估算总大小：已完成切片平均大小 × 总片数（无 HEAD 预取，按分片估）
    function estTotalSize() {
      return st.done.n > 0 ? (sumBytes() / st.done.n) * N : 0;
    }
    // 每片状态文本（即时更新，轻量）；已完成切片自动移除
    function refresh(i) {
      var el = segEls[i];
      if (parts[i]) { el.style.display = "none"; return; }
      el.style.display = "";
      var s = "切片 " + i + ": ";
      if (st.dead[i]) {
        s += "失败";
      } else {
        s += "下载中 " + fmtSize(st.bytes[i]);
        if (st.sizes[i] > 0) s += "/" + fmtSize(st.sizes[i]);
        if (st.retry[i] > 0) s += " (重试 " + st.retry[i] + "/3)";
      }
      el.textContent = s;
    }
    function render() {
      var now = Date.now();
      var tb = sumBytes(), dl = downloadedTotal();
      // 进度按分片计数计算（不依赖切片大小预取）
      totalFill.style.width = Math.round(st.done.n / N * 100) + "%";

      // 速度：字节流量 1s 采样，取最近约 2s 窗口首尾均值，平滑防波动
      samples.push({ ts: now, tb: tb });
      while (samples.length && now - samples[0].ts > 2500) samples.shift();
      var s0 = samples[0], s1 = samples[samples.length - 1];
      if (s0 && s1 && s1.ts - s0.ts >= 1000) {
        smooth = (s1.tb - s0.tb) / ((s1.ts - s0.ts) / 1000);
      }

      // 剩余时间按分片计算：平均每片耗时 × 剩余片数（与速度解耦）
      var elapsed = (now - startTime) / 1000;
      var avgPerSeg = st.done.n > 0 ? elapsed / st.done.n : 0;
      var remainingN = N - st.done.n;
      var eta = remainingN > 0 && avgPerSeg > 0 ? remainingN * avgPerSeg : 0;

      var speedMB = smooth / 1048576;
      var estTotal = estTotalSize();
      var statTxt = speedMB > 0 ? "速度 " + speedMB.toFixed(1) + " MB/s" : "速度 --";
      if (eta > 0) statTxt += " | 剩余 ~" + fmtTime(Math.round(eta));
      statTxt += " | 完成 " + st.done.n + "/" + N + " 片";
      statTxt += " | 下载 " + fmtSize(dl);
      if (estTotal > 0) statTxt += "/~" + fmtSize(estTotal);
      if (st.failed.n > 0) statTxt += " | 失败 " + st.failed.n + " 片";
      statEl.textContent = statTxt;
    }
    function maybeRender() {
      var now = Date.now();
      if (now - last < 1000) return; // 1s 刷新
      last = now;
      render();
    }
    return {
      refresh: function (i) { refresh(i); maybeRender(); },
      done: function () {
        // 完成时校准总大小为实际字节总和
        for (var j = 0; j < N; j++) if (parts[j]) st.sizes[j] = Math.max(st.sizes[j], st.bytes[j]);
        totalFill.style.width = "100%";
        statEl.textContent = "下载完成，总大小 " + fmtSize(downloadedTotal());
        for (var k = 0; k < N; k++) refresh(k);
        setTimeout(function () {
          box.classList.add("hide");
          list.innerHTML = "";
        }, 2000); // 完成后自动移除进度区
      }
    };
  }

  function concatChunks(chunks, len) {
    var u = new Uint8Array(len);
    var off = 0;
    for (var i = 0; i < chunks.length; i++) {
      u.set(chunks[i], off);
      off += chunks[i].length;
    }
    return u.buffer;
  }

  function saveBlob(blob, fileName) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      document.body.removeChild(a);
      URL.revokeObjectURL(a.href);
    }, 5000);
    return blob.size;
  }

  function downloadCurrent() {
    startFlow("ts");
  }

  // ---------- mp4 转换（ffmpeg.wasm 0.12/0.11 自动选择，-c copy 重封装） ----------
  var ffmpegPromise = null;
  function canUseSAB() { return typeof SharedArrayBuffer !== "undefined"; }
  function getFFmpeg() {
    if (ffmpegPromise) return ffmpegPromise;
    var v12 = canUseSAB();
    var dir = v12 ? "lib/ffmpeg/" : "lib/ffmpeg-v11/";
    var base = location.href.replace(/[^/]*$/, "");
    ffmpegPromise = (async function () {
      log("加载 ffmpeg.wasm " + (v12 ? "0.12" : "0.11 (降级, 当前环境无 SharedArrayBuffer)") +
          " (~" + (v12 ? "32" : "24") + "MB)...");
      await loadScript(dir + "ffmpeg.min.js");
      if (v12) {
        // 0.12 类 API：new FFmpeg() + ff.load({coreURL, wasmURL})
        var FF = window.FFmpegWASM;
        if (!FF || !FF.FFmpeg) throw new Error("FFmpegWASM 加载失败 (0.12)");
        var ff = new FF.FFmpeg();
        ff.on("log", function (ev) { log("ffmpeg: " + ev.message); });
        ff.on("progress", function (ev) {
          if (ev.progress > 0) log("ffmpeg 转换进度 " + Math.round(ev.progress * 100) + "%");
        });
        await ff.load({
          coreURL: base + dir + "ffmpeg-core.js",
          wasmURL: base + dir + "ffmpeg-core.wasm"
        });
        log("ffmpeg.wasm 0.12 加载完成");
        return {
          kind: "v12", obj: ff,
          writeFile: function (n, d) { return ff.writeFile(n, d); },
          readFile: function (n) { return ff.readFile(n); },
          deleteFile: function (n) { return ff.deleteFile(n); },
          run: function (args) { return ff.exec(args); }
        };
      }
      // 0.11 工厂 API：createFFmpeg + ffmpeg.FS 文件操作 + ffmpeg.run(...)
      var api = window.FFmpeg;
      if (!api || !api.createFFmpeg) throw new Error("FFmpegWASM 加载失败 (0.11)");
      var ffmpeg = api.createFFmpeg({
        corePath: base + dir + "ffmpeg-core.js",
        log: false,
        progress: function (p) {
          if (p && p.ratio > 0) log("ffmpeg 转换进度 " + Math.round(p.ratio * 100) + "%");
        }
      });
      await ffmpeg.load();
      log("ffmpeg.wasm 0.11 加载完成");
      return {
        kind: "v11", obj: ffmpeg,
        writeFile: function (n, d) { return ffmpeg.FS.writeFile(n, d); },
        readFile: function (n) { return ffmpeg.FS.readFile(n); },
        deleteFile: function (n) { return ffmpeg.FS.unlink(n); },
        run: function (args) { return ffmpeg.run.apply(ffmpeg, args); }
      };
    })();
    return ffmpegPromise;
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error("加载失败: " + src)); };
      document.head.appendChild(s);
    });
  }

  function downloadMp4() {
    startFlow("mp4");
  }

  // ---------- 下载会话流程（startFlow/finalize/webm 降级/重置） ----------
  function updateResetBtns() {
    var running = !!(dl && dl.running);
    $("btnReset").disabled = !running;
    $("btnResetFix").disabled = !running;
  }

  function rebuildProg(data) {
    data.prog = startProg(data.N, data.st, data.parts);
  }

  // 启动下载流程：mode = "ts" | "mp4"
  function startFlow(mode, forcedT) {
    if (dl && dl.running) { log("已有下载进行中"); return; }
    if (pre && pre.running) { log("预加载进行中，请先等待完成"); return; }
    if (!dl) dl = {};
    if (!dl.ctrl || dl.ctrl.signal.aborted) dl.ctrl = new AbortController();
    dl.mode = mode;
    dl.running = true;
    updateResetBtns();
    showLogPane();
    dl.promise = (async function () {
      try {
        if (!dl.data || dl.data.epId !== curEp.id) {
          dl.data = await prepareDownload();
        } else {
          rebuildProg(dl.data); // 续下：复用已有解析，重建进度显示
        }
        var res = await runDownload(dl.data, dl.ctrl, forcedT || cfg.downloadThreads);
        dl.running = false;
        updateResetBtns();
        updateStoredInfo(); // 下载分片已永久保存，刷新已预加载数
        await finalize(mode, res);
      } catch (e) {
        dl.running = false;
        updateResetBtns();
        if (e && e.name === "AbortError") {
          log("下载已中断，可点击「重置」继续剩余切片");
        } else {
          var em = (e && e.message) || JSON.stringify(e);
          if (mode === "mp4") {
            await handleMp4Failure(e, null); // 下载或转换失败：让用户选择录制或下载 ts
          } else {
            $("playerStatus").textContent = "下载失败: " + em;
            log("下载失败: " + em + "\n" + ((e && e.stack) || ""), true);
          }
        }
      }
    })();
    return dl.promise;
  }

  async function finalize(mode, res) {
    if (mode === "ts") {
      var size = saveBlob(res.blob, res.name + ".ts");
      $("playerStatus").textContent = "已下载 " + res.name + ".ts (" + Math.round(size / 1048576) + " MB)";
      log("已保存: " + res.name + ".ts (" + Math.round(size / 1048576) + " MB)");
      return;
    }
    try {
      var ff = await getFFmpeg();
      log("写入 ffmpeg 虚拟文件 in.ts (" + Math.round(res.blob.size / 1048576) + " MB)...");
      await ff.writeFile("in.ts", new Uint8Array(await res.blob.arrayBuffer()));
      log("执行 ffmpeg -i in.ts -c copy out.mp4 (重封装, 不重编码)...");
      await ff.run(["-i", "in.ts", "-c", "copy", "out.mp4"]);
      var out = await ff.readFile("out.mp4");
      await ff.deleteFile("in.ts");
      await ff.deleteFile("out.mp4");
log("ffmpeg 转换完成, 输出 " + Math.round(out.byteLength / 1048576) + " MB");
      var size2 = saveBlob(new Blob([out], { type: "video/mp4" }), res.name + ".mp4");
      $("playerStatus").textContent = "已下载 " + res.name + ".mp4 (" + Math.round(size2 / 1048576) + " MB)";
      log("已保存: " + res.name + ".mp4 (" + Math.round(size2 / 1048576) + " MB)");
    } catch (e) {
      await handleMp4Failure(e, res);
    }
  }

  async function webmFallback(res) {
    try {
      var webm = await recordWebm();
      var name = (res && res.name) || "video";
      var size = saveBlob(webm, name + ".webm");
      $("playerStatus").textContent = "已下载 " + name + ".webm (" + Math.round(size / 1048576) + " MB)";
      log("已保存 webm: " + Math.round(size / 1048576) + " MB");
    } catch (e2) {
      $("playerStatus").textContent = "转换失败: " + ((e2 && e2.message) || e2);
      log("webm 录制也失败: " + ((e2 && e2.message) || JSON.stringify(e2)) + "\n" + ((e2 && e2.stack) || ""), true);
    }
  }

  async function handleMp4Failure(e, res) {
    var em = (e && e.message) || JSON.stringify(e);
    log("mp4 转换失败: " + em + "\n" + ((e && e.stack) || ""), true);
    ffmpegPromise = null;
    // 错误后让用户选择：浏览器录制 或 直接下载 ts
    var choice = await askMode(res);
    if (choice === "ts") {
      if (res && res.blob) {
        var size = saveBlob(res.blob, res.name + ".ts");
        $("playerStatus").textContent = "已下载 " + res.name + ".ts (" + Math.round(size / 1048576) + " MB)";
        log("已保存: " + res.name + ".ts (" + Math.round(size / 1048576) + " MB)");
      } else {
        $("playerStatus").textContent = "下载未完成，无 .ts 可保存";
        log("下载未完成，无 .ts 可保存", true);
      }
    } else {
      await webmFallback(res);
    }
  }

  // 错误后弹出选择：浏览器录制 webm 或直接保存 ts
  function askMode(res) {
    return new Promise(function (resolve) {
      var box = $("choice");
      var tsBtn = $("chTs");
      tsBtn.disabled = !(res && res.blob);
      var done = false;
      function pick(choice) {
        if (done) return;
        done = true;
        box.classList.remove("open");
        $("chWebm").removeEventListener("click", onWebm);
        tsBtn.removeEventListener("click", onTs);
        resolve(choice);
      }
      function onWebm() { pick("webm"); }
      function onTs() { pick("ts"); }
      $("chWebm").addEventListener("click", onWebm);
      tsBtn.addEventListener("click", onTs);
      box.classList.add("open");
    });
  }

  // 浏览器录制兜底：video.captureStream + MediaRecorder，10x 加速
  async function recordWebm() {
    var video = $("video");
    if (!curEp) throw new Error("请先选择要下载的集");
    if (!window.MediaRecorder || !video.captureStream) throw new Error("浏览器不支持 webm 录制");
    if (!(hls && hls.url === curEp.url)) playEp(curEp, false);
    if (video.readyState < 2) {
      await new Promise(function (res, rej) {
        video.addEventListener("canplay", res, { once: true });
        video.addEventListener("error", function () { rej(new Error("播放器加载失败")); }, { once: true });
        setTimeout(function () { rej(new Error("播放器加载超时")); }, 30000);
      });
    }
    var mime = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"]
      .filter(function (m) { try { return MediaRecorder.isTypeSupported(m); } catch (e) { return false; } })[0];
    if (!mime) throw new Error("浏览器不支持 webm 编码");
    log("浏览器录制 webm (" + mime + "), 10x 加速（耗时≈视频时长/10）...");
    var stream = video.captureStream();
    var rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6000000 });
    var chunks = [];
    rec.ondataavailable = function (e) { if (e.data && e.data.size) chunks.push(e.data); };
    var stopP = new Promise(function (res, rej) {
      rec.onstop = function () { res(new Blob(chunks, { type: mime })); };
      rec.onerror = function () { rej(rec.error || new Error("录制错误")); };
    });
    video.muted = true;
    video.playbackRate = 10;
    video.currentTime = 0;
    rec.start(1000);
    await video.play().catch(function () {});
    await new Promise(function (res, rej) {
      var done = false;
      var timer = setTimeout(function () { finish(new Error("录制超时")); }, 120000);
      function finish(err) {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (err) rej(err); else res();
      }
      video.addEventListener("ended", function () { finish(); }, { once: true });
      video.addEventListener("error", function () { finish(new Error("录制播放错误")); }, { once: true });
    });
    rec.stop();
    var blob = await stopP;
    video.playbackRate = 1;
    video.muted = false;
    video.pause();
    return blob;
  }

  // 重置：中断当前下载，保留已完成切片，续下剩余（forcedT 强制 1 线程修复）
  function resetDownload(forcedT) {
    if (!dl || !dl.running) { log("当前没有运行中的下载"); return; }
    var p = dl.promise;
    dl.ctrl.abort();
    p.catch(function () {}).then(function () {
      var d = dl.data;
      if (!d) return;
      for (var i = 0; i < d.N; i++) {
        if (!d.parts[i]) {
          d.st.bytes[i] = 0;
          d.st.sizes[i] = 0;
          d.st.retry[i] = 0;
          d.st.dead[i] = false;
        }
      }
      d.st.failed.n = 0;
      d.st.done.n = 0;
      for (var j = 0; j < d.N; j++) if (d.parts[j]) d.st.done.n++;
      log((forcedT ? "重置并修复 (强制 1 线程)" : "重置未完成下载") + ", 保留已完成 " + d.st.done.n + " 片");
      dl.ctrl = new AbortController();
      startFlow(dl.mode, forcedT);
    });
  }

  // ---------- 预加载视频（IndexedDB 永久存储，仅对应视频播放时使用） ----------
  var pre = null; // { epId, N, stored, ctrl, running }
  var PRE_DB = "jp-preload";
  var PRE_STORE = "segs";
  var PRE_META = "meta";

  function idbOpen() {
    return new Promise(function (res, rej) {
      var rq = indexedDB.open(PRE_DB, 2);
      rq.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains(PRE_STORE)) {
          var s = d.createObjectStore(PRE_STORE, { keyPath: "key" });
          s.createIndex("ep", "ep", { unique: false });
        }
        if (!d.objectStoreNames.contains(PRE_META)) {
          d.createObjectStore(PRE_META, { keyPath: "ep" });
        }
      };
      rq.onsuccess = function () { res(rq.result); };
      rq.onerror = function () { rej(rq.error || new Error("IndexedDB 打开失败")); };
    });
  }
  function idbPut(ep, idx, data) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(PRE_STORE, "readwrite");
        tx.objectStore(PRE_STORE).put({ key: ep + ":" + idx, ep: ep, idx: idx, data: data, size: data.byteLength, ts: Date.now() });
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error || new Error("存储失败")); };
      });
    });
  }
  function idbGetAll(ep) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(PRE_STORE, "readonly");
        var rq = tx.objectStore(PRE_STORE).index("ep").getAll(IDBKeyRange.only(ep));
        rq.onsuccess = function () { res(rq.result || []); };
        rq.onerror = function () { rej(rq.error || new Error("读取失败")); };
      });
    });
  }
  function idbClear(ep) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction([PRE_STORE, PRE_META], "readwrite");
        var store = tx.objectStore(PRE_STORE);
        var idx = store.index("ep");
        var cur = idx.openKeyCursor(IDBKeyRange.only(ep));
        cur.onsuccess = function () {
          var c = cur.result;
          if (c) { store.delete(c.primaryKey); c.continue(); }
        };
        tx.objectStore(PRE_META).delete(ep);
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error || new Error("清除失败")); };
      });
    });
  }
  // 记录某集总片数（用于显示已预加载 x/N）
  function idbPutMeta(ep, N) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(PRE_META, "readwrite");
        tx.objectStore(PRE_META).put({ ep: ep, N: N, ts: Date.now() });
        tx.oncomplete = function () { res(); };
        tx.onerror = function () { rej(tx.error || new Error("元数据存储失败")); };
      });
    });
  }
  function idbGetMeta(ep) {
    return idbOpen().then(function (db) {
      return new Promise(function (res, rej) {
        var tx = db.transaction(PRE_META, "readonly");
        var rq = tx.objectStore(PRE_META).get(ep);
        rq.onsuccess = function () { res(rq.result || null); };
        rq.onerror = function () { rej(rq.error || new Error("元数据读取失败")); };
      });
    });
  }

  // 优先级顺序：正在播放的分片 + 后续 2 块优先，其余按序号补齐
  // 播放门控：预加载进行中且前 5 块未齐时禁止播放
  function preloadGateBlocked() {
    if (!pre || !pre.running || pre.epId !== curEp.id) return false;
    var need = Math.min(5, pre.N || 5);
    for (var i = 0; i < need; i++) if (!pre.stored || !pre.stored[i]) return true;
    return false;
  }

  function updateGateStatus() {
    var el = $("preStatus");
    if (!pre || pre.epId !== curEp.id || !pre.running) { updateStoredInfo(); return; }
    var need = Math.min(5, pre.N || 5);
    var n = 0;
    for (var i = 0; i < need; i++) if (pre.stored && pre.stored[i]) n++;
    if (el) el.textContent = "预加载中：前 " + need + " 块 " + n + "/" + need + "，完成后才可播放";
  }

  // 点集/完成后：显示当前已永久存储的分片数（预加载 + 下载共用）
  function updateStoredInfo() {
    var el = $("preStatus");
    if (!el || !curEp) return;
    if (pre && pre.running && pre.epId === curEp.id) { updateGateStatus(); return; }
    idbGetAll(curEp.id).then(function (rows) {
      return idbGetMeta(curEp.id).then(function (meta) {
        var n = rows.length;
        el.textContent = n > 0
          ? "已预加载 " + n + " 块" + (meta && meta.N ? " / " + meta.N : "")
          : "";
      });
    }).catch(function () {});
  }

  // 本地播放器（已存 TS 分片经 mux.js 转封装为 fMP4 喂 MSE，不联网）
  var localPlayer = null; // { epId, N, segData, ms, sb, tx, initDone, nextIdx, ready, appending }
  function initLocalPlayback() {
    if (!pre || !pre.N || !pre.epId || pre.epId !== curEp.id) return;
    if (localPlayer && localPlayer.epId === pre.epId) return;
    if (localPlayer) stopLocalPlayback();
    if (!window.muxjs || !window.muxjs.mp4) {
      log("本地播放不可用：mux.js 未加载", true);
      return;
    }
    var ms = new MediaSource();
    var lp = { epId: pre.epId, N: pre.N, segData: pre.segData, ms: ms, sb: null, tx: null, initDone: false, nextIdx: 0, ready: false, appending: false, pending: [] };
    localPlayer = lp;
    $("video").src = URL.createObjectURL(ms);
    ms.addEventListener("sourceopen", function () {
      if (!ms.sourceBuffers || !ms.sourceBuffers.length) {
        var sb = null;
        var mimes = ['video/mp4; codecs="avc1.64001f,mp4a.40.2"', 'video/mp4; codecs="avc1.42E01E,mp4a.40.2"', 'video/mp4'];
        for (var m = 0; m < mimes.length; m++) {
          try { sb = ms.addSourceBuffer(mimes[m]); break; } catch (e) {}
        }
        if (!sb) {
          log("本地播放不可用：无法添加 mp4 SourceBuffer", true);
          localPlayer = null;
          return;
        }
        lp.sb = sb;
        // 设置全集时长，进度条显示全长、可拖动
        if (pre && pre.totalDur) { try { ms.duration = pre.totalDur; } catch (e) {} }
        lp.tx = new muxjs.mp4.Transmuxer();
        lp.tx.on("data", function (segment) {
          var u8;
          if (!lp.initDone) {
            var a = segment.initSegment, b = segment.data;
            u8 = new Uint8Array(a.byteLength + b.byteLength);
            u8.set(a, 0);
            u8.set(b, a.byteLength);
            lp.initDone = true;
          } else {
            u8 = segment.data;
          }
          lp.pending.push(u8);
          drainBuf(lp);
        });
        sb.addEventListener("updateend", function () {
          lp.appending = false;
          drainBuf(lp);    // 清空已转封装队列
          appendLocal(lp); // 连续转封装+追加下一个分片，不再等 timeupdate 触发
        });
        lp.ready = true;
        appendLocal(lp);
      }
    });
    log("本地播放就绪：从浏览器存储取流，经 mux.js 转封装（不走网络）");
  }

  function drainBuf(lp) {
    if (!lp || !lp.sb || lp.appending || !lp.pending || !lp.pending.length) return;
    var u8 = lp.pending.shift();
    try {
      lp.sb.appendBuffer(u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength));
      lp.appending = true;
    } catch (e) {
      if (e.name === "QuotaExceededError") { lp.pending.unshift(u8); return; } // 缓冲满，放回等消费
      log("本地播放追加失败: " + e.message, true);
    }
  }

  // 按序把已就绪分片转封装后追加（每次一个，等待 updateend）
  function appendLocal(lp) {
    if (!lp || !lp.ready || !lp.sb || !lp.tx || lp.appending || !lp.segData) return;
    if (lp.pending && lp.pending.length > 8) return; // 队列积压（缓冲满），等追加消化
    while (lp.nextIdx < lp.N && lp.segData[lp.nextIdx]) {
      var d = lp.segData[lp.nextIdx];
      try {
        lp.tx.push(d);
        lp.tx.flush();
        lp.nextIdx++;
        return;
      } catch (e) {
        log("本地播放分片 " + lp.nextIdx + " 转封装失败: " + e.message, true);
        lp.nextIdx++;
      }
    }
  }

  function stopLocalPlayback() {
    if (!localPlayer) return;
    var lp = localPlayer, ms = lp.ms;
    var video = $("video");
    var url = video.currentSrc || "";
    try { if (ms && ms.readyState === "open") ms.endOfStream(); } catch (e) {}
    if (lp.sb && ms && ms.sourceBuffers && ms.sourceBuffers.length) {
      try { ms.removeSourceBuffer(lp.sb); } catch (e) {}
    }
    lp.sb = null;
    lp.ready = false;
    video.removeAttribute("src");
    try { video.load(); } catch (e) {}
    if (url && url.indexOf("blob:") === 0) { try { URL.revokeObjectURL(url); } catch (e) {} }
    localPlayer = null;
  }

  async function preloadCurrent() {
    if (dl && dl.running) { log("下载进行中，请先完成或重置"); return; }
    var epId = curEp && curEp.id;
    if (!epId) { log("请先选择要预加载的集"); return; }
    if (pre && pre.running && pre.epId !== epId) {
      // 切换选集：中断旧预加载（已保存分片保留），开始新集预加载
      pre.ctrl.abort();
      pre.running = false;
    }
    if (pre && pre.running) { log("预加载进行中"); return; }
    showLogPane();
    // 立即置 running 生效播放门控（含 prepareDownload 异步窗口），不自动播放
    var myPre = { epId: epId, ctrl: new AbortController(), running: true };
    pre = myPre;
    updateGateStatus();
    try {
      var data = await prepareDownload();
      var N = data.N, parts = data.parts, st = data.st, prog = data.prog;
      // 已永久存储的切片直接视为完成（支持续存），并载入本地播放数据
      var stored = new Array(N).fill(false);
      var segData = new Array(N);
      var rows = await idbGetAll(epId);
      for (var r = 0; r < rows.length; r++) {
        var idx = rows[r].idx;
        if (idx >= 0 && idx < N) { stored[idx] = true; parts[idx] = true; segData[idx] = rows[r].data; }
      }
      st.done.n = 0;
      for (var c = 0; c < N; c++) if (stored[c]) st.done.n++;
      myPre.N = N;
      myPre.stored = stored;
      myPre.segData = segData;
      myPre.totalDur = data.pl.totalDur || (N * 10); // 全集时长（进度条全长）
      updateGateStatus();
      initLocalPlayback(); // 就绪后 MSE 从本地存储取流
      var myLP = localPlayer;
      var T = Math.min(Math.max(1, cfg.downloadThreads || 20), N);
      var need = Math.min(5, N);          // 先只下载前 5 块
      var firstDone = 0;
      var firstPhaseDone = false;         // 前 need 块全部尝试完（含失败）
      // 动态优先级队列：seek 时把目标区域插到队首
      myPre.pending = [];
      for (var o = 0; o < N; o++) myPre.pending.push(o); // 先 0..4 后按序
      myPre.claimed = {};
      log("预加载: " + N + " 片, 线程 " + T + ", 先下载前 " + need + " 块, 完成后可播放并继续");
      function claimNext() {
        for (var k = 0; k < myPre.pending.length; k++) {
          var ci = myPre.pending[k];
          if (stored[ci]) { myPre.pending.splice(k, 1); k--; settleFirst(ci); continue; } // 已存直接视作完成
          if (!firstPhaseDone && ci >= need) continue; // 前 need 块未完成，暂缓后续
          if (myPre.claimed[ci]) continue; // 已被其它 worker 领取
          myPre.claimed[ci] = true;
          myPre.pending.splice(k, 1);
          return ci;
        }
        return -1;
      }
      function settleFirst(i) {
        if (i >= need || firstPhaseDone) return;
        firstDone++;
        if (firstDone < need) return;
        firstPhaseDone = true;
        var all = true;
        for (var q = 0; q < need; q++) if (!stored[q]) { all = false; break; }
        if (all) log("前 " + need + " 块已就绪，可播放，继续下载剩余分片");
        else log("前 " + need + " 块未全部成功，继续下载其余分片（从头播放可能受限）", true);
      }
      function worker() {
        return new Promise(function (res) {
          (function loop() {
            if (myPre.ctrl.signal.aborted) return res();
            var i = claimNext();
            if (i < 0) {
              if (myPre.pending.length === 0 && firstPhaseDone) return res(); // 全部领完且首阶段完成
              setTimeout(loop, 200); return; // 暂无可用（前5块未齐或等待已领分片完成），轮询
            }
            downloadOne(data, myPre.ctrl, i).then(function () {
              stored[i] = true;
              st.done.n++;
              if (!st.sizes[i]) st.sizes[i] = st.bytes[i];
              segData[i] = parts[i];   // 本地播放可立即追加
              appendLocal(myLP);       // 已就绪分片按序喂给 MSE
              prog.refresh(i);
              updateGateStatus();
              settleFirst(i);
              loop();
            }).catch(function (e) {
              if (myPre.ctrl.signal.aborted) { res(); return; }
              settleFirst(i);
              loop();
            });
          })();
        });
      }
      var workers = [];
      for (var w = 0; w < T; w++) workers.push(worker());
      await Promise.all(workers);
      if (myPre.ctrl.signal.aborted) { myPre.running = false; return; }
      prog.done();
      myPre.running = false;
      updateGateStatus();
      if (st.failed.n > 0) {
        log("预加载完成: " + N + " 片已保存至浏览器存储, 其中 " + st.failed.n + " 片失败（可重新预加载补齐）", true);
      } else {
        log("预加载完成: " + N + " 片已永久保存至浏览器存储");
      }
      $("playerStatus").textContent = "预加载完成，可手动播放";
    } catch (e) {
      if (pre && pre.epId === epId) { pre.running = false; }
      var em = (e && e.message) || JSON.stringify(e);
      $("playerStatus").textContent = "预加载失败: " + em;
      log("预加载失败: " + em + "\n" + ((e && e.stack) || ""), true);
    } finally {
      updateGateStatus();
    }
  }

  // ---------- 设置面板 ----------
  function openSettings() {
    $("cfgSign").checked = cfg.sign !== false;
    $("cfgSignDownload").checked = cfg.signDownload === true;
    $("cfgPreload").checked = cfg.preload === true;
    $("cfgThreads").value = cfg.downloadThreads || 20;
    $("cfgSecret").value = cfg.secret || "";
    $("cfgToken").value = cfg.token || "";
    $("cfgApi").value = cfg.api || "";
    $("settings").classList.add("open");
  }
  function closeSettings() { $("settings").classList.remove("open"); }

  function saveSettings() {
    var preloadOn = $("cfgPreload").checked;
    cfg.sign = $("cfgSign").checked;
    cfg.signDownload = $("cfgSignDownload").checked;
    cfg.preload = preloadOn;
    cfg.downloadThreads = Math.min(50, Math.max(1, parseInt($("cfgThreads").value, 10) || 20));
    cfg.secret = $("cfgSecret").value.trim();
    cfg.token = $("cfgToken").value.trim();
    cfg.api = $("cfgApi").value.trim() || "https://h5.jianpianips1.com/api";
    persistCfg();
    if (!preloadOn) {
      // 关闭预加载：中断当前预加载，本地播放转为在线播放
      if (pre && pre.running) {
        pre.ctrl.abort();
        pre.running = false;
      }
      updateGateStatus();
      if (localPlayer && curEp) {
        stopLocalPlayback();
        playEp(curEp, false);
      }
    }
    $("setStatus").textContent = "已保存 " + new Date().toLocaleTimeString();
    setTimeout(function () { closeSettings(); }, 600);
  }

  function clearHistory() {
    localStorage.removeItem(HIST_KEY);
    renderHistory();
    $("setStatus").textContent = "历史已清空";
  }

  // ---------- 事件绑定 ----------
  $("btnSearch").addEventListener("click", function () { doSearch($("q").value); });
  $("q").addEventListener("keydown", function (e) { if (e.key === "Enter") doSearch($("q").value); });
  $("btnBack").addEventListener("click", function () {
    $("detail").classList.add("hide");
    $("list").classList.remove("hide");
  });
  $("btnSettings").addEventListener("click", openSettings);
  $("btnSave").addEventListener("click", saveSettings);
  $("btnClose").addEventListener("click", closeSettings);
  $("btnClear").addEventListener("click", clearHistory);
  $("btnDownload").addEventListener("click", downloadCurrent);
  $("btnMp4").addEventListener("click", downloadMp4);
  $("btnReset").addEventListener("click", function () { resetDownload(false); });
  $("btnResetFix").addEventListener("click", function () { resetDownload(true); });
  updateResetBtns();

  // 播放门控：预加载本集且前 5 块未齐时，阻止播放（不自动播放，完成后用户可手动播放）
  $("video").addEventListener("play", function () {
    if (preloadGateBlocked()) {
      this.pause();
      updateGateStatus();
      log("前 5 块未预加载完成，暂不允许播放");
    }
  });

  // 本地播放：持续把已下载分片追喂进缓冲 + 跳转时优先补下载目标区域
  function seekPriority(targetTime) {
    if (!pre || pre.epId !== curEp.id || !pre.N || !pre.totalDur || !pre.running) return;
    var avg = pre.totalDur / pre.N;
    var t = Math.min(pre.N - 1, Math.max(0, Math.floor((targetTime || 0) / avg)));
    var prio = [];
    for (var d = -2; d <= 2; d++) {
      var j = t + d;
      if (j >= 0 && j < pre.N && !pre.stored[j] && !pre.claimed[j] && prio.indexOf(j) < 0) prio.push(j);
    }
    if (!prio.length) return;
    for (var q = 0; q < prio.length; q++) {
      var idx = pre.pending.indexOf(prio[q]);
      if (idx > 0) { pre.pending.splice(idx, 1); pre.pending.unshift(prio[q]); }
    }
    log("定位中：优先补齐该区域分片 (" + prio.join(",") + ")，就绪后自动续播");
  }
  $("video").addEventListener("timeupdate", function () {
    if (localPlayer && localPlayer.epId === curEp.id) appendLocal(localPlayer);
  });
  $("video").addEventListener("seeking", function () {
    if (localPlayer && localPlayer.epId === curEp.id) {
      appendLocal(localPlayer);
      seekPriority(this.currentTime);
    }
  });

  // ---------- 启动 ----------
  renderHistory();
  renderWatch();
  ensureSecret();
  updateStoredInfo();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(function () {});
  }
})();