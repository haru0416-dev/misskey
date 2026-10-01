-- 廃止した実績通知の受信設定を、各利用者の通知設定から取り除く。
UPDATE "user_profile" SET "notificationRecieveConfig" = "notificationRecieveConfig" - 'achievementEarned' WHERE "notificationRecieveConfig" ? 'achievementEarned';
