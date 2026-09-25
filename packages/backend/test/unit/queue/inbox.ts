/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:http';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { parseRequestSignature } from '@/core/activitypub/http-signature.js';
import * as Bull from 'bullmq';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { fetchFollowingByFollowerIdAndFolloweeIdFromDatabase } from '@/core/user/FollowingStore.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { genId } from '@/misc/id/gen-id.js';
import { ApRequestCreator } from '@/core/activitypub/ap-request.js';
import { handleQueueInbox, flushQueueInboxUpdateInstanceQueue } from '@/queue/handlers/inbox.js';
import type { QueueInboxDependencies } from '@/queue/handlers/inbox.js';
import type { InboxJobData } from '@/queue/types.js';
import type { IActivity } from '@/core/activitypub/type.js';
import type { MiUser } from '@/models/User.js';

type CapturedRequest = { method: string; headers: Record<string, string>; body: string };

function captureRequestServer(): Promise<{ server: Server; url: string; capture: () => Promise<CapturedRequest> }> {
	return new Promise((resolve, reject) => {
		let resolveCapture: (req: CapturedRequest) => void;
		const capturePromise = new Promise<CapturedRequest>((r) => {
			resolveCapture = r;
		});
		const server = createServer((req: IncomingMessage, res: ServerResponse) => {
			const chunks: Buffer[] = [];
			req.on('data', (chunk) => chunks.push(chunk));
			req.on('end', () => {
				resolveCapture({
					method: req.method ?? 'POST',
					headers: Object.fromEntries(
						Object.entries(req.headers).map(([k, v]) => [k, Array.isArray(v) ? v.join(', ') : (v ?? '')]),
					),
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

describe('hono-queue-inbox handleQueueInbox', () => {
	type ActivityOverrides = { [K in keyof IActivity]?: IActivity[K] | undefined };

	let runtime: RuntimeDependencies;
	let deps: QueueInboxDependencies;
	let keyPair: Awaited<ReturnType<typeof genRsaKeyPair>>;
	const servers: Server[] = [];

	beforeAll(async () => {
		runtime = await createRuntimeDependencies(loadConfig());
		deps = { ...runtime, logger: runtime.loggerService.getLogger('test-queue-inbox') };
		keyPair = await genRsaKeyPair();
		// 新規テストDBでは meta.federation が既定で 'none' になっており、そのままだと
		// isFederationAllowedHost がすべてのホストを拒否してしまう。
		runtime.meta.federation = 'all';
	});

	afterEach(async () => {
		await flushQueueInboxUpdateInstanceQueue();
		await Promise.all(servers.splice(0).map((s) => new Promise<void>((resolve) => s.close(() => resolve()))));
	});

	afterAll(async () => {
		await runtime.dispose();
	});

	// user_publickey に登録したリモートユーザーの RSA 鍵で createSignedPost の署名付きリクエストを組み立て、
	// ローカル HTTP フィクスチャへ送って捕捉する。verifyRequestSignature を実際のバイト列に対して動かすため。
	async function createSignedInboxPayload(
		host: string,
		activityOverrides: ActivityOverrides = {},
	): Promise<{ user: MiUser; data: InboxJobData; activity: IActivity }> {
		const { server, url, capture } = await captureRequestServer();
		servers.push(server);

		const id = genId();
		const keyId = `http://${host}/users/${id}#main-key`;
		const user = await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: {
				id,
				username: `honoqueueinbox${id}`,
				usernameLower: `honoqueueinbox${id}`.toLowerCase(),
				host,
				uri: `http://${host}/users/${id}`,
				inbox: `http://${host}/users/${id}/inbox`,
			},
			profile: { userId: id },
			publickey: { userId: id, keyId, keyPem: keyPair.publicKey },
		});

		const activity: IActivity = {
			id: `http://${host}/activities/${genId()}`,
			type: 'Follow',
			actor: user.uri!,
			// object は必須フィールドだが、署名検証のみを検証するテスト (federation/keyId系) では
			// 実際のフォロー対象は使われないため自分自身へのダミー参照で埋める。
			object: user.uri!,
		};
		Object.assign(activity, activityOverrides);
		const body = JSON.stringify(activity);

		const signed = await ApRequestCreator.createSignedPost({
			key: { privateKeyPem: keyPair.privateKey, keyId },
			url,
			body,
			additionalHeaders: {},
		});

		await deps.httpRequestService.send(url, {
			method: signed.request.method,
			headers: signed.request.headers,
			body,
		});

		const captured = await capture();
		const signature = parseRequestSignature({
			method: captured.method,
			url: new URL(url).pathname,
			headers: captured.headers,
		});

		const data: InboxJobData = { activity, signature };
		return { user, data, activity };
	}

	async function createTestLocalUser(prefix: string): Promise<MiUser> {
		const id = genId();
		return await createUserWithProfileAndPublickeyInDatabase(deps.db, {
			user: { id, username: `${prefix}${id}`, usernameLower: `${prefix}${id}`.toLowerCase() },
			profile: { userId: id },
		});
	}

	// 途中の 1 バイトを差し替える。末尾に文字を足すだけではデコーダが余剰文字を無視してデコード結果が変わらず、
	// 検証が偶然成功することがある。
	function tamperBase64Signature(signature: string): string {
		const buf = Buffer.from(signature, 'base64');
		buf[Math.floor(buf.length / 2)] = buf[Math.floor(buf.length / 2)]! ^ 0xff;
		return buf.toString('base64');
	}

	test('正しい署名のFollowアクティビティはperformActivityForApiまで到達しFollowRequestを作成する', async () => {
		const host = `hono-queue-inbox-ok-${genId()}.example.com`;
		const followee = await createTestLocalUser('honoqueueinboxee');
		const { user: actor, data } = await createSignedInboxPayload(host, {
			object: `${deps.config.instance.url}/users/${followee.id}`,
		});

		const result = await handleQueueInbox(deps, data);
		expect(result).toBe('ok');

		// followee は isLocked ではないため即時Followingが作られる (承認制ならFollowRequestになる)
		const following = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(deps.db, actor.id, followee.id);
		expect(following).not.toBeNull();
	});

	test('署名を改竄した場合はHTTP-Signature検証に失敗しLD-Signatureも無いためUnrecoverableErrorになる', async () => {
		const host = `hono-queue-inbox-tampered-${genId()}.example.com`;
		const followee = await createTestLocalUser('honoqueueinboxtamperee');
		const { data } = await createSignedInboxPayload(host, {
			object: `${deps.config.instance.url}/users/${followee.id}`,
		});

		data.signature.signature = tamperBase64Signature(data.signature.signature);

		await expect(handleQueueInbox(deps, data)).rejects.toThrow(Bull.UnrecoverableError);
	});

	test('正しい署名でもactivity.actorが署名者と異なる場合は拒否する', async () => {
		const host = `hono-queue-inbox-actor-mismatch-${genId()}.example.com`;
		const { data } = await createSignedInboxPayload(host, {
			actor: `http://${host}/users/${genId()}`,
		});

		await expect(handleQueueInbox(deps, data)).rejects.toThrow(Bull.UnrecoverableError);
	});

	test('正しい署名でもactivity.idのホストが署名者と異なる場合は拒否する', async () => {
		const host = `hono-queue-inbox-id-mismatch-${genId()}.example.com`;
		const { data } = await createSignedInboxPayload(host, {
			id: `http://other-${genId()}.example.com/activities/${genId()}`,
		});

		await expect(handleQueueInbox(deps, data)).rejects.toThrow(Bull.UnrecoverableError);
	});

	test('正しい署名でもactivity.idが無い場合は拒否する', async () => {
		const host = `hono-queue-inbox-missing-id-${genId()}.example.com`;
		const { data } = await createSignedInboxPayload(host, { id: undefined });

		await expect(handleQueueInbox(deps, data)).rejects.toThrow(Bull.UnrecoverableError);
	});

	// actor はリモートが送ってくる値で、欠けていても不思議ではない。UnrecoverableError にしないと
	// 「壊れた activity が再試行され続ける」形になる。
	test('activity.actor が無い場合は再試行せずスキップする', async () => {
		const host = `hono-queue-inbox-noactor-${genId()}.example.com`;
		const { data } = await createSignedInboxPayload(host);

		// keyId から引けない状況にして、actor を見に行く経路へ入れる。
		data.signature.keyId = `http://${host}/users/unknown#main-key`;
		delete (data.activity as { actor?: unknown }).actor;

		await expect(handleQueueInbox(deps, data)).rejects.toThrow(Bull.UnrecoverableError);
	});

	test('federationでブロックされたホストからのリクエストはBlocked requestを返す', async () => {
		const host = `hono-queue-inbox-blocked-${genId()}.example.com`;
		const { data } = await createSignedInboxPayload(host);

		const originalFederation = runtime.meta.federation;
		const originalFederationHosts = runtime.meta.federationHosts;
		runtime.meta.federation = 'specified';
		runtime.meta.federationHosts = [];
		try {
			const result = await handleQueueInbox(deps, data);
			expect(result).toContain('Blocked request');
		} finally {
			runtime.meta.federation = originalFederation;
			runtime.meta.federationHosts = originalFederationHosts;
		}
	});

	test('acct:形式の古いkeyIdはサポート対象外としてスキップされる', async () => {
		const host = `hono-queue-inbox-oldkeyid-${genId()}.example.com`;
		const { data } = await createSignedInboxPayload(host);

		data.signature.keyId = `acct:someone@${host}`;

		const result = await handleQueueInbox(deps, data);
		expect(result).toContain('Old keyId is no longer supported');
	});
});
