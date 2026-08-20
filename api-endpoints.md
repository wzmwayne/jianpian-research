# 荐片 API 接口清单（148 个）

> 来源：逆向 `index-legacy-DspsKBZi.js` 主包提取的全部相对路径。
> baseURL = `https://h5.jianpianips1.com/api`，即完整请求 = `baseURL + 路径`。
> 含 v1（根路径）与 v2（`/v2/`）两套接口。

## 一、用户相关 `/nUser/`
| 接口路径 | 功能 |
|---|---|
| `/login` | 登录 |
| `/register` | 注册 |
| `/nUser/accountLogin` | 账号登录 |
| `/nUser/phoneLogin` | 手机号登录 |
| `/nUser/mailLogin` | 邮箱登录 |
| `/nUser/sendMsg` | 发送短信验证码 |
| `/nUser/mailSendMsg` | 发送邮件验证码 |
| `/nUser/bind` | 绑定 |
| `/nUser/changePassword` | 修改密码 |
| `/nUser/changePWD` | 修改密码（旧） |
| `/nUser/mailChangePassword` | 邮箱修改密码 |
| `/nUser/checkPWD` | 校验密码 |
| `/nUser/logout` | 退出登录 |
| `/nUser/updateUserInfo` | 更新用户信息 |
| `/nUser/updateVip` | 更新 VIP |
| `/nUser/todayData` | 今日数据 |
| `/nUser/shareVideo` | 分享视频 |
| `/nUser/downloadVideo` | 下载视频 |
| `/nUser/deleteDownload` | 删除下载 |
| `/nUser/getCollect` | 获取收藏 |
| `/nUser/getSpecial` | 获取专题 |
| `/nUser/getInviteRecord` | 邀请记录 |
| `/nUser/collectVideo` | 收藏视频 |
| `/nUser/cancelVideoCollect` | 取消收藏视频 |
| `/nUser/cancelCollectVideoBatch` | 批量取消收藏 |
| `/nUser/collectSpecial` | 收藏专题 |
| `/nUser/cancelSpecialCollect` | 取消收藏专题 |
| `/nUser/checkCollectSpecial` | 检查收藏专题 |

## 二、V2 用户 `/v2/nUser/`
| 接口路径 | 功能 |
|---|---|
| `/v2/nUser/guestRegister` | 游客注册 |
| `/v2/nUser/accountRegister` | 账号注册 |
| `/v2/nUser/phoneRegister` | 手机注册 |
| `/v2/nUser/mailRegister` | 邮箱注册 |
| `/v2/nUser/bindPhone` | 绑定手机 |
| `/v2/nUser/bindMail` | 绑定邮箱 |
| `/v2/nUser/getUserInfo` | 获取用户信息 |
| `/v2/nUser/getCollectSingle` | 获取单个收藏 |
| `/v2/nUser/nickname` | 昵称 |
| `/v2/nUser/nickname/fake` | 假昵称 |

## 三、视频/内容
| 接口路径 | 功能 |
|---|---|
| `/video/detailv2` | 视频详情 v2（**核心**：线路/选集/ftp） |
| `/videos/category` | 视频分类 |
| `/videos/recommend` | 视频推荐 |
| `/videos/room` | 视频房间 |
| `/crumb/list` | crumb 列表（导航/分类） |
| `/crumb/shortList` | 短 crumb 列表 |
| `/crumb/filterOptions` | 筛选选项 |
| `/search` | 搜索 |
| `/search/recommend` | 搜索推荐 |
| `/special/list` | 专题列表 |
| `/special/detail` | 专题详情 |
| `/series/list` | 系列列表 |
| `/series/details` | 系列详情 |
| `/discover/list` | 发现列表 |
| `/discover/detail` | 发现详情 |
| `/discover/before` | 发现前置 |

## 四、V2 搜索
| 接口路径 | 功能 |
|---|---|
| `/v2/search/videoV2` | **v2 视频搜索（核心，参数 `key`）** |

## 五、评论 `/comment/`、`/v2/comment/`
| 接口路径 | 功能 |
|---|---|
| `/comment/list` | 评论列表 |
| `/comment/add` | 添加评论 |
| `/comment/delete` | 删除评论 |
| `/comment/myCommentList` | 我的评论 |
| `/comment/myReplyCommentList` | 我的回复 |
| `/comment/myVideoList` | 我的视频评论 |
| `/comment/thumb` | 评论点赞 |
| `/comment/report` | 评论举报 |
| `/comment/reportOptions` | 举报选项 |
| `/v2/comment/list` | v2 评论列表 |
| `/v2/comment/add` | v2 添加评论 |
| `/v2/comment/favor` | v2 评论收藏/点赞 |

