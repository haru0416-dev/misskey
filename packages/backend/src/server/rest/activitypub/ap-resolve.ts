/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import * as htmlParser from 'node-html-parser';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import { ApRequestCreator } from '@/core/activitypub/ap-request.js';
import { FetchAllowSoftFailMask, assertActivityMatchesUrl } from '@/core/activitypub/misc/check-against-url.js';
import { validateContentTypeSetAsActivityPub } from '@/core/activitypub/misc/validator.js';
import {
	isCollectionOrOrderedCollection,
	type ICollection,
	type IObject,
	type IOrderedCollection,
} from '@/core/activitypub/type.js';
import { fetchOrCreateSystemAccountInDatabase } from '@/core/system-account/SystemAccountLogic.js';
import { fetchFollowRequestByIdFromDatabase } from '@/core/user/FollowRequestStore.js';
import {
	fetchNoteByIdFromDatabase,
	fetchNoteByIdOrFailFromDatabase,
	fetchNoteByUriFromDatabase,
} from '@/core/note/NoteStore.js';
import { fetchNoteReactionByIdOrFailFromDatabase } from '@/core/note/NoteReactionStore.js';
import { fetchPollByNoteIdOrFailFromDatabase } from '@/core/note/PollStore.js';
import {
	fetchLocalUserByIdFromDatabase,
	fetchRemoteUserByIdFromDatabase,
	fetchUserByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserByUriFromDatabase,
} from '@/core/user/UserStore.js';
import { fetchUserKeypairFromDatabaseCached } from '@/core/user/UserKeypairStore.js';
import { fetchUserPublickeyByKeyIdFromDatabase } from '@/core/user/UserPublickeyStore.js';
import type { MiUserPublickey } from '@/models/UserPublickey.js';
import { genId } from '@/misc/id/gen-id.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { getApId } from '@/core/activitypub/type.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiRemoteUser, MiUser } from '@/models/User.js';
import { addActivityContext, renderCreateForHonoApi, renderLikeForHonoApi, renderNoteForHonoApi } from './notes-ap.js';
import { renderPersonForHonoApi, type HonoApiAccountUpdateDependencies } from '../account/account-update.js';

export type HonoApiApResolveDependencies = HonoApiAccountUpdateDependencies & {
	httpRequestService: HttpRequestService;
};

type LocalApUriParseResult =
	| {
			local: true;
			id: string | undefined;
			type: string | undefined;
			rest?: string;
	  }
	| {
			local: false;
			uri: string;
	  };

function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

export function extractDbHost(uri: string): string {
	const url = new URL(uri);
	return toPuny(url.host);
}

function punyHost(url: string): string {
	const urlObj = new URL(url);
	return `${toPuny(urlObj.hostname)}${urlObj.port.length > 0 ? ':' + urlObj.port : ''}`;
}

export function isSelfHost(config: Pick<Config, 'runtime'>, host: string | null): boolean {
	if (host == null) return true;
	return toPuny(config.runtime.host) === toPuny(host);
}

function isBlockedHost(blockedHosts: string[], host: string | null): boolean {
	if (host == null) return false;
	return blockedHosts.some((x) => `.${host.toLowerCase()}`.endsWith(`.${x}`));
}

export function isFederationAllowedHost(
	config: Pick<Config, 'runtime'>,
	meta: Pick<import('@/models/_.js').MiMeta, 'federation' | 'federationHosts' | 'blockedHosts'>,
	host: string,
): boolean {
	if (isSelfHost(config, host)) return true;
	if (meta.federation === 'none') return false;
	if (meta.federation === 'specified' && !meta.federationHosts.some((x) => `.${host.toLowerCase()}`.endsWith(`.${x}`)))
		return false;
	if (isBlockedHost(meta.blockedHosts, host)) return false;
	return true;
}

export function isFederationAllowedUri(
	config: Pick<Config, 'runtime'>,
	meta: Pick<import('@/models/_.js').MiMeta, 'federation' | 'federationHosts' | 'blockedHosts'>,
	uri: string,
): boolean {
	return isFederationAllowedHost(config, meta, extractDbHost(uri));
}

