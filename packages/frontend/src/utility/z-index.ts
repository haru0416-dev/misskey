/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// 重なり順の帯。同じ帯の中では、後から開いたものほど上に来る。
const zIndexes = {
	veryLow: 500_000,
	low: 1_000_000,
	middle: 2_000_000,
	high: 3_000_000,
};

export type ZIndexPriority = keyof typeof zIndexes;

export function claimZIndex(priority: ZIndexPriority = 'low'): number {
	zIndexes[priority] += 100;
	return zIndexes[priority];
}
