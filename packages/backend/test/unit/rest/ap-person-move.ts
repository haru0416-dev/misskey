/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserByUriFromDatabase,
} from '@/core/UserStore.js';
import { createFollowingInDatabase } from '@/core/FollowingStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { updatePersonForHonoApi, type HonoApiUpdatePersonDependencies } from '@/server/rest/ap-person.js';
import type { MiRemoteUser } from '@/models/User.js';

/**
 * `person`のJSONを固定で返すローカルHTTPフィクスチャ。`getPerson`は遅延評価するクロージャで、
 * 呼び出し側がサーバー起動後にmovedTo等の値を確定させてから中身を差し替えられるようにする。
 */
function actorFixtureServer(getPerson: () => Record<string, unknown>): Promise<{ server: Server; host: string }> {
	return new Promise((resolve, reject) => {
		const server = createServer((req, res) => {
			res.writeHead(200, { 'Content-Type': 'application/activity+json' });
			res.end(JSON.stringify(getPerson()));
		});
		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			const address = server.address() as AddressInfo;
			resolve({ server, host: `127.0.0.1:${address.port}` });
		});
	});
}

describe('updatePersonForHonoApi の引っ越し (processRemoteMove) 処理', () => {
	let runtime: RuntimeDependencies;
	let deps: HonoApiUpdatePersonDependencies;
	const servers: Server[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-ap-person-move') };
		runtime.meta.federation = 'all';
		// 署名済みGETだと本物のシステムアカウント鍵での署名が必要になり、テストフィクスチャの
		// 構築が煩雑になるため、既存のe2eテストと同様に平文GETへ倒す。
		runtime.meta.signToActivityPubGet = false;
	});

	afterEach(async () => {
		await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	async function createLocalUser(prefix: string): Promise<{ id: string }> {
		const id = genId();
		await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase() },
			profile: { userId: id },
		});
		return { id };
	}

	test('movedToが新規に検知され、dstがsrcをalsoKnownAsで承認していれば、未知のdstを新規作成しフォロワーの移行ジョブを積む', async () => {
		// dst (移行先、まだこのインスタンスには知られていない新規リモートユーザー) のフィクスチャ
		const dstFixture = await actorFixtureServer(() => ({
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `http://${dstFixture.host}/users/dst`,
			type: 'Person',
			preferredUsername: 'dst',
			inbox: `http://${dstFixture.host}/users/dst/inbox`,
			alsoKnownAs: [`http://${srcFixture.host}/users/src`],
		}));
		servers.push(dstFixture.server);
		const dstUri = `http://${dstFixture.host}/users/dst`;

		// src (移行元、既存のリモートユーザー) のフィクスチャ。movedToでdstUriを指す。
		const srcFixture = await actorFixtureServer(() => ({
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `http://${srcFixture.host}/users/src`,
			type: 'Person',
			preferredUsername: 'src',
			inbox: `http://${srcFixture.host}/users/src/inbox`,
			movedTo: dstUri,
		}));
		servers.push(srcFixture.server);
		const srcUri = `http://${srcFixture.host}/users/src`;

		const srcId = genId();
		const srcUser = (await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: {
				id: srcId,
				username: 'honomovesrc',
				usernameLower: 'honomovesrc',
				host: srcFixture.host,
				uri: srcUri,
				inbox: `${srcUri}/inbox`,
				lastFetchedAt: new Date(0),
			},
			profile: { userId: srcId },
		})) as MiRemoteUser;

		const follower = await createLocalUser('honomovefollower');
		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: follower.id,
			followeeId: srcUser.id,
			followerHost: null,
			followeeHost: srcFixture.host,
		});

		await updatePersonForHonoApi(deps, srcUri, srcUser);

		const updatedSrc = await fetchUserByIdOrFailFromDatabase(deps.db, srcUser.id);
		expect(updatedSrc.movedToUri).toBe(dstUri);
		expect(updatedSrc.movedAt).not.toBeNull();

		const dstUser = await fetchUserByUriFromDatabase(deps.db, dstUri);
		expect(dstUser).not.toBeNull();

		const jobs = await deps.relationshipQueue.getJobs(['waiting', 'delayed']);
		const followJob = jobs.find(
			(j) => j.name === 'follow' && (j.data as { from: { id: string } }).from.id === follower.id,
		);
		expect(followJob).toBeDefined();
		expect((followJob!.data as { to: { id: string } }).to.id).toBe(dstUser!.id);
	});

	test('dstがsrcをalsoKnownAsで承認していない場合は移行処理をスキップする', async () => {
		const dstFixture = await actorFixtureServer(() => ({
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `http://${dstFixture.host}/users/noackdst`,
			type: 'Person',
			preferredUsername: 'noackdst',
			inbox: `http://${dstFixture.host}/users/noackdst/inbox`,
			// alsoKnownAsを設定しない (承認していないケース)
		}));
		servers.push(dstFixture.server);
		const dstUri = `http://${dstFixture.host}/users/noackdst`;

		const srcFixture = await actorFixtureServer(() => ({
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `http://${srcFixture.host}/users/noacksrc`,
			type: 'Person',
			preferredUsername: 'noacksrc',
			inbox: `http://${srcFixture.host}/users/noacksrc/inbox`,
			movedTo: dstUri,
		}));
		servers.push(srcFixture.server);
		const srcUri = `http://${srcFixture.host}/users/noacksrc`;

		const srcId = genId();
		const srcUser = (await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: {
				id: srcId,
				username: 'honomovenoacksrc',
				usernameLower: 'honomovenoacksrc',
				host: srcFixture.host,
				uri: srcUri,
				inbox: `${srcUri}/inbox`,
				lastFetchedAt: new Date(0),
			},
			profile: { userId: srcId },
		})) as MiRemoteUser;

		const follower = await createLocalUser('honomovenoackfollower');
		await createFollowingInDatabase(deps.db, {
			id: genId(),
			followerId: follower.id,
			followeeId: srcUser.id,
			followerHost: null,
			followeeHost: srcFixture.host,
		});

		await updatePersonForHonoApi(deps, srcUri, srcUser);

		const updatedSrc = await fetchUserByIdOrFailFromDatabase(deps.db, srcUser.id);
		expect(updatedSrc.movedToUri).toBe(dstUri);

		const jobs = await deps.relationshipQueue.getJobs(['waiting', 'delayed']);
		const followJob = jobs.find(
			(j) => j.name === 'follow' && (j.data as { from: { id: string } }).from.id === follower.id,
		);
		expect(followJob).toBeUndefined();
	});
});
