/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, createVerify } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { handleQueueDeliver } from '@/queue/handlers/deliver.js';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createRelayInDatabase, deleteRelayFromDatabase } from '@/core/relay/RelayStore.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { userKeypair } from '@/db/schema/user-keypair.js';
import { JsonLd } from '@/core/activitypub/json-ld.js';
import { ApRequestCreator } from '@/core/activitypub/ap-request.js';
import { genId } from '@/misc/id/gen-id.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { attachLdSignatureForApi, deliverToRelaysForApi } from '@/server/rest/activitypub/notes-ap.js';
import type { DeliverJobData } from '@/queue/types.js';
import type { MiUser } from '@/models/User.js';

describe('deliverToRelaysForApi / attachLdSignatureForApi (RelayService#deliverToRelays / ApRendererService#attachLdSignature 相当)', () => {
	let runtime: RuntimeDependencies;
	let user: MiUser;
	let publicKey: string;
	const createdRelayIds: string[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());

		const id = genId();
		user = await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
			user: { id, username: `relaydeliver${id}`, usernameLower: `relaydeliver${id}`.toLowerCase() },
			profile: { userId: id },
		});
		const keyPair = await genRsaKeyPair();
		publicKey = keyPair.publicKey;
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

		await deliverToRelaysForApi(runtime, { id: user.id, host: null }, activity);

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

		const signed = await attachLdSignatureForApi(runtime, activity, { id: user.id, host: null });

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

		await deliverToRelaysForApi(runtime, { id: user.id, host: null }, activity);

		const jobs = await runtime.deliverQueue.getJobs(['waiting', 'delayed']);
		const relayJob = jobs.find((j) => (j.data as DeliverJobData).to === inbox);
		expect(relayJob).toBeDefined();

		const data = relayJob!.data as DeliverJobData;
		expect(data.user.id).toBe(user.id);
		expect(data.isSharedInbox).toBe(false);
		const content = JSON.parse(data.content) as Record<string, unknown>;
		expect((content['signature'] as Record<string, unknown>)['type']).toBe('RsaSignature2017');
		expect(content['to']).toEqual(['https://www.w3.org/ns/activitystreams#Public']);
		// 入力の activity オブジェクトは変異させない。
		expect('to' in activity).toBe(false);
		expect('signature' in activity).toBe(false);

		expect(jobs.find((j) => (j.data as DeliverJobData).to === pendingInbox)).toBeUndefined();

		await relayJob!.remove();
	});

	test('複数リレーへ一括投入し、宛先・署名・再送設定と同じjobIdの重複抑制を維持する', async () => {
		for (let index = 0; index < 2; index++) {
			const relay = await createRelayInDatabase(runtime.db, {
				id: genId(),
				inbox: `https://relay-${index}.example/inbox-${genId()}`,
				status: 'accepted',
			});
			createdRelayIds.push(relay.id);
		}
		for (const prefix of [undefined, genId()]) {
			const activity = {
				'@context': 'https://www.w3.org/ns/activitystreams',
				id: `${runtime.config.instance.url}/activities/${genId()}`,
				type: 'Create',
				actor: `${runtime.config.instance.url}/users/${user.id}`,
				to: ['https://www.w3.org/ns/activitystreams#Public'],
				cc: [`${runtime.config.instance.url}/users/${user.id}/followers`],
				object: { type: 'Note', content: '日本語の配信本文' },
			};
			const original = structuredClone(activity);
			const digests = vi.spyOn(ApRequestCreator, 'createDigest');
			const bulk = vi.spyOn(runtime.deliverQueue, 'addBulk');
			const single = vi.spyOn(runtime.deliverQueue, 'add');
			try {
				await deliverToRelaysForApi(runtime, { id: user.id, host: null }, activity, prefix);
				expect(digests).toHaveBeenCalledTimes(1);
				expect(bulk).toHaveBeenCalledTimes(1);
				expect(single).not.toHaveBeenCalled();
				const findJobs = async () =>
					(await runtime.deliverQueue.getJobs(['waiting', 'delayed'])).filter((job) =>
						job.data.content?.includes(activity.id),
					);
				await expect.poll(async () => (await findJobs()).length).toBe(3);
				const jobs = await findJobs();
				expect(new Set(jobs.map((job) => job.data.to)).size).toBe(3);
				expect(new Set(jobs.map((job) => job.data.content)).size).toBe(1);
				const content = JSON.parse(jobs[0]!.data.content);
				expect(await new JsonLd(runtime.httpRequestService).verifyRsaSignature2017(content, publicKey)).toBe(true);
				const { signature: _signature, ...unsigned } = content;
				expect(unsigned).toEqual(activity);
				expect(activity).toEqual(original);
				for (const job of jobs) {
					expect(job.data.user.id).toBe(user.id);
					expect(job.data.isSharedInbox).toBe(false);
					expect(job.data.digest).toBe(`SHA-256=${createHash('sha256').update(job.data.content).digest('base64')}`);
					expect(job.opts.attempts).toBe(runtime.config.queues.deliver.maximumAttempts ?? 12);
					expect(job.opts.backoff).toMatchObject({ type: 'custom' });
					if (prefix != null)
						expect(job.id).toBe(`${prefix}-${createHash('sha256').update(job.data.to).digest('hex').slice(0, 24)}`);
				}
				if (prefix != null) {
					await deliverToRelaysForApi(runtime, { id: user.id, host: null }, activity, prefix);
					expect((await findJobs()).map((job) => job.id).sort()).toEqual(jobs.map((job) => job.id).sort());
				}
				await Promise.all(jobs.map((job) => job.remove()));
			} finally {
				digests.mockRestore();
				bulk.mockRestore();
				single.mockRestore();
			}
		}
	});

	test('一括投入したリレージョブを配送ハンドラーからHTTP送信し、本文と署名を受信側で検証する', async () => {
		const received: { path: string; body: string; digest: string; signatureValid: boolean }[] = [];
		const server = createServer(async (request, response) => {
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			const body = Buffer.concat(chunks).toString();
			const signature = request.headers['signature'] as string;
			const value = /signature="([^"]+)"/.exec(signature)?.[1] ?? '';
			const names = /headers="([^"]+)"/.exec(signature)?.[1]?.split(' ') ?? [];
			const signingString = names
				.map((name) =>
					name === '(request-target)'
						? `(request-target): ${request.method!.toLowerCase()} ${request.url}`
						: `${name}: ${request.headers[name]}`,
				)
				.join('\n');
			const verifier = createVerify('sha256');
			verifier.update(signingString);
			received.push({
				path: request.url!,
				body,
				digest: request.headers['digest'] as string,
				signatureValid: verifier.verify(publicKey, value, 'base64'),
			});
			response.writeHead(202).end();
		});
		await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
		const { port } = server.address() as AddressInfo;
		const inboxes = [0, 1].map((index) => `http://127.0.0.1:${port}/relay/${index}`);
		const relayIds: string[] = [];
		const activity = {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `${runtime.config.instance.url}/activities/${genId()}`,
			type: 'Create',
			actor: `${runtime.config.instance.url}/users/${user.id}`,
			object: { type: 'Note', content: 'HTTP受信の検証' },
		};
		try {
			for (const inbox of inboxes) {
				const relay = await createRelayInDatabase(runtime.db, { id: genId(), inbox, status: 'accepted' });
				relayIds.push(relay.id);
			}
			await deliverToRelaysForApi(runtime, { id: user.id, host: null }, activity, genId());
			const jobs = (await runtime.deliverQueue.getJobs(['waiting', 'delayed'])).filter((job) =>
				job.data.content?.includes(activity.id),
			);
			try {
				const localJobs = jobs.filter((job) => inboxes.includes(job.data.to));
				expect(localJobs).toHaveLength(2);
				for (const job of localJobs) {
					expect(
						await handleQueueDeliver(
							{ ...runtime, meta: { ...runtime.meta, federation: 'all', enableStatsForFederatedInstances: false } },
							job,
						),
					).toBe('Success');
				}
				expect(received.map((entry) => entry.path).sort()).toEqual(['/relay/0', '/relay/1']);
				for (const entry of received) {
					expect(entry.signatureValid).toBe(true);
					expect(entry.digest).toBe(`SHA-256=${createHash('sha256').update(entry.body).digest('base64')}`);
					expect(entry.body).toBe(localJobs[0]!.data.content);
					expect(
						await new JsonLd(runtime.httpRequestService).verifyRsaSignature2017(JSON.parse(entry.body), publicKey),
					).toBe(true);
				}
			} finally {
				await Promise.all(jobs.map((job) => job.remove()));
			}
		} finally {
			await Promise.all(relayIds.map((id) => deleteRelayFromDatabase(runtime.db, id)));
			await new Promise<void>((resolve) => server.close(() => resolve()));
		}
	});
});
