# 接入真实 CI

课程允许 Gitee Go 或 GitHub Actions。本仓库已准备 `.github/workflows/ci.yml`：每次 push/PR 跑 `npm test` 与 `python ci_check.py --day 6 --name 蒲嘉洋`。当前只有配置，不声称云端运行成功。

镜像仓库：本人已在浏览器登录 GitHub 账号 `bvsk91361-cell`，独立的 `bvsk91361-cell/vibe-pujiayang` 公开仓库已创建。GitHub 导入页返回服务器错误，仓库尚无文件，因此改为通过本机 Git 推送完整历史。Gitee 仍是课程登记与完工 issue 所在的个人仓库。先获得 GitHub Actions 的真实运行记录，再在 README 添加对应动态徽章。

2026-10-07 登录本账号检查“流水线”后，Gitee Go 开通页明确提示预付费增值服务，因此本次选择 GitHub Actions。GitHub 官方说明：公开仓库使用标准托管 runner 免费，见 https://docs.github.com/en/billing/concepts/product-billing/github-actions 。当前使用的 `ubuntu-latest` 是标准 runner，不使用收费大规格 runner 或收费存储扩展。

GitHub 连接器登录账号与本人浏览器账号不同；本次使用本人确认的 `bvsk91361-cell`。推送需将本机已有 SSH 公钥授权给该账号；私钥不上传、不进入仓库。云端 CI 尚未运行。

不要使用固定 `passing` 图标替代 CI；不要把准备好配置写成已经跑绿。
