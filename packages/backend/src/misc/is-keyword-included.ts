/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import RE2 from '@/misc/re2.js';

const regexpPattern = /^\/(.+)\/(.*)$/;

export function isKeywordIncluded(text: string, keywords: string[]): boolean {
	if (keywords.length === 0 || text === '') return false;

	return keywords.some((filter) => {
		const regexp = filter.match(regexpPattern);
		if (regexp == null) {
			return filter.split(' ').every((keyword) => text.includes(keyword));
		}

		try {
			const [, pattern, flags] = regexp;
			if (pattern == null || flags == null) return false;
			return new RE2(pattern, flags).test(text);
		} catch {
			return false;
		}
	});
}
