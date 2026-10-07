# 接入真实 CI

课程允许 Gitee Go 或 GitHub Actions。本仓库 `.github/workflows/ci.yml` 对 main/master、feat/**、docs/** 的 push、day* tag、PR 执行 `npm test` 与 `python ci_check.py --through-day 6 --name 蒲嘉洋`。闸门逐日核对 day1–day6 的反思、验收、对话摘要、被跟踪状态与最近署名作者。

镜像仓库为 `bvsk91361-cell/vibe-pujiayang`。导入页返回错误后，使用本机 SSH 直接推送，完整历史已实际上传。Gitee 仍是课程登记与完工 issue 所在的个人仓库，Gitee master 与 GitHub main 同步相同提交。

2026-10-07 登录本账号检查“流水线”后，Gitee Go 开通页明确提示预付费增值服务，因此本次选择 GitHub Actions。GitHub 官方说明：公开仓库使用标准托管 runner 免费，见 https://docs.github.com/en/billing/concepts/product-billing/github-actions 。当前使用的 `ubuntu-latest` 是标准 runner，不使用收费大规格 runner 或收费存储扩展。

GitHub 连接器登录账号与本人浏览器账号不同；本次使用本人确认的 `bvsk91361-cell`。本人明确授权添加现有公钥后，实际认证为这个账号；私钥不上传、不进入仓库。

真实记录：修复分支 `0cdf868` 的运行 https://github.com/bvsk91361-cell/vibe-pujiayang/actions/runs/37564369479 为 success，测试和当时 day6 闸门均通过。逐日闸门扩展后的运行另在最终验收总表补充。徽章链接实时 main 工作流，不使用固定 passing 图。

本地验证：`python ci_check.py --through-day 6 --name 蒲嘉洋` 六条 PASS；请求不存在的 day7 反思时明确失败，已确认漏交会被闸门拒绝。标签是否已远程推送、网页报告是否发布，由最终审计与官方自查分别核对。

不要使用固定 `passing` 图标替代 CI；不要把准备好配置写成已经跑绿。
