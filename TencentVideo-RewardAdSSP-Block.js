/*
 * Tencent Video - exact reward_ad_ssp adService blocker
 * Test 9
 *
 * Only blocks i.video.qq.com requests whose decoded request body contains:
 * trpc.reward_ad_ssp.reward_ad_ssp_service.adService
 *
 * No response script is used.
 */

const TARGET = "trpc.reward_ad_ssp.reward_ad_ssp_service.adService";
const body = ($request && typeof $request.body === "string") ? $request.body : "";
const method = (($request && $request.method) || "").toUpperCase();
const url = ($request && $request.url) || "";
const hit = body.indexOf(TARGET) !== -1;

console.log(
  "[TencentVideo-Test9] method=" + method +
  " body=" + body.length +
  " hit=" + (hit ? TARGET : "none")
);

if (method === "POST" && /^https:\/\/i\.video\.qq\.com\/?$/.test(url) && hit) {
  console.log("[TencentVideo-Test9] BLOCK " + TARGET);
  $done({
    response: {
      status: 204,
      headers: {
        "Cache-Control": "no-store",
        "X-TencentVideo-AdBlock": "reward_ad_ssp.adService"
      },
      body: ""
    }
  });
} else {
  $done({});
}
