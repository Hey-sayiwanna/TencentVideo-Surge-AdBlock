/*
 * TencentVideo-PersonalCenter-Ad.js
 * 腾讯视频个人中心广告定位测试
 *
 * 目标：仅当 i.video.qq.com 的 POST Body 中出现
 * GetPersonalCenterAdData 时直接返回 HTTP 204。
 * 其他请求全部原样放行。
 */

const TARGET = "GetPersonalCenterAdData";

function containsAscii(body, text) {
  if (!body || !text) return false;

  if (typeof body === "string") {
    return body.indexOf(text) !== -1;
  }

  let bytes = null;

  if (typeof Uint8Array !== "undefined" && body instanceof Uint8Array) {
    bytes = body;
  } else if (
    typeof ArrayBuffer !== "undefined" &&
    ArrayBuffer.isView &&
    ArrayBuffer.isView(body)
  ) {
    bytes = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
  }

  if (!bytes) return false;

  const needle = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) {
    needle[i] = text.charCodeAt(i) & 0xff;
  }

  outer:
  for (let i = 0; i <= bytes.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) {
      if (bytes[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return true;
  }

  return false;
}

const method = (($request && $request.method) || "").toUpperCase();
const url = ($request && $request.url) || "";
const body = $request && $request.body;

if (
  method === "POST" &&
  /^https:\/\/i\.video\.qq\.com\/?$/.test(url) &&
  containsAscii(body, TARGET)
) {
  console.log("[TencentVideo-Test5] BLOCK GetPersonalCenterAdData");

  $done({
    response: {
      status: 204,
      headers: {
        "Content-Type": "application/octet-stream",
        "Cache-Control": "no-store, no-cache, must-revalidate",
        "Pragma": "no-cache",
        "X-TencentVideo-AdBlock": "GetPersonalCenterAdData"
      },
      body: ""
    }
  });
} else {
  console.log("[TencentVideo-Test5] PASS normal request");
  $done({});
}
