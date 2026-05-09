#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
エラーログをGitHub Issuesに自動投稿するスクリプト

使用方法:
    python scripts/report_error_to_github.py <ログファイルパス> [--title "エラータイトル"]
"""

import sys
import os
from pathlib import Path
from datetime import datetime
import argparse
from typing import Optional
from urllib.parse import urlparse

try:
    from github import Github
except ImportError:
    print("エラー: PyGithubがインストールされていません")
    print("インストール: pip install PyGithub")
    sys.exit(1)


def read_log_file(log_path: Path, max_lines: int = 100) -> str:
    """ログファイルの最後のN行を読み込む"""
    try:
        with open(log_path, 'r', encoding='utf-8', errors='ignore') as f:
            lines = f.readlines()
            recent_lines = lines[-max_lines:] if len(lines) > max_lines else lines
            return ''.join(recent_lines)
    except Exception as e:
        return f"ログファイルの読み込みエラー: {str(e)}"


def get_repo_name_from_git() -> Optional[str]:
    """Gitリモートからリポジトリ名を取得"""
    try:
        import subprocess
        result = subprocess.run(
            ['git', 'remote', 'get-url', 'origin'],
            capture_output=True, text=True, cwd=Path(__file__).parent.parent
        )
        if result.returncode == 0:
            url = result.stdout.strip()
            # https://github.com/owner/repo.git または git@github.com:owner/repo.git
            if url.startswith('git@'):
                ssh_prefix = 'git@github.com:'
                if url.startswith(ssh_prefix):
                    repo = url[len(ssh_prefix):].replace('.git', '')
                    return repo
            else:
                parsed = urlparse(url)
                if parsed.hostname == 'github.com':
                    repo = parsed.path.lstrip('/').replace('.git', '')
                    if repo:
                        return repo
    except Exception:
        pass
    return None


def create_issue(
    github_token: str,
    repo_name: str,
    log_content: str,
    title: Optional[str] = None,
    log_path: Optional[Path] = None
) -> bool:
    """GitHub Issueを作成"""
    try:
        g = Github(github_token)
        repo = g.get_repo(repo_name)

        if not title:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
            title = f"[自動報告] エラー発生: {timestamp}"

        body = f"""## エラーログ報告

**報告日時**: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}
**ログファイル**: `{log_path.name if log_path else "不明"}`

### エラーログ内容

```log
{log_content[-5000:]}
```

### 🤖 Claude Codeへの指示

1. エラーの原因を調査
2. 修正を実装
3. テストを実行して確認
4. コミット & プッシュ

---
*このIssueは自動報告スクリプトによって生成されました*"""

        issue = repo.create_issue(
            title=title,
            body=body,
            labels=['bug', 'automated', 'error-report', 'auto-fix']
        )

        print(f"✅ Issue作成成功: {issue.html_url}")
        return True

    except Exception as e:
        print(f"❌ Issue作成失敗: {str(e)}")
        return False


def main():
    parser = argparse.ArgumentParser(description='エラーログをGitHub Issuesに自動投稿')
    parser.add_argument('log_file', type=str, help='ログファイルのパス')
    parser.add_argument('--title', type=str, help='Issueのタイトル（省略可）')
    parser.add_argument('--max-lines', type=int, default=100, help='読み込むログ行数')
    parser.add_argument('--repo', type=str, help='GitHubリポジトリ名')

    args = parser.parse_args()

    log_path = Path(args.log_file)
    if not log_path.exists():
        print(f"❌ エラー: ログファイルが見つかりません: {log_path}")
        sys.exit(1)

    github_token = os.getenv('GITHUB_TOKEN')
    if not github_token:
        print("❌ エラー: GITHUB_TOKEN環境変数が設定されていません")
        sys.exit(1)

    # リポジトリ名を自動検出
    repo_name = args.repo or os.getenv('GITHUB_REPOSITORY') or get_repo_name_from_git()
    if not repo_name:
        print("❌ エラー: リポジトリ名を特定できません。--repo オプションで指定してください")
        sys.exit(1)

    print(f"📖 ログファイルを読み込み中: {log_path}")
    log_content = read_log_file(log_path, args.max_lines)

    if not log_content.strip():
        print("⚠️  警告: ログファイルが空です")
        return

    print(f"📝 GitHub Issue作成中... (リポジトリ: {repo_name})")
    success = create_issue(
        github_token=github_token,
        repo_name=repo_name,
        log_content=log_content,
        title=args.title,
        log_path=log_path
    )

    if success:
        print("✅ 完了")
    else:
        sys.exit(1)


if __name__ == '__main__':
    main()