## 六、观看/追剧 `/watch/`、`/v2/watch/`
| 接口路径 | 功能 |
|---|---|
| `/watch/getList` | 追剧列表 |
| `/watch/getWatch` | 单个追剧 |
| `/watch/getDetail` | 追剧详情 |
| `/watch/getWatchList` | 追剧列表 |
| `/watch/getWatchCollectList` | 追剧收藏列表 |
| `/watch/addDetail` | 添加追剧详情 |
| `/watch/addMovieLog` | 添加观影记录 |
| `/watch/cancelWatchCollect` | 取消追剧收藏 |
| `/watch/cancelWatchCollectBatch` | 批量取消追剧收藏 |
| `/watch/checkWatchCollect` | 检查追剧收藏 |
| `/watch/deleteWatch` | 删除追剧 |
| `/watch/getMovieLog` | 观影记录 |
| `/watch/setWatchCollect` | 设置追剧收藏 |
| `/watch/upload` | 上传 |
| `/watch/tags` | 标签 |
| `/v2/watch/create` | v2 创建追剧 |
| `/v2/watch/editWatch` | v2 编辑追剧 |

## 七、观看历史 `/usersV2/`、`/v2/view/`
| 接口路径 | 功能 |
|---|---|
| `/usersV2/getView` | 获取观看历史 |
| `/usersV2/viewVideo` | 记录观看视频 |
| `/usersV2/deleteView` | 删除观看记录 |
| `/usersV2/deleteViewCollection` | 删除观看记录合集 |
| `/v2/view/list` | v2 观看列表 |

## 八、广告
| 接口路径 | 功能 |
|---|---|
| `/advertise_model/getSetting` | 获取广告设置 |
| `/advertise_model/editSetting` | 编辑广告设置 |
| `/v2/advertise/recordShow` | 广告展示记录 |
| `/v2/advertise/recordClick` | 广告点击记录 |
| `/v2/advertise/list` | 广告列表 |

## 九、设置/配置 `/v2/settings/`
| 接口路径 | 功能 |
|---|---|
| `/v2/settings/homeCategory` | 首页分类 |
| `/v2/settings/topCategory` | 顶部分类 |
| `/v2/settings/tabbarList` | 底部导航 |
| `/v2/settings/slideList` | 轮播图 |
| `/v2/settings/feedback` | 反馈配置 |
| `/v2/settings/appAuthConfig` | 应用授权配置 |
| `/v2/settings/resourceDomainConfig` | 资源域名配置（图片 CDN 轮询） |
| `/v2/settings/advertiseDomainConfig` | 广告域名配置 |
| `/v2/settings/updateAd` | 更新广告 |

## 十、系统 `/v2/sys/`
| 接口路径 | 功能 |
|---|---|
| `/v2/sys/init` | **系统初始化（核心：返回 secret / official_domain）** |

## 十一、支付/VIP/兑换
| 接口路径 | 功能 |
|---|---|
| `/v2/pay/packages` | 支付套餐 |
| `/v2/pay/createVipOrder` | 创建 VIP 订单 |
| `/v2/pay/switch` | 支付切换 |
| `/v2/pay/vipModelSwitch` | VIP 模式切换 |
| `/v2/vip/change` | VIP 变更 |
| `/order` | 订单 |
| `/redeem/config/detail` | 兑换配置详情 |
| `/redeem/config/list` | 兑换配置列表 |
| `/redeem/gift` | 兑换礼物 |
| `/redeem/giftlist` | 兑换礼物列表 |
| `/redemption` | 兑换 |

## 十二、其他
| 接口路径 | 功能 |
|---|---|
| `/api` | 通用 API 入口 |
| `/deal/getStr` | 获取签名 content |
| `/address` + `/address/add|edit|del|list|default` | 地址管理 |
| `/bindemail` / `/bindphone` | 绑定邮箱/手机 |
| `/ask/list` / `/ask/thumb` / `/ask/user_apply` / `/ask/user_daily_check` | 提问 |
| `/customerService` | 客服 |
| `/customTags/list` | 自定义标签 |
| `/dyTag/hand_data` / `/dyTag/list` / `/dyTag/tpl` | 抖音标签 |
| `/feedback` | 反馈 |
| `/invite` | 邀请 |
| `/onair/list` | 直播列表 |
| `/protocol` | 协议 |
| `/report` | 举报 |
| `/share/friend|movie|movieWatch|special` | 分享 |
| `/sign/check` / `/sign/do` | 签到 |
| `/sms/mobileAreaCode` | 手机区号 |
| `/splash` | 开屏广告 |
| `/term/fenlei` | 分类 |
| `/weekRank/list` / `/weekRank/options` | 周榜 |