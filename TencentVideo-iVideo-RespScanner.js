/*
 * Tencent Video i.video.qq.com response scanner
 * Test 8: observation only, never blocks/modifies traffic.
 */

function getHeader(headers, name) {
  headers = headers || {};
  const want = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === want) return String(headers[k] || "");
  }
  return "";
}

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
  return !!(bytes && bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b);
}

function printableStrings(bytes, minLen) {
  const out = [];
  if (!bytes) return out;
  let cur = "";
  for (let i = 0; i < bytes.length; i++) {
    const c = bytes[i];
    if (c >= 0x20 && c <= 0x7e) {
      cur += String.fromCharCode(c);
    } else {
      if (cur.length >= minLen) out.push(cur);
      cur = "";
    }
  }
  if (cur.length >= minLen) out.push(cur);
  return out;
}

const id = ($request && $request.id) || "unknown";
const service = $persistentStore.read("tvid_req_" + id) || "unknown";
let bytes = toBytes($response && $response.body);
const rawLen = bytes ? bytes.length : 0;
let gzip = false;

if (isGzip(bytes)) {
  try {
    const u = $utils.ungzip(bytes);
    if (u && u.length) {
      bytes = u;
      gzip = true;
    }
  } catch (e) {
    console.log("[TencentVideo-Test8][RESP] ungzip failed: " + e);
  }
}

const keywords = [
  "ad", "advert", "gdt", "ssp", "promo", "promotion", "commercial",
  "recommend", "feed", "personal", "card", "resource", "activity",
  "popup", "banner", "monet", "game", "material"
];

const known = [
  "GetPersonalCenterAdData",
  "ServerAdFeedsVideo",
  "video_ad_ssp_feeds",
  "AdRequestContextInfo",
  "AccessPromotion",
  "reward_ad_ssp",
  "vip_ad_promotion"
];

let strings = printableStrings(bytes, 5);
let hits = [];
for (const s of strings) {
  const low = s.toLowerCase();
  if (known.some(k => s.indexOf(k) !== -1) || keywords.some(k => low.indexOf(k) !== -1)) {
    hits.push(s.length > 260 ? s.slice(0, 260) + "<...>" : s);
  }
}
hits = [...new Set(hits)].slice(0, 20);

console.log(
  "[TencentVideo-Test8][RESP] id=" + id +
  " status=" + (($response && $response.status) || 0) +
  " raw=" + rawLen +
  " body=" + (bytes ? bytes.length : 0) +
  " gzipMagic=" + (gzip ? "yes" : "no") +
  " service=" + service +
  " hits=" + hits.length
);

for (let i = 0; i < hits.length; i++) {
  console.log("[TencentVideo-Test8][RESP] H" + (i + 1) + " " + hits[i]);
}

$done({});
