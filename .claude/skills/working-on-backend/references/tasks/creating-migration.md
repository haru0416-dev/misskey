# DB migration を作成する

`db/schema/*.ts` の変更から `packages/backend/migration/` へ新規 migration を追加するための手順。**2026-07-09 に drizzle-kit を導入し、schema.ts の差分から migration SQL を自動生成できるようになった**(それ以前は手書きJSだった。旧形式は `migration/_legacy/` に歴史的参照として残っているのみで実行系からは外れている)。

## 大前提 (絶対 NG)

- **既にマージ済み (develop / master) の migration ファイル (`packages/backend/migration/*.sql`) を編集しない** ([AGENTS.md](../../../../../AGENTS.md))。本番履歴の改変は深刻なデータ不整合を引き起こす。スキーマ変更は **常に新規のmigrationファイル** を作る(`db:generate`が連番で自動的に新しい番号を振る)
- `migration/meta/_journal.json` / `migration/meta/{N}_snapshot.json` も手で編集しない(`db:generate`が管理する)
- forward-only — down migrationの概念が無い。変更を戻したい場合は「戻すDDLを持つ新しいmigration」を追加する

---

## 手順

1. `packages/backend/src/db/schema/*.ts` を編集する(カラム追加/削除、index、外部キー`.references()`など)。書き方は [knowledge/db-models-and-migrations.md](../knowledge/db-models-and-migrations.md) を参照
2. ルートから `bun run --filter backend db:generate` を実行する — `packages/backend/migration/` に新しい連番の `.sql` ファイルが生成される
3. **生成されたSQLの中身を必ず目視確認する。** 特にenum変更・列リネームは対話プロンプトでの確認判定に依存するため、意図通りのSQLになっているか確認すること(詳細は[knowledge/db-models-and-migrations.md](../knowledge/db-models-and-migrations.md)の該当節)
4. schema.tsの変更が **drizzle-kitで表現できない特殊DDL** (拡張機能・関数・`INCLUDE`句・ストレージパラメータの事後変更など) を伴う場合は、`bun run --filter backend db:generate:custom` で空の`.sql`ファイルを作り、生SQLを手書きする。どのDDLが該当するかは[knowledge/db-models-and-migrations.md §drizzle-kitで自動生成できないDDL](../knowledge/db-models-and-migrations.md)を参照
5. 「検証」セクションのコマンドで確認する

---

## SPDXヘッダーは不要

生成される `.sql` ファイルにSPDXヘッダーは付けない(AGENTS.mdのSPDX対象拡張子リストに`.sql`は含まれない。`db:generate:custom`で作る手書きファイルも同様)。

---

## 検証

ルートから実行:

```bash
# 未適用の migration ファイルが無いか (実行し忘れの検出)
bun run --bun --filter backend check-migrations

# ローカル DB に適用
bun run migrate
```

`check-migrations` の実体は [migration-runner.ts](../../../../../packages/backend/src/migration-runner.ts) の `check` コマンド。`drizzle.__drizzle_migrations` テーブル(drizzle標準のブックキーピング)と `packages/backend/migration/meta/_journal.json` を突き合わせ、**まだ適用されていない migration ファイルが無いか**を検査する。「schema.tsとDBの実スキーマが同期しているか」の検査ではない — 純粋に「migrationファイルを生成したのに `bun run migrate` し忘れていないか」のチェック(CIは新規migrationに対して`migrate`→`check`の順で走らせて検証する)。

forward-onlyのため`revert`コマンドは存在しない。ロールバックしたい場合は新規migrationとして逆方向のDDLを追加し、`db:generate`→検証の手順を繰り返す。

---

## CHANGELOG (ユーザー影響がある場合)

スキーマ変更がユーザーに見える挙動を生む場合のみ、`CHANGELOG.md` に追記する。内部リファクタや純粋なインデックス追加は不要。詳細は [shipping-misskey-change スキル](../../../shipping-misskey-change/SKILL.md) で確認。

---

## 提出前セルフレビューチェックリスト

完了前に以下を上から確認する (各項目を TodoWrite 化してよい):

- [ ] 既にマージ済みの migration ファイル (`.sql`) は一切編集していない (大前提)
- [ ] schema.tsの変更は `db:generate`(通常のDDL)または `db:generate:custom`(拡張機能/関数/INCLUDE等)のいずれかで生成したものである
- [ ] 生成されたSQLの中身を目視確認した(特にenum変更・列リネームが意図通りか)
- [ ] `bun run --bun --filter backend check-migrations` が **0 件 (未適用 migration なし)** で通る (事前に `bun run migrate` を実行しておくこと)
- [ ] ユーザーに見える変更なら CHANGELOG 追記 → [shipping-misskey-change](../../../shipping-misskey-change/SKILL.md)
