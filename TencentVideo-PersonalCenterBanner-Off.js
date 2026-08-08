/*
 * Tencent Video - Personal Center banner request patch (Test 14)
 *
 * Exact target request:
 *   trpc.multi_vector_layout.mvl_controller.MVLPageService
 *   + personal_center_banner_day
 *
 * Instead of blocking the whole MVLPageService request, replace the slot name
 * with a same-length invalid slot name:
 *   personal_center_banner_day -> personal_center_banner_off
 *
 * Both strings are 26 bytes, so protobuf length fields stay unchanged.
 */

const TARGET_SERVICE = "trpc.multi_vector_layout.mvl_controller.MVLPageService";
const FROM_SLOT = "personal_center_banner_day";
const TO_SLOT   = "personal_center_banner_off";

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
    const out = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) {
      out[i] = body.charCodeAt(i) & 0xff;
    }
    return out;
  }

  return null;
}

function asciiBytes(text) {
  const out = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    out[i] = text.charCodeAt(i) & 0xff;
  }
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

function replaceAllSameLength(bytes, fromText, toText) {
  if (!bytes || fromText.length !== toText.length) return 0;

  const from = asciiBytes(fromText);
  const to = asciiBytes(toText);
  let count = 0;

  outer:
  for (let i = 0; i <= bytes.length - from.length; i++) {
    for (let j = 0; j < from.length; j++) {
      if (bytes[i + j] !== from[j]) continue outer;
    }

    for (let j = 0; j < to.length; j++) {
      bytes[i + j] = to[j];
    }

    count++;
    i += from.length - 1;
  }

  return count;
}

const method = (($request && $request.method) || "").toUpperCase();
const url = ($request && $request.url) || "";
const original = toBytes($request && $request.body);

const serviceHit = containsAscii(original, TARGET_SERVICE);
const slotHit = containsAscii(original, FROM_SLOT);

console.log(
  "[TencentVideo-Test14] method=" + method +
  " bytes=" + (original ? original.length : 0) +
  " service=" + (serviceHit ? "yes" : "no") +
  " slot=" + (slotHit ? "yes" : "no")
);

if (
  method === "POST" &&
  /^https:\/\/i\.video\.qq\.com\/?$/.test(url) &&
  original &&
  serviceHit &&
  slotHit
) {
  // Work on a copy so non-target requests are never altered accidentally.
  const patched = new Uint8Array(original.length);
  patched.set(original);

  const replaced = replaceAllSameLength(patched, FROM_SLOT, TO_SLOT);

  console.log(
    "[TencentVideo-Test14] PATCH " + FROM_SLOT +
    " -> " + TO_SLOT +
    " count=" + replaced
  );

  if (replaced > 0) {
    $done({ body: patched });
  } else {
    $done({});
  }
} else {
  $done({});
}
