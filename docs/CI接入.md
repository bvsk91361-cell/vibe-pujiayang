# 接入真实 CI

课程允许 Gitee Go 或 GitHub Actions。本仓库已准备 `.github/workflows/ci.yml`：每次 push/PR 跑 `npm test` 与 `python ci_check.py --day 6 --name 蒲嘉洋`。当前只有配置，不声称云端运行成功。

最短镜像方案：在自己的 GitHub 账号 `pujiayang` 下新建独立的 `vibe-pujiayang` 仓库，再把此项目推上去。Gitee 仍是课程登记与完工 issue 所在的个人仓库。先获得 GitHub Actions 的真实运行记录，再在 README 添加对应动态徽章。

2026-10-07 登录本账号检查“流水线”后，Gitee Go 开通页明确提示预付费增值服务，因此本次选择 GitHub Actions。GitHub 官方说明：公开仓库使用标准托管 runner 免费，见 https://docs.github.com/en/billing/concepts/product-billing/github-actions 。当前使用的 `ubuntu-latest` 是标准 runner，不使用收费大规格 runner 或收费存储扩展。

GitHub 连接账号已核对为 `pujiayang`，但浏览器尚需本人登录才能创建独立镜像仓库；已有 `server-project` 是其他私有项目，本次不改它。

不要使用固定 `passing` 图标替代 CI；不要把准备好配置写成已经跑绿。
