"""CI evidence gate: check real reflection, dialogue, and named commits.

Tags/issues are checked after sealing, not before the CI push.
"""
import argparse
from pathlib import Path
import subprocess
import sys

def git(*args):
    return subprocess.check_output(
        ["git", "-c", "core.quotePath=false", *args], encoding="utf-8"
    ).strip()

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--day", type=int, required=True)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    relative = f"docs/反思录/{args.name}/day{args.day}.md"
    path = Path(relative)
    if not path.is_file():
        sys.exit(f"Missing reflection: {relative}")
    content = path.read_text(encoding="utf-8")
    if len(content.strip()) < 50 or "对话" not in content or "验收" not in content:
        sys.exit("Reflection must include concrete dialogue and verification evidence.")
    git("ls-files", "--error-unmatch", relative)
    author = git("log", "-1", "--format=%an", "--", relative)
    if author != args.name:
        sys.exit(f"Reflection author mismatch: expected {args.name}, got {author}")
    print(f"PASS: tracked day{args.day} reflection, dialogue, verification, author {author}")

if __name__ == "__main__":
    main()
