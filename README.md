# TencentVideo Surge AdBlock

腾讯视频 iOS Surge 去广告测试项目。

当前目标不是大范围屏蔽腾讯域名，而是通过抓包逐个识别真正的广告接口，在尽量不影响正常功能的前提下删除广告。

## 当前测试

### Test 5 - 个人中心广告

目标接口：

- `i.video.qq.com`
- POST Body 中包含 `GetPersonalCenterAdData`

脚本只会在检测到该服务名时返回 HTTP 204。

其他 `i.video.qq.com` 请求全部原样放行。

### Surge 模块

直接导入：

`https://raw.githubusercontent.com/Hey-sayiwanna/TencentVideo-Surge-AdBlock/main/TencentVideo-Test5-PersonalCenter.sgmodule`

## 当前待处理广告

1. 个人中心观看历史下方广告
2. 视频详情页推荐视频流广告
3. 视频详情页其他广告卡
4. 首页顶部焦点广告

后续根据 Surge 抓包逐个定位。

## 原则

不使用大范围：

- `DOMAIN-SUFFIX,video.qq.com,REJECT`
- `DOMAIN-SUFFIX,tc.qq.com,REJECT`
- 图片 CDN 整域名屏蔽
- 所有 MP4 屏蔽

优先使用：

- 精确 API
- 精确 TRPC 服务名
- 精确 response/request 脚本

避免影响：

- 观看历史
- 视频缩略图
- 首页封面
- 正片播放
- 拖动进度
- 清晰度切换
