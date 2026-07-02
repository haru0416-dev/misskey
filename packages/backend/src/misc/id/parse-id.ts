/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Config } from '@/config.js';
import { parseAid } from './aid.js';
import { parseAidx } from './aidx.js';
import { parseMeid } from './meid.js';
import { parseMeidg } from './meidg.js';
import { parseObjectId } from './object-id.js';
import { parseUlid } from './ulid.js';

export function parseId(config: Pick<Config, 'id'>, id: string): { date: Date; } {
	switch (config.id.toLowerCase()) {
		case 'aid': return parseAid(id);
		case 'aidx': return parseAidx(id);
		case 'objectid': return parseObjectId(id);
		case 'meid': return parseMeid(id);
		case 'meidg': return parseMeidg(id);
		case 'ulid': return parseUlid(id);
		default: throw new Error('unrecognized id generation method');
	}
}
