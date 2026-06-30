/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { RE2JS } from 're2js';

const ignoredFlags = new Set(['g', 'u', 'y']);
const flagMap = new Map([
	['i', RE2JS.CASE_INSENSITIVE],
	['m', RE2JS.MULTILINE],
	['s', RE2JS.DOTALL],
]);

function parseFlags(flags) {
	let parsed = 0;
	const seen = new Set();
	for (const flag of flags) {
		if (seen.has(flag)) {
			throw new SyntaxError(`Duplicate regular expression flag: ${flag}`);
		}
		seen.add(flag);
		if (ignoredFlags.has(flag)) continue;
		const value = flagMap.get(flag);
		if (value == null) {
			throw new SyntaxError(`Invalid regular expression flag: ${flag}`);
		}
		parsed |= value;
	}
	return parsed;
}

export default class RE2 {
	#regexp;

	constructor(pattern, flags = '') {
		if (pattern instanceof RegExp) {
			flags = flags || pattern.flags;
			pattern = pattern.source;
		}
		this.source = String(pattern);
		this.flags = String(flags);
		this.#regexp = RE2JS.compile(this.source, parseFlags(this.flags));
	}

	test(input) {
		return this.#regexp.test(String(input));
	}

	toString() {
		return `/${this.source}/${this.flags}`;
	}
}
