/*
 * Tencent Video Test 17 - remove the enclosing protobuf ad block field.
 *
 * Strategy:
 * - Only touches i.video.qq.com responses that contain the confirmed ad markers.
 * - Parse protobuf wire-format generically (no .proto schema required).
 * - Find the smallest length-delimited field that contains BOTH AdFeedInfo and
 *   AdFocusPoster plus an ad-block marker, then remove that entire field.
 * - Rebuild ancestor length prefixes so the protobuf remains structurally valid.
 *
 * If no safe candidate is found, the response is passed through unchanged.
 */

const M1 = "com.tencent.qqlive.protocol.pb.AdFeedInfo";
const M2 = "com.tencent.qqlive.protocol.pb.AdFocusPoster";
const EXTRA = [
  "_ad_insert_mix_block",
  "ad_block_2",
  "ad_focus",
  "ad_scene=1&channelId=100101&ad_pos=1"
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

const needles = [M1, M2, ...EXTRA].map(asciiBytes);

function contains(bytes, start, end, needle) {
  if (!bytes || !needle || end - start < needle.length) return false;
  outer:
  for (let i = start; i <= end - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) continue outer;
    }
    return true;
  }
  return false;
}

function hasAnyMarker(bytes, start, end) {
  for (const n of needles) if (contains(bytes, start, end, n)) return true;
  return false;
}

function hasPrimaryPair(bytes, start, end) {
  return contains(bytes, start, end, needles[0]) && contains(bytes, start, end, needles[1]);
}

function hasExtra(bytes, start, end) {
  for (let i = 2; i < needles.length; i++) if (contains(bytes, start, end, needles[i])) return true;
  return false;
}

function readVarint(bytes, pos, end) {
  let value = 0;
  let shift = 0;
  const start = pos;
  while (pos < end && shift <= 35) {
    const c = bytes[pos++];
    value += (c & 0x7f) * Math.pow(2, shift);
    if ((c & 0x80) === 0) return { value, next: pos, start, ok: true };
    shift += 7;
  }
  return { ok: false, next: pos, start };
}

function encodeVarint(value) {
  const out = [];
  let v = value;
  while (v >= 0x80) {
    out.push((v % 128) | 0x80);
    v = Math.floor(v / 128);
  }
  out.push(v);
  return new Uint8Array(out);
}

