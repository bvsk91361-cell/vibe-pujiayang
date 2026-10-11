# Command Center 动效与开源参考

观测时间：2026-10-11 09:36（北京时间）。Stars 为当时官方 GitHub REST API 的实时值，会继续变化；原始响应保存在本机 `data/command-center/research.json`。

| 项目 | 官方仓库 | Stars | 许可证 | 本次用途 |
|---|---|---:|---|---|
| shadcn-admin | [satnaing/shadcn-admin](https://github.com/satnaing/shadcn-admin) | 15,684 | MIT | 仅研究导航与操作层级，不复制模板、不迁移框架 |
| shadcndashboard | [shadcndashboard/shadcndashboard](https://github.com/shadcndashboard/shadcndashboard) | 489 | MIT | 仅研究信息密度与布局 |
| Framer Motion / Motion | [motiondivision/motion](https://github.com/motiondivision/motion) | 33,950 | MIT | 实际使用 `framer-motion@14.1.0` 的原生 DOM mini，Hover、Focus、入场 |
| GSAP | [greensock/GSAP](https://github.com/greensock/GSAP) | 29,022 | Standard No Charge GSAP License | 实际使用 `gsap@3.15.0`，SVG 描绘和实际数值过渡 |
| Apache ECharts | [apache/echarts](https://github.com/apache/echarts) | 67,470 | Apache-2.0 | 研究数据层级；本次特色星图与时间流采用原生 SVG，未引入 |
| D3.js | [d3/d3](https://github.com/d3/d3) | 113,727 | ISC | 研究关系布局与坐标映射；本次确定性小规模图形不需要完整库 |
| React Flow / xyflow | [xyflow/xyflow](https://github.com/xyflow/xyflow) | 38,631 | MIT | 研究节点关系与交互；未安装 React 运行时 |
| Three.js | [mrdoob/three.js](https://github.com/mrdoob/three.js) | 116,212 | MIT | 研究空间层次；本次二维运营信息不引入 WebGL 或大型 3D 依赖 |

## 实际依赖边界

产品仍为原生 HTML/CSS/JavaScript。构建工具与 npm 包安装在仓库外 `../.tooling/command-motion`，未修改产品 `package.json`。固定版本安装禁用生命周期脚本：

```powershell
npm install --prefix ../.tooling/command-motion --ignore-scripts --save-exact --no-audit --no-fund framer-motion@14.1.0 gsap@3.15.0 esbuild@0.28.2
node scripts/build-admin-motion.mjs
```

构建读取官方 `framer-motion/dom/mini` 导出，并用 `esbuild@0.28.2` 生成浏览器 ESM；并非把 React 组件包塞进原生页面。实际输出 `motion-dom.js` 为 8,465 字节、GSAP 官方 ESM 入口构建的 `gsap.min.js` 为 70,724 字节，均本地加载，不依赖运行时 CDN。版权声明保留在 `public/vendor`。构建会校验三个固定版本。没有直接 import GSAP 的 UMD 发行文件：其全局变量处理不能在 strict ESM 中执行；实际浏览器测试定位并修复为官方 ESM 入口构建。

官方版本的 npm SHA-512 完整性：

- Framer Motion 14.1.0：`sha512-QsdZSdWoyQfUmgi+GZfow8Du5COG6VRYEo9FlgKUPgH87/Le/fYekHCAKwLdYKHdCZcZfWHg4iOxlD6RoqXciQ==`
- GSAP 3.15.0：`sha512-dMW4CWBTUK1AEEDeZc1g4xpPGIrSf9fJF960qbTZmN/QwZIWY5wgliS6JWl9/25fpTGJrMRtSjGtOmPnfjZB+A==`
- esbuild 0.28.2：`sha512-HKVLS8dvII+xoKW9kmqxbRKrnWEXfJJr/FZhhJmiqIB0e053QNYFqOBouTMO/k5sID4MvCiUCvv8b9M4h32wIA==`

GSAP 不属于 MIT 开源许可。[官方 Standard No Charge License](https://gsap.com/community/standard-license/)允许普通网站与数字界面使用，限制用于与 Webflow 竞争的可视化动画构建工具；Borrow Lab 只做资源管理界面，不提供动画编辑器。不得移除其版权声明。Motion 的 [官方 animate 文档](https://motion.dev/docs/animate)说明 mini 版本通过浏览器原生动画 API 运行。

## 运行与性能约束

`public/admin/motion.js` 实际调用 Framer Motion `animate` 和 GSAP `to`，对应 SVG 路径、节点 Hover、输入 Focus 与数据变化。Canvas 只绘制两条光流和固定相位的 16 个微小光点，不代表设备或业务事件；业务数字、节点和预约状态全部由接口提供。

- SVG 与节点首次入场为有限动画；轮询保留的节点不重复入场。
- 数字只向接口给出的真实目标值过渡，ARIA 直接读真实结果。
- Canvas 上限 24fps、DPR 上限 1.5，限制像素面积；持续绘制超预算主动停止。
- 页面隐藏、离开可见区域或启用减少动画偏好时停止 Canvas；闲置 45 秒后停止，可由交互短暂唤醒。
- 切换界面调用 `dispose()`，撤销监听、计时、动画、Observer；不改业务选择或认证状态。

2026-10-11 09:52（北京时间），Microsoft Edge / Playwright 隔离 fixture 实际通过 10 项：库导入、Canvas 绘制、Hover、Network 键盘聚焦强调真实关系、GSAP SVG 绘制、真实目标数值变化、登录光环清理、减少动画停帧、dispose 清理、无 JavaScript 异常。减少动画后帧计数保持 55→55。此记录属于动效模块验证，不代替完整后台业务与布局验收。

验证记录保存于本机 `data/command-center/motion-verification.json`，仅实际完成的浏览器检查标为通过。
