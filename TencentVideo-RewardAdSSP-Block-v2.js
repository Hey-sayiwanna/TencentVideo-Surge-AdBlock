/*
 * Tencent Video - exact reward_ad_ssp adService blocker v2
 *
 * Reads i.video.qq.com protobuf request body in binary mode and only blocks
 * requests containing the exact ASCII service name below.
 * All non-target requests are left untouched with $done({}).
 */

const TARGET = "trpc.reward_ad_ssp.reward_ad_ssp_service.adService";

function toBytes(body) {
  if (!body) return null;

  if (typeof Uint8Array !== "undefined" && body instanceof Uint8Array) {
    return body;
  }

  if (
    typeof ArrayBuffer !== "undefined" &&
    ArrayBuffer.isView &&
    ArrayBuffer.isView(body)
  ) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  if (typeof body === "string") {
    const bytes = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) {
      bytes[i] = body.charCodeAt(i) & 0xff;
    }
    return bytes;
  }

  return null;
}

function containsAscii(bytes, text) {
  if (!bytes || !text || bytes.length < text.length) return false;

  const needle = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    needle[i] = text.charCodeAt(i) & 0xff;
  }

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
const hit = containsAscii(bytes, TARGET);

console.log(
  "[TencentVideo-Test10] method=" + method +
  " bytes=" + (bytes ? bytes.length : 0) +
  " hit=" + (hit ? TARGET : "none")
);

if (
  method === "POST" &&
  /^https:\/\/i\.video\.qq\.com\/?$/.test(url) &&
  hit
) {
  console.log("[TencentVideo-Test10] BLOCK " + TARGET);

  $done({
    response: {
      status: 204,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-TencentVideo-AdBlock": "reward_ad_ssp.adService"
      },
      body: ""
    }
  });
} else {
  $done({});
}
