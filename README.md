# 借一下 · Borrow Lab

蒲嘉洋独立负责、使用AI工具协作实现的高校实验实训与校园创作共享设备智能预约平台。候选分支：feat/glass-review-workspace。
本地新版：http://localhost:3004/ 。本轮未部署、未合main。

## 课程交付

Day1正式6/6并冻结；Day2～Day6已被老师系统识别为提前完成（本人2026-10-08反馈）。
[十天最终审计](docs/十天交付最终审计.md) · [十天总控台](docs/十天交付总控台.md) · [个人质量验收](docs/个人质量验收.md)。

Day10报告[IKK8N3](https://gitee.com/pujiayang-vibe/vibe-pujiayang/issues/IKK8N3)已真实发布，十章Issue齐全；正式当天动作见最终审计。

day1～day6归档tag不移动。day7～day10为2026-10-08实际提前准备，不假装未来课堂已发生。本人独立完成，使用个人黑盒验收、自动化测试、AI代码审计、CI和Git恢复演练作为质量验证。

## 当前产品与工程

- 28件/10类设备、原创品牌/Hero与线性场景图、搜索与详情。
- 场景组合、可独立保存的创作方案、真实空闲核对、规则替换；单件与最多8件整套原子事务预约。
- 冲突拒绝、取消后重约、SQLite本机持久化；个人账号/头像/偏好/收藏与历史。
- Yos Hub/deepseek-v4-flash查询、创作推荐与六部分周报。Key只在后端环境变量/本机.env，mock测试不烧余额。
- 10-09预约双专题Edge真实点击10组通过，四桌面尺寸通过；新CI174/174与[证据](docs/验收证据/预约双专题-20261009/联合浏览器.json)可核验。10-08真实周报9.588秒、Vlog推荐5.730秒证据保留，开放式模型需求仍可能上游超时。

[数据模型](docs/数据模型说明.md) · [AI接入与成本](docs/AI接入与成本.md) · [桌面验收](docs/桌面最终精修验收.md) · [设计参考与许可证](docs/设计参考与许可证.md)。

## 本地运行

Node.js22.14或兼容更新版，无第三方运行依赖：

```powershell
node scripts/seed-product.js
$env:PORT="3004"
node server.js
```

已有3004服务无需重复启动。配置AI.ps1仅在本机隐藏输入Key；禁止发到聊天、前端或Git。
数据在被Git忽略的data/borrow-lab.sqlite；种子不会清空预约或偏好。
本地账号切换不是公网身份认证；完整新版需Node+SQLite，不宣称离线PWA或商店上架。

```powershell
npm test
python -X utf8 ci_check.py --through-day 10 --name "蒲嘉洋"
python -X utf8 "交作业自查.py" --day N --name "蒲嘉洋"
```

官方脚本保持原样，检查今日实名commit、反思、今日入库、origin远程tag；GiteeIssue/CI需另核对。正式当天不覆盖已有dayN。
[本地运行与演示说明](docs/本地运行与演示说明.md)。

## 证据与演示

[![Course CI](https://github.com/bvsk91361-cell/vibe-pujiayang/actions/workflows/ci.yml/badge.svg?branch=feat%2Fglass-review-workspace)](https://github.com/bvsk91361-cell/vibe-pujiayang/actions/workflows/ci.yml)

[GitHub镜像](https://github.com/bvsk91361-cell/vibe-pujiayang) · [Gitee报告列表](https://gitee.com/pujiayang-vibe/vibe-pujiayang/issues) · [历史线上静态版](https://bvsk91361-cell.github.io/vibe-pujiayang/)。
旧线上仅浏览器存储，不含新版后端AI，不能冒充当前产品公网部署。

[Day1～6原过程审计](docs/第1-6天个人总审计报告.md) · [Git恢复](docs/急救演练.md) · [代码审计](docs/第5天代码审计.md) · [Demo彩排](docs/Demo彩排.md) · [8分钟完整故事](docs/8分钟Demo完整故事.md) · [老师选题核查](docs/老师选题符合性核查.md)。

独立演示：node scripts/demo-day.js（3005，每次新库，日常预约不清空）。浏览器流程smoke不是本人讲解彩排。

本人现场彩排/录像/正式路演与真实反馈仍待发生；不虚构同学参与、教师批准、成绩或比赛结果。
