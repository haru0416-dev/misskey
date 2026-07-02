/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { isDuplicateKeyValueDatabaseError } from './is-duplicate-key-value-database-error.js';

export function isDuplicateKeyValueError(error: unknown): boolean {
	return isDuplicateKeyValueDatabaseError(error);
}
