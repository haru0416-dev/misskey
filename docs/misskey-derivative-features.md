# Misskey派生リポジトリの機能比較

調査日: 2026-08-27

## 調査対象

- [monsier-oui/misskey](https://github.com/monsier-oui/misskey)
- [yuriha-chan/misskey](https://github.com/yuriha-chan/misskey)
- [ikaskey/misskey](https://github.com/ikaskey/misskey)
- [TORI-sabure/torikago-misskey](https://github.com/TORI-sabure/torikago-misskey)
- [mendakon/sushiski](https://github.com/mendakon/sushiski)
- [kiyo4act/misskey.design](https://github.com/kiyo4act/misskey.design)
- [Misskey-art/misskey](https://github.com/Misskey-art/misskey)
- [nocturne-project/oranski-nocturne](https://github.com/nocturne-project/oranski-nocturne)
- [shrimpia/misskey](https://github.com/shrimpia/misskey)
- [mistems/mistems](https://github.com/mistems/mistems/tree/mistems-main)
- [niri-la/misskey.niri.la](https://github.com/niri-la/misskey.niri.la)
- [atsu1125/misskey-v12](https://github.com/atsu1125/misskey-v12)

## 調査方法と注意点

各リポジトリについて、本家Misskeyとの共通祖先、固有コミット、現在のtree差分、実装ファイルを確認した。コミット件名だけでは機能と判定せず、現在の対象ブランチに残っている実装を基準にしている。

依存更新、翻訳、生成物、本家コミットのcherry-pickは、原則として派生固有機能から除外した。`atsu1125/misskey-v12`だけは現行`develop`ではなく、公式タグ`12.119.2`を比較基準としている。

既定ブランチが実際のカスタマイズ先とは限らない。特に次のリポジトリではブランチの区別が必要になる。

- `monsier-oui/misskey`: 雪機能は`develop`ではなく`snow`に存在する。
- `mendakon/sushiski`: 既定`deploy`には独自コミットがなく、機能の多くは未統合の実験ブランチにある。
- `kiyo4act/misskey.design`: 既定`master`ではなく`main`に独自機能がある。
- `mistems/mistems`: この文書ではURLで指定された`mistems-main`を対象とする。

## 概要

| 派生 | 主な方向性 | 独自性 | 本家追従負担 |
| --- | --- | --- | --- |
| monsier-oui | 季節UI演出 | 小 | 低。ただし実装が古い |
| yuriha-chan | チャット、検索、投稿、アカウントの総合拡張 | 非常に大 | 非常に高い |
| ikaskey | 連合の堅牢化、監視、配布運用 | 小 | 低 |
| Torikago | 相互関係、絵文字配慮、安心機能 | 中 | 低から中 |
| Sushiski | Misskey機能の実験ブランチ群 | 現在の本流は小 | 実験ごとに異なる |
| misskey.design | 共同描画、創作向けUI、AWS運用 | 大 | 高い |
| Misskey.art | 創作者向けの軽量UI拡張 | 小から中 | 低から中 |
| Oranski Nocturne | 3Dゲーム、経済、描画、質問箱 | 非常に大 | 非常に高い |
| Shrimpia | ローカル文化、リアクション、投稿UX | 大 | 高い |
| mistems | 検索、過去TL、DB性能実験 | 大 | 高い |
| misskey.niri.la | 独自連合TL、削除ノート管理、モデレーション | 大 | 高い |
| misskey-v12 | v12 LTS、セキュリティと運用backport | 大 | 継続的に高い |

## 派生別の機能

### monsier-oui/misskey

小規模な季節演出を追加した派生。ただし、機能は古い[`snow`](https://github.com/monsier-oui/misskey/tree/snow)ブランチだけにあり、現在の既定ブランチには統合されていない。

- 画面全体に雪を降らせる設定
- 3層の雪アニメーション
- 回転するロゴ演出
- 端末単位でのON/OFF保存

主な実装:

- [`SMSnow.vue`](https://github.com/monsier-oui/misskey/blob/snow/packages/frontend/src/components/sidemisskey/SMSnow.vue)
- [`universal.vue`](https://github.com/monsier-oui/misskey/blob/snow/packages/frontend/src/ui/universal.vue)
- [`general.vue`](https://github.com/monsier-oui/misskey/blob/snow/packages/frontend/src/pages/settings/general.vue)

現在は保守中の製品機能というより、2023年時点のUI実験に近い。

### yuriha-chan/misskey

Misskey本体を広範囲に拡張した総合派生。対象ブランチは[`yuriha-master`](https://github.com/yuriha-chan/misskey/tree/yuriha-master)。

#### チャット

- 投票、時限シークレット、カード配布
- 公開ルーム、定員、期限、アーカイブ
- kick、soft-leave、個別宛メッセージ
- 吹き出し色やルームイベントの追加

実装例:

- [`ChatService.ts`](https://github.com/yuriha-chan/misskey/blob/yuriha-master/packages/backend/src/core/ChatService.ts)
- [`feat-chatroom.md`](https://github.com/yuriha-chan/misskey/blob/yuriha-master/feat-chatroom.md)

チャットAPIのレスポンスをunion eventへ変更し、一部ページネーションも削除しているため、既存クライアントとの互換性に注意が必要になる。

#### 検索とフィルター

- HTL、LTL、自分宛ノートの検索
- Bot投稿の除外
- 外部TCPサービスを使う検索プリフィルター
- AND、関数、正規表現を扱うDSL形式の投稿フィルター

実装例:

- [`SearchService.ts`](https://github.com/yuriha-chan/misskey/blob/yuriha-master/packages/backend/src/core/SearchService.ts)
- [`SearchPrefilterService.ts`](https://github.com/yuriha-chan/misskey/blob/yuriha-master/packages/backend/src/core/SearchPrefilterService.ts)
- [`parse-filter.peg`](https://github.com/yuriha-chan/misskey/blob/yuriha-master/packages/backend/src/misc/parse-filter.peg)

#### 投稿とタイムライン

- R18投稿の自動判定とクライアント側の年齢確認
- 投稿後の公開範囲、`localOnly`、リアクション受け入れ設定の変更
- GTLのインスタンス単位ミュート
- 最近投稿したフォロー中ユーザー一覧
- ロール別メンション人数上限

#### アカウントと連合

- メインアカウントから作成するサブアカウント
- サブアカウントtokenの取得、再生成、削除
- リモート凍結アカウントの追跡とTL等からの除外
- パスワード再設定の遅延実行と取消

実装例:

- [`create-sub-account.ts`](https://github.com/yuriha-chan/misskey/blob/yuriha-master/packages/backend/src/server/api/endpoints/i/create-sub-account.ts)
- [`NoteUpdateVisibilityService.ts`](https://github.com/yuriha-chan/misskey/blob/yuriha-master/packages/backend/src/core/NoteUpdateVisibilityService.ts)

#### 表示とメディア

- MFMルビ構文
- Temmlによる数式表示
- 前景、背景、blend modeを持つ多層アバターデコレーション
- ドライブの種類別絞り込み
- 音声のミニプレイヤー
- 管理者が配布する推奨絵文字パレット

本家への移植時は、API、DB、ActivityPub配送、チャットデータモデルを再設計する必要があり、12派生の中でも移植難度が特に高い。

### ikaskey/misskey

利用者向け機能より、連合障害の回避、監視、コンテナ配布を重視する派生。

- ActivityPub Actorの`discoverable: null`を許容
- Sentry内部エラーへusername、host、アカウント状態等を付加
- GHCR向けDockerイメージの自動ビルド
- favicon、アイコン、splashのS3配信
- `2026.7.0-ikaskey`としてのバージョン識別

実装例:

- [`ApPersonService.ts`](https://github.com/ikaskey/misskey/blob/ikaskey/packages/backend/src/core/activitypub/models/ApPersonService.ts)
- [`ApiCallService.ts`](https://github.com/ikaskey/misskey/blob/ikaskey/packages/backend/src/server/api/ApiCallService.ts)
- [`build-image.yml`](https://github.com/ikaskey/misskey/blob/ikaskey/.github/workflows/build-image.yml)

本家との差分は小さいが、Sentryへ送る利用者情報の範囲と、`discoverable`が不明なActorを探索可能として扱う判断には注意が必要になる。

### TORI-sabure/torikago-misskey

相互フォロー関係と、リアクション時の配慮を重視する派生。

- 相互フォロー限定タイムライン
- 相互フォロー相手を示すノートバッジ
- 最大100件の「苦手な絵文字」登録
- 苦手絵文字で反応する際の警告
- 管理者による苦手絵文字の管理API
- ハッシュタグ専用検索タブ
- 新規利用者の投稿公開範囲を`home`に変更
- モデレーターがセンシティブ指定した画像の専用警告
- iOSチャット入力欄の表示修正

実装例:

- [`notes/timeline.ts`](https://github.com/TORI-sabure/torikago-misskey/blob/develop/packages/backend/src/server/api/endpoints/notes/timeline.ts)
- [`use-mutual-relation.ts`](https://github.com/TORI-sabure/torikago-misskey/blob/develop/packages/frontend/src/composables/use-mutual-relation.ts)
- [`notes/reactions/create.ts`](https://github.com/TORI-sabure/torikago-misskey/blob/develop/packages/backend/src/server/api/endpoints/notes/reactions/create.ts)

苦手絵文字は強制禁止ではなく、警告後に上書きできる設計になっている。

### mendakon/sushiski

現在の既定`deploy`ブランチには独自コミットがなく、実際にはMisskey機能の実験ブランチを多数保持するリポジトリとしての性格が強い。

未統合または歴史的な実験:

- リアクション、Renote通知のグルーピング
- GraphQL APIの試作
- リモートユーザー解決時のOutbox取得
- ActivityPubノートのURLプレビュー表示
- 凍結アカウントの読み取り専用アクセス
- push/fanout型タイムライン
- ページ復帰時のページネーション、スクロール復元
- OAuth2/OIDCプロバイダー
- Docker Composeとnginxの配備構成

参照ブランチ:

- [`notification-grouping`](https://github.com/mendakon/sushiski/tree/notification-grouping)
- [`graphql`](https://github.com/mendakon/sushiski/tree/graphql)
- [`tl-push`](https://github.com/mendakon/sushiski/tree/tl-push)
- [`oauth2orize`](https://github.com/mendakon/sushiski/tree/oauth2orize)

これらをSushiskiの現在の配備機能として扱うことはできない。古い本家実験ブランチのミラーも含まれている。

### kiyo4act/misskey.design

共同制作とデザイン用途に特化した派生。独自機能は既定`master`ではなく[`main`](https://github.com/kiyo4act/misskey.design/tree/main)にある。

#### 共同お絵かき

- DM、チャットルーム内でのリアルタイム共同描画
- ペン、消しゴム、塗り、水彩、ミキサー、エアブラシ、テキスト
- 筆圧、複数レイヤー、undo、cursor、presence
- PNG保存、再開、ダウンロード

実装例:

- [`ChatDrawingService.ts`](https://github.com/kiyo4act/misskey.design/blob/main/packages/backend/src/core/ChatDrawingService.ts)
- [`drawing-canvas.vue`](https://github.com/kiyo4act/misskey.design/blob/main/packages/frontend/src/pages/chat/drawing-canvas.vue)

キャンバスは約6,000行あり、Redis上のlive buffer、画像サイズ、WebSocket権限検査を含めて保守負担が大きい。

#### その他の機能

- 画像投稿だけを表示するメディアタイムライン
- `漢字《かんじ》`形式のルビ表示
- 猫ユーザーの「にゃ」変換を無効化
- 動画、音声の右クリックとdownload UIの抑止
- 通報対象ユーザーを開いた際にDriveを初期表示
- 二次創作向け通報案内
- クリップ一覧のデフォルト取得数を100件へ増加
- リモートノート清掃のDB負荷調整
- `/api/stats`の高負荷なリアクション集計を削除
- AWS ECS/CodeDeployによるBlue-Green配備

### Misskey-art/misskey

創作者向けの軽量なUI、運営機能を追加する派生。

- 運営のお知らせへの絵文字リアクション
- CWまたは画像添付時の投稿ルール案内
- センシティブ画像のBlurHash表示改善
- Cookie Clickerのプリンクリッカー化
- favicon、アプリアイコン、About画面、サービスリンクの独自化

実装例:

- [`AnnouncementReactionService.ts`](https://github.com/Misskey-art/misskey/blob/art/main/packages/backend/src/core/AnnouncementReactionService.ts)
- [`MkAnnouncementReactions.vue`](https://github.com/Misskey-art/misskey/blob/art/main/packages/frontend/src/components/MkAnnouncementReactions.vue)
- [`MkPostForm.vue`](https://github.com/Misskey-art/misskey/blob/art/main/packages/frontend/src/components/MkPostForm.vue)

過去にメディアタイムラインも導入されていたが、現在は削除済み。連合や投稿モデルへの侵襲は比較的小さい。

### nocturne-project/oranski-nocturne

Misskeyを土台として別サービス級の機能を実装した派生。

#### Noctown

- 3Dマップとリアルタイム移動
- NPC、動物、ペット
- クエスト、農業、収穫、釣り
- 家、ワールドオブジェクト、アイテム制作と設置
- 店舗、ガチャ、掲示板、ランキング
- モバイル向け仮想ジョイスティック

実装例:

- [`pages/noctown/`](https://github.com/nocturne-project/oranski-nocturne/tree/develop/packages/frontend/src/pages/noctown)
- [`endpoints/noctown/`](https://github.com/nocturne-project/oranski-nocturne/tree/develop/packages/backend/src/server/api/endpoints/noctown)

#### 経済

- 通貨とウォレット
- アイテム所有権
- 利用者間取引
- 店舗とガチャ
- 取引ログと通知

実装例:

- [`trade/execute.ts`](https://github.com/nocturne-project/oranski-nocturne/blob/develop/packages/backend/src/server/api/endpoints/noctown/trade/execute.ts)

#### 描画

- 匿名マッチング型のランダム絵チャット
- ソロモード、リアルタイム描画、テキストチャット
- 季節別のお題、通報、同意後のbot投稿
- 通常チャットルーム内の共同描画
- レイヤー、undo/redo、筆圧、Apple Pencil、ズーム

実装例:

- [`paint-chat.ts`](https://github.com/nocturne-project/oranski-nocturne/blob/develop/packages/backend/src/server/api/stream/channels/paint-chat.ts)
- [`PaintChatCanvasService.ts`](https://github.com/nocturne-project/oranski-nocturne/blob/develop/packages/backend/src/core/PaintChatCanvasService.ts)
- [`room.drawing.vue`](https://github.com/nocturne-project/oranski-nocturne/blob/develop/packages/frontend/src/pages/chat/room.drawing.vue)

#### その他

- 匿名または名前付き質問箱「Noqestion」
- 画像、カード、NGワード、専用ミュート、通報
- イラストギャラリーとタグランキング
- Pagesの`public`、URL限定、フォロワー限定、指定ユーザー限定公開
- 凍結理由保存、全フォロー解除等の管理機能

Noctownだけでも独立ゲームに近い規模であり、本家追従負担は非常に大きい。Noqestionの暗号化は、パスワードから同じ鍵を再現できない可能性があり、暗号機能として利用する前に再設計が必要になる。

### shrimpia/misskey

ローカル文化とリアクション体験を強く作り込んだ派生。

#### リアクション

- カスタム絵文字ごとの再生音と音量
- 音源ライセンス情報の管理
- 絵文字への`isHarmful`属性
- 投稿者によるトゲのある絵文字リアクションの拒否

実装例:

- [`EmojiSoundService.ts`](https://github.com/shrimpia/misskey/blob/empire/packages/backend/src/core/EmojiSoundService.ts)
- [`ReactionService.ts`](https://github.com/shrimpia/misskey/blob/empire/packages/backend/src/core/ReactionService.ts)

#### 投稿

- 通知やreply関係を作らないエアリプ
- 他人の投稿内容を複製する「パクる」
- コピー後に編集する「編集してパクる」
- 特定URLやpure Renoteの連投抑止

実装例:

- [`steal-menu.ts`](https://github.com/shrimpia/misskey/blob/empire/packages/frontend/src/utility/steal-menu.ts)
- [`NoteCreateService.ts`](https://github.com/shrimpia/misskey/blob/empire/packages/backend/src/core/NoteCreateService.ts)

#### タイムラインとメディア

- Bot投稿の除外
- HTLのローカルユーザー限定表示
- ハイライトタイムライン
- ドライブファイルのメディア種別、登録期間フィルター

#### コミュニティ機能

- 運営記事、イベント、ヒントを表示するShrimpia Headline
- 外部Shrimpia Portal APIからのイベント取得
- アバターをリアルタイムで「なでなで」するWebSocket機能
- 公開範囲ごとの投稿フォーム色分け

ローカル機能の多くはActivityPubを変更せず、未対応クライアントでは表示されない形で追加されている。

### mistems/mistems

検索、過去タイムライン、DB性能を中心に実験する派生。対象は[`mistems-main`](https://github.com/mistems/mistems/tree/mistems-main)。

#### 投稿とタイムライン

- 投稿フォームからのチャンネル選択
- CWと本文の交換
- 長文をUTF-8ファイルとして添付
- センシティブワード投稿警告
- 指定時刻へ移動して0.5倍から100倍で再生するタイムマシン
- ロールによるタイムマシンの利用可否と遡及範囲の制御

実装例:

- [`MkPostForm.vue`](https://github.com/mistems/mistems/blob/mistems-main/packages/frontend/src/components/MkPostForm.vue)
- [`use-timemachine.ts`](https://github.com/mistems/mistems/blob/mistems-main/packages/frontend/src/composables/use-timemachine.ts)
- [`timeshiftPaginator.ts`](https://github.com/mistems/mistems/blob/mistems-main/packages/frontend/src/utility/timeshiftPaginator.ts)

タイムマシンは通常のページングとstreamingを組み合わせる方式であり、削除済み投稿や遅延到着を含む完全な過去状態の再現ではない。

#### 検索

- 日付範囲
- CWを含む検索
- ユーザー、チャンネル、ホスト
- 添付ファイルの有無
- PGroonga複合式インデックス
- 検索timeoutとJIT制御

実装例:

- [`SearchService.ts`](https://github.com/mistems/mistems/blob/mistems-main/packages/backend/src/core/SearchService.ts)

#### UIとリアクション

- 最大5,000件の全チャンネル一覧
- ハッシュタグ長押し、右クリックからのミュート
- 絵文字検索のひらがな、カタカナ正規化
- 絵文字tooltipへの読み、ライセンス、センシティブ属性表示
- リアクション数による青ふぁぼ、赤ふぁぼ

#### 性能と運用

- ホームTL DB fallbackの`LATERAL` query化
- リモートノート削除カーソルのRedis保存
- timeout時のbatch縮小とID窓スキップ
- Fanout Timeline切替時のデータプレーン停止とRedis purge
- chart resync、webhook、fetch errorの診断強化

### niri-la/misskey.niri.la

独自連合タイムラインと強いモデレーション機能を持つ派生。

#### VRTLとVSTL

- ぶいみみリレー参加サーバーのpublic投稿を集約するVRTL
- VRTLとホームTLを混ぜたVSTL
- REST、streaming、FTTL、NodeInfo対応
- ロールによる利用可否制御

実装例:

- [`VmimiRelayTimelineService.ts`](https://github.com/niri-la/misskey.niri.la/blob/develop/packages/backend/src/core/VmimiRelayTimelineService.ts)
- [`vmimi-relay-timeline.ts`](https://github.com/niri-la/misskey.niri.la/blob/develop/packages/backend/src/server/api/endpoints/notes/vmimi-relay-timeline.ts)

参加サーバー一覧を外部`relay.virtualkemomimi.net`から取得するため、外部サービスの停止や誤登録がTL境界へ影響する。

#### 投稿と連合

- 日時指定の過去タイムライン
- 管理者による公開ノート、純Renoteの`home`化
- 未知のリモートユーザーからのmention、reply、quote拒否
- 削除済みノートのID、URI、reply、renote関係の保存
- 削除されたリモートノートの復活防止

実装例:

- [`past-timeline-window.ts`](https://github.com/niri-la/misskey.niri.la/blob/develop/packages/frontend/src/utility/past-timeline-window.ts)
- [`note-public-to-home.ts`](https://github.com/niri-la/misskey.niri.la/blob/develop/packages/backend/src/server/api/endpoints/admin/note-public-to-home.ts)
- [`DeletedNote.ts`](https://github.com/niri-la/misskey.niri.la/blob/develop/packages/backend/src/models/DeletedNote.ts)

#### アカウントとモデレーション

- 退会時のユーザー情報、メール、サインイン履歴、ロール、ポリシーのJSON保存
- ロールによるアイコン、バナー変更制限
- センシティブチャンネル
- ユーザーページでのセンシティブ投稿折り畳み
- ノート投稿のsystem webhook送信

退会ログは高感度な個人情報を退会後も保持する。保存期限や自動削除が確認できないため、データ保持方針とアクセス制御が重要になる。

#### メディア

- 画像ごとに1125pxから8192pxまたは無制限を選択
- ロスレス画像と非可逆圧縮の分離

### atsu1125/misskey-v12

公式`12.119.2`を2026年まで保守するLTS派生。独自機能と、後年の本家からのbackportを分けて評価する必要がある。

#### 独自機能

- Limited Timeline
- Media Timeline
- Personal Timeline
- 利用者によるLTL、GTL、Media、Personal、Limited TLの非表示
- MFM全体の無効化
- 検索、アンテナ処理の停止設定
- 管理画面の詳細情報、危険操作を隠すSudo表示
- モデレーション通知
- 全ファイル削除、全ユーザー削除、全フォロー解除
- 正規表現による通報の自動分類と転送
- 配送ホストの自動制御とcircuit breaker
- 遅延Inboxキュー
- メールドメインブロック

実装例:

- [`limited-timeline.ts`](https://github.com/atsu1125/misskey-v12/blob/v12fix/packages/backend/src/server/api/endpoints/notes/limited-timeline.ts)
- [`delete-instance-users.ts`](https://github.com/atsu1125/misskey-v12/blob/v12fix/packages/backend/src/server/api/endpoints/admin/delete-instance-users.ts)
- [`abuse-report-resolver/create.ts`](https://github.com/atsu1125/misskey-v12/blob/v12fix/packages/backend/src/server/api/endpoints/admin/abuse-report-resolver/create.ts)

#### 機能backport

- 2FAバックアップコードと管理者リセット
- Argon2パスワード
- ハードミュート
- inboundノート編集
- ActivityPub画像のwidth、height
- センシティブ添付反映
- suspended、silencedユーザーのTL、通知除外
- アンテナからの個別ノート除去
- movedTo表示等の連合互換対応

#### セキュリティbackport

- LD-Signature関連の脆弱性修正
- ActivityPub object、activity検証の強化
- SSRFとPrivate IPアクセス対策
- redirect先hostの検証
- poll update spoofingと負数票の防止
- Streaming接続数制限
- InboxとJSON応答のサイズ制限
- SQL LIKE escape、外部URL validation、AiScript API境界修正

#### ランタイムと依存保守

- Node 14から22までの段階更新
- TypeORM、Sharp、WebSocket、sanitize-html、nodemailer等の更新
- jemalloc採用
- queueデータの事前JSONシリアライズ

LTSとして積極的に保守されているが、古いTypeORM世代へ新しい修正を手作業で移植するため、本家との差と保守コストは時間とともに増える。

## 横断比較

### 多くの派生に共通する改造

- タイムラインの追加と絞り込み
- 絵文字リアクションの制御
- センシティブ投稿の表示改善
- 創作物や画像を発見しやすくするUI
- モデレーター向け一括操作
- リモートノート清掃やタイムラインqueryの性能改善
- インスタンス固有のブランドとコミュニティ導線

### 特に独自性が高い機能

1. NocturneのNoctown、経済、共同描画
2. yurihaのチャットルーム、DSLフィルター、サブアカウント
3. mistemsの過去タイムライン再生とPGroonga検索
4. niri.laのVRTL、VSTLと削除ノート保持
5. Shrimpiaのサウンドリアクションとなでなで
6. misskey.designのチャット共同描画
7. Torikagoの苦手絵文字と相互フォロータイムライン

### 比較的独立して移植しやすい候補

- お知らせリアクション
- ハッシュタグからのミュート導線
- ハッシュタグ検索タブ
- 相互フォローバッジ
- 投稿フォーム上のルール案内
- センシティブ画像の表示改善
- ドライブの種類、期間フィルター

ただし、独立して見える機能でも、現在の本家のコンポーネント構造、API schema、設定保存方式へ合わせた再実装が必要になる。

### 移植時に再設計が必要な機能

- Noctownと独自経済
- yurihaのチャットルーム
- サブアカウント
- 投稿後の公開範囲変更
- VRTLとVSTL
- 削除ノート保持
- タイムマシン
- 共同描画
- 独自検索サービスとPGroonga検索

これらはDB schema、migration、API、streaming、権限検査、連合動作、障害復旧を横断するため、単純なcherry-pickではなく現行本家向けの設計が必要になる。

## まとめ

派生ごとの性格は次のように整理できる。

- **コミュニティUX型**: Torikago、Shrimpia、Misskey.art
- **総合機能拡張型**: yuriha-chan、misskey.niri.la
- **創作ツール型**: misskey.design、Misskey.art、Nocturne
- **独自サービス型**: Nocturne
- **検索、性能実験型**: mistems
- **運用特化型**: ikaskey
- **LTS保守型**: misskey-v12
- **実験ブランチ集約型**: Sushiski
- **小規模UI実験型**: monsier-oui

本家への取り込み候補を選ぶ場合は、機能の魅力だけでなく、現在の対象ブランチへ統合済みか、連合互換性を変えるか、DB migrationを必要とするか、外部サービスへ依存するかを分けて評価する必要がある。
