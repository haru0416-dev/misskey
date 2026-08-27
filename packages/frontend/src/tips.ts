/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { store } from '@/store.js';

export const TIPS = [
	'drive',
	'uploader',
	'postFormUploader',
	'clips',
	'userLists',
	'postForm',
	'postFormServerRules',
	'deck',
	'tl.home',
	'tl.local',
	'tl.social',
	'tl.global',
	'abuses',
] as const;

export function closeTip(tip: (typeof TIPS)[number]) {
	store.set('tips', {
		...store.tips,
		[tip]: true,
	});
}

export function resetAllTips() {
	store.set('tips', {});
}

export function hideAllTips() {
	const v = {} as Record<(typeof TIPS)[number], boolean>;
	for (const k of TIPS) {
		v[k] = true;
	}
	store.set('tips', v);
}
