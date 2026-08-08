/*
 * Tencent Video Test 16 - ad card response patch
 *
 * Goal: keep the normal i.video.qq.com protobuf response intact, but invalidate
 * the ad-card renderer/type markers using SAME-LENGTH ASCII replacements.
 * This preserves protobuf lengths and avoids blanking unrelated page data.
 */

function toBytes(body) {
  if (!body) return null;
  if (typeof Uint8Array !== "undefined" && body instanceof Uint8Array) return body;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof body === "string") {
    const b = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) b[i] = body.charCodeAt(i) & 0xff;
    return b;
  }
  return null;
}

function asciiBytes(s) {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

function containsAscii(bytes, text) {
  if (!bytes || !text || bytes.length < text.length) return false;
  const needle = asciiBytes(text);
  outer:
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function replaceAsciiSameLength(bytes, from, to) {
  if (from.length !== to.length) throw new Error("replacement length mismatch");
  const src = asciiBytes(from);
  const dst = asciiBytes(to);
  let count = 0;

  outer:
  for (let i = 0; i <= bytes.length - src.length; i++) {
    for (let j = 0; j < src.length; j++) {
      if (bytes[i + j] !== src[j]) continue outer;
    }
    for (let j = 0; j < dst.length; j++) bytes[i + j] = dst[j];
    count++;
    i += src.length - 1;
  }
  return count;
}

const status = ($response && $response.status) || 0;
const bytes = toBytes($response && $response.body);

const MARKER_FEED = "com.tencent.qqlive.protocol.pb.AdFeedInfo";
const MARKER_POSTER = "com.tencent.qqlive.protocol.pb.AdFocusPoster";

const isAdCardResponse =
  status === 200 &&
  bytes &&
  containsAscii(bytes, MARKER_FEED) &&
  containsAscii(bytes, MARKER_POSTER);

if (!isAdCardResponse) {
  console.log("[TencentVideo-Test16] PASS status=" + status + " bytes=" + (bytes ? bytes.length : 0));
  $done({});
} else {
  const replacements = [
    ["ad_block_2", "xx_block_2"],
    ["_ad_insert_mix_block", "_xx_insert_mix_block"],
    ["com.tencent.qqlive.protocol.pb.AdFeedInfo", "com.tencent.qqlive.protocol.pb.XdFeedInfo"],
    ["com.tencent.qqlive.protocol.pb.AdFocusPoster", "com.tencent.qqlive.protocol.pb.XdFocusPoster"],
    ["ad_focus", "xx_focus"]
  ];

  let total = 0;
  for (const [from, to] of replacements) {
    const n = replaceAsciiSameLength(bytes, from, to);
    total += n;
    if (n) console.log("[TencentVideo-Test16] PATCH " + from + " count=" + n);
  }

  console.log("[TencentVideo-Test16] AD CARD RESPONSE PATCHED bytes=" + bytes.length + " total=" + total);
  $done({ body: bytes });
}
