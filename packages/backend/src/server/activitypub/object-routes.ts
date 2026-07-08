/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { Hono } from 'hono';
import type { Context } from 'hono';
import type * as Redis from 'ioredis';
import { listFollowersByFolloweeIdWithPaginationFromDatabase, listFollowingsByFollowerIdWithPaginationFromDatabase } from '@/core/FollowingStore.js';
import { fetchNoteByIdFromDatabase, listActivityPubOutboxNotesByUserIdFromDatabase, listNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { fetchLocalUserByIdFromDatabase, fetchUserByIdFromDatabase, fetchUserByIdOrFailFromDatabase, fetchUserByUsernameAndHostFromDatabase } from '@/core/UserStore.js';
import { fetchUserKeypairFromDatabaseCached } from '@/core/UserKeypairStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import { listUserNotePiningsByUserIdFromDatabase } from '@/core/UserNotePiningStore.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import * as Acct from '@/misc/acct.js';
import { query as urlQuery } from '@/misc/prelude/url.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { getFanoutTimelineNotesForHonoApi } from '../rest/fanout-timeline.js';
import { renderKeyForHonoApi, renderPersonForHonoApi, type HonoApiAccountUpdateDependencies } from '../rest/account-update.js';
import { getUserUri, isRemoteUser } from '../rest/following.js';
import { renderNoteForHonoApi, renderNoteOrRenoteActivityForHonoApi } from '../rest/notes-ap.js';
import { isRenote, isQuote } from '@/misc/is-renote.js';

export type ApObjectRoutesDependencies = HonoApiAccountUpdateDependencies & {
	redisForTimelines: Redis.Redis;
};

const ACTIVITY_JSON = 'application/activity+json; charset=utf-8';
const LD_JSON = 'application/ld+json; profile="https://www.w3.org/ns/activitystreams"; charset=utf-8';

const apAcceptRegex = /application\/activity\+json|application\/ld\+json.+activitystreams/i;

function wantsAp(c: Context): boolean {
	return apAcceptRegex.test(c.req.header('accept') ?? '');
}

function apContentType(c: Context): string {
	const accept = c.req.header('accept') ?? '';
	return /application\/ld\+json/i.test(accept) ? LD_JSON : ACTIVITY_JSON;
}

function apHeaders(c: Context, cacheControl: string): Record<string, string> {
	return {
		'Content-Type': apContentType(c),
		'Cache-Control': cacheControl,
		'Vary': 'Accept',
		'Access-Control-Allow-Headers': 'Accept',
		'Access-Control-Allow-Methods': 'GET, OPTIONS',
		'Access-Control-Allow-Origin': '*',
		'Access-Control-Expose-Headers': 'Vary',
	};
}

function apJson(c: Context, body: Record<string, unknown>, cacheControl = 'public, max-age=180'): Response {
	return new Response(JSON.stringify(body), { status: 200, headers: apHeaders(c, cacheControl) });
}

function apError(status: number, cacheControl?: string): Response {
	const headers = new Headers({ 'Vary': 'Accept' });
	if (cacheControl) headers.set('Cache-Control', cacheControl);
	return new Response(null, { status, headers });
}

function isSelfHost(configHost: string, host: string | null): boolean {
	if (host == null) return true;
	return domainToASCII(configHost.toLowerCase()) === domainToASCII(host.toLowerCase());
}

/** ApRendererService.addContext 相当 (型を緩めたローカル版)。 */
function withApContext(obj: Record<string, unknown>): Record<string, unknown> {
	return { '@context': CONTEXT, ...obj };
}

/** ActivityPubServerService.packActivity 相当。 */
async function packActivity(deps: ApObjectRoutesDependencies, note: MiNote): Promise<Record<string, unknown> | null> {
	const pureRenote = isRenote(note) && !isQuote(note);
	const renote = pureRenote ? await fetchNoteByIdFromDatabase(deps.db, note.renoteId!) : null;
	return await renderNoteOrRenoteActivityForHonoApi(deps, {
		localOnly: note.localOnly,
		renote,
		isQuote: !pureRenote && note.renoteId != null,
	}, note);
}

/** ActivityPubServerService.userInfo 相当。 */
async function renderUserInfo(deps: ApObjectRoutesDependencies, c: Context, user: MiUser | null): Promise<Response> {
	if (user == null) return apError(404);

	if (isRemoteUser(user)) {
		if (user.uri == null || isSelfHost(deps.config.host, user.host)) {
			return apError(500);
		}
		return c.redirect(user.uri, 301);
	}

	return apJson(c, withApContext(await renderPersonForHonoApi(deps, user as MiLocalUser)));
}

/**
 * ActivityPubServerService 相当の ActivityPub オブジェクト GET サーバー。
 * /users/:user, /@:acct, /notes/:note は Accept ヘッダが AP を要求するときのみ応答し、
 * それ以外は next() で後段のクライアントページへフォールスルーする。
 */
export function createApObjectRoutesApp(deps: ApObjectRoutesDependencies): Hono {
	const app = new Hono();

	app.get('/notes/:note', async (c, next) => {
		if (!wantsAp(c)) {
			await next();
			return;
		}

		if (deps.meta.federation === 'none') return apError(403);

		const note = await fetchNoteByIdFromDatabase(deps.db, c.req.param('note'));
		if (note == null || !['public', 'home'].includes(note.visibility) || note.localOnly) {
			return apError(404);
		}

		if (note.userHost != null) {
			if (note.uri == null || isSelfHost(deps.config.host, note.userHost)) {
				return apError(500);
			}
			return c.redirect(note.uri);
		}

		return apJson(c, withApContext(await renderNoteForHonoApi(deps, note, false)));
	});

	app.get('/notes/:note/activity', async (c) => {
		if (deps.meta.federation === 'none') return apError(403);

		const note = await fetchNoteByIdFromDatabase(deps.db, c.req.param('note'));
		if (note == null || note.userHost != null || !['public', 'home'].includes(note.visibility) || note.localOnly) {
			return apError(404);
		}

		const activity = await packActivity(deps, note);
		if (activity == null) return apError(404);

		return apJson(c, withApContext(activity));
	});

	app.get('/users/:user/outbox', async (c) => {
		if (deps.meta.federation === 'none') return apError(403);

		const userId = c.req.param('user');
		const sinceId = c.req.query('since_id') ?? null;
		const untilId = c.req.query('until_id') ?? null;
		const page = c.req.query('page') === 'true';

		if (sinceId != null && untilId != null) return apError(400);

		const user = await fetchLocalUserByIdFromDatabase(deps.db, userId);
		if (user == null) return apError(404);

		const limit = 20;
		const partOf = `${deps.config.url}/users/${userId}/outbox`;

		if (page) {
			const getFromDb = (dbUntilId: string | null, dbSinceId: string | null, dbLimit: number) =>
				listActivityPubOutboxNotesByUserIdFromDatabase(deps.db, user.id, {
					limit: dbLimit,
					sinceId: dbSinceId,
					untilId: dbUntilId,
				});

			const notes = deps.meta.enableFanoutTimeline
				? await getFanoutTimelineNotesForHonoApi({ db: deps.db, meta: deps.meta, redisForTimelines: deps.redisForTimelines }, {
					sinceId,
					untilId,
					limit,
					allowPartial: false,
					me: null,
					redisTimelines: [`userTimeline:${user.id}`, `userTimelineWithReplies:${user.id}`],
					useDbFallback: true,
					ignoreAuthorFromMute: true,
					excludePureRenotes: false,
					noteFilter: (note) => {
						if (note.visibility !== 'home' && note.visibility !== 'public') return false;
						if (note.localOnly) return false;
						return true;
					},
					dbFallback: getFromDb,
				})
				: await getFromDb(untilId, sinceId, limit);

			if (sinceId) notes.reverse();

			const activities = (await Promise.all(notes.map(note => packActivity(deps, note)))).filter((x): x is Record<string, unknown> => x != null);
			const rendered: Record<string, unknown> = {
				id: `${partOf}?${urlQuery({ page: 'true', since_id: sinceId ?? undefined, until_id: untilId ?? undefined })}`,
				partOf,
				type: 'OrderedCollectionPage',
				totalItems: user.notesCount,
				orderedItems: activities,
			};
			if (notes.length > 0) {
				rendered.prev = `${partOf}?${urlQuery({ page: 'true', since_id: notes[0]!.id })}`;
				rendered.next = `${partOf}?${urlQuery({ page: 'true', until_id: notes.at(-1)!.id })}`;
			}

			return apJson(c, withApContext(rendered), 'public, max-age=180');
		}

		return apJson(c, withApContext({
			id: partOf,
			type: 'OrderedCollection',
			totalItems: user.notesCount,
			first: `${partOf}?page=true`,
			last: `${partOf}?page=true&since_id=000000000000000000000000`,
		}));
	});

	const renderFollowRelationCollection = async (
		c: Context,
		kind: 'followers' | 'following',
	): Promise<Response> => {
		if (deps.meta.federation === 'none') return apError(403);

		const userId = c.req.param('user') ?? '';
		const cursor = c.req.query('cursor') ?? null;
		const page = c.req.query('page') === 'true';

		const user = await fetchLocalUserByIdFromDatabase(deps.db, userId);
		if (user == null) return apError(404);

		const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
		const visibility = kind === 'followers' ? profile.followersVisibility : profile.followingVisibility;
		if (visibility !== 'public') {
			return apError(403, 'public, max-age=30');
		}

		const limit = 10;
		const partOf = `${deps.config.url}/users/${userId}/${kind}`;
		const totalItems = kind === 'followers' ? user.followersCount : user.followingCount;

		if (page) {
			const followings = kind === 'followers'
				? await listFollowersByFolloweeIdWithPaginationFromDatabase(deps.db, user.id, { limit: limit + 1, untilId: cursor, order: 'desc' })
				: await listFollowingsByFollowerIdWithPaginationFromDatabase(deps.db, user.id, { limit: limit + 1, untilId: cursor, order: 'desc' });

			const inStock = followings.length === limit + 1;
			if (inStock) followings.pop();

			const renderedUsers = await Promise.all(followings.map(async following => {
				const target = await fetchUserByIdOrFailFromDatabase(deps.db, kind === 'followers' ? following.followerId : following.followeeId);
				return getUserUri(deps.config, target);
			}));

			const rendered: Record<string, unknown> = {
				id: `${partOf}?${urlQuery({ page: 'true', cursor: cursor ?? undefined })}`,
				partOf,
				type: 'OrderedCollectionPage',
				totalItems,
				orderedItems: renderedUsers,
			};
			if (inStock) {
				rendered.next = `${partOf}?${urlQuery({ page: 'true', cursor: followings.at(-1)!.id })}`;
			}

			return apJson(c, withApContext(rendered), 'public, max-age=180');
		}

		return apJson(c, withApContext({
			id: partOf,
			type: 'OrderedCollection',
			totalItems,
			first: `${partOf}?page=true`,
		}));
	};

	app.get('/users/:user/followers', (c) => renderFollowRelationCollection(c, 'followers'));
	app.get('/users/:user/following', (c) => renderFollowRelationCollection(c, 'following'));

	app.get('/users/:user/collections/featured', async (c) => {
		if (deps.meta.federation === 'none') return apError(403);

		const user = await fetchLocalUserByIdFromDatabase(deps.db, c.req.param('user'));
		if (user == null) return apError(404);

		const pinings = await listUserNotePiningsByUserIdFromDatabase(deps.db, user.id, { order: 'desc' });
		const notes = pinings.length === 0
			? []
			: await listNotesByIdsFromDatabase(deps.db, pinings.map(pining => pining.noteId));
		const noteMap = new Map(notes.map(note => [note.id, note]));
		const pinnedNotes = pinings.map(pining => noteMap.get(pining.noteId))
			.filter((note): note is MiNote => note != null)
			.filter(note => !note.localOnly && ['public', 'home'].includes(note.visibility));

		const renderedNotes = await Promise.all(pinnedNotes.map(note => renderNoteForHonoApi(deps, note, true)));

		return apJson(c, withApContext({
			id: `${deps.config.url}/users/${user.id}/collections/featured`,
			type: 'OrderedCollection',
			totalItems: renderedNotes.length,
			orderedItems: renderedNotes,
		}));
	});

	app.get('/users/:user/publickey', async (c) => {
		if (deps.meta.federation === 'none') return apError(403);

		const user = await fetchLocalUserByIdFromDatabase(deps.db, c.req.param('user'));
		if (user == null) return apError(404);

		const keypair = await fetchUserKeypairFromDatabaseCached(deps.db, user.id);

		return apJson(c, withApContext(renderKeyForHonoApi(deps.config, user, keypair)));
	});

	app.get('/users/:user', async (c, next) => {
		if (!wantsAp(c)) {
			await next();
			return;
		}

		if (deps.meta.federation === 'none') return apError(403);

		const user = await fetchUserByIdFromDatabase(deps.db, c.req.param('user'));
		return await renderUserInfo(deps, c, user?.isSuspended ? null : user);
	});

	// Hono は /@:acct のようなセグメント内プレフィックス付きパラメータを解釈できないため、
	// feed.ts と同じくワイルドカード+手動パースで /@acct (サブパスなし) のAP要求のみ処理する。
	app.get('*', async (c, next) => {
		const pathname = new URL(c.req.url).pathname;
		if (!pathname.startsWith('/@')) {
			await next();
			return;
		}
		const rest = decodeURIComponent(pathname.slice(2));
		if (rest === '' || rest.includes('/')) {
			await next();
			return;
		}
		if (!wantsAp(c)) {
			await next();
			return;
		}

		if (deps.meta.federation === 'none') return apError(403);

		const acct = Acct.parse(rest);
		const host = isSelfHost(deps.config.host, acct.host) ? null : acct.host;

		const user = await fetchUserByUsernameAndHostFromDatabase(deps.db, acct.username, host);
		return await renderUserInfo(deps, c, user?.isSuspended ? null : user);
	});

	return app;
}
