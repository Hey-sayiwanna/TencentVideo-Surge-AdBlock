/*
 * Tencent Video V22 - in-place protobuf ad disable
 *
 * Test21 physically removed protobuf fields and shortened the body. Captures
 * showed a 7-byte private prefix (offset=7, framing=prefix), so changing the
 * total response size may invalidate an outer Tencent envelope even when the
 * inner protobuf is rebuilt correctly.
 *
 * V22 NEVER changes body length. It only replaces confirmed ad identifiers
 * with same-length unknown identifiers. Protobuf lengths, parent lengths and
 * the private prefix therefore stay byte-for-byte size compatible.
 *
 * Confirmed markers from live4iphoneRel captures:
 *   type.googleapis.com/com.tencent.qqlive.protocol.pb.AdFeedInfo
 *   type.googleapis.com/com.tencent.qqlive.protocol.pb.AdResponseInfo
 *   mod_adfeed
 *   ad_block_*
 *   _ad_insert_mix_block
 *   feeds_ad_style
 */

const TAG = "TencentVideo-V22";

function log(s) {
  console.log(`[${TAG}] ${s}`);
}

function toBytes(body) {
  if (body == null) return null;
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

function ascii(s) {
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i) & 0xff;
  return a;
}

function replaceAllSameLength(buf, fromStr, toStr) {
  if (fromStr.length !== toStr.length) {
    throw new Error(`replacement length mismatch: ${fromStr} -> ${toStr}`);
  }

  const from = ascii(fromStr);
  const to = ascii(toStr);
  let count = 0;

  outer:
  for (let i = 0; i <= buf.length - from.length; i++) {
    for (let j = 0; j < from.length; j++) {
      if (buf[i + j] !== from[j]) continue outer;
    }

    buf.set(to, i);
    count++;
    i += from.length - 1;
  }

  return count;
}

try {
  const status = ($response && ($response.status || $response.statusCode)) || 0;
  const input = toBytes($response && $response.body);

  if (!input || (status !== 200 && status !== 0)) {
    log(`PASS status=${status} bytes=${input ? input.length : 0}`);
    $done({});
  } else {
    const out = new Uint8Array(input.length);
    out.set(input);

    const patches = [
      [
        "type.googleapis.com/com.tencent.qqlive.protocol.pb.AdFeedInfo",
        "type.googleapis.com/com.tencent.qqlive.protocol.pb.XdFeedInfo"
      ],
      [
        "type.googleapis.com/com.tencent.qqlive.protocol.pb.AdResponseInfo",
        "type.googleapis.com/com.tencent.qqlive.protocol.pb.XdResponseInfo"
      ],
      [
        "type.googleapis.com/com.tencent.qqlive.protocol.pb.AdFocusPoster",
        "type.googleapis.com/com.tencent.qqlive.protocol.pb.XdFocusPoster"
      ],
      [
        "type.googleapis.com/com.tencent.qqlive.protocol.pb.AdFeedVideoPoster",
        "type.googleapis.com/com.tencent.qqlive.protocol.pb.XdFeedVideoPoster"
      ],
      ["_ad_insert_mix_block", "_xx_insert_mix_block"],
      ["ad_block_", "xx_block_"],
      ["mod_adfeed", "mod_xxfeed"],
      ["feeds_ad_style", "feeds_xx_style"]
    ];

    let total = 0;
    const hitParts = [];

    for (const pair of patches) {
      const n = replaceAllSameLength(out, pair[0], pair[1]);
      if (n > 0) {
        total += n;
        hitParts.push(`${pair[0]}=${n}`);
      }
    }

    if (total === 0) {
      log(`PASS bytes=${input.length} no-confirmed-ad-marker`);
      $done({});
    } else {
      log(`PATCH ${hitParts.join(" | ")}`);
      log(`SUMMARY bytes=${input.length} patches=${total} lengthChanged=0`);
      $done({ body: out });
    }
  }
} catch (e) {
  log(`ERROR ${e && e.stack ? e.stack : e}`);
  $done({});
}
