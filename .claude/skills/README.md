# 作業別の指示 (Skill)

共通の判断と保護条件は [AGENTS.md](../../AGENTS.md) にある。ここには、作業の種類ごとの指示を置く。

| Skill | 使う場面 |
| --- | --- |
| [working-on-backend](working-on-backend/SKILL.md) | backend の API、サービス、DB、migration、テストの変更 |
| [working-on-frontend](working-on-frontend/SKILL.md) | frontend の画面、状態管理、UI の文言、コンポーネントのカタログ、ブラウザでの検証。embed・shared・Service Worker の UI と、UI 向けの言語ファイルも含む |
| [shipping-misskey-change](shipping-misskey-change/SKILL.md) | 変更を利用者へ返す前、commit・push・PR の作成前の検証 |
| [creating-issues-and-prs](creating-issues-and-prs/SKILL.md) | GitHub の Issue と PR の下書きと起票 |
| [context-budget](context-budget/SKILL.md) | セッションに渡した指示やツール情報の消費量と、重複の調査 |

## 書き方

`.claude/skills/<name>/SKILL.md` が、その作業の指示の元になる文書になる。`description` には対象の操作を短く書き、本文には、今回読むべき参照先と、その作業に固有の判断を書く。細かい内容は、実装・設定・検証へのリンクを持つ参照文書に置く。共通の規則の全文や、検証していないモデルごとの推奨は、再掲しない。

置いただけで自動的に適用されるとは考えない。AGENTS.md の対象表から、または利用者の明示的な呼び出しで、必要な Skill を読む。同じ変更の中で、すでに読んで変わっていない文書を開き直す必要はない。

## 別の入口への同期

Codex は [.agents/skills/](../../.agents/skills) の入口を読む。同じ `name` と `description` を持ち、元の文書を指す。GitHub Copilot 向けの [.github/copilot-instructions.md](../../.github/copilot-instructions.md) は AGENTS.md から生成する。これらは手で編集せず、元の文書を変えた後に次のコマンドで更新する。

```sh
bun run sync:agent-instructions
bun run lint:agent-instructions # 差分の検査。bun run lint にも含まれる
```

新しい Skill を足すときは、同期スクリプト [scripts/sync-agent-instructions.mjs](../../scripts/sync-agent-instructions.mjs) の対象にも加える。

## 規則を変えるとき

目的、現在の実装との整合、確かめる方法を先に決める。文書が短くなったことと、エージェントの品質や費用が良くなったことは別の話なので、後者は別に確かめる。[harness-audit](../commands/harness-audit.md) は、この照合を手で始める入口で、効果を保証するものではない。

外部の文面、例、評価の構成は、そのまま新しい運用の規則にしない。
