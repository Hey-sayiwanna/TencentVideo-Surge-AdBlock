/*
 * Tencent Video Test 18 - raw protobuf ad field scanner
 *
 * Read-only diagnostic. The i.video.qq.com response has a TRPC/envelope prefix,
 * so parsing from byte 0 as one protobuf message is unreliable. This scanner
 * instead locates confirmed ad markers first, then scans backwards for raw
 * length-delimited protobuf fields that enclose the same ad marker cluster.
 *
 * It NEVER changes the response body.
 */

const STRINGS = {
  feed: "com.tencent.qqlive.protocol.pb.AdFeedInfo",
  focus: "com.tencent.qqlive.protocol.pb.AdFocusPoster",
  block1: "ad_block_2",
  block2: "_ad_insert_mix_block",
  focusName: "ad_focus"
};

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

function anyInside(list, start, end) {
  for (const p of list) if (p >= start && p < end) return true;
  return false;
}

function dedupeCandidates(list) {
  const seen = new Set();
  const out = [];
  for (const c of list) {
    const k = c.start + ":" + c.end;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}

const status = ($response && $response.status) || 0;
const bytes = toBytes($response && $response.body);

if (!bytes || status !== 200) {
  console.log("[TencentVideo-Test18] PASS status=" + status + " bytes=" + (bytes ? bytes.length : 0));
  $done({});
} else {
  const pos = {};
  for (const [name, text] of Object.entries(STRINGS)) {
    pos[name] = findAll(bytes, asciiBytes(text));
  }

  console.log(
    "[TencentVideo-Test18] bytes=" + bytes.length +
    " feed=" + pos.feed.length +
    " focus=" + pos.focus.length +
    " block1=" + pos.block1.length +
    " block2=" + pos.block2.length +
    " adFocus=" + pos.focusName.length
  );

  for (const name of ["feed", "focus", "block1", "block2", "focusName"]) {
    if (pos[name].length) {
      console.log("[TencentVideo-Test18] POS " + name + "=" + pos[name].slice(0, 12).join(","));
    }
  }

  const candidates = [];
  const MAX_BACK = 65536;
  const MAX_FIELD = 65536;

  // Anchor on each AdFocusPoster occurrence. Look for a raw length-delimited
  // field whose payload contains this poster plus AdFeedInfo and an ad-block marker.
  for (const focusPos of pos.focus) {
    const scanStart = Math.max(0, focusPos - MAX_BACK);
    const focusEnd = focusPos + STRINGS.focus.length;

    for (let start = scanStart; start <= focusPos; start++) {
      const key = readVarint(bytes, start, bytes.length);
      if (!key.ok) continue;
      const wire = key.value & 7;
      const field = Math.floor(key.value / 8);
      if (wire !== 2 || field <= 0) continue;
      if (key.next - start > 5) continue;

      const len = readVarint(bytes, key.next, bytes.length);
      if (!len.ok) continue;
      if (len.next - key.next > 5) continue;
      if (len.value < 64 || len.value > MAX_FIELD) continue;

      const payloadStart = len.next;
      const payloadEnd = payloadStart + len.value;
      if (payloadEnd > bytes.length) continue;
      if (!(payloadStart <= focusPos && payloadEnd >= focusEnd)) continue;

      const hasFeed = anyInside(pos.feed, payloadStart, payloadEnd);
      const hasBlock = anyInside(pos.block1, payloadStart, payloadEnd) ||
                       anyInside(pos.block2, payloadStart, payloadEnd) ||
                       anyInside(pos.focusName, payloadStart, payloadEnd);
      if (!hasFeed || !hasBlock) continue;

      candidates.push({
        start,
        end: payloadEnd,
        payloadStart,
        payloadEnd,
        size: payloadEnd - start,
        payloadSize: len.value,
        field,
        keyLen: key.next - start,
        lenLen: len.next - key.next,
        focusPos
      });
    }
  }

  let uniq = dedupeCandidates(candidates);
  uniq.sort((a, b) => a.size - b.size || a.start - b.start);

  console.log("[TencentVideo-Test18] candidates=" + uniq.length);
  for (let i = 0; i < Math.min(uniq.length, 16); i++) {
    const c = uniq[i];
    console.log(
      "[TencentVideo-Test18] C" + (i + 1) +
      " field=" + c.field +
      " keyLen=" + c.keyLen +
      " lenLen=" + c.lenLen +
      " size=" + c.size +
      " payload=" + c.payloadSize +
      " range=" + c.start + "-" + c.end +
      " focus=" + c.focusPos
    );
  }

  $done({});
}
