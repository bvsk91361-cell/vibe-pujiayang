# 预约数据字典（通过只读MCP实际读取）

日期：2026-10-07。传输为stdio/JSON-RPC。客户端完成initialize、tools/list、tools/call；写工具booking_delete被明确拒绝。这里使用本项目JSON台账，不冒充MySQL或Trae实操。

- id：UUID唯一标识
- name：预约人，1～30字符
- equipmentId：camera/projector/recorder
- date：YYYY-MM-DD本地日期
- slot：09:00–11:00 / 14:00–16:00 / 19:00–21:00
- createdAt：ISO8601创建时间

约束：equipmentId + date + slot唯一；写入只由预约API执行。
