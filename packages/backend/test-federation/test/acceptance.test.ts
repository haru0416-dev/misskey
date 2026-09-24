/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import assert from 'node:assert/strict';
import { describe, expect, test } from 'vitest';
import type * as Misskey from 'misskey-js';
import {
	createAccount,
	deliveryBarrier,
	faultStats,
	resolveRemoteNote,
	resolveRemoteUser,
	signedRequest,
	uploadFile,
	waitFor,
	errorMessageMatches,
	knownUpstreamFailure,
} from './utils.js';
import type { LoginUser } from './utils.js';

type Host = 'a.test' | 'b.test';
const convergenceTimeout = 120_000;
const testTimeout = 180_000;
const publicAudience = 'https://www.w3.org/ns/activitystreams#Public';

function unsignedRequest(host: Host, path: string): Promise<Response> {
	return fetch(`https://${host}${path}`, { headers: { accept: 'application/activity+json' } });
}

async function document(response: Response): Promise<Record<string, unknown>> {
	expect(response.status).toBe(200);
	expect(response.headers.get('content-type')).toMatch(/application\/(activity\+json|ld\+json)/);
	const body: unknown = await response.json();
	assert(body != null && typeof body === 'object' && !Array.isArray(body));
	return body as Record<string, unknown>;
}

function orderedItems(body: Record<string, unknown>): Record<string, unknown>[] {
	assert(Array.isArray(body['orderedItems']));
	return body['orderedItems'].map((item: unknown) => {
		assert(item != null && typeof item === 'object' && !Array.isArray(item));
		return item as Record<string, unknown>;
	});
}

function activityObject(activity: Record<string, unknown>): Record<string, unknown> {
	assert(activity['object'] != null && typeof activity['object'] === 'object' && !Array.isArray(activity['object']));
	return activity['object'] as Record<string, unknown>;
}

function collectionPath(host: Host, value: unknown): string {
	assert(typeof value === 'string');
	const url = new URL(value);
	expect(url.origin).toBe(`https://${host}`);
	return `${url.pathname}${url.search}`;
}

async function follow(sourceHost: Host, author: LoginUser, follower: LoginUser) {
	const authorOnPeer = await resolveRemoteUser(sourceHost, author.id, follower);
	await follower.client.request('following/create', { userId: authorOnPeer.id });
	await waitFor(
		async () => (await follower.client.request('users/show', { userId: authorOnPeer.id })).isFollowing === true,
		convergenceTimeout,
	);
	await deliveryBarrier(sourceHost);
	return authorOnPeer;
}

async function delivered(follower: LoginUser, uri: string): Promise<Misskey.entities.Note> {
	let note: Misskey.entities.Note | undefined;
	await waitFor(async () => {
		note = (await follower.client.request('notes/timeline', { limit: 100 })).find((item) => item.uri === uri);
		return note != null;
	}, convergenceTimeout);
	assert(note);
	return note;
}

async function hiddenNote(user: LoginUser, noteId: string, secret: string): Promise<void> {
	try {
		const note = await user.client.request('notes/show', { noteId });
		expect(note.isHidden).toBe(true);
		expect(note.text).toBeNull();
		expect(note.files ?? []).toEqual([]);
		expect(JSON.stringify(note)).not.toContain(secret);
	} catch (error) {
		// 非表示オブジェクトと存在秘匿のどちらも本文の非漏洩を満たす。
		expect(error).toMatchObject({ code: 'NO_SUCH_NOTE' });
	}
}

