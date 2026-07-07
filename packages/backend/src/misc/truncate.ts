/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const segmenter = new Intl.Segmenter();

export function truncate(input: string, size: number): string;
export function truncate(input: string | undefined, size: number): string | undefined;
export function truncate(input: string | undefined, size: number): string | undefined {
	if (!input) {
		return input;
	}

	let result = '';
	let count = 0;
	for (const { segment } of segmenter.segment(input)) {
		if (count >= size) break;
		count++;
		result += segment;
	}
	return result;
}
