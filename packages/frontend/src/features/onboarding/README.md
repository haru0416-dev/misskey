# Onboarding

ユーザーの初期profile設定と、主要操作を説明するtutorialをまとめたfeature。

- `components/MkUserSetupDialog*`: profile、privacy、follow候補、push通知の初期設定
- `components/MkTutorialDialog*`: timeline、投稿、CW、センシティブmediaのtutorial
- `tour.ts`: tutorialの開始条件と進行state

通常のuser閲覧・follow操作は `users/`、投稿機能は `post-composer/` が所有する。このfeatureは初回導線と段階的な説明だけを扱う。