export function parseLocalApUri(
	config: { runtime: Pick<Config['runtime'], 'host'> },
	uri: string,
): LocalApUriParseResult {
	const url = new URL(uri);
	if (toPuny(url.host) !== toPuny(config.runtime.host)) {
		return { local: false, uri: url.href };
	}

	const [, type, id, ...rest] = url.pathname.split('/');
	return {
		local: true,
		type,
		id,
		...(rest.length === 0 ? {} : { rest: rest.join('/') }),
	};
}

/** 認証済み・レート制限付きの ap/show だけが使うため、プロセスローカルキャッシュを持たず直接DBを読む。 */
export async function getNoteFromApIdForHonoApi(
	deps: { config: Pick<Config, 'runtime'>; db: MiDrizzleDatabase },
	value: string | IObject,
): Promise<MiNote | null> {
	const parsed = parseLocalApUri(deps.config, getApId(value));
	if (parsed.local) {
		if (parsed.type !== 'notes' || parsed.id == null) return null;
		return await fetchNoteByIdFromDatabase(deps.db, parsed.id);
	}
	return await fetchNoteByUriFromDatabase(deps.db, parsed.uri);
}

/** 認証済み・レート制限付きの ap/show だけが使うため、プロセスローカルキャッシュを持たず直接DBを読む。 */
export async function getUserFromApIdForHonoApi(
	deps: { config: Pick<Config, 'runtime'>; db: MiDrizzleDatabase },
	value: string | IObject,
): Promise<MiLocalUser | MiRemoteUser | null> {
	const parsed = parseLocalApUri(deps.config, getApId(value));
	if (parsed.local) {
		if (parsed.type !== 'users' || parsed.id == null) return null;
		const user = await fetchUserByIdFromDatabase(deps.db, parsed.id);
		return user == null || user.isDeleted ? null : (user as MiLocalUser);
	}
	const user = await fetchUserByUriFromDatabase(deps.db, parsed.uri);
	return user == null || user.isDeleted ? null : (user as MiRemoteUser);
}

export type HonoApiAuthUser = {
	user: MiRemoteUser;
	key: MiUserPublickey | null;
};

/** 認証済み・レート制限付きの AP 解決経路で使うため、プロセスローカルキャッシュを持たず直接DBを読む。 */
export async function getAuthUserFromKeyIdForHonoApi(
	deps: { db: MiDrizzleDatabase },
	keyId: string,
): Promise<HonoApiAuthUser | null> {
	const key = await fetchUserPublickeyByKeyIdFromDatabase(deps.db, keyId);
	if (key == null) return null;

	const user = await fetchUserByIdFromDatabase(deps.db, key.userId);
	if (user == null || user.isDeleted) return null;

	return { user: user as MiRemoteUser, key };
}

function renderQuestionForHonoApi(
	config: Pick<Config, 'instance'>,
	user: { id: MiUser['id'] },
	note: { id: string; text: string | null },
	poll: { multiple: boolean; choices: string[]; votes: number[] },
): Record<string, unknown> {
	return {
		type: 'Question',
		id: `${config.instance.url}/questions/${note.id}`,
		actor: `${config.instance.url}/users/${user.id}`,
		content: note.text ?? '',
		[poll.multiple ? 'anyOf' : 'oneOf']: poll.choices.map((text, i) => ({
			name: text,
			_misskey_votes: poll.votes[i],
			replies: {
				type: 'Collection',
				totalItems: poll.votes[i],
			},
		})),
	};
}

function renderFollowForHonoApi(
	config: Pick<Config, 'instance'>,
	follower: MiLocalUser | MiRemoteUser,
	followee: MiLocalUser | MiRemoteUser,
	requestId?: string | null,
): Record<string, unknown> {
	const uri = (user: MiLocalUser | MiRemoteUser) =>
		user.host != null ? user.uri! : `${config.instance.url}/users/${user.id}`;
	return {
		id: requestId ?? `${config.instance.url}/follows/${follower.id}/${followee.id}`,
		type: 'Follow',
		actor: uri(follower),
		object: uri(followee),
	};
}

