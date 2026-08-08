/*
 * Tencent Video Test 20 - neutralize non-focus native AdFeed cards.
 *
 * Why this differs from Test19:
 * - Test18 capture showed 5 AdFeedInfo occurrences but only 3 AdFocusPoster occurrences.
 * - Test19 required BOTH AdFeedInfo + AdFocusPoster, therefore it only touched the
 *   3 focus-poster ad cards and necessarily skipped the other 2 AdFeedInfo cards.
 * - The Personal Center native card is a strong candidate for one of those
 *   non-focus AdFeedInfo entries.
 *
 * Strategy:
 * - Anchor on EVERY AdFeedInfo occurrence.
 * - Find the smallest confirmed outer repeated field #1 (wire type LEN) whose
 *   payload starts shortly before AdFeedInfo and looks ad-specific.
 * - ONLY select cards that DO NOT contain AdFocusPoster.
 * - Change the one-byte outer key 0x0A (field #1/LEN) -> 0x7A (field #15/LEN).
 * - No length or payload bytes are changed.
 */

const FEED = "com.tencent.qqlive.protocol.pb.AdFeedInfo";
const FOCUS = "com.tencent.qqlive.protocol.pb.AdFocusPoster";
const AD_MARKERS = [
  "ad_nfb_",
  "ad_product_id",
  "ad_session_id",
  "ad_action_type",
  "ad_pr_id",
  "ad_duration",
  "gdt.qq.com",
  "gtimg.cn",
  "material_url",
  "ad_is_fail",
  "ad_empty_reason"
];

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
  if (!bytes || !needle || bytes.length < needle.length) return out;
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
  start = Math.max(0, start);
  end = Math.min(bytes.length, end);
  if (!needle || end - start < needle.length) return false;
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
  while (pos < end && shift <= 35) {
    const c = bytes[pos++];
    value += (c & 0x7f) * Math.pow(2, shift);
    if ((c & 0x80) === 0) return { ok: true, value, next: pos };
    shift += 7;
  }
  return { ok: false, next: pos };
}

const status = ($response && $response.status) || 0;
const bytes = toBytes($response && $response.body);

if (!bytes || status !== 200) {
  console.log("[TencentVideo-Test20] PASS status=" + status + " bytes=" + (bytes ? bytes.length : 0));
  $done({});
} else {
  const nFeed = asciiBytes(FEED);
  const nFocus = asciiBytes(FOCUS);
  const markerNeedles = AD_MARKERS.map(asciiBytes);
  const feedPos = findAll(bytes, nFeed);

  const rawCandidates = [];

  for (const fp of feedPos) {
    // Test18 confirmed the first three outer card wrappers start ~140 bytes
    // before AdFeedInfo. Use a wider 1 KB window for the remaining card types.
    const scanStart = Math.max(0, fp - 1024);

    for (let start = scanStart; start <= fp; start++) {
      // field #1, wire type 2
      if (bytes[start] !== 0x0a) continue;

      const len = readVarint(bytes, start + 1, bytes.length);
      if (!len.ok) continue;
      const lenLen = len.next - (start + 1);
      if (lenLen < 2 || lenLen > 4) continue;
      if (len.value < 8000 || len.value > 60000) continue;

      const payloadStart = len.next;
      const payloadEnd = payloadStart + len.value;
      if (payloadEnd > bytes.length) continue;
      if (!(fp >= payloadStart && fp < payloadEnd)) continue;

      // AdFeedInfo must be near the beginning of this card wrapper.
      if (fp - payloadStart > 4096) continue;

      // Personal/native target: explicitly exclude focus-poster cards handled by Test19.
      if (contains(bytes, payloadStart, payloadEnd, nFocus)) continue;

      // Require at least one additional ad-specific marker.
      let adMarkerCount = 0;
      for (const n of markerNeedles) {
        if (contains(bytes, payloadStart, payloadEnd, n)) adMarkerCount++;
      }
      if (adMarkerCount < 1) continue;

      rawCandidates.push({
        start,
        end: payloadEnd,
        payloadStart,
        payloadEnd,
        payload: len.value,
        feedPos: fp,
        adMarkerCount
      });
    }
  }

  // For each AdFeedInfo occurrence keep the SMALLEST matching field #1 wrapper.
  const bestByFeed = new Map();
  for (const c of rawCandidates) {
    const old = bestByFeed.get(c.feedPos);
    const size = c.end - c.start;
    if (!old || size < (old.end - old.start)) bestByFeed.set(c.feedPos, c);
  }

  // Deduplicate identical outer ranges.
  const seen = new Set();
  const targets = [];
  for (const c of bestByFeed.values()) {
    const k = c.start + ":" + c.end;
    if (seen.has(k)) continue;
    seen.add(k);
    targets.push(c);
  }
  targets.sort((a, b) => a.start - b.start);

  console.log(
    "[TencentVideo-Test20] bytes=" + bytes.length +
    " AdFeedInfo=" + feedPos.length +
    " nativeTargets=" + targets.length
  );
  console.log("[TencentVideo-Test20] FEEDPOS=" + feedPos.join(","));

  if (!targets.length) {
    console.log("[TencentVideo-Test20] NO NON-FOCUS ADFEED TARGET; pass through");
    $done({});
  } else {
    for (let i = 0; i < targets.length; i++) {
      const t = targets[i];
      console.log(
        "[TencentVideo-Test20] TARGET" + (i + 1) +
        " range=" + t.start + "-" + t.end +
        " payload=" + t.payload +
        " feed=" + t.feedPos +
        " markers=" + t.adMarkerCount
      );
      bytes[t.start] = 0x7a; // field #1/LEN -> field #15/LEN, same width
    }

    console.log("[TencentVideo-Test20] NEUTRALIZED nativeAdFeedCards=" + targets.length);
    $done({ body: bytes });
  }
}
