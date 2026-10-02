/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import type { Config } from '@/config.js';
import { createBunSqlDatabase, createBunSqlClient } from '@/db/bun-sql.js';
import type { SQL as NativeSqlClient } from 'bun';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listAllDriveFilesByUserIdFromDatabase } from '@/core/drive/drive-file-store.js';
import { fetchMetaFromDatabase } from '@/core/meta/meta-store.js';
import { createUserWithProfileAndPublickeyInDatabase, deleteUserByIdFromDatabase } from '@/core/user/user-store.js';
import { genId } from '@/misc/id/gen-id.js';
import { uploadDriveFileFromUrl } from '@/server/rest/drive/drive-file-upload.js';
import type { DriveFileUploadDependencies, DeclaredRemoteFile } from '@/server/rest/drive/drive-file-upload.js';
import { isValidBlurhash, parseDeclaredMedia } from '@/server/rest/activitypub/declared-media.js';
import type { MiMeta } from '@/models/Meta.js';
import type { MiUser } from '@/models/User.js';

// Mastodon が添付の Document に付ける形 (blurhash は先頭 'L' で 4x3 成分、長さ 28)。
const mastodonDocument = {
	type: 'Document',
	mediaType: 'image/jpeg',
	url: 'https://remote.example.test/media/photo.jpg',
	blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
	width: 1920,
	height: 1440,
};

describe('parseDeclaredMedia', () => {
	test('Mastodon の申告から種類・寸法・blurhash を取り出す', () => {
		expect(parseDeclaredMedia(mastodonDocument)).toStrictEqual({
			mime: 'image/jpeg',
			width: 1920,
			height: 1440,
			blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
		});
	});

	test.each([undefined, '', 'image', 'image/jpeg; charset=x', 'text/html\r\nX: y', `image/${'a'.repeat(80)}`])(
		'種類が無いか不正なら申告として扱わない: %s',
		(mediaType) => {
			expect(parseDeclaredMedia({ ...mastodonDocument, mediaType })).toBeNull();
		},
	);

	test('寸法は両方そろった正の整数だけを使い、blurhash は形式が正しいものだけを使う', () => {
		expect(parseDeclaredMedia({ mediaType: 'IMAGE/PNG', width: 640 })).toStrictEqual({
			mime: 'image/png',
			width: null,
			height: null,
			blurhash: null,
		});
		expect(
			parseDeclaredMedia({ mediaType: 'image/png', width: -1, height: 1.5, blurhash: 'LEHV6nWB2yk8' }),
		).toMatchObject({
			width: null,
			height: null,
			blurhash: null,
		});
	});

	test('blurhash は文字種と先頭文字が決める長さを照合する', () => {
		expect(isValidBlurhash('LEHV6nWB2yk8pyo0adR*.7kCMdnj')).toBe(true);
		expect(isValidBlurhash('LEHV6nWB2yk8pyo0adR*.7kCMdn')).toBe(false);
		expect(isValidBlurhash('LEHV6nWB2yk8pyo0adR*.7kCMd\n')).toBe(false);
		expect(isValidBlurhash('')).toBe(false);
	});
});

