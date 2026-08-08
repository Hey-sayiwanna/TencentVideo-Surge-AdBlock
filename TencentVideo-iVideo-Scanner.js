/*
 * TencentVideo i.video.qq.com TRPC scanner
 * Diagnostic only: NEVER blocks or modifies requests.
 *
 * Surge may expose an already-decoded body while Content-Encoding still says gzip,
 * so gzip is detected by the actual 0x1f 0x8b magic bytes instead of the header alone.
 */

function toBytes(body) {
  if (!body) return null;
  if (typeof Uint8Array !== "undefined" && body instanceof Uint8Array) return body;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof body === "string") {
    const out = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) out[i] = body.charCodeAt(i) & 0xff;
    return out;
  }
  return null;
}

function isGzip(bytes) {
  return !!(bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
}

function extractAsciiRuns(bytes, minLen) {
  const runs = [];
  if (!bytes) return runs;
  let start = -1;

  function push(end) {
    if (start < 0) return;
    const len = end - start;
    if (len >= minLen) {
      let s = "";
      for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]);
      runs.push(s);
    }
    start = -1;
  }

  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // Visible ASCII, including spaces.
    if (b >= 0x20 && b <= 0x7e) {
      if (start < 0) start = i;
    } else {
      push(i);
    }
  }
  push(bytes.length);
  return runs;
}

const method = (($request && $request.method) || "").toUpperCase();
const url = ($request && $request.url) || "";
let bytes = toBytes($request && $request.body);
const rawLength = bytes ? bytes.length : 0;
let decompressed = false;
let gunzipError = "";

if (isGzip(bytes)) {
  try {
    const out = $utils.ungzip(bytes);
    if (out && out.length) {
      bytes = out;
      decompressed = true;
    } else {
      gunzipError = "ungzip returned empty";
    }
  } catch (e) {
    gunzipError = String(e);
  }
}

const runs = extractAsciiRuns(bytes, 6);
const interestingRe = /(trpc\.|googleapis\.com|ad|advert|ssp|promo|promotion|personal|feed|recommend|card|banner|resource|activity|operation|home|vip|preload|commercial|monet)/i;
const seen = Object.create(null);
const interesting = [];

for (const r of runs) {
  if (!interestingRe.test(r)) continue;
  // Limit giant strings so Notes remain readable.
  const item = r.length > 240 ? r.slice(0, 240) + "…" : r;
  if (!seen[item]) {
    seen[item] = true;
    interesting.push(item);
  }
  if (interesting.length >= 20) break;
}

console.log(
  "[TencentVideo-Scanner] method=" + method +
  " raw=" + rawLength +
  " body=" + (bytes ? bytes.length : 0) +
  " gzipMagic=" + (decompressed ? "yes" : "no") +
  (gunzipError ? " gunzipError=" + gunzipError : "") +
  " candidates=" + interesting.length
);

if (interesting.length) {
  for (let i = 0; i < interesting.length; i++) {
    console.log("[TencentVideo-Scanner] C" + (i + 1) + " " + interesting[i]);
  }
} else {
  console.log("[TencentVideo-Scanner] no interesting ASCII service markers");
}

// Diagnostic only. Never alter Tencent Video traffic.
$done({});
