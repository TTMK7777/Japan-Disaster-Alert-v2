# Claude Code自動修正フロー

## 🔄 自動修正フローの概要

```
1. Claude Codeがコードを実装・修正
   ↓
2. コミット & プッシュ
   ↓
3. GitHub Actionsが自動でテスト実行
   ↓
4. エラー検出
   ↓
5. GitHub Issueを自動作成（auto-fixラベル付き）
   ↓
6. Claude CodeがIssueを読み取って修正
   ↓
7. 修正をコミット & プッシュ
   ↓
8. 再テスト（自動）
   ↓
9. 成功 → Issue自動クローズ & 通知
   失敗 → ステップ5に戻る
```

## 📋 使い方

### ステップ1: Claude CodeにIssueを読ませる

```
GitHubリポジトリの「auto-fix」ラベルが付いたIssueを確認して、
エラーを修正してください。修正後はコミット & プッシュしてください。
```

### ステップ2: 特定のIssue番号を指定する場合

```
Issue #123を確認して、テストエラーを修正してください。
```

## 🏷️ Issueラベル

- **auto-fix**: Claude Codeによる自動修正が必要
- **automated**: 自動生成されたIssue
- **test-failure**: テスト失敗に関するIssue

## 📝 手動でエラーを報告する場合

```bash
# 環境変数を設定
set GITHUB_TOKEN=your_token

# エラーログを報告
python scripts/report_error_to_github.py logs/error.log
```

---
*このドキュメントはGitHub連携テンプレートによって自動生成されました*
