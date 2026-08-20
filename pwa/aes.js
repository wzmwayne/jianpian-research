/* aes.js - AES-128-CBC 解密（纯 JS，非安全上下文降级用）
 * 移植自 hls.js src/crypt/aes-decryptor.ts（MIT License, Copyright (c) 2016-2023 video-dev）
 * 来源: https://github.com/video-dev/hls.js/blob/master/src/crypt/aes-decryptor.ts
 * 暴露:
 *   window.AESDecryptor    - 解密器类（expandKey / decrypt）
 *   window.aesRemovePadding- 去 PKCS7 填充
 *   window.aesCbcDecrypt   - 便捷函数 aesCbcDecrypt(key, data, iv) -> 去填充后 Uint8Array */
(function (global) {
  "use strict";

  // PKCS7
  function aesRemovePadding(array) {
    var outputBytes = array.byteLength;
    var paddingBytes = outputBytes && new DataView(array.buffer).getUint8(outputBytes - 1);
    if (paddingBytes) {
      return array.slice(0, outputBytes - paddingBytes);
    }
    return array;
  }

  var AESDecryptor = (function () {
    function AESDecryptor() {
      this.rcon = [0x0, 0x1, 0x2, 0x4, 0x8, 0x10, 0x20, 0x40, 0x80, 0x1b, 0x36];
      this.subMix = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      this.invSubMix = [new Uint32Array(256), new Uint32Array(256), new Uint32Array(256), new Uint32Array(256)];
      this.sBox = new Uint32Array(256);
      this.invSBox = new Uint32Array(256);
      this.key = new Uint32Array(0);
      this.ksRows = 0;
      this.keySize = 0;
      this.initTable();
    }

    AESDecryptor.prototype.uint8ArrayToUint32Array_ = function (arrayBuffer) {
      var view = new DataView(arrayBuffer);
      var newArray = new Uint32Array(4);
      for (var i = 0; i < 4; i++) {
        newArray[i] = view.getUint32(i * 4);
      }
      return newArray;
    };

    AESDecryptor.prototype.initTable = function () {
      var sBox = this.sBox;
      var invSBox = this.invSBox;
      var subMix = this.subMix;
      var subMix0 = subMix[0];
      var subMix1 = subMix[1];
      var subMix2 = subMix[2];
      var subMix3 = subMix[3];
      var invSubMix = this.invSubMix;
      var invSubMix0 = invSubMix[0];
      var invSubMix1 = invSubMix[1];
      var invSubMix2 = invSubMix[2];
      var invSubMix3 = invSubMix[3];
      var d = new Uint32Array(256);
      var x = 0;
      var xi = 0;
      var i = 0;
      for (i = 0; i < 256; i++) {
        if (i < 128) {
          d[i] = i << 1;
        } else {
          d[i] = (i << 1) ^ 0x11b;
        }
      }
      for (i = 0; i < 256; i++) {
        var sx = xi ^ (xi << 1) ^ (xi << 2) ^ (xi << 3) ^ (xi << 4);
        sx = (sx >>> 8) ^ (sx & 0xff) ^ 0x63;
        sBox[x] = sx;
        invSBox[sx] = x;

        var x2 = d[x];
        var x4 = d[x2];
        var x8 = d[x4];

        var t = (d[sx] * 0x101) ^ (sx * 0x1010100);
        subMix0[x] = (t << 24) | (t >>> 8);
        subMix1[x] = (t << 16) | (t >>> 16);
        subMix2[x] = (t << 8) | (t >>> 24);
        subMix3[x] = t;

        t = (x8 * 0x1010101) ^ (x4 * 0x10001) ^ (x2 * 0x101) ^ (x * 0x1010100);
        invSubMix0[sx] = (t << 24) | (t >>> 8);
        invSubMix1[sx] = (t << 16) | (t >>> 16);
        invSubMix2[sx] = (t << 8) | (t >>> 24);
        invSubMix3[sx] = t;

        if (!x) {
          x = xi = 1;
        } else {
          x = x2 ^ d[d[d[x8 ^ x2]]];
          xi ^= d[d[xi]];
        }
      }
    };

    AESDecryptor.prototype.expandKey = function (keyBuffer) {
      var key = this.uint8ArrayToUint32Array_(keyBuffer);
      var sameKey = true;
      var offset = 0;
      while (offset < key.length && sameKey) {
        sameKey = key[offset] === this.key[offset];
        offset++;
      }
      if (sameKey) {
        return;
      }
      this.key = key;
      var keySize = (this.keySize = key.length);
      if (keySize !== 4 && keySize !== 6 && keySize !== 8) {
        throw new Error("Invalid aes key size=" + keySize);
      }
      var ksRows = (this.ksRows = (keySize + 6 + 1) * 4);
      var ksRow;
      var invKsRow;
      var keySchedule = (this.keySchedule = new Uint32Array(ksRows));
      var invKeySchedule = (this.invKeySchedule = new Uint32Array(ksRows));
      var sbox = this.sBox;
      var rcon = this.rcon;
      var invSubMix = this.invSubMix;
      var invSubMix0 = invSubMix[0];
      var invSubMix1 = invSubMix[1];
      var invSubMix2 = invSubMix[2];
      var invSubMix3 = invSubMix[3];
      var prev;
      var t;
      for (ksRow = 0; ksRow < ksRows; ksRow++) {
        if (ksRow < keySize) {
          prev = keySchedule[ksRow] = key[ksRow];
          continue;
        }
        t = prev;
        if (ksRow % keySize === 0) {
          t = (t << 8) | (t >>> 24);
          t =
            (sbox[t >>> 24] << 24) |
            (sbox[(t >>> 16) & 0xff] << 16) |
            (sbox[(t >>> 8) & 0xff] << 8) |
            sbox[t & 0xff];
          t ^= rcon[(ksRow / keySize) | 0] << 24;
        } else if (keySize > 6 && ksRow % keySize === 4) {
          t =
            (sbox[t >>> 24] << 24) |
            (sbox[(t >>> 16) & 0xff] << 16) |
            (sbox[(t >>> 8) & 0xff] << 8) |
            sbox[t & 0xff];
        }
        keySchedule[ksRow] = prev = (keySchedule[ksRow - keySize] ^ t) >>> 0;
      }
      for (invKsRow = 0; invKsRow < ksRows; invKsRow++) {
        ksRow = ksRows - invKsRow;
        if (invKsRow & 3) {
          t = keySchedule[ksRow];
        } else {
          t = keySchedule[ksRow - 4];
        }
        if (invKsRow < 4 || ksRow <= 4) {
          invKeySchedule[invKsRow] = t;
        } else {
          invKeySchedule[invKsRow] =
            invSubMix0[sbox[t >>> 24]] ^
            invSubMix1[sbox[(t >>> 16) & 0xff]] ^
            invSubMix2[sbox[(t >>> 8) & 0xff]] ^
            invSubMix3[sbox[t & 0xff]];
        }
        invKeySchedule[invKsRow] = invKeySchedule[invKsRow] >>> 0;
      }
    };

    AESDecryptor.prototype.networkToHostOrderSwap = function (word) {
      return (
        (word << 24) |
        ((word & 0xff00) << 8) |
        ((word & 0xff0000) >> 8) |
        (word >>> 24)
      );
    };

    AESDecryptor.prototype.decrypt = function (inputArrayBuffer, offset, aesIV) {
      var nRounds = this.keySize + 6;
      var invKeySchedule = this.invKeySchedule;
      var invSBOX = this.invSBox;
      var invSubMix = this.invSubMix;
      var invSubMix0 = invSubMix[0];
      var invSubMix1 = invSubMix[1];
      var invSubMix2 = invSubMix[2];
      var invSubMix3 = invSubMix[3];
      var initVector = this.uint8ArrayToUint32Array_(aesIV);
      var initVector0 = initVector[0];
      var initVector1 = initVector[1];
      var initVector2 = initVector[2];
      var initVector3 = initVector[3];
      var inputInt32 = new Int32Array(inputArrayBuffer);
      var outputInt32 = new Int32Array(inputInt32.length);
      var t0, t1, t2, t3;
      var s0, s1, s2, s3;
      var inputWords0, inputWords1, inputWords2, inputWords3;
      var ksRow, i;
      var swapWord = this.networkToHostOrderSwap;

      while (offset < inputInt32.length) {
        inputWords0 = swapWord(inputInt32[offset]);
        inputWords1 = swapWord(inputInt32[offset + 1]);
        inputWords2 = swapWord(inputInt32[offset + 2]);
        inputWords3 = swapWord(inputInt32[offset + 3]);

        s0 = inputWords0 ^ invKeySchedule[0];
        s1 = inputWords3 ^ invKeySchedule[1];
        s2 = inputWords2 ^ invKeySchedule[2];
        s3 = inputWords1 ^ invKeySchedule[3];

        ksRow = 4;

        for (i = 1; i < nRounds; i++) {
          t0 =
            invSubMix0[s0 >>> 24] ^
            invSubMix1[(s1 >> 16) & 0xff] ^
            invSubMix2[(s2 >> 8) & 0xff] ^
            invSubMix3[s3 & 0xff] ^
            invKeySchedule[ksRow];
          t1 =
            invSubMix0[s1 >>> 24] ^
            invSubMix1[(s2 >> 16) & 0xff] ^
            invSubMix2[(s3 >> 8) & 0xff] ^
            invSubMix3[s0 & 0xff] ^
            invKeySchedule[ksRow + 1];
          t2 =
            invSubMix0[s2 >>> 24] ^
            invSubMix1[(s3 >> 16) & 0xff] ^
            invSubMix2[(s0 >> 8) & 0xff] ^
            invSubMix3[s1 & 0xff] ^
            invKeySchedule[ksRow + 2];
          t3 =
            invSubMix0[s3 >>> 24] ^
            invSubMix1[(s0 >> 16) & 0xff] ^
            invSubMix2[(s1 >> 8) & 0xff] ^
            invSubMix3[s2 & 0xff] ^
            invKeySchedule[ksRow + 3];
          s0 = t0;
          s1 = t1;
          s2 = t2;
          s3 = t3;
          ksRow = ksRow + 4;
        }

        t0 =
          (invSBOX[s0 >>> 24] << 24) ^
          (invSBOX[(s1 >> 16) & 0xff] << 16) ^
          (invSBOX[(s2 >> 8) & 0xff] << 8) ^
          invSBOX[s3 & 0xff] ^
          invKeySchedule[ksRow];
        t1 =
          (invSBOX[s1 >>> 24] << 24) ^
          (invSBOX[(s2 >> 16) & 0xff] << 16) ^
          (invSBOX[(s3 >> 8) & 0xff] << 8) ^
          invSBOX[s0 & 0xff] ^
          invKeySchedule[ksRow + 1];
        t2 =
          (invSBOX[s2 >>> 24] << 24) ^
          (invSBOX[(s3 >> 16) & 0xff] << 16) ^
          (invSBOX[(s0 >> 8) & 0xff] << 8) ^
          invSBOX[s1 & 0xff] ^
          invKeySchedule[ksRow + 2];
        t3 =
          (invSBOX[s3 >>> 24] << 24) ^
          (invSBOX[(s0 >> 16) & 0xff] << 16) ^
          (invSBOX[(s1 >> 8) & 0xff] << 8) ^
          invSBOX[s2 & 0xff] ^
          invKeySchedule[ksRow + 3];

        outputInt32[offset] = swapWord(t0 ^ initVector0);
        outputInt32[offset + 1] = swapWord(t3 ^ initVector1);
        outputInt32[offset + 2] = swapWord(t2 ^ initVector2);
        outputInt32[offset + 3] = swapWord(t1 ^ initVector3);

        initVector0 = inputWords0;
        initVector1 = inputWords1;
        initVector2 = inputWords2;
        initVector3 = inputWords3;

        offset = offset + 4;
      }

      return outputInt32.buffer;
    };

    return AESDecryptor;
  })();

  // 便捷函数：aesCbcDecrypt(key, data, iv) -> 去填充后的 Uint8Array
  // key/data/iv 均为 Uint8Array
  function aesCbcDecrypt(key, data, iv) {
    var dec = new AESDecryptor();
    dec.expandKey(key.buffer);
    var plain = new Uint8Array(dec.decrypt(data.buffer, 0, iv.buffer));
    return aesRemovePadding(plain);
  }

  global.AESDecryptor = AESDecryptor;
  global.aesRemovePadding = aesRemovePadding;
  global.aesCbcDecrypt = aesCbcDecrypt;
})(window);