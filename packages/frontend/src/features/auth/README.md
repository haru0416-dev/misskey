# Authentication

サインイン、サインアップ、認可確認、パスワード再設定のUIをまとめたfeature。

- `components/MkSignin*`: password、TOTP、passkeyを含むサインインフロー
- `components/MkSignupDialog*`: 利用規約確認を含むサインアップフロー
- `components/MkAuthConfirm.vue`: MiAuth、OAuthの認可確認
- `components/MkForgotPassword.vue`: パスワード再設定要求
- `components/MkVisitorDashboard.vue`: 未認証ユーザー向けの入口
- `please-login.ts`: 認証必須操作のguardとサインイン誘導

アカウント状態とセッション切り替えは引き続きアプリケーション基盤の `accounts.ts`、`i.ts`、`signout.ts` が所有する。このfeatureはそれらを利用するUI層であり、セッション状態を独自に保持しない。
