/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { Config } from '@/config.js';
import { isSafeAidT, parseAidFull } from '@/misc/id/aid.js';
import { isSafeAidxT, parseAidxFull } from '@/misc/id/aidx.js';
import { isSafeMeidT, parseMeidFull } from '@/misc/id/meid.js';
import { isSafeMeidgT, parseMeidgFull } from '@/misc/id/meidg.js';
import { isSafeObjectIdT, parseObjectIdFull } from '@/misc/id/object-id.js';
import { bindThis } from '@/decorators.js';
import { parseUlidFull } from '@/misc/id/ulid.js';
import { isSafeUuidv7T, parseUuidv7Full } from '@/misc/id/uuidv7.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';

@Injectable()
export class IdService {
	private method: string;

	constructor(
		@Inject(DI.config)
		private config: Config,
	) {
		this.method = config.id.toLowerCase();
	}

	@bindThis
	public isSafeT(t: number): boolean {
		switch (this.method) {
			case 'aid': return isSafeAidT(t);
			case 'aidx': return isSafeAidxT(t);
			case 'meid': return isSafeMeidT(t);
			case 'meidg': return isSafeMeidgT(t);
			case 'ulid': return t > 0;
			case 'objectid': return isSafeObjectIdT(t);
			case 'uuidv7': return isSafeUuidv7T(t);
			default: throw new Error('unrecognized id generation method');
		}
	}

	/**
	 * 時間を元にIDを生成します(省略時は現在日時)
	 * @param time 日時
	 */
	@bindThis
	public gen(time?: number): string {
		return genId(this.config, time);
	}

	@bindThis
	public parse(id: string): { date: Date; } {
		return parseId(this.config, id);
	}

	// Note: additional is at most 64 bits
	@bindThis
	public parseFull(id: string): { date: number; additional: bigint; } {
		switch (this.method) {
			case 'aid': return parseAidFull(id);
			case 'aidx': return parseAidxFull(id);
			case 'objectid': return parseObjectIdFull(id);
			case 'meid': return parseMeidFull(id);
			case 'meidg': return parseMeidgFull(id);
			case 'ulid': return parseUlidFull(id);
			case 'uuidv7': return parseUuidv7Full(id);
			default: throw new Error('unrecognized id generation method');
		}
	}
}
