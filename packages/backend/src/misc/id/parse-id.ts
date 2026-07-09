/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { parseUuidv7 } from './uuidv7.js';

export function parseId(id: string): { date: Date; } {
	return parseUuidv7(id);
}
