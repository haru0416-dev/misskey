/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Misskey from 'misskey-js';

// frontend の MkAvatar と embed の EmAvatar が、アバターデコレーションの配置を同じ見た目にするための計算。
// 既定値のときは undefined を返し、style 属性にプロパティを出さない。

type DecorationPlacement = Pick<
	Misskey.entities.UserDetailed['avatarDecorations'][number],
	'angle' | 'flipH' | 'offsetX' | 'offsetY'
>;

export function getDecorationAngle(decoration: DecorationPlacement): string | undefined {
	const angle = decoration.angle ?? 0;
	return angle === 0 ? undefined : `${angle * 360}deg`;
}

export function getDecorationScale(decoration: DecorationPlacement): string | undefined {
	const scaleX = decoration.flipH ? -1 : 1;
	return scaleX === 1 ? undefined : `${scaleX} 1`;
}

export function getDecorationOffset(decoration: DecorationPlacement): string | undefined {
	const offsetX = decoration.offsetX ?? 0;
	const offsetY = decoration.offsetY ?? 0;
	return offsetX === 0 && offsetY === 0 ? undefined : `${offsetX * 100}% ${offsetY * 100}%`;
}
