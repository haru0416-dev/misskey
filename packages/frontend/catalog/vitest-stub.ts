/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/**
 * カタログは story の play を実行しないので、vitest をブラウザへ持ち込まずに済ませる。
 * (play は `bun run --filter frontend test:stories` 側で本物の vitest から実行される)
 */
function unavailable(): never {
	throw new Error('カタログでは vitest の expect を実行できません。play の検証はテスト側で行ってください。');
}

export const expect = Object.assign(unavailable, { extend: (): void => {} });
