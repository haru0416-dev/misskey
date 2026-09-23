/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { describe, expect, test } from 'vitest';
import {
	createAccount,
	deliveryBarrier,
	fault,
	faultStats,
	hostKind,
	observeDeliverySuccess,
	resolveRemoteNote,
	resolveRemoteUser,
	signedRequest,
	waitFor,
} from './utils.js';
import type { DeliveryCompletion, LoginUser } from './utils.js';

type Host = 'a.test' | 'b.test';
type FaultMode = 'outage' | 'response-loss';
type Operation = 'Note' | 'Follow' | 'Reaction' | 'Delete';

const directions: [Host, Host][] = [
	['a.test', 'b.test'],
	['b.test', 'a.test'],
];
// upstream の配送 backoff は 60 秒・180 秒と各最大 20% jitter を維持する。
const timeout = 480_000;
const reaction = '\u2764';

async function pair(senderHost: Host, receiverHost: Host) {
	const [sender, receiver] = await Promise.all([createAccount(senderHost), createAccount(receiverHost)]);
	const [senderInReceiver, receiverInSender] = await Promise.all([
		resolveRemoteUser(senderHost, sender.id, receiver),
		resolveRemoteUser(receiverHost, receiver.id, sender),
	]);
	return { sender, receiver, senderInReceiver, receiverInSender };
}

function like(senderHost: Host, senderId: string, receiverHost: Host, noteId: string) {
	return {
		'@context': 'https://www.w3.org/ns/activitystreams',
		type: 'Like',
		id: `https://${senderHost}/activities/${crypto.randomUUID()}`,
		actor: `https://${senderHost}/users/${senderId}`,
		object: `https://${receiverHost}/notes/${noteId}`,
		content: reaction,
	};
}

async function assertReaction(receiver: LoginUser, noteId: string, userId: string) {
	const reactions = await receiver.client.request('notes/reactions', { noteId });
	expect(reactions.map((entry) => ({ userId: entry.user.id, type: entry.type }))).toEqual([{ userId, type: reaction }]);
	expect((await receiver.client.request('notes/show', { noteId })).reactions).toEqual({ [reaction]: 1 });
}

async function noteMissing(receiver: LoginUser, noteId: string): Promise<boolean> {
	try {
		await receiver.client.request('notes/show', { noteId });
		return false;
	} catch (error) {
		if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'NO_SUCH_NOTE') {
			return true;
		}
		throw error;
	}
}

interface DeliveryScenario {
	activityType: 'Create' | 'Follow' | 'Like' | 'Delete';
	actorUri: string;
	objectUri: () => string;
	send: () => Promise<unknown>;
	hasEffect: () => Promise<boolean>;
	assertBefore: () => Promise<void>;
	assertFinal: () => Promise<void>;
}

