/*
 * Tencent Video Test 15 - i.video.qq.com response-only scanner
 *
 * IMPORTANT:
 * - No request script is used, so requests are not touched.
 * - This script only observes response bodies and always $done({}).
 * - Goal: find the actual protobuf/card fields that render the Personal Center ad.
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

function isGzip(bytes) {
  return !!bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
}

function printableRuns(bytes) {
  const out = [];
  if (!bytes) return out;
  let cur = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c >= 0x20 && c <= 0x7e) {
      cur += String.fromCharCode(c);
      if (cur.length > 500) {
        out.push(cur);
        cur = "";
      }
    } else {
      if (cur.length >= 4) out.push(cur);
      cur = "";
    }
  }
  if (cur.length >= 4) out.push(cur);
  return out;
}

function interesting(s) {
  const x = s.toLowerCase();
  const keys = [
    "personal_center", "personalcenter", "banner", "advert", "ad_", "_ad", ".ad",
    "ssp", "gdt", "promotion", "promo", "material", "native", "card", "feed",
    "mvl", "multi_vector_layout", "layout", "operation", "resource", "recommend",
    "type.googleapis.com", "trpc.", "com.tencent.qqlive.protocol.pb"
  ];
  return keys.some(k => x.indexOf(k) !== -1);
}

const status = ($response && $response.status) || 0;
let bytes = toBytes($response && $response.body);
const raw = bytes ? bytes.length : 0;
let gz = isGzip(bytes);
let decoded = false;

if (gz) {
  try {
    const u = $utils.ungzip(bytes);
    if (u && u.length) {
      bytes = u;
      decoded = true;
    }
  } catch (e) {
    console.log("[TencentVideo-Test15] ungzip failed: " + e);
  }
}

let runs = printableRuns(bytes);
let hits = [];
for (const s of runs) {
  if (interesting(s)) hits.push(s);
}
hits = [...new Set(hits)].slice(0, 40);

console.log(
  "[TencentVideo-Test15][RESP] status=" + status +
  " raw=" + raw +
  " body=" + (bytes ? bytes.length : 0) +
  " gzipMagic=" + (gz ? "yes" : "no") +
  " decoded=" + (decoded ? "yes" : "no") +
  " hits=" + hits.length
);

for (let i = 0; i < hits.length; i++) {
  let v = hits[i];
  if (v.length > 220) v = v.slice(0, 220) + "<...>";
  console.log("[TencentVideo-Test15][RESP] H" + (i + 1) + " " + v);
}

$done({});
