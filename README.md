# 蒲嘉洋的 Vibe Coding 课程实践

[![Course CI](https://github.com/bvsk91361-cell/vibe-pujiayang/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/bvsk91361-cell/vibe-pujiayang/actions/workflows/ci.yml)

[在线器材预约演示](https://bvsk91361-cell.github.io/vibe-pujiayang/) · [GitHub 镜像](https://github.com/bvsk91361-cell/vibe-pujiayang)

线上演示保存当前浏览器预约，不同设备不共享。本地 Node 版继续使用 JSON 持久化，部署差异见 [部署手册](docs/部署手册.md)。

- 姓名：蒲嘉洋
- 讨论组：第 10 组
- 学习目标：学会把需求说清楚，验证 AI 生成的代码，使用 Git 留存版本，并交付可运行的项目。

本仓库保存个人项目代码、需求文档、测试和真实学习过程记录。

## 项目：借一下 · 校园器材预约

三张器材卡片、日期/时段预约、重复预约拒绝、预约列表与取消。后端保存本机 JSON 数据，刷新和重启不会丢失记录。

### 本地启动

需要 Node.js 22 或更高版本，无需安装第三方依赖。

```bash
npm start
```

浏览器打开 `http://localhost:3000`。停止服务：在启动终端按 Ctrl+C。

```bash
npm test
```

2026-10-07 实际运行：11 组测试全部通过。覆盖五条核心规则、真实 HTTP 闭环、取消/重新预约、持久化、并发重复请求、中文分块、静态存储失败与 CSV 边界。浏览器证据见 [验收证据](docs/验收证据/)。

### 数据与适用范围

数据写入 `data/reservations.json`，不进入 Git。本版为单进程、本机课程原型，没有账号登录；可以查看和取消共享记录。公网部署前需补身份验证、取消权限和备份。

### 第 1—6 天个人补做

按本人要求独立推进。使用2026-10-07实际提交和验证，不倒签，不虚构组长、同学互评或教师批阅。标签是本次补做材料的归档时点，不代表曾按六个历史日期完成开发。本人独立验收与课程替代流程是否获认可，需本人和教师实际确认。

| 天数 | 审计材料 | 反思 |
|---|---|---|
| 1 | [环境](docs/环境审计.md) · [电梯稿](docs/电梯稿.md) | [day1](docs/反思录/蒲嘉洋/day1.md) |
| 2 | [需求、骨架、个人 PR](docs/第2天个人审计.md) | [day2](docs/反思录/蒲嘉洋/day2.md) |
| 3 | [两组真实闭环摘要](docs/反思录/对话/day3-两组真实闭环.md) | [day3](docs/反思录/蒲嘉洋/day3.md) |
| 4 | [外部组件](docs/外部组件接入.md) · [部署](docs/部署手册.md) | [day4](docs/反思录/蒲嘉洋/day4.md) |
| 5 | [代码审计与整改](docs/第5天代码审计.md) | [day5](docs/反思录/蒲嘉洋/day5.md) |
| 6 | [急救演练](docs/急救演练.md) · [外仓检查](docs/交叉验收/吴晟.md) | [day6](docs/反思录/蒲嘉洋/day6.md) |

- 实际补做日期：2026-10-07；不伪造 2026-09-18 的提交。
- 需求：[PRD](docs/PRD.md)；方案：[技术方案](docs/技术方案.md)；优先级：[任务看板](docs/任务看板.md)。
- 反思与实际对话摘要：[day6](docs/反思录/蒲嘉洋/day6.md)。
- 交叉验收：[吴晟仓库检查](docs/交叉验收/吴晟.md)，当前缺少可运行代码，待同学补充后复验。
- CI：GitHub Actions 真实成功，README 为动态徽章；修复运行见 [37564369479](https://github.com/bvsk91361-cell/vibe-pujiayang/actions/runs/37564369479)。
- 完工报告：[第6天完工报告](https://gitee.com/pujiayang-vibe/vibe-pujiayang/issues/IKJT3S)；整改 issue：[吴晟仓库交叉验收](https://gitee.com/wusheng1108/vibe-wusheng/issues/IKJT3M)。`day6` 标签等待 CI 与最终检查；报告保留实际未完成事项。
