#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""《Vibe Coding》收工自查（学生端 · 零依赖 · 放仓库根目录跑）
用法（在仓库根目录的终端里）:
  python3 交作业自查.py --day 3 --name 张三
检查你自己今天的作业四件套，缺哪样它告诉你补哪样，全绿再下班。
老师用同一套硬指标巡查：这里全绿 = 今天不会被记缺交。
--name 可以不传，默认取 git config user.name（所以署名必须是真名）。
"""
import argparse, datetime, pathlib, subprocess, sys

def sh(cmd):
    return subprocess.run(cmd, shell=True, capture_output=True, text=True).stdout

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--day", type=int, required=True)
    ap.add_argument("--name", default="")
    a = ap.parse_args()
    if not pathlib.Path(".git").exists(): sys.exit("请在仓库根目录运行（找不到 .git）")
    name = a.name or sh("git config user.name").strip()
    if not name: sys.exit("没查到你的名字：先配 git config user.name 真名，或用 --name 传入")
    today = datetime.date.today().isoformat()
    since = f'--since="{today}T00:00:00"'
    my_commits = [x for x in sh(f"git -c core.quotePath=false log {since} --author=\"{name}\" --pretty=format:%h").split() if x]
    f = pathlib.Path("docs") / "反思录" / name / f"day{a.day}.md"
    today_files = sh(f"git -c core.quotePath=false log {since} --name-only --pretty=format:").splitlines()
    filed_in = f.as_posix() in [p.strip() for p in today_files if p.strip()]
    tag_pushed = f"refs/tags/day{a.day}" in sh("git ls-remote --tags origin")
    checks = [
        (bool(my_commits), f"① 今日你名下 commit ≥1（{name}）",
         "   现在 0 个。今天干的活要署名提交：git add -A && git commit -m \"写人话\" && git push"),
        (f.exists(), f"② 反思件存在 docs/反思录/{name}/day{a.day}.md",
         "   把今天的反思区 + 至少 1 组对话档案写进这个文件（目录名一字不差）"),
        (filed_in, "③ 反思件已随今日 commit 入库",
         "   文件在但没提交或没推：git add 它 → commit → push"),
        (tag_pushed, f"④ 封卷 tag day{a.day} 已推到你自己的仓库",
         f"   你的远程还没这个 tag：git tag day{a.day} && git push origin --tags"),
    ]
    bad = 0
    for ok, title, hint in checks:
        print(("✅ " if ok else "❌ ") + title)
        if not ok:
            print(hint); bad += 1
    print("ℹ️ ⑤ 「第 %d 天完工报告」issue 要在你自己的 Gitee 仓库发，本地查不到——没收工前先发掉（组长查本组时就看这条）" % a.day)
    print("\n" + ("全绿，可以下班。老师那边你今天的作业判'已交'。" if not bad else f"还差 {bad} 样，补完再跑一次。"))
    sys.exit(0 if not bad else 1)

if __name__ == "__main__": main()
