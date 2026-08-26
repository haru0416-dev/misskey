/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しない。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createRelayInDatabase, deleteRelayFromDatabase } from '@/core/relay/RelayStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { userKeypair } from '@/db/schema/user-keypair.js';
import { genId } from '@/misc/id/gen-id.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { attachLdSignatureForHonoApi, deliverToRelaysForHonoApi } from '@/server/rest/activitypub/notes-ap.js';
import type { DeliverJobData } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';

describe('deliverToRelaysForHonoApi / attachLdSignatureForHonoApi (RelayService#deliverToRelays / ApRendererService#attachLdSignature 相当)', () => {
	let runtime: RuntimeDependencies;
	let user: MiUser;
	const createdRelayIds: string[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());

		const id = genId();
		user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `relaydeliver${id}`, usernameLower: `relaydeliver${id}`.toLowerCase() },
			profile: { userId: id },
		});
		const keyPair = await genRsaKeyPair();
		await runtime.db.insert(userKeypair).values({
			userId: id,
			publicKey: keyPair.publicKey,
			privateKey: keyPair.privateKey,
		});
	});

	afterAll(async () => {
		for (const relayId of createdRelayIds.splice(0)) {
			await deleteRelayFromDatabase(runtime.db, relayId);
		}
		await runtime.dispose();
	});

	// リレー行を作成するテストより前に実行する必要がある (作成された relay 行は afterAll まで残るため)。
	test('deliverToRelays: accepted リレーが無い場合は何もしない (署名もキュー投入も発生しない)', async () => {
		const activity = {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `${runtime.config.instance.url}/test-activity/${genId()}`,
			type: 'Create',
			actor: `${runtime.config.instance.url}/users/${user.id}`,
			object: { type: 'Note' },
		};

		await deliverToRelaysForHonoApi(runtime, { id: user.id, host: null }, activity);

		// 共有 redis 上の deliver キューには他テストの残骸ジョブが混在し得るため、
		// JSON.parse せず content 文字列に自分のアクティビティ id が含まれるかだけを見る。
		const jobs = await runtime.deliverQueue.getJobs(['waiting', 'delayed']);
		const contentId = activity.id;
		expect(
			jobs.find(
				(j) =>
					typeof (j?.data as DeliverJobData | undefined)?.content === 'string' &&
					(j.data as DeliverJobData).content.includes(contentId),
			),
		).toBeUndefined();
	});

	test('attachLdSignature: RsaSignature2017 の signature フィールドを付与し、元のフィールドを保持する', async () => {
		const activity = {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `${runtime.config.instance.url}/test-activity/${genId()}`,
			type: 'Add',
			actor: `${runtime.config.instance.url}/users/${user.id}`,
			object: `${runtime.config.instance.url}/notes/dummy`,
		};

		const signed = await attachLdSignatureForHonoApi(runtime, activity, { id: user.id, host: null });

		const signature = signed['signature'] as Record<string, unknown>;
		expect(signature).toBeDefined();
		expect(signature['type']).toBe('RsaSignature2017');
		expect(signature['creator']).toBe(`${runtime.config.instance.url}/users/${user.id}#main-key`);
		expect(typeof signature['signatureValue']).toBe('string');
		expect((signature['signatureValue'] as string).length).toBeGreaterThan(0);
		expect(signed['type']).toBe('Add');
		expect(signed['actor']).toBe(activity.actor);
	});

	test('deliverToRelays: accepted リレーにのみ LD 署名済みアクティビティを deliver キューへ積む', async () => {
		const inbox = `https://relay.example.com/inbox-${genId()}`;
		const relay = await createRelayInDatabase(runtime.db, { id: genId(), inbox, status: 'accepted' });
		createdRelayIds.push(relay.id);
		// requesting 状態のリレーには配送されないことも同時に確認する
		const pendingInbox = `https://relay.example.com/pending-${genId()}`;
		const pendingRelay = await createRelayInDatabase(runtime.db, {
			id: genId(),
			inbox: pendingInbox,
			status: 'requesting',
		});
		createdRelayIds.push(pendingRelay.id);

		const activity = {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `${runtime.config.instance.url}/test-activity/${genId()}`,
			type: 'Create',
			actor: `${runtime.config.instance.url}/users/${user.id}`,
			object: { type: 'Note' },
		};

		await deliverToRelaysForHonoApi(runtime, { id: user.id, host: null }, activity);

		const jobs = await runtime.deliverQueue.getJobs(['waiting', 'delayed']);
		const relayJob = jobs.find((j) => (j.data as DeliverJobData).to === inbox);
		expect(relayJob).toBeDefined();

		const data = relayJob!.data as DeliverJobData;
		expect(data.user.id).toBe(user.id);
		expect(data.isSharedInbox).toBe(false);
		const content = JSON.parse(data.content) as Record<string, unknown>;
		// LD署名が付与されている
		expect((content['signature'] as Record<string, unknown>)['type']).toBe('RsaSignature2017');
		// to が無い場合は Public が補われる
		expect(content['to']).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
		// 元の activity オブジェクト自体は変異しない (deepClone してから加工する)
		expect('to' in activity).toBe(false);
		expect('signature' in activity).toBe(false);

		// requesting のリレーには配送されない
		expect(jobs.find((j) => (j.data as DeliverJobData).to === pendingInbox)).toBeUndefined();

		await relayJob!.remove();
	});
});
