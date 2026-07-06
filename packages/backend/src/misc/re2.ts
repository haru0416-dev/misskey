/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// Bun ランタイムでは re2 (nan/node-gyp ベースのネイティブアドオン) が動作しないため、
// 純JS実装の re2js を ReDoS 耐性のある線形時間マッチャーとして使う。
import { RE2JS } from 're2js';

const ignoredFlags = new Set(['g', 'u', 'y']);
const flagMap = new Map([
	['i', RE2JS.CASE_INSENSITIVE],
	['m', RE2JS.MULTILINE],
	['s', RE2JS.DOTALL],
]);

function parseFlags(flags: string): number {
	let parsed = 0;
	const seen = new Set<string>();
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
	public readonly source: string;
	public readonly flags: string;
	#regexp: RE2JS;

	constructor(pattern: string | RegExp, flags = '') {
		if (pattern instanceof RegExp) {
			flags = flags || pattern.flags;
			pattern = pattern.source;
		}
		this.source = String(pattern);
		this.flags = String(flags);
		this.#regexp = RE2JS.compile(this.source, parseFlags(this.flags));
	}

	test(input: string): boolean {
		return this.#regexp.test(String(input));
	}

	toString(): string {
		return `/${this.source}/${this.flags}`;
	}
}
