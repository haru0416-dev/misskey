/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { getApId, isActor, isPost, type IObject } from '@/core/activitypub/type.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiNote } from '@/models/Note.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { parseHonoApiParams } from './validation.js';
import {
	extractDbHost,
	getNoteFromApIdForHonoApi,
	getUserFromApIdForHonoApi,
	isFederationAllowedUri,
	isSelfHost,
	resolveApObjectForHonoApi,
	type HonoApiApResolveDependencies,
} from './ap-resolve.js';
import { createNoteFromApForHonoApi, type HonoApiApNoteDependencies } from './ap-note.js';
import { createPersonForHonoApi, type HonoApiApPersonDependencies } from './ap-person.js';
import { packUserDetailedNotMeForHonoApi, type UserPackingDependencies } from './user.js';
import { packNoteForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { FetchAllowSoftFailMask } from '@/core/activitypub/misc/check-against-url.js';

const apGetParamDef = z.object({
	uri: z.string(),
});

type ApGetParams = {
	uri: string;
};

export async function handleHonoApiApGet(deps: HonoApiApResolveDependencies, body: Record<string, unknown>): Promise<IObject> {
	const params = parseHonoApiParams(apGetParamDef, body);
	return await resolveApObjectForHonoApi(deps, params.uri);
}

export type HonoApiApShowDependencies = HonoApiApNoteDependencies & HonoApiApPersonDependencies & UserPackingDependencies & HonoApiNoteDependencies;

const apShowParamDef = z.object({
	uri: z.string(),
});

type ApShowParams = {
	uri: string;
};

type ApShowResult =
	| { type: 'User'; object: Awaited<ReturnType<typeof packUserDetailedNotMeForHonoApi>> }
	| { type: 'Note'; object: Awaited<ReturnType<typeof packNoteForHonoApi>> };

function apShowFederationNotAllowedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Federation for this host is not allowed.', code: 'FEDERATION_NOT_ALLOWED', id: '974b799e-1a29-4889-b706-18d4dd93e266' });
}
function apShowUriInvalidError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'URI is invalid.', code: 'URI_INVALID', id: '1a5eab56-e47b-48c2-8d5e-217b897d70db' });
}
function apShowRequestFailedError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Request failed.', code: 'REQUEST_FAILED', id: '81b539cf-4f57-4b29-bc98-032c33c0792e' });
}
function apShowResponseInvalidError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Response from remote server is invalid.', code: 'RESPONSE_INVALID', id: '70193c39-54f3-4813-82f0-70a680f7495b' });
}
function apShowNoSuchObjectError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such object.', code: 'NO_SUCH_OBJECT', id: 'dc94d745-1262-4e63-a17d-fecaa57efc82' });
}

async function mergePackForHonoApi(
	deps: HonoApiApShowDependencies,
	me: MiLocalUser | null | undefined,
	user: MiUser | null | undefined,
	note: MiNote | null | undefined,
): Promise<ApShowResult | null> {
	if (user != null) {
		return {
			type: 'User',
			object: await packUserDetailedNotMeForHonoApi(deps, user, me),
		};
	} else if (note != null) {
		try {
			return {
				type: 'Note',
				object: await packNoteForHonoApi(deps, note, me, { detail: true }),
			};
		} catch {
			return null;
		}
	}

	return null;
}

/**
 * ap/show の fetchAny 相当。URIからUserかNoteを解決する。
 */
async function fetchAnyForHonoApi(
	deps: HonoApiApShowDependencies,
	uri: string,
	me: MiLocalUser | null | undefined,
): Promise<ApShowResult | null> {
	if (!isFederationAllowedUri(deps.config, deps.meta, uri)) {
		throw apShowFederationNotAllowedError();
	}

	let local = await mergePackForHonoApi(deps, me, ...await Promise.all([
		getUserFromApIdForHonoApi(deps, uri),
		getNoteFromApIdForHonoApi(deps, uri),
	]));
	if (local != null) return local;

	const host = extractDbHost(uri);

	if (isSelfHost(deps.config, host)) return null;

	const history = new Set<string>();
	const object = await resolveApObjectForHonoApi(deps, uri, FetchAllowSoftFailMask.CrossOrigin | FetchAllowSoftFailMask.NonCanonicalId, history).catch((err: unknown) => {
		if (err instanceof IdentifiableError) {
			switch (err.id) {
				case 'b94fd5b1-0e3b-4678-9df2-dad4cd515ab2':
					throw apShowUriInvalidError();
				case '0dc86cf6-7cd6-4e56-b1e6-5903d62d7ea5':
				case 'd592da9f-822f-4d91-83d7-4ceefabcf3d2':
					throw apShowRequestFailedError();
				case '09d79f9e-64f1-4316-9cfa-e75c4d091574':
					throw apShowFederationNotAllowedError();
				case '72180409-793c-4973-868e-5a118eb5519b':
					throw apShowResponseInvalidError();
				case '02b40cd0-fa92-4b0c-acc9-fb2ada952ab8':
					throw apShowUriInvalidError();
				case 'a9d946e5-d276-47f8-95fb-f04230289bb0':
				case '06ae3170-1796-4d93-a697-2611ea6d83b6':
					throw apShowNoSuchObjectError();
				case '7a5d2fc0-94bc-4db6-b8b8-1bf24a2e23d0':
					throw apShowResponseInvalidError();
			}
		}

		throw apShowRequestFailedError();
	});

	if (object.id == null) {
		throw apShowResponseInvalidError();
	}

	if (uri !== object.id) {
		local = await mergePackForHonoApi(deps, me, ...await Promise.all([
			getUserFromApIdForHonoApi(deps, object.id),
			getNoteFromApIdForHonoApi(deps, object.id),
		]));
		if (local != null) return local;
	}

	return await mergePackForHonoApi(
		deps,
		me,
		isActor(object) ? await createPersonForHonoApi(deps, getApId(object)) : null,
		isPost(object) ? await createNoteFromApForHonoApi(deps, getApId(object), undefined, new Set(), true) : null,
	);
}

export async function handleHonoApiApShow(
	deps: HonoApiApShowDependencies,
	me: MiLocalUser | null | undefined,
	body: Record<string, unknown>,
): Promise<ApShowResult> {
	const params = parseHonoApiParams(apShowParamDef, body);

	const object = await fetchAnyForHonoApi(deps, params.uri, me);
	if (object) {
		return object;
	}

	throw apShowNoSuchObjectError();
}
