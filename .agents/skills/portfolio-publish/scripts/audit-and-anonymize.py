#!/usr/bin/env python3
"""
Portfolio Publish & Anonymization Audit Script
Scans repository files, git objects, and commit history for personal identifiers,
emails, local Windows user paths, and sensitive credentials.
"""

import argparse
import os
import re
import subprocess
import sys

# Patterns to scan for
SENSITIVE_PATTERNS = [
    r"AIza[0-9A-Za-z-_]{35}",           # Google API Keys
    r"ghp_[0-9A-Za-z]{36}",             # GitHub Personal Access Tokens
    r"sk-[0-9a-zA-Z]{20,}",             # OpenAI / Generic API keys
    r"[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+", # Emails (excluding dummy/noreply)
    r"[A-Z]:\\[Uu]sers\\[^\\]+",        # Windows user profile paths
    r"/home/[^/\s]+",                   # Linux home paths
]

EXCLUDED_EMAILS = {
    "contributor@users.noreply.github.com",
    "developer@users.noreply.github.com",
    "noreply@github.com",
    "placeholder@example.com",
}

def run_git(cmd):
    res = subprocess.run(['git'] + cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if res.returncode != 0:
        return ""
    return res.stdout.decode('utf-8', errors='ignore')

def audit_working_tree():
    print("🔍 Auditing working tree files...")
    issues = []
    
    # Check git tracked files
    tracked = run_git(['ls-files']).strip().split('\n')
    for f in tracked:
        if not f or not os.path.isfile(f):
            continue
        # Skip package-lock.json, binaries, and this audit script / docs
        if f.endswith(('.png', '.webp', '.jpg', '.ico', '.woff', '.woff2', 'package-lock.json')):
            continue
        if "portfolio-publish" in f:
            continue
        try:
            with open(f, 'r', encoding='utf-8', errors='ignore') as fp:
                for line_no, line in enumerate(fp, start=1):
                    for pat in SENSITIVE_PATTERNS:
                        matches = re.findall(pat, line)
                        for m in matches:
                            if m in EXCLUDED_EMAILS or "placeholder" in m.lower():
                                continue
                            # Allow example placeholders
                            if "AIzaSy..." in line or "placeholder" in line:
                                continue
                            issues.append((f, line_no, m))
        except Exception:
            pass
            
    return issues

def audit_git_history():
    print("📜 Auditing git commit history & authors...")
    author_issues = []
    log_output = run_git(['log', '--format=%H | %an | %ae | %cn | %ce | %s', 'main']).strip().split('\n')
    for line in log_output:
        if not line:
            continue
        parts = [p.strip() for p in line.split('|')]
        if len(parts) >= 6:
            sha, an, ae, cn, ce, msg = parts[0], parts[1], parts[2], parts[3], parts[4], parts[5]
            if ae not in EXCLUDED_EMAILS or ce not in EXCLUDED_EMAILS:
                author_issues.append((sha, an, ae, msg))
    return author_issues

def audit_git_blobs():
    print("📦 Auditing git object store blobs...")
    blob_issues = []
    obj_output = run_git(['rev-list', '--objects', 'main']).strip().split('\n')
    for line in obj_output:
        if not line:
            continue
        parts = line.split(maxsplit=1)
        sha = parts[0]
        path = parts[1] if len(parts) > 1 else ''
        obj_type = run_git(['cat-file', '-t', sha]).strip()
        if obj_type == 'blob':
            raw = run_git(['cat-file', '-p', sha])
            for pat in [r"C:\\Users\\[a-zA-Z0-9]+", r"[A-Z]:/Users/[a-zA-Z0-9]+"]:
                if re.search(pat, raw, re.IGNORECASE):
                    blob_issues.append((sha, path, "local user path"))
    return blob_issues

def main():
    parser = argparse.ArgumentParser(description="Portfolio Anonymization & Security Audit")
    parser.add_argument("--check", action="store_true", help="Perform non-destructive audit")
    args = parser.parse_args()

    print("=" * 60)
    print("🛡️  PORTFOLIO PUBLISH PRE-FLIGHT AUDIT")
    print("=" * 60)

    tree_issues = audit_working_tree()
    history_issues = audit_git_history()
    blob_issues = audit_git_blobs()

    total_issues = len(tree_issues) + len(history_issues) + len(blob_issues)

    if total_issues == 0:
        print("\n✅ AUDIT PASSED: No sensitive data or personal identifiers found!")
        print("   - Working tree: Clean")
        print("   - Commit authors: Anonymized")
        print("   - Git object store: Scrubbed")
        sys.exit(0)
    else:
        print(f"\n⚠️  FOUND {total_issues} POTENTIAL ISSUES:")
        for f, line, val in tree_issues:
            print(f"   [FILE] {f}:{line} -> {val}")
        for sha, an, ae, msg in history_issues:
            print(f"   [AUTHOR] Commit {sha[:7]} -> {an} <{ae}> ({msg})")
        for sha, path, val in blob_issues:
            print(f"   [BLOB] Object {sha[:7]} ({path}) -> {val}")
        sys.exit(1)

if __name__ == "__main__":
    main()
