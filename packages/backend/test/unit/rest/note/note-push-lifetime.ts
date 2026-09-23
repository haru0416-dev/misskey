/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import push from 'web-push';
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
	await createSwSubscriptionInDatabase(runtime.db, {
		id: genId(),
		userId: recipient.id,
		endpoint,
		auth: 'test-auth',
		publickey: 'test-key',
	});
	const delivery = Promise.withResolvers<push.SendResult>();
	const sent = Promise.withResolvers<void>();
	vi.spyOn(push, 'sendNotification').mockImplementation(() => {
		sent.resolve();
		return delivery.promise;
	});
	// 外部応答を待たずに投稿と stage transaction が終了し、その後の失効応答でも削除できる。
	await createNote(deps, author, { ...base, reply: parent });
	await sent.promise;
	expect(await fetchSwSubscriptionFromDatabase(runtime.db, recipient.id, endpoint)).not.toBeNull();
	delivery.reject(Object.assign(new Error('expired subscription'), { statusCode: 410 }));
	await vi.waitFor(async () => {
		expect(await fetchSwSubscriptionFromDatabase(runtime.db, recipient.id, endpoint)).toBeNull();
	});
});
