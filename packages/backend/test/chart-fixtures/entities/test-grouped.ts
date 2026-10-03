/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { schemaToEntity } from '@/core/chart/core.js';

export const name = 'testGrouped';

export const schema = {
	'foo.total': { accumulate: true },
	'foo.inc': {},
	'foo.dec': {},
} as const;

export const entity = schemaToEntity(name, schema, true);
