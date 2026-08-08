/*
 * Tencent Video Test 21 - remove protobuf ad cards as complete fields.
 *
 * Confirmed in live4iphoneRel captures:
 * - _ad_insert_mix_block + AdFeedInfo + AdFocusPoster
 * - ad_block_* + AdFeedInfo
 * - mod_adfeed + AdFeedInfo + AdFeedVideoPoster
 *
 * Design borrowed from the Tencent Sports rule philosophy:
 * remove the ad object/container itself instead of blocking its image/video CDN.
 *
 * This script is schema-less. It walks protobuf wire fields, only descends into
 * length-delimited payloads that contain confirmed Tencent Video ad signatures,
 * and drops the smallest valid protobuf field whose payload contains both:
 *   1) an ad message type; and
 *   2) an ad-container/module marker.
 * Parent protobuf lengths are rebuilt automatically.
 */

const TAG = "TencentVideo-Test21";

function log(msg) {
  console.log(`[${TAG}] ${msg}`);
}

function toBytes(body) {
  if (!body) return null;
  if (typeof Uint8Array !== "undefined" && body instanceof Uint8Array) return body;
  if (typeof ArrayBuffer !== "undefined" && ArrayBuffer.isView && ArrayBuffer.isView(body)) {
    return new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }
  if (typeof ArrayBuffer !== "undefined" && body instanceof ArrayBuffer) {
    return new Uint8Array(body);
  }
  if (typeof body === "string") {
    const out = new Uint8Array(body.length);
    for (let i = 0; i < body.length; i++) out[i] = body.charCodeAt(i) & 0xff;
    return out;
  }
  return null;
}

function asciiBytes(str) {
  const out = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) out[i] = str.charCodeAt(i) & 0xff;
  return out;
}

const SIG = {
  insertMix: asciiBytes("_ad_insert_mix_block"),
  adBlock: asciiBytes("ad_block_"),
  modAdFeed: asciiBytes("mod_adfeed"),
  adFeedInfo: asciiBytes("com.tencent.qqlive.protocol.pb.AdFeedInfo"),
  adFocusPoster: asciiBytes("com.tencent.qqlive.protocol.pb.AdFocusPoster"),
  adFeedVideoPoster: asciiBytes("com.tencent.qqlive.protocol.pb.AdFeedVideoPoster"),
  businessAd: asciiBytes("business"),
  adRequestId: asciiBytes("ad_request_id"),
  adProductId: asciiBytes("ad_product_id"),
  adGroupId: asciiBytes("ad_group_id"),
  adDuration: asciiBytes("ad_duration"),
  gdt: asciiBytes("gdt.qq.com")
};

function indexOfBytes(buf, needle, from, to) {
  from = from == null ? 0 : from;
  to = to == null ? buf.length : to;
  if (!buf || !needle || needle.length === 0 || to - from < needle.length) return -1;
  const last = to - needle.length;
  outer: for (let i = from; i <= last; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (buf[i + j] !== needle[j]) continue outer;
    }
    return i;
  }
  return -1;
}

function has(buf, needle, from, to) {
  return indexOfBytes(buf, needle, from, to) !== -1;
}

function hasAdType(buf, from, to) {
  return (
    has(buf, SIG.adFeedInfo, from, to) ||
    has(buf, SIG.adFocusPoster, from, to) ||
    has(buf, SIG.adFeedVideoPoster, from, to)
  );
}

function hasContainerMarker(buf, from, to) {
  return (
    has(buf, SIG.insertMix, from, to) ||
    has(buf, SIG.adBlock, from, to) ||
    has(buf, SIG.modAdFeed, from, to)
  );
}

function adEvidenceScore(buf, from, to) {
  let score = 0;
  if (has(buf, SIG.adFeedInfo, from, to)) score += 4;
  if (has(buf, SIG.adFocusPoster, from, to)) score += 3;
  if (has(buf, SIG.adFeedVideoPoster, from, to)) score += 3;
  if (has(buf, SIG.insertMix, from, to)) score += 4;
  if (has(buf, SIG.adBlock, from, to)) score += 4;
  if (has(buf, SIG.modAdFeed, from, to)) score += 4;
  if (has(buf, SIG.adRequestId, from, to)) score += 1;
  if (has(buf, SIG.adProductId, from, to)) score += 1;
  if (has(buf, SIG.adGroupId, from, to)) score += 1;
  if (has(buf, SIG.adDuration, from, to)) score += 1;
  if (has(buf, SIG.gdt, from, to)) score += 1;
  return score;
}

