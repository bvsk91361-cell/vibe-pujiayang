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
    days_arg = parser.add_mutually_exclusive_group(required=True)
    days_arg.add_argument("--day", type=int)
    days_arg.add_argument("--through-day", type=int)
    parser.add_argument("--name", required=True)
    args = parser.parse_args()
    limit = args.through_day if args.through_day is not None else args.day
    if limit < 1 or limit > 10:
        parser.error("day must be between 1 and 10")
    days = range(1, limit + 1) if args.through_day is not None else [args.day]
    for day in days:
        relative = f"docs/反思录/{args.name}/day{day}.md"
        path = Path(relative)
        if not path.is_file():
            sys.exit(f"Missing reflection: {relative}")
        content = path.read_text(encoding="utf-8")
        if len(content.strip()) < 50 or "对话" not in content or "验收" not in content:
            sys.exit(f"Reflection day{day} must include concrete dialogue and verification evidence.")
        git("ls-files", "--error-unmatch", relative)
        author = git("log", "-1", "--format=%an", "--", relative)
        if author != args.name:
            sys.exit(f"Reflection author mismatch: expected {args.name}, got {author}")
        print(f"PASS: tracked day{day} reflection, dialogue, verification, author {author}")

if __name__ == "__main__":
    main()
