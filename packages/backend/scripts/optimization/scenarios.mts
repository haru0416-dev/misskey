/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { strict as assert } from 'node:assert';
import { setTimeout as sleep } from 'node:timers/promises';
import { inspect } from 'node:util';
import { z } from 'zod';
import policy from './preregistration.json' with { type: 'json' };

export type Peer = { url: string; adminTokenEnv: string; kind: 'fork' | 'upstream' };
export type CorrectnessCheck = { name: string; passed: boolean; evidence: unknown };
export type RecoveryNote = {
	id: string;
	uri: string;
	text: string | null;
	visibility: string;
	userId: string;
	localOnly: boolean;
};
export type RecoverySnapshot = {
	peer: { url: string; kind: 'fork' | 'upstream'; version: string; commit: string; image: string };
	authorId: string;
	notes: RecoveryNote[];
	timelineCache: { key: string; ttlMs: number; ids: string[] } | null;
};
export type RecoveryProbe = (authorId: string) => Promise<RecoverySnapshot>;
type RecoveryExpected = { uri: string; text: string | null; visibility: string };
type RecoveryDirect = Omit<RecoveryNote, 'localOnly'>;
export type RecoveryListingEvidence = {
	kind: 'upstream-user-timeline-cache';
	peer: RecoverySnapshot['peer'];
	authorId: string;
	viewerId: string;
	expected: RecoveryExpected[];
	stored: RecoveryNote[];
	direct: RecoveryDirect[];
	listed: RecoveryDirect[];
	timelineCache: RecoverySnapshot['timelineCache'];
	deadlineExpired: boolean;
};

const recoveryIdentifier = z.string().regex(/^[a-zA-Z0-9]+$/);
const recoveryExpectedSchema = z.object({
	uri: z.url().regex(/^https?:\/\/[^/]+\/notes\/[a-zA-Z0-9]+$/),
	text: z.string().nullable(),
	visibility: z.enum(['public', 'home', 'followers']),
});
const recoveryDirectSchema = recoveryExpectedSchema.extend({
	id: recoveryIdentifier,
	userId: recoveryIdentifier,
	isHidden: z.literal(false).optional(),
	localOnly: z.literal(false).optional(),
});
const recoveryStoredSchema = recoveryDirectSchema.extend({ localOnly: z.literal(false) });
const recoverySnapshotSchema = z.object({
	peer: z.object({
		url: z.url(),
		kind: z.enum(['fork', 'upstream']),
		version: z.string().min(1),
		commit: z.string().min(1),
		image: z.string().min(1),
	}),
	authorId: recoveryIdentifier,
	notes: z.array(recoveryStoredSchema),
	timelineCache: z
		.object({
			key: z.string().min(1),
			ttlMs: z.number().int().min(-1),
			ids: z.array(recoveryIdentifier),
		})
		.nullable(),
});
const recoveryListingSchema = z.object({
	kind: z.literal('upstream-user-timeline-cache'),
	peer: recoverySnapshotSchema.shape.peer,
	authorId: recoveryIdentifier,
	viewerId: recoveryIdentifier,
	expected: z.array(recoveryExpectedSchema),
	stored: z.array(recoveryStoredSchema),
	direct: z.array(recoveryDirectSchema),
	listed: z.array(recoveryDirectSchema),
	timelineCache: recoverySnapshotSchema.shape.timelineCache,
	deadlineExpired: z.boolean(),
});
const recoveryPageSchema = z.array(recoveryDirectSchema).max(100);

function sameContent(actual: RecoveryExpected, expected: RecoveryExpected): boolean {
	return actual.uri === expected.uri && actual.text === expected.text && actual.visibility === expected.visibility;
}

