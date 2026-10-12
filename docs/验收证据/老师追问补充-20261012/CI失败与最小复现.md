# CI失败与最小复现

日期2026-10-12。执行者Codex，按蒲嘉洋授权，不将自动运行称为本人手工验收。

| 证据 | 环境 | 修复前 | 修复后 |
|---|---|---|---|
| 原始云端Job | Ubuntu24.04 / Node22.23.3 | 174项，5失败 | 历史成功CI对应c5f0009 |
| 今日5文件原样运行 | Windows / Node22.14.0 / TZ=UTC | 42项，4失败 | 42项全过 |
| 今日单文件最小复现 | 同上 | 2项，1失败 | 2项全过 |

云端第5个失败是Linux路径分隔符。当前Windows不能说此项已原样复现，原始日志保留hookFailed。

## 不切换分支的PowerShell复现
解出两个Git历史快照到唯一临时目录，只改当前进程TZ，结束时恢复；不递归删除目录。
```powershell
cd "E:\桌面\vibecode\vibe-pujiayang-git"
$reviewDir = Join-Path $env:TEMP ("BorrowLab-CI-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $reviewDir | Out-Null
git archive --format=zip --output="$reviewDir\before.zip" 6f8a91e
git archive --format=zip --output="$reviewDir\after.zip" c5f0009
Expand-Archive -LiteralPath "$reviewDir\before.zip" -DestinationPath "$reviewDir\before"
Expand-Archive -LiteralPath "$reviewDir\after.zip" -DestinationPath "$reviewDir\after"
$previousTZ = $env:TZ
$env:TZ = "UTC"
try {
  foreach ($version in @("before", "after")) {
    Push-Location (Join-Path $reviewDir $version)
    try {
      node --test test/reservation-view.test.js
    } finally {
      Pop-Location
    }
  }
} finally {
  $env:TZ = $previousTZ
}
```
预期before退出1，“已到期 !== 待使用”；after退出0，2项通过。
历史快照由Git已提交内容生成，不复制.env或日常SQLite，不回滚当前产品。

## 扩展命令
在上述快照目录中、保持TZ=UTC：
```powershell
node --test test/ai-planning.test.js test/booking.test.js test/desktop-workspace.test.js test/reservation-view.test.js test/simplified-flows.test.js
```

## 最小修改
时间夹具用ISO显式时区2026-10-07T08:59:00+08:00，避免依赖运行器本地时区。
路径夹具用path.relative/path.isAbsolute/path.basename校验临时目录，不写死反斜杠，不删除清理安全断言。
原修复提交c5f0009；本轮只补证据，没有修改这些业务或测试文件。
