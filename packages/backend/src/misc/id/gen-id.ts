/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { genUuidv7 } from './uuidv7.js';

export function genId(time?: number): string {
	const t = !time || time > Date.now() ? Date.now() : time;

	return genUuidv7(t);
}
