/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { ulid } from 'ulid';
import type { Config } from '@/config.js';
import { genAid } from './aid.js';
import { genAidx } from './aidx.js';
import { genMeid } from './meid.js';
import { genMeidg } from './meidg.js';
import { genObjectId } from './object-id.js';
import { genUuidv7 } from './uuidv7.js';

export function genId(config: Pick<Config, 'id'>, time?: number): string {
	const t = (!time || (time > Date.now())) ? Date.now() : time;

	switch (config.id.toLowerCase()) {
		case 'aid': return genAid(t);
		case 'aidx': return genAidx(t);
		case 'meid': return genMeid(t);
		case 'meidg': return genMeidg(t);
		case 'ulid': return ulid(t);
		case 'objectid': return genObjectId(t);
		case 'uuidv7': return genUuidv7(t);
		default: throw new Error('unrecognized id generation method');
	}
}
