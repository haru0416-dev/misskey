---
name: creating-issues-and-prs
description: GitHub の Issue・Pull Request の下書きと起票を行う。
---

# Issue・Pull Request を作成する

外部送信、秘密情報、Git 操作の共通条件は [AGENTS.md](../../../AGENTS.md) に従う。下書きの依頼は送信の許可ではない。送信先リポジトリ・対象ブランチ・公開される内容が依頼と一致していることを確認し、明示された起票の範囲だけを実行する。既に明確な送信指示がある場合、同じ承認を繰り返し求めない。

この fork の起票先・用途・PR の構成は [CONTRIBUTING.md](../../../CONTRIBUTING.md) に従う。通常の送信先はこのリポジトリであり、upstream の Issue・Discussions 等へ自動で転送しない。

## 非公開で扱う内容

脆弱性の詳細は通常の Issue・PR・コメントへ送らず、[SECURITY.md](../../../SECURITY.md) の非公開報告先を案内する。公開パッチやログから脆弱性が明らかになる場合も同じ扱いにする。別の fork や upstream へ報告する際はその送信先の policy を確認し、公開範囲と承認が不明なら送信を止める。

下書き、添付、コマンド出力には、本番設定、token、秘密鍵、cookie、個人情報、非公開の投稿内容を含めない。再現に必要な条件だけを残し、伏せた箇所を示す。秘密を除外できない資料は添付しない。

## Issue

1. 送信先の既存 Issue を確認し、同じ問題・提案との関係を整理する。検索できなければ重複未確認と報告する。
2. [bug report](../../../.github/ISSUE_TEMPLATE/01_bug-report.yml) または [feature request](../../../.github/ISSUE_TEMPLATE/02_feature-request.yml) の現在の項目を使う。再現手順、期待結果、実結果、環境は確認済みの情報だけを書く。
3. 該当テンプレートがない場合は送信先の contribution policy を確認し、内容に合う下書きを作る。送信先が不明な場合だけ確認する。運用相談を不具合報告に置き換えず、Discussions が適切ならその有効性と送信指示を確認する。

## Pull Request

- 対応 Issue の有無と、変更との関係を確認する。該当 Issue がなく方針確認が必要なら、その点をユーザーに示してから送信する。
- [.github/pull_request_template.md](../../../.github/pull_request_template.md) を使用し、What・Why・必要な補足に成果物、検証結果、未確認事項を記載する。見出しや自己評価の表を無目的に増やさない。
- checklist は実施済みの項目だけを完了扱いにする。適用外と未実施を分ける。
- 変更の完了確認は [shipping-misskey-change](../shipping-misskey-change/SKILL.md) の結果を使い回す。本文を整えたことをコード検証や品質改善の証拠にしない。

送信後は作成された URL と対象を返す。送信に失敗した場合は、実際に作成されたかを確認してから再送を判断し、重複投稿を避ける。作成の許可を merge・close・別サービスへの転載の許可に拡張しない。
