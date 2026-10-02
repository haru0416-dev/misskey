# スラッシュコマンド

利用者が `/` で明示して呼び出すコマンドを置く。

| コマンド | 内容 |
| --- | --- |
| [quality-gate](quality-gate.md) | 指定した変更範囲の検証を、[shipping-misskey-change](../skills/shipping-misskey-change/SKILL.md) の条件に従って実行する |
| [harness-audit](harness-audit.md) | 指示と Skill の元になる文書、参照、読み込みの経路、現在の実装との食い違いを調べる |

共通の方針は [AGENTS.md](../../AGENTS.md)、作業別の指示は [Skills](../skills/README.md) にある。コマンドごとに別の手順を設けず、検証の代わりになる主観的な点数も作らない。

コマンドは、利用者が呼び出したときだけ始める。対象は引数で指定する。外部への送信や DB の変更を伴う場合は、許可と専用の環境を先に確かめる。すでに実行した検査を理由なく繰り返さず、実際の結果と未確認の事項を分けて報告する。
