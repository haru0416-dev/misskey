/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// REPRO: admin/ad/list.ts の publishing:false ページネーションで未開始広告が毎ページ重複する。
// upstream develop の実ソース (endpoints/admin/ad/list.ts:57 + core/QueryService.ts の makePaginationQuery)
// を忠実に再現する。
process.env.NODE_ENV = 'test';

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { DataSource } from 'typeorm';
import { loadConfig } from '@/config.js';
import { MiAd } from '@/models/Ad.js';
import { genAidx } from '@/misc/id/aidx.js';
import type { Repository } from 'typeorm';

describe('REPRO upstream #8 admin/ad/list publishing:false pagination', () => {
	let db: DataSource;

	beforeAll(async () => {
		const config = loadConfig();
		db = new DataSource({
			type: 'postgres',
			host: config.db.host,
			port: config.db.port,
			username: config.db.user,
			password: config.db.pass,
			database: config.db.db,
			synchronize: true,
			dropSchema: true,
			entities: [MiAd],
		});
		await db.initialize();
	});

	afterAll(async () => {
		await db.destroy();
	});

	beforeEach(async () => {
		await db.getRepository(MiAd).clear();
	});

	// endpoints/admin/ad/list.ts の該当ロジックを忠実に再現:
	//   const query = makePaginationQuery(adsRepository.createQueryBuilder('ad'), sinceId, untilId, ...);
	//   } else if (ps.publishing === false) {
	//     query.andWhere('ad.expiresAt <= :now', { now }).orWhere('ad.startsAt > :now', { now });
	//   }
	//   const ads = await query.limit(ps.limit).getMany();
	function buildPublishingFalseQuery(repo: Repository<MiAd>, untilId: string | null, now: Date, limit: number) {
		const query = repo.createQueryBuilder('ad');
		// QueryService.makePaginationQuery(untilId) 相当 (core/QueryService.ts:16-)
		if (untilId != null) {
			query.andWhere('ad.id < :untilId', { untilId });
		}
		query.orderBy('ad.id', 'DESC');
		// admin/ad/list.ts:57 (publishing === false) — 実ソースそのまま
		query.andWhere('ad.expiresAt <= :now', { now }).orWhere('ad.startsAt > :now', { now });
		return query.limit(limit);
	}

	test('未開始(startsAt>now)広告が publishing:false の 2 ページ目に重複しないこと', async () => {
		const repo = db.getRepository(MiAd);
		const base = Date.now();
		// 未開始 (startsAt が未来) の広告 4 件 = "publishing:false"
		for (let i = 0; i < 4; i++) {
			await repo.insert({
				id: genAidx(base + i),
				startsAt: new Date(base + 3_600_000),
				expiresAt: new Date(base + 7_200_000),
				place: 'square',
				priority: 'middle',
				ratio: 1,
				url: `https://example.com/${i}`,
				imageUrl: `https://example.com/${i}.png`,
				memo: `scheduled-${i}`,
				dayOfWeek: 0,
				isSensitive: false,
			});
		}
		const now = new Date();

		const page1 = await buildPublishingFalseQuery(repo, null, now, 2).getMany();
		const untilId = page1[page1.length - 1]!.id;

		const page2q = buildPublishingFalseQuery(repo, untilId, now, 2);
		// 報告の決め手: 生成される WHERE 句 (カーソルが OR で括られていない)
		// eslint-disable-next-line no-console
		console.log('[#8] page2 SQL:', page2q.getQuery());
		const page2 = await page2q.getMany();

		const overlap = page2.filter((a) => page1.some((p) => p.id === a.id)).map((a) => a.memo);
		// eslint-disable-next-line no-console
		console.log(
			'[#8] page1:',
			page1.map((a) => a.memo),
			'| page2:',
			page2.map((a) => a.memo),
			'| overlap:',
			overlap,
		);

		// 正: 2 ページ目は 1 ページ目と重複しない
		expect(overlap).toEqual([]);
	});
});
