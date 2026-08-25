/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createDrizzleDatabase, createDrizzlePool } from '@/drizzle.js';
import { ad } from '@/db/schema/ad.js';
import {
	createAdInDatabase,
	deleteAdFromDatabase,
	fetchAdByIdFromDatabase,
	listActiveAdsFromDatabase,
	listAdsFromDatabase,
	updateAdInDatabase,
} from '@/core/AdStore.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';

describe('AdStore', () => {
	let pool: MiDrizzlePool;
	let db: MiDrizzleDatabase;

	beforeAll(() => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
	});

	afterAll(async () => {
		await pool.end();
	});

	beforeEach(async () => {
		await db.delete(ad);
	});

	afterEach(async () => {
		await db.delete(ad);
	});

	test('lists active ads for the current day', async () => {
		const now = Date.now();
		const currentDayOfWeek = 1 << new Date(now).getDay();
		const activeAd = await createAdInDatabase(db, {
			id: genId(now),
			expiresAt: new Date(now + 60_000),
			startsAt: new Date(now - 60_000),
			place: 'square',
			priority: 'middle',
			ratio: 1,
			url: 'https://example.com/active',
			imageUrl: 'https://example.com/active.png',
			memo: 'active',
			dayOfWeek: currentDayOfWeek,
			isSensitive: false,
		});
		await createAdInDatabase(db, {
			id: genId(now + 1),
			expiresAt: new Date(now - 1),
			startsAt: new Date(now - 60_000),
			place: 'square',
			priority: 'middle',
			ratio: 1,
			url: 'https://example.com/expired',
			imageUrl: 'https://example.com/expired.png',
			memo: 'expired',
			dayOfWeek: currentDayOfWeek,
			isSensitive: false,
		});
		await createAdInDatabase(db, {
			id: genId(now + 2),
			expiresAt: new Date(now + 60_000),
			startsAt: new Date(now + 60_000),
			place: 'square',
			priority: 'middle',
			ratio: 1,
			url: 'https://example.com/future',
			imageUrl: 'https://example.com/future.png',
			memo: 'future',
			dayOfWeek: currentDayOfWeek,
			isSensitive: false,
		});

		const ads = await listActiveAdsFromDatabase(db);

		expect(ads.map((x) => x.id)).toEqual([activeAd.id]);
	});

	test('updates, filters, and deletes ads', async () => {
		const now = Date.now();
		const activeAd = await createAdInDatabase(db, {
			id: genId(now),
			expiresAt: new Date(now + 60_000),
			startsAt: new Date(now - 60_000),
			place: 'square',
			priority: 'middle',
			ratio: 1,
			url: 'https://example.com/active',
			imageUrl: 'https://example.com/active.png',
			memo: 'active',
			dayOfWeek: 0,
			isSensitive: false,
		});
		const expiredAd = await createAdInDatabase(db, {
			id: genId(now + 1),
			expiresAt: new Date(now - 1),
			startsAt: new Date(now - 60_000),
			place: 'square',
			priority: 'middle',
			ratio: 1,
			url: 'https://example.com/expired',
			imageUrl: 'https://example.com/expired.png',
			memo: 'expired',
			dayOfWeek: 0,
			isSensitive: false,
		});

		const updatedAd = await updateAdInDatabase(db, activeAd.id, {
			ratio: 2,
			memo: 'updated',
			isSensitive: true,
		});

		expect(updatedAd?.ratio).toBe(2);
		expect(updatedAd?.memo).toBe('updated');
		expect(updatedAd?.isSensitive).toBe(true);

		await expect(
			listAdsFromDatabase(db, {
				limit: 10,
				publishing: true,
			}).then((ads) => ads.map((x) => x.id)),
		).resolves.toEqual([activeAd.id]);
		await expect(
			listAdsFromDatabase(db, {
				limit: 10,
				publishing: false,
			}).then((ads) => ads.map((x) => x.id)),
		).resolves.toEqual([expiredAd.id]);

		await deleteAdFromDatabase(db, activeAd.id);

		await expect(fetchAdByIdFromDatabase(db, activeAd.id)).resolves.toBeNull();
	});

	test('applies the cursor to all unpublished ads', async () => {
		const now = Date.now();
		const idBase = now - 10_000;
		const createAd = async (id: string, state: 'expired' | 'future') =>
			createAdInDatabase(db, {
				id,
				expiresAt: new Date(now + (state === 'expired' ? -60_000 : 120_000)),
				startsAt: new Date(now + (state === 'expired' ? -120_000 : 60_000)),
				place: 'square',
				priority: 'middle',
				ratio: 1,
				url: `https://example.com/${id}`,
				imageUrl: `https://example.com/${id}.png`,
				memo: state,
				dayOfWeek: 0,
				isSensitive: false,
			});

		const expiredInside = await createAd(genId(idBase), 'expired');
		const futureInside = await createAd(genId(idBase + 1), 'future');
		const cursor = genId(idBase + 2);
		await createAd(genId(idBase + 3), 'expired');
		await createAd(genId(idBase + 4), 'future');

		await expect(
			listAdsFromDatabase(db, {
				limit: 10,
				untilId: cursor,
				publishing: false,
			}).then((ads) => ads.map((x) => x.id)),
		).resolves.toEqual([futureInside.id, expiredInside.id]);
	});
});
