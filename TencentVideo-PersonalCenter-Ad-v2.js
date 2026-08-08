/*
 * Tencent Video personal-center ad detector v2
 * Surge request body may arrive as gzip-compressed binary data.
 * This version ungzips before searching protobuf ASCII strings.
 */

const TARGETS = [
  "GetPersonalCenterAdData",
  "trpc.vip_ad_promotion.access_adaptor.Adaptor",
  "AccessPromotion"
];

function getHeader(name) {
  const headers = ($request && $request.headers) || {};
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

function containsAscii(bytes, text) {
  if (!bytes || !text) return false;
  const needle = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) needle[i] = text.charCodeAt(i) & 0xff;

  outer:
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

const method = (($request && $request.method) || "").toUpperCase();
const url = ($request && $request.url) || "";
let bytes = toBytes($request && $request.body);
const rawLength = bytes ? bytes.length : 0;
const encoding = getHeader("content-encoding").toLowerCase();
let wasUngzipped = false;

if (bytes && encoding.indexOf("gzip") !== -1) {
  try {
    bytes = $utils.ungzip(bytes);
    wasUngzipped = true;
  } catch (e) {
    console.log("[TencentVideo-Test6] ungzip failed: " + e);
  }
}

const hit = TARGETS.find(t => containsAscii(bytes, t));

console.log(
  "[TencentVideo-Test6] " +
  "method=" + method +
  " raw=" + rawLength +
  " decoded=" + (bytes ? bytes.length : 0) +
  " gzip=" + (wasUngzipped ? "yes" : "no") +
  " hit=" + (hit || "none")
);

if (
  method === "POST" &&
  /^https:\/\/i\.video\.qq\.com\/?$/.test(url) &&
  hit
) {
  console.log("[TencentVideo-Test6] BLOCK " + hit);
  $done({
    response: {
      status: 204,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-TencentVideo-AdBlock": hit
      },
      body: ""
    }
  });
} else {
  $done({});
}
