/* md5.js - 纯 JS MD5 实现，用于 API 签名（无第三方依赖）
 * 输出 hex 小写字符串。兼容 ASCII 与 UTF-8。 */
(function (global) {
  "use strict";

  var HEX = "0123456789abcdef";
  var K = new Int32Array(64);
  var S = new Int32Array([
    7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
    5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
    4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
    6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21
  ]);
  for (var i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 0x100000000);

  function utf8Bytes(str) {
    var out = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) out.push(c);
      else if (c < 0x800) out.push((c >> 6) | 0xc0, (c & 0x3f) | 0x80);
      else if (c >= 0xd800 && c <= 0xdbff) {
        var lo = str.charCodeAt(++i);
        var cp = 0x10000 + ((c - 0xd800) << 10) + (lo - 0xdc00);
        out.push((cp >> 18) | 0xf0, ((cp >> 12) & 0x3f) | 0x80, ((cp >> 6) & 0x3f) | 0x80, (cp & 0x3f) | 0x80);
      } else out.push((c >> 12) | 0xe0, ((c >> 6) & 0x3f) | 0x80, (c & 0x3f) | 0x80);
    }
    return out;
  }

  function leftRotate(x, n) {
    return ((x << n) | (x >>> (32 - n))) | 0;
  }

  function md5(plain) {
    var bytes = utf8Bytes(String(plain));
    var len = bytes.length;
    var msg = new Uint8Array(((len + 8) >> 6 << 6) + 64);
    msg.set(bytes);
    msg[len] = 0x80;
    var bitLen = len * 8;
    var dv = new DataView(msg.buffer);
    dv.setUint32(msg.length - 8, bitLen >>> 0, true);
    dv.setUint32(msg.length - 4, Math.floor(bitLen / 0x100000000), true);

    var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

    for (var off = 0; off < msg.length; off += 64) {
      var m = new Int32Array(16);
      for (var j = 0; j < 16; j++) m[j] = dv.getInt32(off + j * 4, true);

      var a = a0, b = b0, c = c0, d = d0;
      for (var i = 0; i < 64; i++) {
        var f, g;
        if (i < 16)      { f = (b & c) | (~b & d); g = i; }
        else if (i < 32) { f = (d & b) | (~d & c); g = (5 * i + 1) % 16; }
        else if (i < 48) { f = b ^ c ^ d;          g = (3 * i + 5) % 16; }
        else             { f = c ^ (b | ~d);       g = (7 * i) % 16; }

        var tmp = d;
        d = c;
        c = b;
        b = (b + leftRotate((a + f + K[i] + m[g]) | 0, S[i])) | 0;
        a = tmp;
      }
      a0 = (a0 + a) | 0; b0 = (b0 + b) | 0; c0 = (c0 + c) | 0; d0 = (d0 + d) | 0;
    }

    function hex(x) {
      x >>>= 0;
      var b0 = x & 0xff, b1 = (x >>> 8) & 0xff, b2 = (x >>> 16) & 0xff, b3 = (x >>> 24) & 0xff;
      return HEX[b0 >> 4] + HEX[b0 & 15] + HEX[b1 >> 4] + HEX[b1 & 15] +
             HEX[b2 >> 4] + HEX[b2 & 15] + HEX[b3 >> 4] + HEX[b3 & 15];
    }
    return hex(a0) + hex(b0) + hex(c0) + hex(d0);
  }

  global.md5 = md5;
})(window);