function concat(parts) {
  let len = 0;
  for (const p of parts) len += p.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

function parseFields(bytes, start, end) {
  const fields = [];
  let pos = start;
  while (pos < end) {
    const fieldStart = pos;
    const key = readVarint(bytes, pos, end);
    if (!key.ok || key.value === 0) return { ok: false, fields, stopped: pos };
    pos = key.next;
    const wire = key.value & 7;
    const number = Math.floor(key.value / 8);
    if (number <= 0) return { ok: false, fields, stopped: pos };

    let payloadStart = pos;
    let payloadEnd = pos;
    let lenStart = -1;
    let lenEnd = -1;

    if (wire === 0) {
      const v = readVarint(bytes, pos, end);
      if (!v.ok) return { ok: false, fields, stopped: pos };
      pos = v.next;
      payloadEnd = pos;
    } else if (wire === 1) {
      if (pos + 8 > end) return { ok: false, fields, stopped: pos };
      pos += 8;
      payloadEnd = pos;
    } else if (wire === 2) {
      lenStart = pos;
      const l = readVarint(bytes, pos, end);
      if (!l.ok) return { ok: false, fields, stopped: pos };
      lenEnd = l.next;
      pos = l.next;
      payloadStart = pos;
      payloadEnd = pos + l.value;
      if (payloadEnd > end) return { ok: false, fields, stopped: pos };
      pos = payloadEnd;
    } else if (wire === 5) {
      if (pos + 4 > end) return { ok: false, fields, stopped: pos };
      pos += 4;
      payloadEnd = pos;
    } else {
      return { ok: false, fields, stopped: pos };
    }

    fields.push({
      number, wire, fieldStart, fieldEnd: pos,
      keyStart: fieldStart, keyEnd: key.next,
      lenStart, lenEnd, payloadStart, payloadEnd
    });
  }
  return { ok: pos === end, fields, stopped: pos };
}

function collectCandidates(bytes, start, end, depth, out) {
  if (depth > 12) return;
  const parsed = parseFields(bytes, start, end);
  if (!parsed.ok) return;

  for (const f of parsed.fields) {
    if (f.wire !== 2) continue;
    if (!hasAnyMarker(bytes, f.payloadStart, f.payloadEnd)) continue;

    if (hasPrimaryPair(bytes, f.payloadStart, f.payloadEnd) && hasExtra(bytes, f.payloadStart, f.payloadEnd)) {
      out.push({ ...f, depth, size: f.fieldEnd - f.fieldStart });
    }

    collectCandidates(bytes, f.payloadStart, f.payloadEnd, depth + 1, out);
  }
}

function rewriteMessage(bytes, start, end, target) {
  const parsed = parseFields(bytes, start, end);
  if (!parsed.ok) return null;
  const parts = [];

  for (const f of parsed.fields) {
    if (f.fieldStart === target.fieldStart && f.fieldEnd === target.fieldEnd) {
      continue; // remove the whole ad field
    }

    // If target is not inside this field, copy raw bytes untouched.
    if (!(f.wire === 2 && target.fieldStart >= f.payloadStart && target.fieldEnd <= f.payloadEnd)) {
      parts.push(bytes.slice(f.fieldStart, f.fieldEnd));
      continue;
    }

    // Rebuild only the ancestor path to the removed field.
    const newPayload = rewriteMessage(bytes, f.payloadStart, f.payloadEnd, target);
    if (!newPayload) return null;
    const keyBytes = bytes.slice(f.keyStart, f.keyEnd);
    const lenBytes = encodeVarint(newPayload.length);
    parts.push(keyBytes, lenBytes, newPayload);
  }

  return concat(parts);
}

let bytes = toBytes($response && $response.body);
const status = ($response && $response.status) || 0;

if (!bytes || status !== 200 || !hasPrimaryPair(bytes, 0, bytes.length)) {
  console.log("[TencentVideo-Test17] PASS status=" + status + " bytes=" + (bytes ? bytes.length : 0));
  $done({});
} else {
  const candidates = [];
  collectCandidates(bytes, 0, bytes.length, 0, candidates);
  candidates.sort((a, b) => a.size - b.size || b.depth - a.depth);

  // Avoid deleting the whole response / a huge container. We want a card/block-sized field.
  const target = candidates.find(c => c.size >= 128 && c.size <= 65536);

  if (!target) {
    console.log("[TencentVideo-Test17] NO SAFE CANDIDATE bytes=" + bytes.length + " candidates=" + candidates.length);
    for (let i = 0; i < Math.min(candidates.length, 6); i++) {
      const c = candidates[i];
      console.log("[TencentVideo-Test17] C" + (i + 1) + " field=" + c.number + " depth=" + c.depth + " size=" + c.size + " range=" + c.fieldStart + "-" + c.fieldEnd);
    }
    $done({});
  } else {
    console.log("[TencentVideo-Test17] TARGET field=" + target.number + " depth=" + target.depth + " size=" + target.size + " range=" + target.fieldStart + "-" + target.fieldEnd + " candidates=" + candidates.length);
    const rewritten = rewriteMessage(bytes, 0, bytes.length, target);

    if (!rewritten || rewritten.length >= bytes.length) {
      console.log("[TencentVideo-Test17] REWRITE FAILED; pass through");
      $done({});
    } else {
      console.log("[TencentVideo-Test17] REMOVED AD BLOCK old=" + bytes.length + " new=" + rewritten.length + " removed=" + (bytes.length - rewritten.length));
      $done({ body: rewritten });
    }
  }
}
