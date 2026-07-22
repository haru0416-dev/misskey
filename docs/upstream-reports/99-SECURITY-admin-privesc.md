# [SECURITY / 非公開] admin reset-password・unset-mfa の権限昇格

> ⚠️ **これは公開 issue にしないこと。** GitHub の "Security" → "Report a vulnerability"
> (private Security Advisory) から非公開で報告する。脆弱性を通常 issue/PR で出さないルールに従う。

- **対象**: `misskey-dev/misskey` develop (`2026.7.0-beta.2`)、2026-07-22 実ソースで確認
- **深刻度**: 中（前提条件つき。CWE-269 Improper Privilege Management）
- **意図判定**: root 保護は**意図的**（`#15530` で `isRoot`→`rootUserId` にリファクタ、専用エラーあり）。
  しかし**非 root 管理者の保護欠如**と **`unset-mfa` の root 無防備**は未認識のギャップ。
  GHSA 全37件・関連 issue とも該当なし。

## 概要

`admin/reset-password` と `admin/unset-mfa` は `requireModerator: true` でゲートされ、対象ユーザーが
**呼び出し元と同格/上位の管理者かどうかを検査しない**。そのため「フル管理者未満だが
`write:admin:reset-password` / `write:admin:unset-mfa` を持つ中間スタッフロール」を運用している
インスタンスで、その保持者が**非 root の上位管理者**アカウントを乗っ取れる。

- `admin/reset-password`: 対象の新パスワード（8 文字）が払い出される → そのパスワードでログイン可能。
  **root だけは保護**されているが、それ以外の管理者は保護されない。
- `admin/unset-mfa`: 対象の TOTP / パスキーを剥がせる。**root も含めて誰も保護されていない**
  （root の 2FA すら剥がせる）。

両者を併用すると、下位モデレーターが非 root 管理者の「パスワード奪取 + 2FA 除去」で完全に乗っ取れる。

## 前提条件（悪用可能性）

- インスタンスが**権限を階層化したロール**を運用しており、`write:admin:reset-password`
  （および `write:admin:unset-mfa`）を、対象より低い信頼レベルのロールに付与している場合に成立。
- 単一管理者や、全モデレーターが同格に信頼される構成では実害は無い。

## Root cause

`packages/backend/src/server/api/endpoints/admin/reset-password.ts`:

```ts
// meta: requireModerator: true, kind: 'write:admin:reset-password'
if (this.serverSettings.rootUserId === user.id) {
	throw new ApiError(meta.errors.cannotResetPasswordOfRootUser);
}
// ↑ root のみ保護。対象が管理者/上位ロールかの階位チェックが無い
const passwd = secureRndstr(8);
// ... updateProfile({ password: hashed })
```

`packages/backend/src/server/api/endpoints/admin/unset-mfa.ts`:

```ts
// meta: requireModerator: true, kind: 'write:admin:unset-mfa'
// 対象ユーザーの階位判定コードが一切無い（root ガードすら無い）
await this.userProfilesRepository.update({ userId: user.id }, { ... 2FA/passkey をクリア ... });
```

## PoC（e2e フロー）

コードレベルで確定済み（上記）。動作 PoC は以下の e2e フローで再現できる:

```
root = signup()                                  // 最初の signup = インスタンス root
admin = signup(); assign(admin, role{isAdministrator:true})
mod   = signup(); assign(mod,   role{isModerator:true})

// モデレーター mod が 非root の管理者 admin を対象に:
api('admin/reset-password', { userId: admin.id }, mod)   // → 200 + 新パスワードが返る（脆弱）
api('admin/unset-mfa',      { userId: admin.id }, mod)    // → 成功（脆弱）
```

期待挙動: いずれも権限昇格として拒否されるべき。

## Proposed fix

両エンドポイントで「呼び出し元が対象を操作してよいか」の階位チェックを追加する:

- 対象が root → 拒否（reset-password は既存、unset-mfa にも追加）。
- 対象が administrator で、呼び出し元がそれを上回らない（例: 呼び出し元が administrator でない）→ 拒否。
- 可能なら共通ヘルパ（`RoleService` に「actor は target を管理操作できるか」）に集約し、
  他の対人 admin 操作（suspend/delete-account 等）にも一貫適用する。

## 備考

このフォーク (Erebia) は upstream から切り離されているため、独自に hardening 済み（弱点を継承しない方針）。
upstream には本 Advisory の内容で非公開報告するのが妥当。