function completeStored(expected: RecoveryExpected[], stored: RecoveryNote[], authorId: string): boolean {
	if (expected.length === 0 || stored.length !== expected.length) return false;
	const byUri = new Map(expected.map((note) => [note.uri, note]));
	if (byUri.size !== expected.length || new Set(stored.map((note) => note.id)).size !== stored.length) return false;
	for (const note of stored) {
		const wanted = byUri.get(note.uri);
		if (!wanted || note.userId !== authorId || !sameContent(note, wanted)) return false;
		byUri.delete(note.uri);
	}
	return byUri.size === 0;
}

function completeDirect(stored: RecoveryNote[], direct: RecoveryDirect[], authorId: string): boolean {
	if (direct.length !== stored.length) return false;
	const byId = new Map(stored.map((note) => [note.id, note]));
	for (const note of direct) {
		const wanted = byId.get(note.id);
		if (!wanted || note.userId !== authorId || !sameContent(note, wanted)) return false;
		byId.delete(note.id);
	}
	return byId.size === 0;
}

function validListed(stored: RecoveryNote[], listed: RecoveryDirect[], authorId: string): boolean {
	const byId = new Map(stored.map((note) => [note.id, note]));
	let previous: string | undefined;
	for (const note of listed) {
		const wanted = byId.get(note.id);
		if (
			!wanted ||
			note.userId !== authorId ||
			!sameContent(note, wanted) ||
			(previous !== undefined && previous <= note.id)
		)
			return false;
		previous = note.id;
		byId.delete(note.id);
	}
	return true;
}

export function acceptedRecoveryListingFailure(
	check: CorrectnessCheck,
	peer: Peer,
): { missingIds: string[] } | undefined {
	const approved = policy.knownUpstreamFailure;
	if (check.passed !== false || check.name !== approved.check || peer.kind !== 'upstream') return undefined;
	const parsed = recoveryListingSchema.safeParse(check.evidence);
	if (!parsed.success) return undefined;
	const evidence = parsed.data;
	if (evidence.kind !== approved.id || evidence.deadlineExpired !== true) return undefined;
	let origin: string;
	let cacheKey: string;
	try {
		const url = new URL(peer.url);
		origin = url.origin;
		cacheKey = `${url.host}:list:userTimeline:${evidence.authorId}`;
	} catch {
		return undefined;
	}
	if (
		origin === 'null' ||
		evidence.peer.url !== origin ||
		evidence.peer.kind !== peer.kind ||
		evidence.peer.kind !== approved.peer.kind ||
		evidence.peer.version !== approved.peer.version ||
		evidence.peer.commit !== approved.peer.commit ||
		evidence.peer.image !== approved.peer.image
	)
		return undefined;
	if (
		!completeStored(evidence.expected, evidence.stored, evidence.authorId) ||
		!completeDirect(evidence.stored, evidence.direct, evidence.authorId) ||
		!validListed(evidence.stored, evidence.listed, evidence.authorId)
	)
		return undefined;
	const cache = evidence.timelineCache;
	if (cache === null || cache.key !== cacheKey || cache.ttlMs !== -1 || cache.ids.length < 2) return undefined;
	const cachedIds = new Set<string>(cache.ids);
	if (cachedIds.size !== cache.ids.length) return undefined;
	const listedIds = new Set(evidence.listed.map((note) => note.id));
	const missingIds = evidence.stored
		.filter((note) => !listedIds.has(note.id))
		.map((note) => note.id)
		.sort()
		.reverse();
	if (missingIds.length === 0) return undefined;
	const orderedCache = [...cachedIds].sort();
	const oldest = orderedCache[0]!;
	if (!missingIds.every((id) => id > oldest && !cachedIds.has(id))) return undefined;
	return { missingIds };
}

class RecoveryListingFailure extends Error {
	constructor(readonly evidence: RecoveryListingEvidence) {
		super('Upstream recovery listing remained incomplete at the completion deadline');
	}
}
type User = { id: string; token: string; username: string };
type Note = {
	id: string;
	text: string | null;
	visibility: string;
	localOnly?: boolean;
	uri?: string;
	userId: string;
	reactions?: Record<string, number>;
};
type RequestOutcome = {
	endpoint: string;
	startedAt: string;
	startedMonotonicMs: number;
	durationMs: number;
	status: number | null;
	ok: boolean;
	body: unknown;
	error?: string;
};
export type Workload = {
	requests: Record<string, RequestOutcome[]>;
	correctness: CorrectnessCheck[];
	completion: { name: string; durationMs: number }[];
};

