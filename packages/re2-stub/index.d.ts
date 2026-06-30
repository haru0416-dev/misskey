/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export default class RE2 {
	public readonly source: string;
	public readonly flags: string;
	public constructor(pattern: string | RegExp, flags?: string);
	public test(input: string): boolean;
	public toString(): string;
}
