# Borrow Lab Command Center

沿用当前 Node.js 22.14+ 服务与 SQLite 台账。后台采用原生 DOM、SVG 和 Canvas，Motion DOM mini 与 GSAP 为本地静态资源；构建工具在独立目录，不增加产品 npm 依赖、不迁移框架。

## 本地启动

```powershell
$env:PORT="3006"
node server.js
```

前台：`http://localhost:3006/#workspace`。从个人菜单的“身份管理”选择“管理员”，或打开 `http://localhost:3006/admin#/login`。

首次初始化在本机交互式终端执行 `node scripts/admin-setup.js`。账号和两次密码在终端输入，密码不回显，不接受命令行或管道传入。已有管理员不会被覆盖。仅明确需要重置时使用 `--reset`；重置会撤销旧会话。自定义数据库使用 `--db 路径`。不把密码、Cookie、`.env` 或数据库提交到 Git。

## 安全与数据

- 管理员独立于前台本地演示身份。所有 `/api/admin/` 数据与写接口由后端验证会话。
- 随机盐 scrypt 密码哈希；会话令牌只保存哈希；Cookie 为 HttpOnly、SameSite=Strict，HTTPS/生产环境启用 Secure。管理写操作验证 Origin 与 CSRF。
- 首次扩展已有数据库前保存一致 SQLite 快照，不重建预约表、不移动设备或预约 ID。新增管理审计和周报表；取消保留历史并释放有效预约唯一约束。
- 设备名称、说明和维护状态存于同一台账。维护操作若影响未来或当前有效预约会被拒绝；先明确处理预约，再停用设备。
- 前台身份仍是本机演示身份，用户管理只读，不代表校园认证。

## 统计口径与同步

“当前占用”表示北京时间当前时段的有效预约设备数，不代表实际领用。趋势按预约日期统计，取消记录独立展示。占用率为有效预约时段数除以当前可运营设备的开放时段数，未包含领用/归还记录，不能视为实际使用时长。

管理页使用受认证的 SSE：服务端每 5 秒核对业务版本，只有设备、预约、方案、身份或北京时间边界改变才发出变更通知。断线时在可见页面每 15 秒补偿查询，获得焦点时刷新；管理写操作立即更新，同源 BroadcastChannel 同时通知前台。页面隐藏时暂停连接和装饰动效。请求序号和取消机制防止旧筛选结果覆盖新结果，增量 DOM 更新保留节点、焦点和图形上下文；同步失败保留最后成功的数据并明确提示。

“下一空闲”检查未来 14 天尚未开始的完整固定时段，不代替提交时的服务端校验。资源星图的热门与待使用依据本周预约、24 小时内安排和当前设备状态；关系网络只连接实际存在的本地身份、保存方案、预约与设备，并标明显示范围。

AI 运营中心区分即时台账规则洞察和模型周报。每条规则建议包含来源、计算逻辑、事实和行动建议，不假装由模型生成。模型周报仅由“生成本周周报”触发，读取或 SSE 更新不会调用模型；报告持久化统计依据和生成时间。未持久化历史冲突日志，因此不显示虚构的冲突次数。当前容量按正常运营设备计算，不回推未记录的历史维护时长。

AI 上游网络或限流失败时不会写入假报告，可从原入口手动重试，普通设备预约继续运行。`node scripts/verify-admin-ai.mjs --live` 会在临时数据库发起一次真实模型验证（可能产生模型费用）；不属于自动测试，不能用它作为轮询或自动重试任务。

## 验证

```powershell
npm test
```

核心测试采用内存或临时 SQLite 数据库，覆盖认证、权限、取消释放、维护保护、持久化、统计及多客户端 SSE；不会写入日常预约台账。

V2 浏览器验收：通过 `ADMIN_PLAYWRIGHT_PATH` 指定已安装 Playwright（可用 `ADMIN_BROWSER_PATH` 指定 Edge），运行 `node scripts/verify-command-browser.mjs`。脚本使用真实业务模块、独立 SQLite 和仅保存在进程内的随机管理员密码；不伪造 API、不调用付费模型。结果与截图保存在忽略的 `data/command-center/`。`node scripts/verify-admin-reconcile.mjs` 验证增量更新保留状态。旧 `verify-admin-browser.mjs` 属于初版管理控制台的历史流程，不代替 V2 验收。

## 管理空间

| 入口 | 职责 |
|---|---|
| `/admin#/dashboard` | Command Center：资源星图、接下来的安排、真实动态和脉冲入口 |
| `/admin#/equipment` | Equipment Intelligence：设备墙、搜索分类、设备编辑与维护保护 |
| `/admin#/bookings` | Time Flow：全台账筛选、时间光点、预约详情与取消审计 |
| `/admin#/users` | Creator Network：真实身份、方案、预约和设备关系；身份只读 |
| `/admin#/analytics` | Resource Insight：资源脉冲、预约需求分布、热门与低预约设备 |
| `/admin#/operations` | Operations Brain：可解释的规则洞察、已保存与按需生成的模型周报 |
| `/admin#/system` | 安全会话、北京时间、同步方式和数据边界 |

工具来源、实际版本及许可证见 [CommandCenter工具调研](docs/CommandCenter工具调研.md)。阶段截图与独立评分见 [CommandCenter阶段验收](docs/CommandCenter阶段验收.md)。