export function scenarios(
	peers: [Peer, Peer],
	output: Workload,
	persist: () => Promise<void>,
	recoveryProbe: RecoveryProbe,
) {
	const responseText = async (response: Response): Promise<string> => {
		if (!response.body) return '';
		const reader = response.body.getReader();
		const decoder = new TextDecoder();
		let bytes = 0;
		let text = '';
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				bytes += value.byteLength;
				if (bytes > policy.maximumResponseBytes) {
					const error = new Error(`Response exceeded ${policy.maximumResponseBytes} bytes`);
					try {
						await reader.cancel(error);
					} catch (cancelError) {
						throw new AggregateError([error, cancelError], 'Response overflow cancellation failed', {
							cause: cancelError,
						});
					}
					throw error;
				}
				text += decoder.decode(value, { stream: true });
			}
			return text + decoder.decode();
		} finally {
			reader.releaseLock();
		}
	};
	const api = async <T,>(
		peer: Peer,
		endpoint: string,
		body: Record<string, unknown>,
		token?: string,
		measurement?: string,
	): Promise<T> => {
		const start = performance.now();
		const outcome: RequestOutcome = {
			endpoint,
			startedAt: new Date().toISOString(),
			startedMonotonicMs: start,
			durationMs: 0,
			status: null,
			ok: false,
			body: null,
		};
		try {
			const response = await fetch(new URL(`/api/${endpoint}`, peer.url), {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ ...body, ...(token ? { i: token } : {}) }),
				signal: AbortSignal.timeout(policy.requestTimeoutMs),
			});
			outcome.status = response.status;
			const text = await responseText(response);
			outcome.body = text ? JSON.parse(text) : null;
			if (!response.ok) throw new Error(`${endpoint} returned ${response.status}: ${text}`);
			outcome.ok = true;
			return outcome.body as T;
		} catch (error) {
			outcome.error = error instanceof Error ? error.message : String(error);
			throw error;
		} finally {
			outcome.durationMs = performance.now() - start;
			if (measurement) (output.requests[measurement] ??= []).push(outcome);
		}
	};
	const check = async (name: string, fn: () => Promise<unknown>) => {
		const failures: unknown[] = [];
		try {
			output.correctness.push({ name, passed: true, evidence: await fn() });
		} catch (error) {
			const failed = {
				name,
				passed: false,
				evidence: error instanceof RecoveryListingFailure ? error.evidence : inspect(error, { depth: null }),
			};
			output.correctness.push(failed);
			if (!(error instanceof RecoveryListingFailure) || !acceptedRecoveryListingFailure(failed, peers[1])) {
				failures.push(error);
			}
		}
		try {
			await persist();
		} catch (error) {
			failures.push(error);
		}
		if (failures.length > 0)
			throw new AggregateError(failures, 'Correctness check or recording failed', { cause: failures[0] });
	};
	const until = async <T,>(fn: () => Promise<T | undefined>): Promise<T> => {
		const deadline = performance.now() + policy.completionTimeoutMs;
		while (performance.now() < deadline) {
			const result = await fn();
			if (result !== undefined) return result;
			await sleep(policy.sampleIntervalMs);
		}
		throw new Error('Asynchronous correctness observation timed out');
	};
	const account = async (peer: Peer, username: string): Promise<User> => {
		const adminToken = process.env[peer.adminTokenEnv];
		if (!adminToken) throw new Error(`Missing ${peer.adminTokenEnv}`);
		const password = 'Optimization-isolated-fixture-2026';
		const created = await api<{ id: string; token?: string }>(
			peer,
			'admin/accounts/create',
			{ username, password },
			adminToken,
		);
		if (!created.id) throw new Error('Account creation response has no id');
		if (peer.kind === 'fork') {
			await sleep(1000);
			const signed = await api<{ finished: boolean; id: string; i: string }>(peer, 'signin-flow', {
				username,
				password,
			});
			assert.equal(signed.finished, true);
			assert.ok(signed.i);
			return { id: signed.id, token: signed.i, username };
		}
		if (!created.token) throw new Error('Upstream admin/accounts/create must return token');
		return { id: created.id, token: created.token, username };
	};
	const [local, remote] = peers;
	let author: User;
	let reader: User;
	let outsider: User;
	let receiver: User;
	let remoteAuthorId: string;
	let initialCount = 0;
	// notesCount は削除で減らないため、現存投稿とは別に受理済み投稿数を数える。
	let createdCount = 0;
	const notes: Note[] = [];
	let remoteNote: Note;
	const create = async (
		text: string,
		visibility = 'public',
		measurement?: string,
		localOnly = false,
	): Promise<Note> => {
		const result = await api<{ createdNote: Note }>(
			local,
			'notes/create',
			{ text, visibility, localOnly, ...(visibility === 'specified' ? { visibleUserIds: [reader.id] } : {}) },
			author.token,
			measurement,
		);
		assert.ok(result?.createdNote?.id, 'Successful creation must return a note');
		assert.equal(result.createdNote.text, text);
		assert.equal(result.createdNote.visibility, visibility);
		assert.equal(result.createdNote.localOnly, localOnly);
		notes.push(result.createdNote);
		createdCount++;
		return result.createdNote;
	};
	const timeline = async (untilId?: string, limit = 100, measurement?: string) => {
		const actual = await api<Note[]>(
			local,
			'notes/timeline',
			{ limit, ...(untilId ? { untilId } : {}) },
			reader.token,
			measurement,
		);
		assert.ok(Array.isArray(actual), 'Timeline output must be an array');
		const expected = notes
			.filter((note) => !untilId || note.id < untilId)
			.sort((a, b) => b.id.localeCompare(a.id))
			.slice(0, limit);
		assert.deepEqual(
			actual.map((note) => ({ id: note.id, text: note.text, visibility: note.visibility })),
			expected.map((note) => ({ id: note.id, text: note.text, visibility: note.visibility })),
		);
		return actual;
	};
	const remoteNotes = (untilId?: string) =>
		api<Note[]>(
			remote,
			'users/notes',
			{ userId: remoteAuthorId, limit: 100, ...(untilId ? { untilId } : {}) },
			receiver.token,
		);
	return {
		async seed() {
			author = await account(local, 'opt_author');
			reader = await account(local, 'opt_reader');
			outsider = await account(local, 'opt_outsider');
			receiver = await account(remote, 'opt_receiver');
			await api(local, 'following/create', { userId: author.id }, reader.token);
			initialCount = (await api<{ notesCount: number }>(local, 'users/show', { userId: author.id }, author.token))
				.notesCount;
			assert.ok(Number.isSafeInteger(initialCount) && initialCount >= 0, 'Initial note count is invalid');
			const resolved = await api<{ type: string; object: { id: string } }>(
				remote,
				'ap/show',
				{ uri: new URL(`/users/${author.id}`, local.url).href },
				receiver.token,
			);
			assert.equal(resolved.type, 'User');
			remoteAuthorId = resolved.object.id;
			await api(remote, 'following/create', { userId: remoteAuthorId }, receiver.token);
			await until(async () =>
				(await api<{ isFollowing: boolean }>(remote, 'users/show', { userId: remoteAuthorId }, receiver.token))
					.isFollowing
					? true
					: undefined,
			);
			for (let index = 0; index < policy.seedNotes; index++)
				await create(
					`optimization-seed-${index}`,
					['public', 'home', 'followers', 'specified'][index % 4],
					undefined,
					index === 0,
				);
		},
		async precondition() {
			for (let index = 0; index < policy.preconditionPostRequests; index++)
				await create(`optimization-precondition-post-${index}`);
			let next = 0;
			const failures: unknown[] = [];
			await Promise.all(
				Array.from({ length: policy.loadConcurrency }, async () => {
					while (next < policy.preconditionLoadRequests) {
						const index = next++;
						try {
							await create(`optimization-precondition-load-${index}`);
						} catch (error) {
							failures.push(error);
						}
					}
				}),
			);
			if (failures.length > 0) throw new AggregateError(failures, 'Preconditioning failed');
		},
		async warm() {
			for (let index = 0; index < policy.warmupRequests; index++) await timeline();
		},
		async measure() {
			for (let index = 0; index < policy.postRequests; index++)
				await create(`optimization-post-${index}`, 'public', 'posting');
			for (let index = 0; index < policy.timelineRequests; index++) await timeline(undefined, 100, 'timeline');
			const sent = await create('optimization-federation-barrier', 'public', 'federationResponse');
			const sentRequest = output.requests['federationResponse']?.at(-1);
			assert.ok(sentRequest);
			await check('remote-push-storage-no-duplicate', async () => {
				remoteNote = await until(async () => {
					const found = (await remoteNotes()).filter(
						(note) => note.uri === new URL(`/notes/${sent.id}`, local.url).href,
					);
					assert.ok(found.length <= 1, 'Remote duplicate note');
					return found[0];
				});
				assert.equal(remoteNote.text, sent.text);
				assert.equal(remoteNote.visibility, 'public');
				output.completion.push({
					name: 'federationPush',
					durationMs: performance.now() - sentRequest.startedMonotonicMs,
				});
				return remoteNote;
			});
			await check('stored-content-and-visibility', async () => {
				const stored = [];
				for (const note of notes) {
					const actual = await api<Note>(local, 'notes/show', { noteId: note.id }, reader.token);
					assert.equal(actual.text, note.text);
					assert.equal(actual.visibility, note.visibility);
					stored.push(actual);
				}
				return stored;
			});
			await check('unauthorized-hidden', async () => {
				const observed = [];
				for (const note of notes.filter((item) => ['followers', 'specified'].includes(item.visibility))) {
					const response = await fetch(new URL('/api/notes/show', local.url), {
						method: 'POST',
						headers: { 'content-type': 'application/json' },
						body: JSON.stringify({ noteId: note.id, i: outsider.token }),
						signal: AbortSignal.timeout(policy.requestTimeoutMs),
					});
					const body = JSON.parse(await responseText(response)) as {
						text?: string | null;
						isHidden?: boolean;
						error?: { code?: string };
					};
					assert.ok(
						(response.status === 400 && body.error?.code === 'NO_SUCH_NOTE') ||
							(response.status === 200 && body.isHidden === true && body.text === null),
						'Unauthorized note must be hidden, not merely an arbitrary HTTP error',
					);
					observed.push({ id: note.id, status: response.status, body });
				}
				const pushed = await remoteNotes();
				assert.ok(!pushed.some((note) => note.text === 'optimization-seed-0'), 'localOnly leaked to remote');
				assert.ok(
					!pushed.some((note) => notes.some((item) => item.visibility === 'specified' && item.text === note.text)),
					'specified leaked to remote',
				);
				return observed;
			});
			await check('timeline-set-order-pagination', async () => {
				const expected = notes
					.map((note) => note.id)
					.sort()
					.reverse();
				const actual: Note[] = [];
				let cursor: string | undefined;
				for (let page = 0; page <= Math.ceil(expected.length / 7); page++) {
					const chunk = await timeline(cursor, 7);
					assert.ok(Array.isArray(chunk));
					actual.push(...chunk);
					if (chunk.length < 7) break;
					cursor = chunk.at(-1)!.id;
				}
				assert.deepEqual(
					actual.map((note) => note.id),
					expected,
				);
				return actual;
			});
			await check('note-count', async () => {
				const user = await api<{ notesCount: number }>(local, 'users/show', { userId: author.id }, reader.token);
				assert.equal(user.notesCount, initialCount + createdCount);
				return user;
			});
			await check('reaction-count-and-notification-no-duplicate', async () => {
				await api(local, 'notes/reactions/create', { noteId: sent.id, reaction: '👍' }, reader.token);
				const notifications = await until(async () => {
					const items = await api<{ id: string; type: string; note?: Note }[]>(
						local,
						'i/notifications',
						{ includeTypes: ['reaction'], limit: 100 },
						author.token,
					);
					return items.some((item) => item.note?.id === sent.id) ? items : undefined;
				});
				assert.equal(notifications.filter((item) => item.note?.id === sent.id).length, 1);
				const actual = await api<Note>(local, 'notes/show', { noteId: sent.id }, author.token);
				assert.equal(
					Object.values(actual.reactions ?? {}).reduce((sum, count) => sum + count, 0),
					1,
				);
				return { actual, notifications };
			});
			await api(local, 'notes/delete', { noteId: sent.id }, author.token);
			await check('remote-delete', async () => {
				await until(async () => ((await remoteNotes()).some((note) => note.id === remoteNote.id) ? undefined : true));
				const response = await fetch(new URL('/api/notes/show', remote.url), {
					method: 'POST',
					headers: { 'content-type': 'application/json' },
					body: JSON.stringify({ noteId: remoteNote.id, i: receiver.token }),
					signal: AbortSignal.timeout(policy.requestTimeoutMs),
				});
				const body = JSON.parse(await responseText(response)) as { error?: { code?: string } };
				assert.equal(response.status, 400);
				assert.equal(body.error?.code, 'NO_SUCH_NOTE');
				return { status: response.status, body };
			});
			notes.splice(
				notes.findIndex((note) => note.id === sent.id),
				1,
			);
			await persist();
		},
		async load() {
			let next = 0;
			const failures: unknown[] = [];
			await Promise.all(
				Array.from({ length: policy.loadConcurrency }, async () => {
					while (next < policy.loadRequests) {
						const index = next++;
						try {
							await create(`optimization-load-${index}`, 'public', 'load');
						} catch (error) {
							failures.push(error);
						}
					}
				}),
			);
			try {
				await persist();
			} catch (error) {
				failures.push(error);
			}
			if (failures.length > 0) throw new AggregateError(failures, 'Load or recording failed');
		},
		async recovered() {
			const expectedRemote = notes
				.filter((note) => !note.localOnly && note.visibility !== 'specified')
				.map((note) => ({
					uri: new URL(`/notes/${note.id}`, local.url).href,
					text: note.text,
					visibility: note.visibility,
				}))
				.sort((a, b) => a.uri.localeCompare(b.uri));
			const expectedByUri = new Map(expectedRemote.map((note) => [note.uri, note]));
			const snapshot = async () => {
				const observed = recoverySnapshotSchema.parse(await recoveryProbe(remoteAuthorId));
				assert.equal(observed.peer.url, new URL(remote.url).origin, 'Recovery probe peer origin mismatch');
				assert.equal(observed.peer.kind, remote.kind, 'Recovery probe peer kind mismatch');
				assert.equal(observed.authorId, remoteAuthorId, 'Recovery probe author mismatch');
				assert.equal(expectedByUri.size, expectedRemote.length, 'Duplicate expected remote URI');
				const seenIds = new Set<string>();
				const seenUris = new Set<string>();
				for (const note of observed.notes) {
					const wanted = expectedByUri.get(note.uri);
					assert.ok(wanted, 'Unexpected remote storage, including private or local-only notes');
					assert.equal(note.userId, remoteAuthorId);
					assert.ok(sameContent(note, wanted), 'Remote stored content or visibility changed');
					assert.ok(!seenIds.has(note.id) && !seenUris.has(note.uri), 'Duplicate remote storage');
					seenIds.add(note.id);
					seenUris.add(note.uri);
				}
				return observed;
			};
			const directlyRead = async (stored: RecoveryNote[]) => {
				const direct: RecoveryDirect[] = [];
				for (const note of stored) {
					const actual = recoveryDirectSchema.parse(
						await api<unknown>(remote, 'notes/show', { noteId: note.id }, receiver.token),
					);
					assert.equal(actual.id, note.id, 'Direct retrieval returned another note');
					assert.equal(actual.userId, remoteAuthorId);
					assert.ok(sameContent(actual, note), 'Remote direct content or visibility changed');
					direct.push({
						id: actual.id,
						uri: actual.uri,
						text: actual.text,
						visibility: actual.visibility,
						userId: actual.userId,
					});
				}
				assert.ok(completeDirect(stored, direct, remoteAuthorId), 'Remote direct retrieval is incomplete');
				return direct;
			};
			let stored: RecoverySnapshot;
			let direct: RecoveryDirect[];
			await check('load-shutdown-restart-no-loss', async () => {
				const recovered = [];
				for (const expected of notes) {
					const actual = await api<Note>(local, 'notes/show', { noteId: expected.id }, reader.token);
					assert.equal(actual.id, expected.id);
					assert.equal(actual.text, expected.text);
					assert.equal(actual.visibility, expected.visibility);
					assert.equal(actual.localOnly, expected.localOnly);
					recovered.push({
						id: actual.id,
						text: actual.text,
						visibility: actual.visibility,
						localOnly: actual.localOnly,
					});
				}
				const user = await api<{ notesCount: number }>(local, 'users/show', { userId: author.id }, reader.token);
				assert.equal(user.notesCount, initialCount + createdCount);
				stored = await until(async () => {
					const observed = await snapshot();
					return completeStored(expectedRemote, observed.notes, remoteAuthorId) ? observed : undefined;
				});
				direct = await directlyRead(stored.notes);
				return { recovered, user, expected: expectedRemote, snapshot: stored, viewerId: receiver.id, direct };
			});
			await check('upstream-recovery-listing', async () => {
				const deadline = performance.now() + policy.completionTimeoutMs;
				let listed: RecoveryDirect[] = [];
				let complete = false;
				while (performance.now() < deadline) {
					listed = [];
					let untilId: string | undefined;
					while (true) {
						const page = recoveryPageSchema.parse(await remoteNotes(untilId));
						for (const note of page) {
							listed.push({
								id: note.id,
								uri: note.uri,
								text: note.text,
								visibility: note.visibility,
								userId: note.userId,
							});
						}
						assert.ok(
							validListed(stored.notes, listed, remoteAuthorId),
							'Invalid remote listing set, content, visibility or order',
						);
						if (page.length < 100) break;
						untilId = page.at(-1)!.id;
					}
					complete = listed.length === expectedRemote.length;
					if (complete) break;
					await sleep(policy.sampleIntervalMs);
				}
				// 欠落判定には期限後の保存状態と同じ閲覧者の直接取得を使い、古い成功結果を流用しない。
				if (!complete) {
					stored = await snapshot();
					assert.ok(
						completeStored(expectedRemote, stored.notes, remoteAuthorId),
						'Remote storage missing after listing deadline',
					);
					direct = await directlyRead(stored.notes);
				}
				const evidence: RecoveryListingEvidence = {
					kind: 'upstream-user-timeline-cache',
					peer: stored.peer,
					authorId: remoteAuthorId,
					viewerId: receiver.id,
					expected: expectedRemote,
					stored: stored.notes,
					direct,
					listed,
					timelineCache: stored.timelineCache,
					deadlineExpired: !complete,
				};
				if (!complete) throw new RecoveryListingFailure(evidence);
				return evidence;
			});
		},
	};
}
