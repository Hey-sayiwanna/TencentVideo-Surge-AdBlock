/*
 * Tencent Video - i.video.qq.com request service tracer v2
 * Observation only: never blocks or rewrites traffic.
 *
 * Purpose:
 * - Read protobuf request body as Uint8Array.
 * - Extract TRPC / com.tencent service names.
 * - Print suspicious ad/layout/page-related ASCII strings.
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

function latin1(bytes) {
  if (!bytes) return "";
  let s = "";
  const CHUNK = 4096;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const end = Math.min(i + CHUNK, bytes.length);
    let part = "";
    for (let j = i; j < end; j++) part += String.fromCharCode(bytes[j]);
    s += part;
  }
  return s;
}

function uniq(arr) {
  return [...new Set(arr)];
}

const bytes = toBytes($request && $request.body);
const text = latin1(bytes);
const method = (($request && $request.method) || "").toUpperCase();

let services = [];
for (const re of [
  /trpc\.[A-Za-z0-9_\.\/-]{6,240}/g,
  /com\.tencent\.[A-Za-z0-9_\.\/-]{6,240}/g
]) {
  services.push(...(text.match(re) || []));
}
services = uniq(services).slice(0, 12);

const printable = text.match(/[\x20-\x7e]{5,220}/g) || [];
const interestingRe = /(\bad\b|advert|ssp|gdt|banner|material|card|feed|recommend|promotion|personal|center|layout|mvl|page|module|history|mine|resource|operation|marketing|commercial)/i;
let interesting = uniq(printable.filter(s => interestingRe.test(s))).slice(0, 20);

console.log(
  "[TencentVideo-Test12] method=" + method +
  " bytes=" + (bytes ? bytes.length : 0) +
  " services=" + services.length +
  " interesting=" + interesting.length
);

for (let i = 0; i < services.length; i++) {
  console.log("[TencentVideo-Test12] S" + (i + 1) + " " + services[i]);
}
for (let i = 0; i < interesting.length; i++) {
  let s = interesting[i];
  if (s.length > 180) s = s.slice(0, 180) + "...";
  console.log("[TencentVideo-Test12] K" + (i + 1) + " " + s);
}

$done({});
