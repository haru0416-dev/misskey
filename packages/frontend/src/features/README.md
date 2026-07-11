# Feature modules

`features/` はユーザー機能ごとの縦割り構造を置く。

各featureは必要に応じて次のサブディレクトリを持つ。

- `components/`: feature専用Vue components
- `core/`: frameworkに依存しない中心ロジック
- feature固有の処理群 (`effects/`, `frame/` など)

feature外から利用する型や処理は、安定した少数の入口へ寄せる。内部ファイルへのimportが必要な場合でも、別featureの内部実装へ依存しない。

## Feature index

| Area | Features |
| --- | --- |
| Account | `auth`, `onboarding`, `users`, `roles`, `invitations` |
| Content | `notes`, `post-composer`, `media-viewer`, `link-preview`, `page-content`, `code`, `autocomplete` |
| Discovery | `search`, `channels`, `antennas`, `clips`, `gallery`, `flash` |
| Communication | `chat`, `notifications`, `announcements`, `sound` |
| Emoji and images | `custom-emojis`, `emoji-picker`, `image-editor`, `drive` |
| Administration | `abuse-reports`, `instances`, `charts`, `webhooks`, `server-setup`, `admin-tools` |
| Extensions and project | `extensions`, `themes`, `achievements`, `support` |
| Application UI | `dynamic-form`, `ui-preview`, `cache-management` |