async function prepareDelivery(senderHost: Host, receiverHost: Host, operation: Operation): Promise<DeliveryScenario> {
	const { sender, receiver, senderInReceiver, receiverInSender } = await pair(senderHost, receiverHost);

	if (operation === 'Follow') {
		const followers = () => receiver.client.request('users/followers', { userId: receiver.id, limit: 100 });
		return {
			activityType: 'Follow',
			actorUri: `https://${senderHost}/users/${sender.id}`,
			objectUri: () => `https://${receiverHost}/users/${receiver.id}`,
			send: () => sender.client.request('following/create', { userId: receiverInSender.id }),
			hasEffect: async () => (await followers()).some((entry) => entry.followerId === senderInReceiver.id),
			assertBefore: async () => {
				expect(await followers()).toEqual([]);
				expect((await receiver.client.request('users/show', { userId: senderInReceiver.id })).isFollowed).toBe(false);
			},
			assertFinal: async () => {
				expect((await followers()).map((entry) => entry.followerId)).toEqual([senderInReceiver.id]);
				expect((await receiver.client.request('users/show', { userId: receiver.id })).followersCount).toBe(1);
				expect((await receiver.client.request('users/show', { userId: senderInReceiver.id })).isFollowed).toBe(true);
				expect((await sender.client.request('users/show', { userId: receiverInSender.id })).isFollowing).toBe(true);
				expect((await sender.client.request('users/show', { userId: sender.id })).followingCount).toBe(1);
			},
		};
	}

	if (operation === 'Reaction') {
		const note = (await receiver.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
		const remoteNote = await resolveRemoteNote(receiverHost, note.id, sender);
		return {
			activityType: 'Like',
			actorUri: `https://${senderHost}/users/${sender.id}`,
			objectUri: () => `https://${receiverHost}/notes/${note.id}`,
			send: () => sender.client.request('notes/reactions/create', { noteId: remoteNote.id, reaction }),
			hasEffect: async () =>
				(await receiver.client.request('notes/reactions', { noteId: note.id })).some(
					(entry) => entry.user.id === senderInReceiver.id,
				),
			assertBefore: async () => {
				expect(await receiver.client.request('notes/reactions', { noteId: note.id })).toEqual([]);
				expect((await receiver.client.request('notes/show', { noteId: note.id })).reactions).toEqual({});
			},
			assertFinal: () => assertReaction(receiver, note.id, senderInReceiver.id),
		};
	}

	await receiver.client.request('following/create', { userId: senderInReceiver.id });
	await waitFor(
		async () =>
			(await sender.client.request('users/followers', { userId: sender.id })).some(
				(entry) => entry.followerId === receiverInSender.id,
			),
		timeout,
	);
	await deliveryBarrier(senderHost);
	const text = crypto.randomUUID();
	const notes = () => receiver.client.request('users/notes', { userId: senderInReceiver.id, limit: 100 });

	if (operation === 'Note') {
		let uri: string;
		return {
			activityType: 'Create',
			actorUri: `https://${senderHost}/users/${sender.id}`,
			objectUri: () => uri,
			send: async () => {
				const note = (await sender.client.request('notes/create', { text })).createdNote;
				uri = `https://${senderHost}/notes/${note.id}`;
			},
			hasEffect: async () => (await notes()).some((entry) => entry.uri === uri),
			assertBefore: async () => {
				expect(await notes()).toEqual([]);
			},
			assertFinal: async () => {
				const received = await notes();
				expect(received.map((entry) => ({ uri: entry.uri, text: entry.text, userId: entry.userId }))).toEqual([
					{ uri, text, userId: senderInReceiver.id },
				]);
				assert(received[0]);
				expect((await receiver.client.request('notes/show', { noteId: received[0].id })).text).toBe(text);
			},
		};
	}

	const note = (await sender.client.request('notes/create', { text })).createdNote;
	const uri = `https://${senderHost}/notes/${note.id}`;
	// 取得 API による再解決ではなく、配送で保存された投稿だけを観測する。
	await waitFor(async () => (await notes()).some((entry) => entry.uri === uri), timeout);
	await deliveryBarrier(senderHost);
	const remoteNote = (await notes()).find((entry) => entry.uri === uri);
	assert(remoteNote);
	return {
		activityType: 'Delete',
		actorUri: `https://${senderHost}/users/${sender.id}`,
		objectUri: () => uri,
		send: () => sender.client.request('notes/delete', { noteId: note.id }),
		hasEffect: () => noteMissing(receiver, remoteNote.id),
		assertBefore: async () => {
			expect((await notes()).map((entry) => entry.uri)).toEqual([uri]);
			expect((await receiver.client.request('notes/show', { noteId: remoteNote.id })).text).toBe(text);
		},
		assertFinal: async () => {
			expect(await notes()).toEqual([]);
			await expect(receiver.client.request('notes/show', { noteId: remoteNote.id })).rejects.toMatchObject({
				code: 'NO_SUCH_NOTE',
			});
			await expect(sender.client.request('notes/show', { noteId: note.id })).rejects.toMatchObject({
				code: 'NO_SUCH_NOTE',
			});
		},
	};
}

describe.each(directions)('Resilience %s -> %s', (senderHost, receiverHost) => {
	test(
		'valid signed GET returns a public Note to a remote actor',
		async () => {
			const { sender, receiver } = await pair(senderHost, receiverHost);
			const text = crypto.randomUUID();
			const note = (await receiver.client.request('notes/create', { text, visibility: 'public' })).createdNote;
			await deliveryBarrier(receiverHost);
			const response = await signedRequest(receiverHost, sender.id, `/notes/${note.id}`, { method: 'GET' });
			expect(response.status, `${hostKind(senderHost)} -> ${hostKind(receiverHost)} signed GET`).toBe(200);
			const document = await response.json();
			expect(document).toMatchObject({
				type: 'Note',
				id: `https://${receiverHost}/notes/${note.id}`,
				attributedTo: `https://${receiverHost}/users/${receiver.id}`,
			});
			expect(document.content).toContain(text);
		},
		timeout,
	);

	test(
		'valid signed POST applies exactly one Like',
		async () => {
			const { sender, receiver, senderInReceiver } = await pair(senderHost, receiverHost);
			const note = (await receiver.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
			const response = await signedRequest(receiverHost, sender.id, '/inbox', {
				method: 'POST',
				body: JSON.stringify(like(senderHost, sender.id, receiverHost, note.id)),
			});
			expect(response.ok, `${hostKind(senderHost)} -> ${hostKind(receiverHost)} signed POST`).toBe(true);
			await waitFor(
				async () =>
					(await receiver.client.request('notes/reactions', { noteId: note.id })).some(
						(entry) => entry.user.id === senderInReceiver.id,
					),
				timeout,
			);
			await deliveryBarrier(senderHost);
			await assertReaction(receiver, note.id, senderInReceiver.id);
		},
		timeout,
	);

	test.each(['body', 'actor', 'id', 'host', 'signed-actor-mismatch', 'signed-id-mismatch'] as const)(
		'%s causes no final side effect, while a subsequent valid POST succeeds',
		async (variant) => {
			const { sender, receiver, senderInReceiver } = await pair(senderHost, receiverHost);
			const note = (await receiver.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
			const activity = like(senderHost, sender.id, receiverHost, note.id);
			if (variant === 'signed-actor-mismatch') {
				const otherActor = await createAccount(senderHost);
				await resolveRemoteUser(senderHost, otherActor.id, receiver);
				activity.actor = `https://${senderHost}/users/${otherActor.id}`;
			} else if (variant === 'signed-id-mismatch') {
				activity.id = `https://${receiverHost}/activities/${crypto.randomUUID()}`;
			}
			await signedRequest(receiverHost, sender.id, '/inbox', {
				method: 'POST',
				body: JSON.stringify(activity),
				...(variant === 'signed-actor-mismatch' || variant === 'signed-id-mismatch' ? {} : { tamper: variant }),
			});
			// 202 は受理にすぎないため、署名検証を含む受信処理の完了後に副作用を判定する。
			await deliveryBarrier(senderHost);
			expect(
				await receiver.client.request('notes/reactions', { noteId: note.id }),
				`${hostKind(senderHost)} -> ${hostKind(receiverHost)} accepted ${variant}`,
			).toEqual([]);
			expect((await receiver.client.request('notes/show', { noteId: note.id })).reactions).toEqual({});
			expect((await receiver.client.request('notes/show', { noteId: note.id })).text).toBe(note.text);
			const control = await signedRequest(receiverHost, sender.id, '/inbox', {
				method: 'POST',
				body: JSON.stringify(like(senderHost, sender.id, receiverHost, note.id)),
			});
			expect(control.ok).toBe(true);
			await waitFor(
				async () => (await receiver.client.request('notes/reactions', { noteId: note.id })).length === 1,
				timeout,
			);
			await deliveryBarrier(senderHost);
			await assertReaction(receiver, note.id, senderInReceiver.id);
		},
		timeout,
	);

	describe.each<FaultMode>(['outage', 'response-loss'])('%s', (mode) => {
		test.each<Operation>(['Note', 'Follow', 'Reaction', 'Delete'])(
			'%s converges without duplicate effects',
			async (operation) => {
				const scenario = await prepareDelivery(senderHost, receiverHost, operation);
				await deliveryBarrier(senderHost);
				await scenario.assertBefore();
				await fault(receiverHost, mode, scenario.activityType);
				let senderCompletion: DeliveryCompletion | undefined;
				try {
					const baseline = await faultStats(receiverHost);
					await scenario.send();
					const attempts = async () =>
						(await faultStats(receiverHost, baseline.lastSequence)).observations.filter(
							(item) =>
								item.type === scenario.activityType &&
								item.actor === scenario.actorUri &&
								item.objectUri === scenario.objectUri(),
						);
					await waitFor(async () => (await attempts()).length > 0, timeout);
					const firstAttempt = (await attempts())[0];
					assert(firstAttempt?.id);
					const activityId = firstAttempt.id;
					if (mode === 'outage') {
						await waitFor(
							async () =>
								(await attempts()).some(
									(item) => item.id === activityId && item.outcome === 'rejected' && item.status === 503,
								),
							timeout,
						);
						expect((await attempts()).every((item) => item.mode === 'outage')).toBe(true);
						await scenario.assertBefore();
					} else {
						// 同じ activity の応答喪失を繰り返し、別配送の成功で再送判定を満たさない。
						await waitFor(
							async () =>
								(await attempts()).filter((item) => item.id === activityId && item.outcome === 'lost').length >= 2,
							timeout,
						);
						await waitFor(scenario.hasEffect, timeout);
					}
					senderCompletion = await observeDeliverySuccess(senderHost, receiverHost, activityId);
					const recoverySequence = (await faultStats(receiverHost, Number.MAX_SAFE_INTEGER)).lastSequence;
					await fault(receiverHost, 'pass');
					await waitFor(
						async () =>
							(await attempts()).some(
								(item) =>
									item.id === activityId &&
									item.sequence > recoverySequence &&
									item.mode === 'pass' &&
									item.outcome === 'acknowledged',
							),
						timeout,
					);
					await senderCompletion.waitForSuccess();
					await waitFor(scenario.hasEffect, timeout);
					await deliveryBarrier(senderHost);
					await scenario.assertFinal();
				} finally {
					await fault(receiverHost, 'pass');
					senderCompletion?.close();
					await deliveryBarrier(senderHost);
				}
			},
			timeout,
		);
	});
});
