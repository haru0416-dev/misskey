/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { Test } from '@nestjs/testing';
import { GlobalModule } from '@/GlobalModule.js';
import { DI } from '@/di-symbols.js';
import { ad } from '@/db/schema/ad.js';
import {
	createAdInDatabase,
	deleteAdFromDatabase,
	fetchAdByIdFromDatabase,
	listActiveAdsFromDatabase,
	listAdsFromDatabase,
	updateAdInDatabase,
} from '@/core/AdStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genAidx } from '@/misc/id/aidx.js';
import type { TestingModule } from '@nestjs/testing';

describe('AdStore', () => {
	let app: TestingModule;
	let db: MiDrizzleDatabase;

	beforeEach(async () => {
		app = await Test.createTestingModule({
			imports: [
				GlobalModule,
			],
		}).compile();

		app.enableShutdownHooks();

		db = app.get<MiDrizzleDatabase>(DI.drizzle);
		await db.delete(ad);
	});

	afterEach(async () => {
		await db.delete(ad);
		await app.close();
	});

	test('lists active ads for the current day', async () => {
		const now = Date.now();
		const currentDayOfWeek = 1 << new Date(now).getDay();
		const activeAd = await createAdInDatabase(db, {
			id: genAidx(now),
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
			id: genAidx(now + 1),
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
			id: genAidx(now + 2),
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

		expect(ads.map(x => x.id)).toEqual([activeAd.id]);
	});

	test('updates, filters, and deletes ads', async () => {
		const now = Date.now();
		const activeAd = await createAdInDatabase(db, {
			id: genAidx(now),
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
			id: genAidx(now + 1),
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

		await expect(listAdsFromDatabase(db, {
			limit: 10,
			publishing: true,
		}).then(ads => ads.map(x => x.id))).resolves.toEqual([activeAd.id]);
		await expect(listAdsFromDatabase(db, {
			limit: 10,
			publishing: false,
		}).then(ads => ads.map(x => x.id))).resolves.toEqual([expiredAd.id]);

		await deleteAdFromDatabase(db, activeAd.id);

		await expect(fetchAdByIdFromDatabase(db, activeAd.id)).resolves.toBeNull();
	});
});