describe.each<[Host, Host]>([
	['a.test', 'b.test'],
	['b.test', 'a.test'],
])('Federation acceptance %s -> %s', (sourceHost, peerHost) => {
	test(
		'resolves the actor by handle and canonical URI without changing its identity',
		async () => {
			const [author, viewer] = await Promise.all([createAccount(sourceHost), createAccount(peerHost)]);
			const actorUri = `https://${sourceHost}/users/${author.id}`;
			const byHandle = await viewer.client.request('users/show', { username: author.username, host: sourceHost });
			const byUri = await resolveRemoteUser(sourceHost, author.id, viewer);
			expect(byHandle.id).toBe(byUri.id);
			expect(byUri).toMatchObject({ username: author.username, host: sourceHost, uri: actorUri });
			for (const response of [
				await unsignedRequest(sourceHost, `/users/${author.id}`),
				await signedRequest(sourceHost, viewer.id, `/users/${author.id}`),
			]) {
				const actor = await document(response);
				expect(actor).toMatchObject({
					id: actorUri,
					type: 'Person',
					preferredUsername: author.username,
					inbox: `${actorUri}/inbox`,
					outbox: `${actorUri}/outbox`,
					followers: `${actorUri}/followers`,
					publicKey: { owner: actorUri },
				});
			}
		},
		testTimeout,
	);

	test(
		'locked Follow remains pending until explicit Accept, then Undo removes both relationships',
		async () => {
			const [follower, author] = await Promise.all([createAccount(sourceHost), createAccount(peerHost)]);
			await author.client.request('i/update', { isLocked: true });
			const [authorOnSource, followerOnPeer] = await Promise.all([
				resolveRemoteUser(peerHost, author.id, follower),
				resolveRemoteUser(sourceHost, follower.id, author),
			]);
			await follower.client.request('following/create', { userId: authorOnSource.id });
			await waitFor(
				async () =>
					(await author.client.request('following/requests/list', {})).some(
						(request) => request.follower.id === followerOnPeer.id,
					),
				convergenceTimeout,
			);
			await deliveryBarrier(sourceHost);
			expect(
				(await follower.client.request('users/following', { userId: follower.id })).map(
					(relation) => relation.followeeId,
				),
			).not.toContain(authorOnSource.id);
			expect(
				(await author.client.request('users/followers', { userId: author.id })).map((relation) => relation.followerId),
			).not.toContain(followerOnPeer.id);

			await author.client.request('following/requests/accept', { userId: followerOnPeer.id });
			await waitFor(
				async () => (await follower.client.request('users/show', { userId: authorOnSource.id })).isFollowing === true,
				convergenceTimeout,
			);
			await deliveryBarrier(peerHost);
			expect(
				(await author.client.request('users/followers', { userId: author.id })).map((relation) => relation.followerId),
			).toEqual([followerOnPeer.id]);
			expect(await author.client.request('following/requests/list', {})).toEqual([]);

			await follower.client.request('following/delete', { userId: authorOnSource.id });
			await deliveryBarrier(sourceHost);
			await waitFor(
				async () => (await author.client.request('users/followers', { userId: author.id })).length === 0,
				convergenceTimeout,
			);
			expect(await follower.client.request('users/following', { userId: follower.id })).toEqual([]);
			expect(await author.client.request('following/requests/list', {})).toEqual([]);
		},
		testTimeout,
	);

	test(
		'delivers attachments and replies with canonical external content and parent identity',
		async () => {
			const [author, follower] = await Promise.all([createAccount(sourceHost), createAccount(peerHost)]);
			const authorOnPeer = await follow(sourceHost, author, follower);
			const uploaded = await uploadFile(sourceHost, author);
			const image = await author.client.request('drive/files/update', {
				fileId: uploaded.id,
				comment: 'federated image alternative text',
				isSensitive: true,
			});
			const parent = (await author.client.request('notes/create', { text: `parent-${crypto.randomUUID()}` }))
				.createdNote;
			const text = `attachment-${crypto.randomUUID()}`;
			const reply = (
				await author.client.request('notes/create', {
					text,
					cw: 'content warning',
					replyId: parent.id,
					fileIds: [image.id],
				})
			).createdNote;
			const replyUri = `https://${sourceHost}/notes/${reply.id}`;
			const parentUri = `https://${sourceHost}/notes/${parent.id}`;
			const received = await delivered(follower, replyUri);
			await deliveryBarrier(sourceHost);
			expect(received).toMatchObject({
				text,
				cw: 'content warning',
				userId: authorOnPeer.id,
				visibility: 'public',
				uri: replyUri,
			});
			expect(received.reply).toMatchObject({ uri: parentUri, text: parent.text });
			expect(received.replyId).toBe(received.reply?.id);
			expect(received.files).toHaveLength(1);
			const remoteFile = received.files?.[0];
			assert(remoteFile);
			expect(remoteFile).toMatchObject({
				type: image.type,
				comment: image.comment,
				isSensitive: true,
				properties: { width: image.properties.width, height: image.properties.height },
			});
			const [sourceBytes, remoteBytes] = await Promise.all([fetch(image.url), fetch(remoteFile.url)]);
			expect(sourceBytes.status).toBe(200);
			expect(remoteBytes.status).toBe(200);
			expect(new Uint8Array(await remoteBytes.arrayBuffer())).toEqual(new Uint8Array(await sourceBytes.arrayBuffer()));

			const external = await document(await unsignedRequest(sourceHost, `/notes/${reply.id}`));
			expect(external).toMatchObject({
				id: replyUri,
				type: 'Note',
				attributedTo: `https://${sourceHost}/users/${author.id}`,
				inReplyTo: parentUri,
				summary: reply.cw,
				sensitive: true,
			});
			expect(external['content']).toContain(text);
			expect(external['to']).toContain(publicAudience);
			expect(external['attachment']).toEqual([
				expect.objectContaining({
					type: 'Document',
					mediaType: image.type,
					name: image.comment,
					sensitive: true,
					url: image.url,
				}),
			]);
			assert(received.replyId);
			await waitFor(
				async () => (await follower.client.request('notes/show', { noteId: received.replyId! })).repliesCount === 1,
				convergenceTimeout,
			);
		},
		testTimeout,
	);

	test(
		'Reaction and Undo converge to one reaction then none on the original host',
		async () => {
			const [reactor, author] = await Promise.all([createAccount(sourceHost), createAccount(peerHost)]);
			const reactorOnPeer = await resolveRemoteUser(sourceHost, reactor.id, author);
			const original = (await author.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
			const remote = await resolveRemoteNote(peerHost, original.id, reactor);
			const reaction = '\u2764';
			await reactor.client.request('notes/reactions/create', { noteId: remote.id, reaction });
			await waitFor(
				async () => (await author.client.request('notes/reactions', { noteId: original.id })).length === 1,
				convergenceTimeout,
			);
			await deliveryBarrier(sourceHost);
			expect(await author.client.request('notes/reactions', { noteId: original.id })).toEqual([
				expect.objectContaining({ type: reaction, user: expect.objectContaining({ id: reactorOnPeer.id }) }),
			]);
			await reactor.client.request('notes/reactions/delete', { noteId: remote.id });
			await deliveryBarrier(sourceHost);
			await waitFor(
				async () => (await author.client.request('notes/reactions', { noteId: original.id })).length === 0,
				convergenceTimeout,
			);
			expect((await author.client.request('notes/show', { noteId: original.id })).reactions).toEqual({});
		},
		testTimeout,
	);

	test(
		'Announce and Undo remove only the renote, then Delete removes the delivered original',
		async () => {
			const [author, follower] = await Promise.all([createAccount(sourceHost), createAccount(peerHost)]);
			await follow(sourceHost, author, follower);
			const original = (await author.client.request('notes/create', { text: crypto.randomUUID() })).createdNote;
			const originalOnPeer = await delivered(follower, `https://${sourceHost}/notes/${original.id}`);
			const renote = (await author.client.request('notes/create', { renoteId: original.id })).createdNote;
			const renoteOnPeer = await delivered(follower, `https://${sourceHost}/notes/${renote.id}/activity`);
			expect(renoteOnPeer.renoteId).toBe(originalOnPeer.id);
			const announce = await document(await unsignedRequest(sourceHost, `/notes/${renote.id}/activity`));
			expect(announce).toMatchObject({
				type: 'Announce',
				id: `https://${sourceHost}/notes/${renote.id}/activity`,
				actor: `https://${sourceHost}/users/${author.id}`,
				object: `https://${sourceHost}/notes/${original.id}`,
			});
			await author.client.request('notes/delete', { noteId: renote.id });
			await deliveryBarrier(sourceHost);
			await expect(follower.client.request('notes/show', { noteId: renoteOnPeer.id })).rejects.toMatchObject({
				code: 'NO_SUCH_NOTE',
			});
			expect((await follower.client.request('notes/show', { noteId: originalOnPeer.id })).text).toBe(original.text);
			await author.client.request('notes/delete', { noteId: original.id });
			await deliveryBarrier(sourceHost);
			await expect(follower.client.request('notes/show', { noteId: originalOnPeer.id })).rejects.toMatchObject({
				code: 'NO_SUCH_NOTE',
			});
			expect((await follower.client.request('notes/timeline', { limit: 100 })).map((note) => note.id)).not.toContain(
				originalOnPeer.id,
			);
			expect((await unsignedRequest(sourceHost, `/notes/${original.id}`)).status).toBe(404);
		},
		testTimeout,
	);

	test(
		'profile Update changes the cached remote actor without changing identity',
		async () => {
			const [author, follower] = await Promise.all([createAccount(sourceHost), createAccount(peerHost)]);
			const remote = await follow(sourceHost, author, follower);
			const name = `updated-${crypto.randomUUID().slice(0, 8)}`;
			const description = `profile-${crypto.randomUUID()}`;
			await author.client.request('i/update', { name, description, isCat: true });
			await waitFor(
				async () => (await follower.client.request('users/show', { userId: remote.id })).description === description,
				convergenceTimeout,
			);
			await deliveryBarrier(sourceHost);
			expect(await follower.client.request('users/show', { userId: remote.id })).toMatchObject({
				id: remote.id,
				uri: `https://${sourceHost}/users/${author.id}`,
				name,
				description,
				isCat: true,
			});
			const actor = await document(await signedRequest(sourceHost, follower.id, `/users/${author.id}`));
			expect(actor['name']).toBe(name);
			expect(actor['summary']).toContain(description);
		},
		testTimeout,
	);

	test(
		'Move honors destination alias and transfers local and remote followers',
		// 公式版がローカル移行先を uri で探す不具合で、公式版側のフォロワーが引き継がれない (a.test 発の Move のみ)。
		knownUpstreamFailure(
			sourceHost === 'a.test',
			errorMessageMatches(/^Condition was not met within 120000ms$/),
			async () => {
				const [source, destination, sourceFollower, destinationFollower] = await Promise.all([
					createAccount(sourceHost),
					createAccount(peerHost),
					createAccount(sourceHost),
					createAccount(peerHost),
				]);
				await sourceFollower.client.request('following/create', { userId: source.id });
				const sourceOnPeer = await follow(sourceHost, source, destinationFollower);
				await destination.client.request('i/update', { alsoKnownAs: [`@${source.username}@${sourceHost}`] });
				const destinationOnSource = await resolveRemoteUser(peerHost, destination.id, source);
				const destinationActor = await document(await unsignedRequest(peerHost, `/users/${destination.id}`));
				expect(destinationActor['alsoKnownAs']).toContain(`https://${sourceHost}/users/${source.id}`);
				await source.client.request('i/move', { moveToAccount: `@${destination.username}@${peerHost}` });
				await waitFor(async () => {
					const [localFollowing, remoteFollowing] = await Promise.all([
						sourceFollower.client.request('users/following', { userId: sourceFollower.id }),
						destinationFollower.client.request('users/following', { userId: destinationFollower.id }),
					]);
					return (
						localFollowing.some((relation) => relation.followeeId === destinationOnSource.id) &&
						remoteFollowing.some((relation) => relation.followeeId === destination.id)
					);
				}, convergenceTimeout);
				await deliveryBarrier(sourceHost);
				const sourceFollowerOnPeer = await resolveRemoteUser(sourceHost, sourceFollower.id, destination);
				expect(
					(await destination.client.request('users/followers', { userId: destination.id }))
						.map((relation) => relation.followerId)
						.sort(),
				).toEqual([sourceFollowerOnPeer.id, destinationFollower.id].sort());
				expect((await source.client.request('i', {})).movedTo).toBe(destinationOnSource.id);
				expect((await destinationFollower.client.request('users/show', { userId: sourceOnPeer.id })).movedTo).toBe(
					destination.id,
				);
				const movedActor = await document(await unsignedRequest(sourceHost, `/users/${source.id}`));
				expect(movedActor['movedTo']).toBe(`https://${peerHost}/users/${destination.id}`);
			},
		),
		testTimeout,
	);

	test.each(['public', 'home', 'followers', 'specified', 'localOnly'] as const)(
		'%s preserves allowed delivery and denies unauthorized disclosure across pull and collection routes',
		async (visibility) => {
			const [author, allowed, denied, localViewer] = await Promise.all([
				createAccount(sourceHost),
				createAccount(peerHost),
				createAccount(peerHost),
				createAccount(sourceHost),
			]);
			const authorOnPeer = await follow(sourceHost, author, allowed);
			const allowedOnSource = await resolveRemoteUser(peerHost, allowed.id, author);
			if (visibility === 'specified') await follow(sourceHost, author, denied);
			await localViewer.client.request('following/create', { userId: author.id });
			const ingressStart = (await faultStats(peerHost, Number.MAX_SAFE_INTEGER)).lastSequence;
			const text = `visibility-${visibility}-${crypto.randomUUID()}`;
			const note = (
				await author.client.request('notes/create', {
					text,
					visibility: visibility === 'localOnly' ? 'public' : visibility,
					localOnly: visibility === 'localOnly',
					...(visibility === 'specified' ? { visibleUserIds: [allowedOnSource.id] } : {}),
				})
			).createdNote;
			const uri = `https://${sourceHost}/notes/${note.id}`;
			let remote: Misskey.entities.Note | undefined;
			if (visibility !== 'localOnly') {
				remote = await delivered(allowed, uri);
				expect(remote).toMatchObject({ text, uri, userId: authorOnPeer.id, visibility });
			} else {
				await waitFor(
					async () =>
						(await localViewer.client.request('notes/timeline', { limit: 100 })).some(
							(item) => item.id === note.id && item.text === text,
						),
					convergenceTimeout,
				);
			}
			await author.client.request('i/pin', { noteId: note.id });
			await deliveryBarrier(sourceHost);
			const publiclyFetchable = visibility === 'public' || visibility === 'home';
			const deniedTimeline = await denied.client.request('notes/timeline', { limit: 100 });
			expect(deniedTimeline.some((item) => item.uri === uri)).toBe(false);
			const globalTimeline = await denied.client.request('notes/global-timeline', { limit: 100 });
			expect(globalTimeline.some((item) => item.uri === uri)).toBe(visibility === 'public');
			if (visibility === 'localOnly') {
				const ingress = await faultStats(peerHost, ingressStart);
				expect(ingress.observations.filter((item) => item.uris.includes(uri))).toEqual([]);
				expect((await allowed.client.request('notes/timeline', { limit: 100 })).some((item) => item.uri === uri)).toBe(
					false,
				);
				expect(
					(await allowed.client.request('users/notes', { userId: authorOnPeer.id, limit: 100 })).some(
						(item) => item.uri === uri,
					),
				).toBe(false);
			} else {
				assert(remote);
				if (publiclyFetchable) {
					expect((await denied.client.request('notes/show', { noteId: remote.id })).text).toBe(text);
				} else {
					await hiddenNote(denied, remote.id, text);
					if (visibility === 'specified') {
						await hiddenNote(localViewer, note.id, text);
					} else {
						expect((await localViewer.client.request('notes/show', { noteId: note.id })).text).toBe(text);
					}
				}
			}
			for (const suffix of ['', '/activity']) {
				// 署名は既存の公開 GET 方針を拡張しない。非公開投稿の許可宛先は配送本文で検証する。
				for (const response of [
					await unsignedRequest(sourceHost, `/notes/${note.id}${suffix}`),
					await signedRequest(sourceHost, allowed.id, `/notes/${note.id}${suffix}`),
					await signedRequest(sourceHost, denied.id, `/notes/${note.id}${suffix}`),
				]) {
					if (publiclyFetchable) {
						const body = await document(response);
						const object = suffix === '' ? body : activityObject(body);
						expect(object['id']).toBe(uri);
						expect(object['content']).toContain(text);
						expect(object[visibility === 'public' ? 'to' : 'cc']).toContain(publicAudience);
					} else {
						expect(response.status).toBe(404);
						expect(await response.text()).not.toContain(text);
					}
				}
			}
			for (const viewer of [null, allowed, denied]) {
				const get = (path: string) =>
					viewer == null ? unsignedRequest(sourceHost, path) : signedRequest(sourceHost, viewer.id, path);
				const outbox = await document(await get(`/users/${author.id}/outbox`));
				const page = await document(await get(collectionPath(sourceHost, outbox['first'])));
				expect(page['type']).toBe('OrderedCollectionPage');
				expect(orderedItems(page).map((item) => activityObject(item)['id'])).toEqual(publiclyFetchable ? [uri] : []);
				const featured = await document(await get(`/users/${author.id}/collections/featured`));
				expect(orderedItems(featured).map((item) => item['id'])).toEqual(publiclyFetchable ? [uri] : []);
				if (!publiclyFetchable) {
					expect(JSON.stringify(page)).not.toContain(text);
					expect(JSON.stringify(featured)).not.toContain(text);
				}
			}
			const cachedActor = await allowed.client.request('users/show', { userId: authorOnPeer.id });
			expect(cachedActor.pinnedNotes.some((item) => item.uri === uri)).toBe(publiclyFetchable);
			if (!publiclyFetchable) expect(JSON.stringify(cachedActor.pinnedNotes)).not.toContain(text);
		},
		testTimeout,
	);

	test.each(['followers', 'specified'] as const)(
		'%s never crosses into a denied-only remote destination',
		async (visibility) => {
			const [author, localAllowed, remoteDenied] = await Promise.all([
				createAccount(sourceHost),
				createAccount(sourceHost),
				createAccount(peerHost),
			]);
			await localAllowed.client.request('following/create', { userId: author.id });
			const authorOnPeer = await resolveRemoteUser(sourceHost, author.id, remoteDenied);
			await resolveRemoteUser(peerHost, remoteDenied.id, author);
			if (visibility === 'specified') {
				await remoteDenied.client.request('following/create', { userId: authorOnPeer.id });
				await waitFor(
					async () =>
						(await remoteDenied.client.request('users/show', { userId: authorOnPeer.id })).isFollowing === true,
					convergenceTimeout,
				);
			}
			await deliveryBarrier(sourceHost);
			const ingressStart = (await faultStats(peerHost, Number.MAX_SAFE_INTEGER)).lastSequence;
			const secret = `denied-host-${crypto.randomUUID()}`;
			const confidential = (
				await author.client.request('notes/create', {
					text: secret,
					visibility,
					...(visibility === 'specified' ? { visibleUserIds: [localAllowed.id] } : {}),
				})
			).createdNote;
			const confidentialUri = `https://${sourceHost}/notes/${confidential.id}`;
			expect((await localAllowed.client.request('notes/show', { noteId: confidential.id })).text).toBe(secret);
			// 同じ送信者の後続公開配送を実際に受信させ、既知の宛先への通信が進んだことを確認する。
			const control = (
				await author.client.request('notes/create', {
					text: `@${remoteDenied.username}@${peerHost} progress-${crypto.randomUUID()}`,
					visibility: 'public',
				})
			).createdNote;
			const controlUri = `https://${sourceHost}/notes/${control.id}`;
			await waitFor(
				async () =>
					(await remoteDenied.client.request('users/notes', { userId: authorOnPeer.id, limit: 100 })).some(
						(note) => note.uri === controlUri,
					),
				convergenceTimeout,
			);
			await deliveryBarrier(sourceHost);
			const ingress = (await faultStats(peerHost, ingressStart)).observations;
			expect(ingress.some((item) => item.uris.includes(controlUri) && item.outcome === 'acknowledged')).toBe(true);
			expect(ingress.filter((item) => item.uris.includes(confidentialUri))).toEqual([]);
			const remoteNotes = await remoteDenied.client.request('users/notes', { userId: authorOnPeer.id, limit: 100 });
			expect(remoteNotes.some((note) => note.uri === confidentialUri)).toBe(false);
			expect(JSON.stringify(remoteNotes)).not.toContain(secret);
			expect((await signedRequest(sourceHost, remoteDenied.id, `/notes/${confidential.id}`)).status).toBe(404);
		},
		testTimeout,
	);

	test(
		'outbox pagination retains public/home notes without disclosing interleaved private notes',
		async () => {
			const [author, viewer] = await Promise.all([createAccount(sourceHost), createAccount(peerHost)]);
			const publicUris: string[] = [];
			const secrets: string[] = [];
			for (let index = 0; index < 23; index++) {
				const note = (
					await author.client.request('notes/create', {
						text: `page-${index}`,
						visibility: index % 2 === 0 ? 'public' : 'home',
					})
				).createdNote;
				publicUris.push(`https://${sourceHost}/notes/${note.id}`);
				if (index % 8 === 0) {
					const secret = `private-page-${crypto.randomUUID()}`;
					secrets.push(secret);
					await author.client.request('notes/create', { text: secret, visibility: 'specified' });
				}
			}
			await deliveryBarrier(sourceHost);
			for (const signed of [false, true]) {
				const get = (path: string) =>
					signed ? signedRequest(sourceHost, viewer.id, path) : unsignedRequest(sourceHost, path);
				const root = await document(await get(`/users/${author.id}/outbox`));
				let path = collectionPath(sourceHost, root['first']);
				const found: unknown[] = [];
				const visited = new Set<string>();
				for (let pageNumber = 0; pageNumber < 10; pageNumber++) {
					expect(visited.has(path)).toBe(false);
					visited.add(path);
					const page = await document(await get(path));
					expect(page['type']).toBe('OrderedCollectionPage');
					for (const secret of secrets) expect(JSON.stringify(page)).not.toContain(secret);
					const items = orderedItems(page);
					found.push(...items.map((item) => activityObject(item)['id']));
					if (items.length === 0 || page['next'] == null) break;
					path = collectionPath(sourceHost, page['next']);
				}
				expect(found).toEqual([...publicUris].reverse());
				expect(visited.size).toBeGreaterThan(1);
			}
		},
		testTimeout,
	);

	test(
		'reply visibility and public collections never expose an inaccessible parent or attachment',
		async () => {
			const [author, parentAuthor, follower] = await Promise.all([
				createAccount(sourceHost),
				createAccount(sourceHost),
				createAccount(peerHost),
			]);
			await follow(sourceHost, author, follower);
			await author.client.request('following/create', { userId: parentAuthor.id });
			const file = await uploadFile(sourceHost, parentAuthor);
			const secret = `private-parent-${crypto.randomUUID()}`;
			const parent = (
				await parentAuthor.client.request('notes/create', { text: secret, visibility: 'followers', fileIds: [file.id] })
			).createdNote;
			const text = `restricted-child-${crypto.randomUUID()}`;
			const reply = (await author.client.request('notes/create', { text, visibility: 'public', replyId: parent.id }))
				.createdNote;
			expect(reply.visibility).toBe('followers');
			await author.client.request('i/pin', { noteId: reply.id });
			const publicText = `public-control-${crypto.randomUUID()}`;
			const control = (await author.client.request('notes/create', { text: publicText, visibility: 'public' }))
				.createdNote;
			await author.client.request('i/pin', { noteId: control.id });
			await deliveryBarrier(sourceHost);
			for (const viewer of [null, follower]) {
				const get = (path: string) =>
					viewer == null ? unsignedRequest(sourceHost, path) : signedRequest(sourceHost, viewer.id, path);
				for (const path of [`/notes/${reply.id}`, `/notes/${reply.id}/activity`]) {
					expect((await get(path)).status).toBe(404);
				}
				for (const path of [
					`/notes/${control.id}`,
					`/notes/${control.id}/activity`,
					`/users/${author.id}/outbox?page=true`,
					`/users/${author.id}/collections/featured`,
				]) {
					const serialized = JSON.stringify(await document(await get(path)));
					expect(serialized).toContain(publicText);
					expect(serialized).not.toContain(text);
					expect(serialized).not.toContain(secret);
					expect(serialized).not.toContain(file.url);
				}
				expect((await get(`/notes/${parent.id}`)).status).toBe(404);
			}
			const received = await delivered(follower, `https://${sourceHost}/notes/${reply.id}`);
			expect(received.text).toBe(text);
			expect(received.replyId).toBeNull();
			expect(received.reply ?? null).toBeNull();
			expect(JSON.stringify(received)).not.toContain(secret);
			expect(JSON.stringify(received)).not.toContain(file.url);
		},
		testTimeout,
	);

	test(
		'specified reply reaches its own recipient without exposing an inaccessible specified parent',
		async () => {
			const [author, recipient] = await Promise.all([createAccount(sourceHost), createAccount(peerHost)]);
			await follow(sourceHost, author, recipient);
			const recipientOnSource = await resolveRemoteUser(peerHost, recipient.id, author);
			const secret = `specified-parent-${crypto.randomUUID()}`;
			const parent = (await author.client.request('notes/create', { text: secret, visibility: 'specified' }))
				.createdNote;
			const text = `specified-child-${crypto.randomUUID()}`;
			const reply = (
				await author.client.request('notes/create', {
					text,
					visibility: 'specified',
					replyId: parent.id,
					visibleUserIds: [recipientOnSource.id],
				})
			).createdNote;
			const received = await delivered(recipient, `https://${sourceHost}/notes/${reply.id}`);
			await deliveryBarrier(sourceHost);
			expect(received).toMatchObject({ text, visibility: 'specified', replyId: null });
			expect(received.reply ?? null).toBeNull();
			expect(JSON.stringify(received)).not.toContain(secret);
			expect(JSON.stringify(received)).not.toContain(`https://${sourceHost}/notes/${parent.id}`);
			expect(
				(await recipient.client.request('notes/timeline', { limit: 100 })).some(
					(note) => note.uri === `https://${sourceHost}/notes/${parent.id}`,
				),
			).toBe(false);
		},
		testTimeout,
	);
});
