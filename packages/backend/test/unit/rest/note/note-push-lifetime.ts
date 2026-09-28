/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import push from 'web-push';
import { StatusError } from '@/misc/status-error.js';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import { createUserWithProfileAndPublickeyInDatabase } from '@/core/user/UserStore.js';
import { createSwSubscriptionInDatabase, fetchSwSubscriptionFromDatabase } from '@/core/sw/SwSubscriptionStore.js';
import { createNote } from '@/core/note/NoteCreationService.js';
import type { NoteCreationDependencies } from '@/core/note/NoteCreationService.js';
import type { MiLocalUser } from '@/models/User.js';
import { genId } from '@/misc/id/gen-id.js';

let runtime: RuntimeDependencies;
beforeAll(async () => {
	runtime = await createRuntimeDependencies(loadConfig());
});
afterAll(async () => {
	await runtime.dispose();
});

test('a delayed push 410 removes its subscription after the note stage commits', async () => {
	const users = await Promise.all(
		[0, 1].map(async () => {
			const id = genId();
			return (await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
				user: { id, username: `push${id}`, usernameLower: `push${id}` },
				profile: { userId: id },
			})) as MiLocalUser;
		}),
	);
	const [recipient, author] = users as [MiLocalUser, MiLocalUser];
	const vapid = push.generateVAPIDKeys();
	const deps: NoteCreationDependencies = {
		...runtime,
		config: { ...runtime.config, instance: { ...runtime.config.instance, url: 'https://misskey.local' } },
		meta: { ...runtime.meta, enableServiceWorker: true, swPublicKey: vapid.publicKey, swPrivateKey: vapid.privateKey },
	};
	const base = {
		createdAt: new Date(),
		text: 'push lifetime',
		cw: null,
		reply: null,
		renote: null,
		files: [],
		poll: null,
		localOnly: true,
		reactionAcceptance: null,
		visibility: 'home' as const,
		visibleUsers: [],
		channel: null,
	};
	const parent = await createNote(deps, recipient, base);
	const endpoint = `https://push.example.test/${genId()}`;
	// 送信前に購読の鍵で暗号化するので、ブラウザと同じ形の有効な鍵が要る (不正だと送信が飛ばされる)。
	const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
	await createSwSubscriptionInDatabase(runtime.db, {
		id: genId(),
		userId: recipient.id,
		endpoint,
		auth: Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString('base64url'),
		publickey: Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url'),
	});
	const delivery = Promise.withResolvers<never>();
	const sent = Promise.withResolvers<string>();
	// 送信は SSRF 検査付きの httpRequestService.send を経由する。web-push 内蔵の https 送信ではない。
	const sendSpy = vi.spyOn(deps.httpRequestService, 'send').mockImplementation((url) => {
		sent.resolve(url);
		return delivery.promise;
	});
	// 外部応答を待たずに投稿と stage transaction が終了し、その後の失効応答でも削除できる。
	await createNote(deps, author, { ...base, reply: parent });
	// 検査付きクライアントへ、登録した endpoint がそのまま渡る。
	expect(await sent.promise).toBe(endpoint);
	expect(sendSpy.mock.calls[0]?.[1]?.method).toBe('POST');
	expect(await fetchSwSubscriptionFromDatabase(runtime.db, recipient.id, endpoint)).not.toBeNull();
	delivery.reject(new StatusError('expired subscription', 410, 'Gone'));
	await vi.waitFor(async () => {
		expect(await fetchSwSubscriptionFromDatabase(runtime.db, recipient.id, endpoint)).toBeNull();
	});
});
