/*
 * Tencent Video - Personal Center banner ad blocker (Test 13)
 *
 * Exact target:
 *   trpc.multi_vector_layout.mvl_controller.MVLPageService
 *   + personal_center_banner_day
 *
 * Other i.video.qq.com requests are passed through unchanged.
 */

const TARGET_SERVICE = "trpc.multi_vector_layout.mvl_controller.MVLPageService";
const TARGET_SLOT = "personal_center_banner_day";

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

const hitService = containsAscii(bytes, TARGET_SERVICE);
const hitSlot = containsAscii(bytes, TARGET_SLOT);

console.log(
  "[TencentVideo-Test13] method=" + method +
  " bytes=" + (bytes ? bytes.length : 0) +
  " service=" + (hitService ? "yes" : "no") +
  " slot=" + (hitSlot ? "yes" : "no")
);

if (
  method === "POST" &&
  /^https:\/\/i\.video\.qq\.com\/?$/.test(url) &&
  hitService &&
  hitSlot
) {
  console.log("[TencentVideo-Test13] BLOCK personal_center_banner_day");

  $done({
    response: {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "X-TencentVideo-AdBlock": "personal_center_banner_day"
      },
      body: ""
    }
  });
} else {
  $done({});
}
