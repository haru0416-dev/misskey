# Security Policy

## 脆弱性の報告 / Reporting a vulnerability

脆弱性を見つけた場合、**通常の Issue や Pull Request には書かないでください**。
修正がリリースされる前に詳細が公開され、稼働中のサーバーが危険に晒されます。

このリポジトリの [Security advisories](https://github.com/haru0416-dev/misskey/security/advisories/new) から
非公開で報告してください。

Please report vulnerabilities privately through this repository's
[Security advisories](https://github.com/haru0416-dev/misskey/security/advisories/new),
**not** through public Issues or Pull Requests.

報告に含めてほしい内容:

- 影響を受ける箇所 (エンドポイント / ファイル / バージョン)
- 再現手順、または再現コード
- 想定される影響 (情報漏洩・権限昇格・DoS 等)

修正パッチを併せて提示できる場合は、advisory から作成できる private fork 上で PR を作成してください。

## 対象範囲

このリポジトリのコードに起因する問題を対象とします。
upstream の [misskey-dev/misskey](https://github.com/misskey-dev/misskey) 由来のコードにも同じ問題がある場合、
upstream への報告は upstream の Security policy に従って別途行ってください (このリポジトリからは連絡しません)。

個別サーバーの運用設定に起因する問題は、そのサーバーの管理者へ連絡してください。
