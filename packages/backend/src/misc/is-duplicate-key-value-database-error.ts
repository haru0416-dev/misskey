/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function isDuplicateKeyValueDatabaseError(error: unknown): boolean {
	let current: unknown = error;

	for (let i = 0; i < 5 && current != null && typeof current === 'object'; i++) {
		const candidate = current as {
			code?: unknown;
			cause?: unknown;
			driverError?: unknown;
		};

		if (candidate.code === '23505') {
			return true;
		}

		current = candidate.driverError ?? candidate.cause;
	}

	return false;
}