describe('uploadDriveFileFromUrl の保存しないリモートのファイル', () => {
	let config: Config;
	let pool: NativeSqlClient;
	let db: MiDrizzleDatabase;
	let meta: MiMeta;
	let remote: MiUser;

	beforeAll(async () => {
		config = loadConfig();
		pool = createBunSqlClient(config);
		db = createBunSqlDatabase(pool, config);
		meta = { ...(await fetchMetaFromDatabase(db)), sensitiveMediaDetection: 'none', useObjectStorage: false };
		const id = genId();
		remote = await createUserWithProfileAndPublickeyInDatabase(db, {
			user: {
				id,
				username: `linkremote${id}`,
				usernameLower: `linkremote${id}`,
				host: 'remote.example.test',
				uri: `https://remote.example.test/users/${id}`,
				isExplorable: false,
			},
			profile: { userId: id },
		});
	}, 60_000);

	afterAll(async () => {
		await deleteUserByIdFromDatabase(db, remote.id);
		await pool.close();
	});

	function buildDeps(overrides: Partial<MiMeta> = {}) {
		const downloadUrl = vi.fn(async (_url: string, path: string) => {
			await fs.writeFile(path, Buffer.alloc(16));
			return { filename: 'downloaded.bin' };
		});
		const fetchFileName = vi.fn(async () => '192.jpg');
		const update = vi.fn();
		const deps = {
			config,
			db,
			meta: { ...meta, ...overrides },
			downloadService: { downloadUrl, fetchFileName },
			fileInfoService: {
				fetchFileInfo: vi.fn(async () => ({
					size: 16,
					md5: '99999999999999999999999999999999',
					type: { mime: 'text/plain', ext: 'txt' },
					sensitive: false,
					porn: false,
					warnings: [],
				})),
			},
			imageProcessingService: {},
			videoProcessingService: {},
			internalStorageService: {
				del: vi.fn(),
				saveFromBuffer: vi.fn(),
				saveFromPath: vi.fn(() => 'https://local.test/f'),
			},
			chartWriters: { driveChart: { update }, perUserDriveChart: { update }, instanceChart: { updateDrive: update } },
			logger: { debug: vi.fn(), error: vi.fn(), info: vi.fn(), warn: vi.fn() },
		} as unknown as DriveFileUploadDependencies;
		return { deps, downloadUrl, fetchFileName };
	}

	const declared: DeclaredRemoteFile = {
		mime: 'image/jpeg',
		width: 1920,
		height: 1440,
		blurhash: 'LEHV6nWB2yk8pyo0adR*.7kCMdnj',
	};
	const register = (
		deps: DriveFileUploadDependencies,
		url: string,
		options: { isLink?: boolean; declared?: DeclaredRemoteFile | null } = {},
	) =>
		uploadDriveFileFromUrl(deps, {
			url,
			uri: url,
			user: remote,
			isLink: options.isLink ?? true,
			declared: options.declared === undefined ? declared : options.declared,
		});

	test('申告があれば中身を取得せずに登録し、同じ URI の 2 回目は取得も追加もしない', async () => {
		const url = `https://remote.example.test/media/${genId()}.jpg`;
		const { deps, downloadUrl, fetchFileName } = buildDeps();

		const file = await register(deps, url);
		expect(downloadUrl).not.toHaveBeenCalled();
		expect(file).toMatchObject({
			isLink: true,
			storedInternal: false,
			md5: null,
			size: 0,
			type: 'image/jpeg',
			url,
			uri: url,
			blurhash: declared.blurhash,
			properties: { width: 1920, height: 1440 },
		});
		// 名前は取得した場合と同じく Content-Disposition 由来 (HEAD で得る)。URL の末尾ではない。
		expect(fetchFileName).toHaveBeenCalledWith(url);
		expect(file.name).toBe('192.jpg');
		expect(file.webpublicAccessKey).toMatch(/^webpublic-/);

		// 2 回目は中身を取得する経路 (申告なし。アバター・バナーと同じ) でも、登録済みの URI なら取得しない。
		const second = buildDeps();
		const again = await register(second.deps, url, { declared: null });
		expect(again.id).toBe(file.id);
		expect(second.downloadUrl).not.toHaveBeenCalled();
		expect((await listAllDriveFilesByUserIdFromDatabase(db, remote.id)).filter((f) => f.uri === url)).toHaveLength(1);
	});

	test.each([
		['センシティブ判定がリモートに掛かる', { sensitiveMediaDetection: 'remote' as const }, {}],
		['センシティブ判定が全体に掛かる', { sensitiveMediaDetection: 'all' as const }, {}],
		['申告が無い', {}, { declared: null }],
		['保存する設定', {}, { isLink: false }],
	])('%s場合は中身を取得して判定する', async (_label, metaOverrides, options) => {
		const url = `https://remote.example.test/media/${genId()}.jpg`;
		const { deps, downloadUrl } = buildDeps(metaOverrides);
		const file = await register(deps, url, options);
		expect(downloadUrl).toHaveBeenCalledTimes(1);
		expect(file.md5).toBe('99999999999999999999999999999999');
	});
});
