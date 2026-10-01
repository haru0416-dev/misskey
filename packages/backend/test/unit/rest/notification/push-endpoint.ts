/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createServer } from 'node:net';
import type { AddressInfo, Server } from 'node:net';
import { afterAll, afterEach, beforeAll, expect, test, vi } from 'vitest';
import push from 'web-push';
import { loadConfig } from '@/config.js';
import { createHttpRequestService } from '@/core/net/HttpRequestService.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createSwSubscriptionInDatabase } from '@/core/sw/SwSubscriptionStore.js';
import { pushSwNotification } from '@/core/notification/push-notification.js';
import { genId } from '@/misc/id/gen-id.js';

// push の送信先は利用者が登録した任意 URL。送信が SSRF 検査付きの HttpRequestService を通り、
// 内部アドレス宛てには接続しないことを、実際に購読を作って push を送らせて確かめる。
let runtime: RuntimeDependencies;
let internal: Server;
let internalPort = 0;
let connections = 0;

beforeAll(async () => {
	runtime = await createRuntimeDependencies(loadConfig());
	internal = createServer((socket) => {
		connections++;
		socket.destroy();
	});
	await new Promise<void>((r) => internal.listen(0, '127.0.0.1', r));
	internalPort = (internal.address() as AddressInfo).port;
});

afterAll(async () => {
	await new Promise<void>((r) => internal.close(() => r()));
	await runtime.dispose();
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllEnvs();
	connections = 0;
});

// ブラウザの PushSubscription と同じ形の有効な鍵。鍵が不正だと送信前に飛ばされ、検査を通らずにテストが通ってしまう。
async function browserSubscriptionKeys(): Promise<{ p256dh: string; auth: string }> {
	const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
	const raw = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey));
	return {
		p256dh: Buffer.from(raw).toString('base64url'),
		auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
	};
}

test('内部アドレス宛ての push は検査で弾かれ、接続しない', async () => {
	vi.stubEnv('NODE_ENV', 'production');
	const config = runtime.config;
	// 許可ネットワークを空にすると 127.0.0.1 は private として弾かれる。
	const httpRequestService = createHttpRequestService({
		...config,
		outboundNetwork: {
			...config.outboundNetwork,
			privateNetworkAccess: { ...config.outboundNetwork.privateNetworkAccess, allowedNetworks: [] },
			proxy: { ...config.outboundNetwork.proxy, url: null },
		},
	} as unknown as typeof config);
	const sends: Promise<unknown>[] = [];
	const originalSend = httpRequestService.send;
	const sendSpy = vi.spyOn(httpRequestService, 'send').mockImplementation((...args) => {
		const p = originalSend(...args);
		sends.push(p);
		return p;
	});

	const id = genId();
	await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
		user: { id, username: `pushssrf${id}`, usernameLower: `pushssrf${id}` },
		profile: { userId: id },
	});
	const endpoint = `https://127.0.0.1:${internalPort}/push`;
	const keys = await browserSubscriptionKeys();
	await createSwSubscriptionInDatabase(runtime.db, {
		id: genId(),
		userId: id,
		endpoint,
		auth: keys.auth,
		publickey: keys.p256dh,
	});

	const vapid = push.generateVAPIDKeys();
	await pushSwNotification(
		{
			config: { ...config, instance: { ...config.instance, url: 'https://misskey.local' } },
			meta: { enableServiceWorker: true, swPublicKey: vapid.publicKey, swPrivateKey: vapid.privateKey },
			db: runtime.db,
			httpRequestService,
		},
		id,
		'notification',
		{ id: genId(), type: 'app' },
	);

	// 送信は検査付きクライアントへ 1 度だけ渡り (鍵が有効なので飛ばされない)、検査で弾かれる。
	expect(sendSpy).toHaveBeenCalledTimes(1);
	expect(sendSpy.mock.calls[0]?.[0]).toBe(endpoint);
	await expect(sends[0]).rejects.toThrow(/Blocked/);
	// 内部のサーバーには 1 度も届かない。
	expect(connections).toBe(0);
});