async function resolveLocalApObjectForHonoApi(deps: HonoApiApResolveDependencies, url: string): Promise<IObject> {
	const parsed = parseLocalApUri(deps.config, url);
	if (!parsed.local) throw new IdentifiableError('02b40cd0-fa92-4b0c-acc9-fb2ada952ab8', 'resolveLocal: not local');
	if (parsed.id == null) {
		throw new IdentifiableError('7a5d2fc0-94bc-4db6-b8b8-1bf24a2e23d0', `resolveLocal: type ${parsed.type} unhandled`);
	}

	switch (parsed.type) {
		case 'notes': {
			const note = await fetchNoteByIdOrFailFromDatabase(deps.db, parsed.id);
			if (parsed.rest === 'activity') {
				const rendered = await renderNoteForHonoApi(deps, note, true);
				return addActivityContext(
					deps.config,
					renderCreateForHonoApi(deps.config, rendered, note),
				) as unknown as IObject;
			}
			return (await renderNoteForHonoApi(deps, note, true)) as unknown as IObject;
		}
		case 'users': {
			const user = await fetchUserByIdOrFailFromDatabase(deps.db, parsed.id);
			return (await renderPersonForHonoApi(deps, user as MiLocalUser)) as unknown as IObject;
		}
		case 'questions': {
			const note = await fetchNoteByIdOrFailFromDatabase(deps.db, parsed.id);
			const poll = await fetchPollByNoteIdOrFailFromDatabase(deps.db, parsed.id);
			return renderQuestionForHonoApi(deps.config, { id: note.userId }, note, poll) as unknown as IObject;
		}
		case 'likes': {
			const reaction = await fetchNoteReactionByIdOrFailFromDatabase(deps.db, parsed.id);
			return addActivityContext(
				deps.config,
				await renderLikeForHonoApi(deps, reaction, { uri: null, id: reaction.noteId }),
			) as unknown as IObject;
		}
		case 'follows': {
			const followRequest = await fetchFollowRequestByIdFromDatabase(deps.db, parsed.id);
			if (followRequest == null)
				throw new IdentifiableError('a9d946e5-d276-47f8-95fb-f04230289bb0', 'resolveLocal: invalid follow request ID');
			const [follower, followee] = await Promise.all([
				fetchLocalUserByIdFromDatabase(deps.db, followRequest.followerId),
				fetchRemoteUserByIdFromDatabase(deps.db, followRequest.followeeId),
			]);
			if (follower == null || followee == null) {
				throw new IdentifiableError(
					'06ae3170-1796-4d93-a697-2611ea6d83b6',
					'resolveLocal: follower or followee does not exist',
				);
			}
			return addActivityContext(
				deps.config,
				renderFollowForHonoApi(deps.config, follower, followee, url),
			) as unknown as IObject;
		}
		default:
			throw new IdentifiableError(
				'7a5d2fc0-94bc-4db6-b8b8-1bf24a2e23d0',
				`resolveLocal: type ${parsed.type} unhandled`,
			);
	}
}

async function signedGetForHonoApi(
	deps: HonoApiApResolveDependencies,
	url: string,
	user: { id: MiUser['id'] },
	allowSoftfail: FetchAllowSoftFailMask,
	followAlternate = true,
): Promise<IObject> {
	const keypair = await fetchUserKeypairFromDatabaseCached(deps.db, user.id);

	const req = await ApRequestCreator.createSignedGet({
		key: {
			privateKeyPem: keypair.privateKey,
			keyId: `${deps.config.instance.url}/users/${user.id}#main-key`,
		},
		url,
		additionalHeaders: {},
	});

	const res = await deps.httpRequestService.send(
		url,
		{
			method: req.request.method,
			headers: req.request.headers,
		},
		{
			throwErrorWhenResponseNotOk: true,
		},
	);

	const contentType = res.headers.get('content-type');

	if (res.ok && (contentType ?? '').split(';', 1)[0]?.trimEnd().toLowerCase() === 'text/html' && followAlternate) {
		const html = await res.text();

		try {
			const document = htmlParser.parse(html);
			const alternate = document.querySelector('head > link[rel="alternate"][type="application/activity+json"]');
			if (alternate) {
				const href = alternate.getAttribute('href');
				if (href && punyHost(url) === punyHost(href)) {
					return await signedGetForHonoApi(deps, href, user, allowSoftfail, false);
				}
			}
		} catch (_) {
			// HTML の解析に失敗したため、全体を無視する。
		}
	}

	validateContentTypeSetAsActivityPub(res);
	const finalUrl = res.url;
	const activity = (await res.json()) as IObject;
	assertActivityMatchesUrl(url, activity, finalUrl, allowSoftfail);

	return activity;
}

