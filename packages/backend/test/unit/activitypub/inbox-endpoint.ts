/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';
// createRuntimeDependencies() が構築する UrlPreviewService は rolldown の `define` で注入される
// _SUMMALY_VERSION_ を参照するが、vitest はソースを直接importするだけでrolldownを経由しないため
// 未定義になる。テスト用にダミー値を注入しておく。
(globalThis as unknown as { _SUMMALY_VERSION_: string })._SUMMALY_VERSION_ = 'test';

import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies, type RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/UserStore.js';
import { userKeypair } from '@/db/schema/user-keypair.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { genId } from '@/misc/id/gen-id.js';
import { signedPostForHonoApi } from '@/server/rest/ap-resolve.js';
import { handleInboxRequest, type InboxEndpointDependencies } from '@/server/activitypub/inbox-endpoint.js';
import type { MiUser } from '@/models/User.js';

type CapturedRequest = {
	method: string;
	headers: Record<string, string>;
	body: string;
};

async function createTestUserWithKeypair(deps: InboxEndpointDependencies & { db: RuntimeDependencies['db'] }): Promise<MiUser> {
	const id = genId();
	const user = await createUserWithProfileAndPublickeyInDatabase(deps.db, {
		user: { id, username: `honoinboxep${id}`, usernameLower: `honoinboxep${id}`.toLowerCase() },
		profile: { userId: id },
	});
	const keyPair = await genRsaKeyPair();
	await deps.db.insert(userKeypair).values({
		userId: id,
		publicKey: keyPair.publicKey,
		privateKey: keyPair.privateKey,
	});
	return user;
}

// 実際に自分自身へ signedPostForHonoApi で配送させ、送信された生のHTTPリクエストを
// ローカルHTTPフィクスチャで捕捉することで、本物のHTTP-Signature/Digestヘッダーを持つ
// リクエストを再現する (established local HTTP fixture pattern)。
function captureRequestServer(): Promise<{ server: Server; url: string; capture: () => Promise<CapturedRequest> }> {
	return new Promise((resolve, reject) => {
		let resolveCapture: (req: CapturedRequest) => void;
		const capturePromise = new Promise<CapturedRequest>(r => { resolveCapture = r; });

		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			const chunks: Buffer[] = [];
			req.on('data', chunk => chunks.push(chunk));
			req.on('end', () => {
				resolveCapture({
					method: req.method ?? 'POST',
					headers: Object.fromEntries(Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')])),
					body: Buffer.concat(chunks).toString('utf-8'),
				});
				res.writeHead(202);
				res.end();
			});
		});

		server.once('error', reject);
		server.listen(0, '127.0.0.1', () => {
			server.off('error', reject);
			const address = server.address() as AddressInfo;
			resolve({ server, url: `http://127.0.0.1:${address.port}/inbox`, capture: () => capturePromise });
		});
	});
}

