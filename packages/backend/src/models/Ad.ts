/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export class MiAd {
	public id: string;

	public expiresAt: Date;

	public startsAt: Date;

	public place: string;

	public priority: string;

	public ratio: number;

	public url: string;

	public imageUrl: string;

	public memo: string;

	public dayOfWeek: number;

	public isSensitive: boolean;

	constructor(data: Partial<MiAd>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}
