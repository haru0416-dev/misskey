---
name: working-on-backend
description: packages/backend の API・サービス・DB・migration・テストを追加または変更するときに使う。
---

# Backend の変更

共通の安全条件と完了条件は [AGENTS.md](../../../AGENTS.md) を正本とする。この Skill は backend 固有の実装・検証先を案内する。

変更する入力、認可、保存、非同期処理、応答を特定し、同じ処理を使う REST・ActivityPub・queue の経路を追う。既に読んだ情報は再利用し、以下から関係する節だけを読む。

| 作業 | 参照先 |
| --- | --- |
| API の追加・契約変更 | [API 作業](references/tasks/adding-api-endpoint.md) |
| DB schema・migration の変更 | [migration 作業](references/tasks/creating-migration.md) |
| 依存・transaction・queue の境界変更 | [サービス構成](references/knowledge/service-architecture.md) |
| テーブル・モデル・DDL の判断 | [DB と migration](references/knowledge/db-models-and-migrations.md) |
| 認可・入力・応答の宣言 | [meta・paramDef・res](references/knowledge/api-meta-paramdef.md) |
| HTTP ルートとメタデータの配線 | [API 登録](references/knowledge/endpoint-registration.md) |
| 実行環境・既存テスト・観測方法 | [backend 検証](references/knowledge/backend-testing.md) |

Hono のルート、明示的な依存を受ける関数・factory、drizzle の既存構成に合わせる。新しい層や共通化は、守る契約と所有者を明確にするときに設ける。

検証の最終実行先は [shipping-misskey-change](../shipping-misskey-change/SKILL.md)。API の独立レビューが必要なら [misskey-api-reviewer](../../agents/misskey-api-reviewer.md) に対象差分と観測した結果を渡す。レビューや Skill 読込自体を動作確認の代わりにしない。
