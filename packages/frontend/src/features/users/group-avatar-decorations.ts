/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

type AvatarDecorationBase = { category?: string | null | undefined };

/**
 * アバターデコレーションをカテゴリごとにグループ化します。
 * @param decorations アバターデコレーションの配列
 * @returns カテゴリごとにグループ化されたアバターデコレーションオブジェクト
 */
export function groupAvatarDecorations<T extends AvatarDecorationBase>(decorations: T[]) {
	const grouped: Record<string, T[]> = {};

	for (const decoration of decorations) {
		const category = decoration.category ?? '';
		const group = grouped[category] ?? [];
		group.push(decoration);
		grouped[category] = group;
	}

	return grouped;
}