export type HonoApiSignedPostDependencies = {
	config: Pick<Config, 'instance'>;
	db: MiDrizzleDatabase;
	httpRequestService: Pick<HttpRequestService, 'send'>;
};

export async function signedPostForHonoApi(
	deps: HonoApiSignedPostDependencies,
	user: { id: MiUser['id'] },
	url: string,
	object: unknown,
	digest?: string,
): Promise<void> {
	const body = typeof object === 'string' ? object : JSON.stringify(object);

	const keypair = await fetchUserKeypairFromDatabaseCached(deps.db, user.id);

	const req = await ApRequestCreator.createSignedPost({
		key: {
			privateKeyPem: keypair.privateKey,
			keyId: `${deps.config.instance.url}/users/${user.id}#main-key`,
		},
		url,
		body,
		...(digest === undefined ? {} : { digest }),
		additionalHeaders: {},
	});

	await deps.httpRequestService.send(url, {
		method: req.request.method,
		headers: req.request.headers,
		body,
	});
}

/**
 * 複数回の解決を跨いで再帰を防ぐ呼び出し元は、同じ `history` Set を明示的に使い回すこと。
 * 省略時は呼び出しごとに新しい Set を使うため、単発解決に限って使用できる。
 */
export async function resolveApObjectForHonoApi(
	deps: HonoApiApResolveDependencies,
	value: string | IObject,
	allowSoftfail: FetchAllowSoftFailMask = FetchAllowSoftFailMask.Strict,
	history: Set<string> = new Set(),
): Promise<IObject> {
	if (typeof value !== 'string') {
		return value;
	}

	if (value.includes('#')) {
		throw new IdentifiableError('b94fd5b1-0e3b-4678-9df2-dad4cd515ab2', `cannot resolve URL with fragment: ${value}`);
	}

	if (history.has(value)) {
		throw new IdentifiableError('0dc86cf6-7cd6-4e56-b1e6-5903d62d7ea5', 'cannot resolve already resolved one');
	}
	if (history.size > 256) {
		throw new IdentifiableError('d592da9f-822f-4d91-83d7-4ceefabcf3d2', `hit recursion limit: ${extractDbHost(value)}`);
	}
	history.add(value);

	const host = extractDbHost(value);
	if (isSelfHost(deps.config, host)) {
		return await resolveLocalApObjectForHonoApi(deps, value);
	}

	if (!isFederationAllowedHost(deps.config, deps.meta, host)) {
		throw new IdentifiableError('09d79f9e-64f1-4316-9cfa-e75c4d091574', 'Instance is blocked');
	}

	const object = deps.meta.signToActivityPubGet
		? await signedGetForHonoApi(
				deps,
				value,
				await fetchOrCreateSystemAccountInDatabase({ db: deps.db, meta: deps.meta, genId }, 'actor'),
				allowSoftfail,
			)
		: await deps.httpRequestService.getActivityJson(value, undefined, allowSoftfail);

	const contextOk = Array.isArray(object['@context'])
		? (object['@context'] as unknown[]).includes('https://www.w3.org/ns/activitystreams')
		: object['@context'] === 'https://www.w3.org/ns/activitystreams';
	if (!contextOk) {
		throw new IdentifiableError('72180409-793c-4973-868e-5a118eb5519b', 'invalid response');
	}

	return object;
}

export async function resolveCollectionForHonoApi(
	deps: HonoApiApResolveDependencies,
	value: string | IObject,
	history: Set<string> = new Set(),
): Promise<ICollection | IOrderedCollection> {
	const collection =
		typeof value === 'string'
			? await resolveApObjectForHonoApi(deps, value, FetchAllowSoftFailMask.Strict, history)
			: value;

	if (isCollectionOrOrderedCollection(collection)) {
		return collection;
	}
	throw new IdentifiableError(
		'f100eccf-f347-43fb-9b45-96a0831fb635',
		`unrecognized collection type: ${collection.type}`,
	);
}
