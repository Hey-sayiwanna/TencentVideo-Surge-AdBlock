/*
 * Tencent Video Test 19 - neutralize confirmed ad-card protobuf entries.
 *
 * Based on Test18 capture from Tencent Video iOS 8.12.00:
 * each rendered ad card is wrapped by a repeated length-delimited field #1.
 * The outer field begins only ~14-18 bytes before "_ad_insert_mix_block" and
 * contains AdFeedInfo + AdFocusPoster within the first few hundred bytes.
 *
 * Instead of deleting bytes (which would require rebuilding every ancestor
 * length prefix), this script changes ONLY the one-byte protobuf tag:
 *   field #1, wire type 2: 0x0A
 * to
 *   field #15, wire type 2: 0x7A
 *
 * Length and payload bytes remain untouched. A client schema that does not know
 * field #15 will keep it as an unknown field, so the normal field #1 card list
 * no longer receives that ad entry.
 *
 * Very strict matching is used to avoid touching ordinary cards.
 */

const BLOCK = "_ad_insert_mix_block";
const FEED = "com.tencent.qqlive.protocol.pb.AdFeedInfo";
const FOCUS = "com.tencent.qqlive.protocol.pb.AdFocusPoster";

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

function asciiBytes(s) {
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i) & 0xff;
  return b;
}

function findAll(bytes, needle) {
  const out = [];
  outer:
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    out.push(i);
  }
  return out;
}

function contains(bytes, start, end, needle) {
  if (start < 0) start = 0;
  if (end > bytes.length) end = bytes.length;
  if (end - start < needle.length) return false;
  outer:
  for (let i = start; i <= end - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function readVarint(bytes, pos, end) {
  let value = 0;
  let shift = 0;
  const start = pos;
  while (pos < end && shift <= 35) {
    const c = bytes[pos++];
    value += (c & 0x7f) * Math.pow(2, shift);
    if ((c & 0x80) === 0) return { ok: true, value, start, next: pos };
    shift += 7;
  }
  return { ok: false, start, next: pos };
}

const status = ($response && $response.status) || 0;
const bytes = toBytes($response && $response.body);

if (!bytes || status !== 200) {
  console.log("[TencentVideo-Test19] PASS status=" + status + " bytes=" + (bytes ? bytes.length : 0));
  $done({});
} else {
  const nBlock = asciiBytes(BLOCK);
  const nFeed = asciiBytes(FEED);
  const nFocus = asciiBytes(FOCUS);
  const blockPos = findAll(bytes, nBlock);

  const targets = [];
  const seen = new Set();

  // Test18 showed the exact card wrapper starts 14-18 bytes before BLOCK.
  // Scan a slightly wider window, but only accept field #1 / LEN with a
  // 20-40 KB payload and all three ad markers near the payload start.
  for (const bp of blockPos) {
    const scanStart = Math.max(0, bp - 96);
    for (let start = scanStart; start <= bp; start++) {
      // One-byte protobuf key for field #1, wire type LEN is exactly 0x0A.
      if (bytes[start] !== 0x0a) continue;

      const len = readVarint(bytes, start + 1, bytes.length);
      if (!len.ok) continue;
      const lenLen = len.next - (start + 1);
      if (lenLen !== 3) continue; // matches the confirmed captures
      if (len.value < 20000 || len.value > 40000) continue;

      const payloadStart = len.next;
      const payloadEnd = payloadStart + len.value;
      if (payloadEnd > bytes.length) continue;
      if (!(bp >= payloadStart && bp < payloadEnd)) continue;

      // Confirm this is the exact ad-card wrapper: BLOCK must be right at the
      // beginning, while AdFeedInfo and AdFocusPoster follow shortly after.
      const headEnd = Math.min(payloadEnd, payloadStart + 1024);
      if (!contains(bytes, payloadStart, headEnd, nBlock)) continue;
      if (!contains(bytes, payloadStart, headEnd, nFeed)) continue;
      if (!contains(bytes, payloadStart, headEnd, nFocus)) continue;

      const k = start + ":" + payloadEnd;
      if (seen.has(k)) continue;
      seen.add(k);
      targets.push({ start, end: payloadEnd, payload: len.value, blockPos: bp });
    }
  }

  targets.sort((a, b) => a.start - b.start);
  console.log("[TencentVideo-Test19] bytes=" + bytes.length + " blockMarkers=" + blockPos.length + " targets=" + targets.length);

  if (!targets.length) {
    console.log("[TencentVideo-Test19] NO STRICT AD CARD TARGET; pass through");
    $done({});
  } else {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      console.log("[TencentVideo-Test19] TARGET" + (i + 1) + " range=" + t.start + "-" + t.end + " payload=" + t.payload + " block=" + t.blockPos);
      // 0x0A = field 1 / LEN, 0x7A = field 15 / LEN. Same one-byte width.
      bytes[t.start] = 0x7a;
    }

    console.log("[TencentVideo-Test19] NEUTRALIZED adCards=" + targets.length + " field1->field15 bodyBytesUnchanged=" + bytes.length);
    $done({ body: bytes });
  }
}
