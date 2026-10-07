# 本项目只读MCP练习

服务脚本scripts/mcp-booking.js为本项目原生Node实现，stdio/JSON-RPC，公开两个只读工具：booking_dictionary、booking_plan_summary。
不会写预约、运行SQL、读取任意路径或读取.env；汇总不包含姓名。
协议来源：https://modelcontextprotocol.io/specification/2025-06-18/basic/transports 及server/tools、basic/lifecycle。

真实运行node scripts/check-mcp.js，完成initialize→tools/list→字典读取→拒绝booking_delete，产出docs/数据字典-MCP.md。该证据是本机协议客户端调用，尚未在Trae里配置。
Trae等客户端配置示例：
```json
{
  "mcpServers": {
    "borrow-lab-readonly": {
      "command": "node",
      "args": ["E:/桌面/vibecode/vibe-pujiayang-git/scripts/mcp-booking.js"]
    }
  }
}
```

手册第7天指定Trae+MySQL MCP。当前项目JSON台账的只读MCP只是额外准备；不能替代原文并自动勾选MySQL任务。若教师允许按实际技术栈调整，可以使用本数据字典证据；若要求原任务，需要本人配置真实只读MySQL环境并留档。

