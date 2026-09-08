---
description: Misskey の変更を返す前の検証を手動で開始する。
argument-hint: "[変更範囲]"
---

# /quality-gate

[shipping-misskey-change](../skills/shipping-misskey-change/SKILL.md) を適用する。引数は変更範囲の指定であり、共通の安全条件や必要な通信・DB・UI 検証を省く指定ではない。

既に同じ変更状態で得た検証結果は使い回し、未実行の対象だけを実行する。結果、適用外の理由、未確認事項は shipping の完了報告にまとめる。この入口独自の pipeline や合格基準は設けない。
