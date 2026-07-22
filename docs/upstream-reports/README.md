# upstream (misskey-dev/misskey) 報告用パッケージ

作成: 2026-07-22 / 対象: `misskey-dev/misskey` **develop** (`2026.7.0-beta.2`)

このフォーク (Erebia) を Rust 化する前に TS backend を「仕様の正解」に固める過程で、
upstream Misskey が気づかずに継承しているバグを複数見つけた。うちのフォークは upstream から
切り離されているが、逆方向に渡せる情報として報告できる形に整えたもの。

各バグは **upstream develop の実ソースを clone し、実 entity・実ロジックに対して再現**した
（`~/dev/misskey-upstream`、別 postgres に TypeORM `synchronize` でスキーマ生成）。
「意図的な設計 vs 気づかれていないバグ」を GitHub issue/PR・セキュリティアドバイザリ(全37件)・
コードコメント/TODO・コミット履歴・単体テストで裏取り済み（判定は各ドキュメント参照）。

## 一覧

| # | 内容 | 種別 | repro | 修正 | 提出先 |
|---|---|---|---|---|---|
| [01](./01-note-replies-count.md) | 返信の並行削除で親 `repliesCount` が二重減算・負値化 | 未報告バグ | ✅ `repliesCount=-1` | ✅検証済 patch | 公開 issue + PR |
| [02](./02-dateutc.md) | `dateUTC` が Unix epoch ちょうどで誤例外 | 未報告バグ(潜在) | ✅ throw 再現 | ✅検証済 patch | 公開 issue + PR |
| [03](./03-ad-list-pagination.md) | admin 広告一覧 `publishing:false` のページネーション破綻 | 未報告バグ | ✅ page1==page2 | ✅検証済 patch | 公開 issue + PR |
| [04](./04-registry-dup.md) | registry 同一キー並行 set で重複行 | 既知(TODO)・未対応 | ✅ 2 行 | 提案(migration要) | 公開 issue + PR |
| [05](./05-drive-capacity-toctou.md) | ドライブ容量チェックの TOCTOU で容量超過 | 未報告バグ | ✅ usage 120>100 | 提案(直列化要) | 公開 issue + PR |
| [99](./99-SECURITY-admin-privesc.md) | admin reset-password/unset-mfa の権限昇格 | root保護=意図的/admin間=未認識 | (e2e) | 提案 | **非公開 Security Advisory** |

- `submissions/` — **そのまま貼れる英語の提出文面**（upstream の慣習: issue/PR は英語推奨）:
  - `issues.md` — 5 件の issue 本文（bug-report テンプレ形式）
  - `pull-requests.md` — #01/#02/#03 の PR タイトル+本文（+CHANGELOG 文言）
  - `security-advisory.md` — #99 の非公開 Advisory 文面
- `patches/*.patch` — 検証済み修正の diff（#01/#02/#03）。`git apply` で upstream develop に当たる。
- `repros/*.repro.ts` — upstream で動かした再現テスト（`packages/backend/test/unit/` に置いて実行）。

## 再現環境の作り方

```bash
git clone --depth 1 -b develop https://github.com/misskey-dev/misskey.git
cd misskey && pnpm install --filter backend...
# 別の postgres を用意し .config/test.yml の db を向ける
# built/meta.json が無いと config 読込で ENOENT になるので最小生成:
mkdir -p built && echo '{"version":"0.0.0"}' > built/meta.json
# repro を test/unit/ に置いて:
cd packages/backend
NODE_ENV=test npx vitest run --config vitest.config.unit.ts test/unit/<repro>.ts
```

各 repro は「**正しい挙動を assert → 現行 develop では失敗**」の形なので、失敗出力が再現の証拠。
修正 patch を当てると通る（#01/#02/#03 は検証済み）。

## 提出方針

- **#01〜#05 は公開 issue + PR**。1 バグ 1 PR。各 PR は repro をリグレッションテストとして同梱する。
- **#99 はセキュリティ項目なので公開 issue にしない**。GitHub の "Report a vulnerability"
  (Security Advisory) から非公開で報告する（[creating-issues-and-prs] スキルの脆弱性報告ルールに従う）。
- 提出前に upstream develop の**行番号を再確認**すること（develop は日々動く）。
- 意図判定で「意図的」だった `makeNotesHiddenBefore=0`（全ノート非表示）は **バグではない**ので
  ここには含めていない（upstream 単体テストが 0→hide を明示アサート）。
