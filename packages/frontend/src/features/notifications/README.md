# Notifications

通知の表示、stream受信、絞り込み、Web Push許可UIをまとめたfeature。

- `components/MkNotification.vue`: 通知種別ごとの表示
- `components/MkStreamingNotificationsTimeline.vue`: paginationとstreamを統合した通知timeline
- `components/MkNotificationSelectWindow.vue`: 通知種別filter
- `components/MkPushNotificationAllowButton.vue`: Web Push subscriptionの設定

OS通知への変換とservice worker連携はアプリケーション基盤が所有し、このfeatureは画面上の通知閲覧と設定だけを扱う。