function hasPotentialAd(buf, from, to) {
  return hasAdType(buf, from, to) || hasContainerMarker(buf, from, to);
}

function isStrongAdMessage(buf, from, to) {
  return hasAdType(buf, from, to) && hasContainerMarker(buf, from, to) && adEvidenceScore(buf, from, to) >= 8;
}

function readVarint(buf, pos, end) {
  let value = 0;
  let factor = 1;
  let p = pos;

  for (let i = 0; i < 10 && p < end; i++, p++) {
    const b = buf[p];
    value += (b & 0x7f) * factor;
    if ((b & 0x80) === 0) {
      return { ok: Number.isSafeInteger(value), value, next: p + 1 };
    }
    factor *= 128;
    if (!Number.isSafeInteger(value) || !Number.isSafeInteger(factor)) break;
  }

  return { ok: false, value: 0, next: pos };
}

function encodeVarint(value) {
  const arr = [];
  let n = value;
  while (n >= 128) {
    arr.push((n % 128) | 0x80);
    n = Math.floor(n / 128);
  }
  arr.push(n);
  return Uint8Array.from(arr);
}

function concatChunks(chunks, total) {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

const LIMITS = {
  maxDepth: 28,
  maxVisits: 100000
};

let globalVisits = 0;
let removedRanges = [];

function sanitizeMessage(buf, start, end, depth) {
  if (depth > LIMITS.maxDepth) return { valid: false };
  if (start >= end) return { valid: true, bytes: new Uint8Array(0), removedBlocks: 0 };

  const chunks = [];
  let total = 0;
  let removedBlocks = 0;
  let pos = start;

  while (pos < end) {
    globalVisits++;
    if (globalVisits > LIMITS.maxVisits) return { valid: false };

    const fieldStart = pos;
    const tag = readVarint(buf, pos, end);
    if (!tag.ok || tag.value === 0) return { valid: false };

    const fieldNo = Math.floor(tag.value / 8);
    const wireType = tag.value & 7;
    if (fieldNo <= 0 || fieldNo > 536870911) return { valid: false };
    pos = tag.next;

    if (wireType === 0) {
      const v = readVarint(buf, pos, end);
      if (!v.ok) return { valid: false };
      pos = v.next;
      const raw = buf.subarray(fieldStart, pos);
      chunks.push(raw);
      total += raw.length;
      continue;
    }

    if (wireType === 1) {
      if (pos + 8 > end) return { valid: false };
      pos += 8;
      const raw = buf.subarray(fieldStart, pos);
      chunks.push(raw);
      total += raw.length;
      continue;
    }

    if (wireType === 5) {
      if (pos + 4 > end) return { valid: false };
      pos += 4;
      const raw = buf.subarray(fieldStart, pos);
      chunks.push(raw);
      total += raw.length;
      continue;
    }

    if (wireType === 3 || wireType === 4) return { valid: false };
    if (wireType !== 2) return { valid: false };

    const keyEnd = pos;
    const lenInfo = readVarint(buf, pos, end);
    if (!lenInfo.ok) return { valid: false };

    const len = lenInfo.value;
    const payloadStart = lenInfo.next;
    const payloadEnd = payloadStart + len;
    if (len < 0 || payloadEnd > end) return { valid: false };
    pos = payloadEnd;

    if (len < 4 || !hasPotentialAd(buf, payloadStart, payloadEnd)) {
      const raw = buf.subarray(fieldStart, pos);
      chunks.push(raw);
      total += raw.length;
      continue;
    }

    // First try to remove a deeper/smaller valid protobuf ad field.
    const child = sanitizeMessage(buf, payloadStart, payloadEnd, depth + 1);

    if (child.valid && child.removedBlocks > 0) {
      const keyBytes = buf.subarray(fieldStart, keyEnd);
      const newLen = encodeVarint(child.bytes.length);
      chunks.push(keyBytes, newLen, child.bytes);
      total += keyBytes.length + newLen.length + child.bytes.length;
      removedBlocks += child.removedBlocks;
      continue;
    }

    // If no deeper field was removable, remove this field only when it is a
    // strongly identified ad container. This is what removes the whole card.
    if (isStrongAdMessage(buf, payloadStart, payloadEnd)) {
      const evidence = adEvidenceScore(buf, payloadStart, payloadEnd);
      removedBlocks += 1;
      removedRanges.push({ depth, fieldNo, start: fieldStart, end: pos, evidence });
      log(`REMOVE depth=${depth} field=${fieldNo} bytes=${pos - fieldStart} evidence=${evidence}`);
      continue;
    }

    const raw = buf.subarray(fieldStart, pos);
    chunks.push(raw);
    total += raw.length;
  }

  if (pos !== end) return { valid: false };
  return { valid: true, bytes: concatChunks(chunks, total), removedBlocks };
}

function be32(buf, off) {
  return (
    ((buf[off] * 0x1000000) >>> 0) +
    (buf[off + 1] << 16) +
    (buf[off + 2] << 8) +
    buf[off + 3]
  ) >>> 0;
}

function le32(buf, off) {
  return (
    buf[off] +
    (buf[off + 1] << 8) +
    (buf[off + 2] << 16) +
    ((buf[off + 3] * 0x1000000) >>> 0)
  ) >>> 0;
}

function u32be(value) {
  return Uint8Array.from([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff
  ]);
}

function u32le(value) {
  return Uint8Array.from([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff
  ]);
}

function rewriteAtOffset(buf, offset, framing) {
  globalVisits = 0;
  removedRanges = [];

  const result = sanitizeMessage(buf, offset, buf.length, 0);
  if (!result.valid || result.removedBlocks <= 0) return null;

  let out;
  if (framing === "grpc5") {
    const head = new Uint8Array(5);
    head[0] = buf[0];
    head.set(u32be(result.bytes.length), 1);
    out = concatChunks([head, result.bytes], 5 + result.bytes.length);
  } else if (framing === "be4") {
    const head = u32be(result.bytes.length);
    out = concatChunks([head, result.bytes], 4 + result.bytes.length);
  } else if (framing === "le4") {
    const head = u32le(result.bytes.length);
    out = concatChunks([head, result.bytes], 4 + result.bytes.length);
  } else {
    const prefix = buf.subarray(0, offset);
    out = concatChunks([prefix, result.bytes], prefix.length + result.bytes.length);
  }

  return {
    out,
    removedBlocks: result.removedBlocks,
    visits: globalVisits,
    offset,
    framing,
    ranges: removedRanges.slice()
  };
}

function sanitizeBody(buf) {
  if (buf.length >= 5 && (buf[0] === 0 || buf[0] === 1) && be32(buf, 1) === buf.length - 5) {
    const r = rewriteAtOffset(buf, 5, "grpc5");
    if (r) return r;
  }

  if (buf.length >= 4 && be32(buf, 0) === buf.length - 4) {
    const r = rewriteAtOffset(buf, 4, "be4");
    if (r) return r;
  }

  if (buf.length >= 4 && le32(buf, 0) === buf.length - 4) {
    const r = rewriteAtOffset(buf, 4, "le4");
    if (r) return r;
  }

  let r = rewriteAtOffset(buf, 0, "plain");
  if (r) return r;

  // Tencent Video responses may carry a short non-protobuf prefix.
  const maxOffset = Math.min(64, buf.length - 1);
  for (let offset = 1; offset <= maxOffset; offset++) {
    r = rewriteAtOffset(buf, offset, "prefix");
    if (r) return r;
  }

  return null;
}

try {
  const status = ($response && ($response.status || $response.statusCode)) || 0;
  const input = toBytes($response && $response.body);

  if (!input || (status !== 200 && status !== 0)) {
    log(`PASS status=${status} bytes=${input ? input.length : 0}`);
    $done({});
  } else if (!hasPotentialAd(input, 0, input.length)) {
    log(`PASS bytes=${input.length} no-ad-signature`);
    $done({});
  } else {
    const result = sanitizeBody(input);

    if (!result) {
      log(`NOCHANGE bytes=${input.length} signatures=yes parser=no-match`);
      $done({});
    } else {
      log(
        `SUMMARY before=${input.length} after=${result.out.length} ` +
        `removedBlocks=${result.removedBlocks} removedBytes=${input.length - result.out.length} ` +
        `parseVisits=${result.visits} offset=${result.offset} framing=${result.framing}`
      );
      $done({ body: result.out });
    }
  }
} catch (e) {
  log(`ERROR ${e && e.stack ? e.stack : e}`);
  $done({});
}
