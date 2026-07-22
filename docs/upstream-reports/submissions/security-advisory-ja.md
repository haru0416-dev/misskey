# そのまま貼れる Security Advisory（日本語・推奨）— 公開 issue にしないこと

GitHub の対象リポジトリ **Security → Report a vulnerability**（非公開の Security Advisory）から提出する
（CONTRIBUTING の "Security Advisory" に従う）。修正は後から private fork への PR として出せる。

---

**Title:** 権限昇格: モデレーターが非 root 管理者のパスワードをリセットし、任意ユーザーの MFA を解除できる

**概要**

`admin/reset-password` と `admin/unset-mfa` は `requireModerator: true` のみでゲートされ、**対象**ユーザーが
呼び出し元と同格/上位かを検査しません。そのため `write:admin:reset-password` /
`write:admin:unset-mfa` を、対象の管理者より低い信頼レベルのロールに付与しているインスタンスでは、
その保持者が非 root の上位管理者アカウントを乗っ取れます。

- `admin/reset-password` は対象の新パスワード（8 文字）を払い出し、それでログインできます。**root だけ**が
  保護されており、それ以外の管理者は保護されません。
- `admin/unset-mfa` は対象の TOTP / パスキーを剥がします。**対象に対するガードが一切なく**（root すら）、
  モデレーターが root の二要素認証すら外せます。

両者を併用すると、下位のモデレーターが非 root 管理者を完全に乗っ取れます（パスワードリセット + MFA 除去）。

**深刻度:** 中。悪用可否はインスタンスのロール構成に依存します。`write:admin:reset-password`
（および `write:admin:unset-mfa`）を、対象より低い信頼レベルのロールに付与した権限階層が前提です。
単一管理者や、全モデレーターが同格に信頼される構成では実害はありません。

**影響バージョン:** `develop`（2026.7.0-beta.2）。ソース確認により確定。

**原因**

- `packages/backend/src/server/api/endpoints/admin/reset-password.ts`: `serverSettings.rootUserId === user.id`
  のみ保護。対象が同格/上位の管理者かのチェックが無い。
- `packages/backend/src/server/api/endpoints/admin/unset-mfa.ts`: 対象の階位チェックが一切無い（root ガードすら無い）。

**PoC（e2e フロー）**

上記のとおりコードレベルで確定。動作 PoC は以下で再現できます:

```
root  = signup()                                   // 最初の signup = インスタンス root
admin = signup(); ロール { isAdministrator: true } を付与
mod   = signup(); ロール { isModerator: true } を付与

// モデレーター mod が、非 root の管理者 admin を対象に:
POST /api/admin/reset-password { userId: admin.id }   // → 200 で新パスワードが返る（拒否されるべき）
POST /api/admin/unset-mfa      { userId: admin.id }    // → 成功（拒否されるべき）
```

期待挙動: いずれも権限昇格として拒否されるべき。

**修正案**

両エンドポイントに「呼び出し元が対象を管理操作してよいか」の階位チェックを追加します（できれば
`RoleService` に共通ヘルパを設け、suspend / delete-account 等の対人 admin 操作にも一貫適用):

- 対象が root なら拒否（reset-password の既存ガードを unset-mfa にも広げる）。
- 対象が管理者で、呼び出し元がそれを上回らない場合は拒否（例: 管理者でないモデレーターは管理者を操作不可）。

**意図について**

reset-password の root 保護は意図的です（`#15530` で `isRoot`→`rootUserId` にリファクタされ、専用エラーもある）。
一方、非 root 管理者の保護欠如と unset-mfa の完全な無防備は意図しないギャップに見えます
（公開済みのセキュリティアドバイザリ全 37 件・関連 issue とも該当なし）。
