# 接入真实 CI

课程允许 Gitee Go 或 GitHub Actions。本仓库已准备 `.github/workflows/ci.yml`：每次 push/PR 跑 `npm test` 与 `python ci_check.py --day 6 --name 蒲嘉洋`。当前只有配置，不声称云端运行成功。

最短镜像方案：在自己的 GitHub 账号 `pujiayang` 下新建独立的 `vibe-pujiayang` 仓库，再把此项目推上去。Gitee 仍是课程登记与完工 issue 所在的个人仓库。先获得 GitHub Actions 的真实运行记录，再在 README 添加对应动态徽章。

或者在 Gitee 仓库“流水线”中接入 Node.js 22 环境，依次执行上述两条命令。网页开通与配置需在本人账号中完成；运行成功后使用平台给出的真实徽章地址。

不要使用固定 `passing` 图标替代 CI；不要把准备好配置写成已经跑绿。
