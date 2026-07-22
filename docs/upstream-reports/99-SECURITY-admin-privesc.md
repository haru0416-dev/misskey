# [SECURITY / 非公開] admin reset-password・unset-mfa の権限昇格

> ⚠️ **これは公開 issue にしないこと。** GitHub の "Security" → "Report a vulnerability"
> (private Security Advisory) から非公開で報告する。脆弱性を通常 issue/PR で出さないルールに従う。

- **対象**: `misskey-dev/misskey` develop (`2026.7.0-beta.2`)、2026-07-22 実ソースで確認
- **深刻度**: 高（CVSS 3.1 `AV:N/AC:L/PR:H/UI:N/S:C/C:H/I:H/A:H` ≈ 9.0、CWE-269 Improper Privilege Management）
- **意図判定**: root 保護は**意図的**（`#15530` で `isRoot`→`rootUserId` にリファクタ、専用エラーあり）。
  しかし**非 root 管理者の保護欠如**と **`unset-mfa` の root 無防備**は未認識のギャップ。
  GHSA 全37件・関連 issue とも該当なし。

## 概要

`admin/reset-password` と `admin/unset-mfa` は `requireModerator: true` でゲートされ、対象ユーザーが
**呼び出し元と同格/上位の管理者かどうかを検査しない**。さらに `kind`（`write:admin:*`）権限チェックは
`ApiCallService.ts:412` の `if (token && …)` の内側 = **アプリトークン専用**で、モデレーターの通常ログイン
（ネイティブセッション）では評価されない。よって **モデレーターと管理者を分けている標準運用で、任意の
モデレーターが通常の Web クライアントから非 root の上位管理者を乗っ取れる**（特別な権限付与は不要）。

- `admin/reset-password`: 対象の新パスワード（8 文字）が払い出される → そのパスワードでログイン可能。
  **root だけは保護**されているが、それ以外の管理者は保護されない。
- `admin/unset-mfa`: 対象の TOTP / パスキーを剥がせる。**root も含めて誰も保護されていない**
  （root の 2FA すら剥がせる）。

両者を併用すると、下位モデレーターが非 root 管理者の「パスワード奪取 + 2FA 除去」で完全に乗っ取れる。

## 前提条件（悪用可能性）

- 前提は**特別な設定ではなく、モデレーターと管理者を分けている標準的な二層スタッフ運用**そのもの。
  `write:admin:reset-password` の明示付与は不要（`kind` はアプリトークンにしか効かないため、
  素のモデレーターの通常ログインで両 EP を叩ける）。
- 唯一の緩和は「攻撃者が既にモデレーターであること」。だがモデレーターは設計上管理者より低信頼の層なので、
  これは意図された信頼境界（モデレーター↛管理者）の突破であり緩和にならない。
- モデレーター層が存在せず管理者のみのインスタンスに限り、この経路は成立しない。

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
