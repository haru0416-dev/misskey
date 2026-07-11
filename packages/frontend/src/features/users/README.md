# Users

ユーザーの表示、選択、follow、移行・停止状態の案内をまとめたfeature。

- `components/MkMention.vue`: usernameとhostの表示
- `components/MkFollowButton.vue`: follow状態と操作
- `components/MkUserPopup.vue`, `components/MkUserInfo.vue`, `components/MkUserCardMini.vue`: user概要表示
- `components/MkUserList.vue`, `components/MkUserSelectDialog.vue`: user一覧と選択
- `components/MkAvatars.vue`, `components/MkUsersTooltip.vue`: 複数userのcompact表示
- `components/MkAccountMoved.vue`, `components/MkRemoteCaution.vue`: remote・移行状態の案内
- `get-user-menu.ts`: user action menu
- `show-moved-dialog.ts`, `show-suspended-dialog.ts`: account状態dialog
- その他のTS module: user名、誕生日、環境、avatar decorationの表示変換

ログイン中accountのsession管理は `auth/` とアプリケーション基盤、初期profile設定はonboarding側が所有する。
