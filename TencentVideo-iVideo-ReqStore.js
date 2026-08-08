/*
 * Tencent Video i.video.qq.com request service correlator
 * Test 8: observation only, never blocks/modifies traffic.
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

function bytesToLatin1(bytes) {
  if (!bytes) return "";
  let out = "";
  const CHUNK = 4096;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    const sub = bytes.subarray(i, Math.min(i + CHUNK, bytes.length));
    let s = "";
    for (let j = 0; j < sub.length; j++) s += String.fromCharCode(sub[j]);
    out += s;
  }
  return out;
}

const id = ($request && $request.id) || "unknown";
const body = toBytes($request && $request.body);
const text = bytesToLatin1(body);

let services = [];
const regexes = [
  /trpc\.[A-Za-z0-9_\.\/-]{6,220}/g,
  /com\.tencent\.[A-Za-z0-9_\.\/-]{6,220}/g
];

for (const re of regexes) {
  const found = text.match(re) || [];
  services.push(...found);
}

services = [...new Set(services)].slice(0, 6);
const service = services.length ? services.join(" | ") : "none";

$persistentStore.write(service, "tvid_req_" + id);
console.log("[TencentVideo-Test8][REQ] id=" + id + " service=" + service + " body=" + (body ? body.length : 0));
$done({});