describe('hono-inbox-endpoint', () => {
	let runtime: RuntimeDependencies;
	const servers: Server[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
	});

	afterEach(async () => {
		await Promise.all(servers.splice(0).map(s => new Promise<void>(resolve => s.close(() => resolve()))));
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	test('正しい署名付きリクエストは202を返しinboxQueueにジョブを積む', async () => {
		const { server, url, capture } = await captureRequestServer();
		servers.push(server);
		const host = new URL(url).host;

		const deps: InboxEndpointDependencies = { config: runtime.config, meta: { federation: 'all' }, inboxQueue: runtime.inboxQueue };
		const user = await createTestUserWithKeypair({ ...deps, db: runtime.db });
		const activityId = `https://${host}/activities/${genId()}`;

		await signedPostForHonoApi({ config: runtime.config, db: runtime.db, httpRequestService: runtime.httpRequestService }, user, url, {
			id: activityId,
			type: 'Follow',
			actor: `https://${host}/users/${user.id}`,
			object: `https://${host}/users/somebody`,
		});

		const captured = await capture();

		const request = new Request(url, {
			method: captured.method,
			headers: captured.headers,
			body: captured.body,
		});

		const depsWithFixtureHost: InboxEndpointDependencies = {
			...deps,
			config: { ...runtime.config, host },
		};

		const before = await runtime.inboxQueue.getJobCounts();
		const response = await handleInboxRequest(depsWithFixtureHost, request);
		expect(response.status).toBe(202);

		const after = await runtime.inboxQueue.getJobCounts();
		expect((after.waiting ?? 0) + (after.active ?? 0) + (after.delayed ?? 0))
			.toBeGreaterThan((before.waiting ?? 0) + (before.active ?? 0) + (before.delayed ?? 0) - 1);
		const queued = (await runtime.inboxQueue.getJobs(['waiting', 'active', 'delayed', 'completed', 'failed']))
			.find(job => job.data.activity.id === activityId);
		expect(queued?.opts.attempts).toBe(runtime.config.inboxJobMaxAttempts ?? 8);
	});

	test('federationがnoneの場合は403', async () => {
		const deps: InboxEndpointDependencies = { config: runtime.config, meta: { federation: 'none' }, inboxQueue: runtime.inboxQueue };
		const request = new Request('http://example.com/inbox', { method: 'POST', body: '{}' });

		const response = await handleInboxRequest(deps, request);
		expect(response.status).toBe(403);
	});

	test('Content-Lengthのない上限超過リクエストは413', async () => {
		const deps: InboxEndpointDependencies = { config: runtime.config, meta: { federation: 'all' }, inboxQueue: runtime.inboxQueue };
		const request = new Request('http://example.com/inbox', {
			method: 'POST',
			body: new ReadableStream({
				start(controller) {
					controller.enqueue(new Uint8Array(1024 * 64));
					controller.enqueue(new Uint8Array(1));
					controller.close();
				},
			}),
			duplex: 'half',
		} as RequestInit & { duplex: 'half' });

		const response = await handleInboxRequest(deps, request);
		expect(response.status).toBe(413);
	});

	test('署名ヘッダーがない場合は401', async () => {
		const deps: InboxEndpointDependencies = { config: runtime.config, meta: { federation: 'all' }, inboxQueue: runtime.inboxQueue };
		const request = new Request('http://example.com/inbox', {
			method: 'POST',
			headers: { host: runtime.config.host },
			body: JSON.stringify({ actor: 'https://example.com/users/x' }),
		});

		const response = await handleInboxRequest(deps, request);
		expect(response.status).toBe(401);
	});

	test('Hostヘッダーが自インスタンスと一致しない場合は401', async () => {
		const { server, url, capture } = await captureRequestServer();
		servers.push(server);

		const deps: InboxEndpointDependencies = { config: runtime.config, meta: { federation: 'all' }, inboxQueue: runtime.inboxQueue };
		const user = await createTestUserWithKeypair({ ...deps, db: runtime.db });

		await signedPostForHonoApi({ config: runtime.config, db: runtime.db, httpRequestService: runtime.httpRequestService }, user, url, {
			id: `https://example.com/activities/${genId()}`,
			type: 'Follow',
			actor: `https://example.com/users/${user.id}`,
			object: 'https://example.com/users/somebody',
		});
		const captured = await capture();

		// config.host をフィクスチャのホストと変えることで不一致を再現する
		const depsWithMismatchedHost: InboxEndpointDependencies = {
			...deps,
			config: { ...runtime.config, host: 'totally-different-host.example.com' },
		};

		const request = new Request(url, { method: captured.method, headers: captured.headers, body: captured.body });
		const response = await handleInboxRequest(depsWithMismatchedHost, request);
		expect(response.status).toBe(401);
	});

	test('actorを持たない構造的に不正なアクティビティは400', async () => {
		const { server, url, capture } = await captureRequestServer();
		servers.push(server);
		const host = new URL(url).host;

		const deps: InboxEndpointDependencies = { config: runtime.config, meta: { federation: 'all' }, inboxQueue: runtime.inboxQueue };
		const user = await createTestUserWithKeypair({ ...deps, db: runtime.db });

		await signedPostForHonoApi({ config: runtime.config, db: runtime.db, httpRequestService: runtime.httpRequestService }, user, url, {
			id: `https://${host}/activities/${genId()}`,
			type: 'Follow',
			// actor を欠落させる
			object: `https://${host}/users/somebody`,
		});
		const captured = await capture();

		const depsWithFixtureHost: InboxEndpointDependencies = {
			...deps,
			config: { ...runtime.config, host },
		};

		const request = new Request(url, { method: captured.method, headers: captured.headers, body: captured.body });
		const response = await handleInboxRequest(depsWithFixtureHost, request);
		expect(response.status).toBe(400);
	});
});
