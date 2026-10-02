# features

`features/` には、ユーザー機能ごとの縦割りのモジュールを置きます。配置の考え方は [`src/README.md`](../README.md) にあります。

各機能は、必要に応じて次のサブディレクトリを持ちます。

- `components/` その機能専用の Vue コンポーネント
- `core/` フレームワークに依存しない、中心の処理
- 機能に固有の処理のまとまり(`effects/`、`frame/` など)

機能の外から使う型や処理は、少数の安定した入口にまとめます。内部のファイルを import する必要があるときも、別の機能の内部の実装には依存しません。

## 機能の一覧

| 分野 | 機能 |
| --- | --- |
| アカウント | `auth`、`onboarding`、`user`、`role`、`invitation` |
| コンテンツ | `note`、`post-composer`、`media-viewer`、`link-preview`、`page-content`、`code`、`autocomplete` |
| 発見 | `search`、`channel`、`antenna`、`clip`、`gallery`、`flash` |
| コミュニケーション | `chat`、`notification`、`announcement`、`sound` |
| 絵文字と画像 | `custom-emoji`、`emoji-picker`、`image-editor`、`drive` |
| 管理 | `abuse-report`、`instance`、`chart`、`webhook`、`server-setup`、`admin-tool` |
| 拡張とプロジェクト | `extension`、`theme`、`support` |
| アプリの UI | `dynamic-form`、`ui-preview`、`cache-management` |

機能を足したり消したりしたときは、この表も更新します。
