/*
 * Tencent Video - known ad TRPC services blocker
 * Test 11
 *
 * Request-only, binary protobuf scan.
 * Blocks only known ad/promotion service identifiers.
 */

const TARGETS = [
  "trpc.reward_ad_ssp.",
  "com.tencent.qqlive.protocol.pb.adService",
  "trpc.business_feeds.video_ad_ssp_feeds.",
  "video_ad_ssp_feeds",
  "ServerAdFeedsVideo",
  "trpc.vip_ad_promotion.",
  "GetPersonalCenterAdData",
  "trpc.promotion.adapter.adapter/GetFloatActivity"
];

function toBytes(body) {
  if (!body) return null;
  if (typeof Uint8Array !== "undefined" && body instanceof Uint8Array) return body;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
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
const bytes = toBytes($request && $request.body);
const hit = TARGETS.find(t => containsAscii(bytes, t));

console.log(
  "[TencentVideo-Test11] method=" + method +
  " bytes=" + (bytes ? bytes.length : 0) +
  " hit=" + (hit || "none")
);

if (method === "POST" && /^https:\/\/i\.video\.qq\.com\/?$/.test(url) && hit) {
  console.log("[TencentVideo-Test11] BLOCK " + hit);
  $done({
    response: {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "X-TencentVideo-AdBlock": hit.slice(0, 80)
      },
      body: ""
    }
  });
} else {
  $done({});
}
