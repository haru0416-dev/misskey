/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	countAntennasByUserIdFromDatabase,
	createAntennaInDatabase,
	deleteAntennaFromDatabase,
	fetchAntennaByIdAndUserIdFromDatabase,
	fetchAntennaByIdOrFailFromDatabase,
	listAntennasByUserIdFromDatabase,
	updateAntennaInDatabase,
} from '@/core/AntennaStore.js';
import { fetchActiveMutedChannelIdsFromDatabase } from '@/core/ChannelMutingStore.js';
import { listFilteredTimelineNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { fetchUserListByIdAndUserIdFromDatabase } from '@/core/UserListStore.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import type { HonoApiInternalEventPublisher } from './events.js';
import { packNoteManyForHonoApi, type HonoApiNoteDependencies } from './note.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAntennaDependencies = HonoApiNoteDependencies & HonoApiRolePolicyDependencies & {
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

function noSuchAntennaError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such antenna.', code: 'NO_SUCH_ANTENNA', id });
}

function noSuchUserListError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such user list.', code: 'NO_SUCH_USER_LIST', id });
}

function emptyKeywordError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Either keywords or excludeKeywords is required.', code: 'EMPTY_KEYWORD', id });
}

async function packAntennaForHonoApi(
	deps: { db: HonoApiAntennaDependencies['db']; config: HonoApiAntennaDependencies['config'] },
	src: MiAntenna['id'] | MiAntenna,
): Promise<Packed<'Antenna'>> {
	const antenna = typeof src === 'object' ? src : await fetchAntennaByIdOrFailFromDatabase(deps.db, src);

	return {
		id: antenna.id,
		createdAt: parseId(deps.config, antenna.id).date.toISOString(),
		name: antenna.name,
		keywords: antenna.keywords,
		excludeKeywords: antenna.excludeKeywords,
		src: antenna.src,
		userListId: antenna.userListId,
		users: antenna.users,
		caseSensitive: antenna.caseSensitive,
		localOnly: antenna.localOnly,
		excludeBots: antenna.excludeBots,
		withReplies: antenna.withReplies,
		withFile: antenna.withFile,
		excludeNotesInSensitiveChannel: antenna.excludeNotesInSensitiveChannel,
		isActive: antenna.isActive,
		hasUnreadNote: false,
		notify: false,
	};
}

const antennaSrcEnum = ['home', 'all', 'users', 'list', 'users_blacklist'] as const;

const antennasCreateParamDef = {
	type: 'object',
	properties: {
		name: { type: 'string', minLength: 1, maxLength: 100 },
		src: { type: 'string', enum: antennaSrcEnum },
		userListId: { type: 'string', format: 'misskey:id', nullable: true },
		keywords: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
		excludeKeywords: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
		users: { type: 'array', items: { type: 'string' } },
		caseSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		excludeBots: { type: 'boolean' },
		withReplies: { type: 'boolean' },
		withFile: { type: 'boolean' },
		excludeNotesInSensitiveChannel: { type: 'boolean' },
	},
	required: ['name', 'src', 'keywords', 'excludeKeywords', 'users', 'caseSensitive', 'withReplies', 'withFile'],
} as const;

type AntennasCreateParams = {
	name: string;
	src: typeof antennaSrcEnum[number];
	userListId?: string | null;
	keywords: string[][];
	excludeKeywords: string[][];
	users: string[];
	caseSensitive: boolean;
	localOnly?: boolean;
	excludeBots?: boolean;
	withReplies: boolean;
	withFile: boolean;
	excludeNotesInSensitiveChannel?: boolean;
};

export async function handleHonoApiAntennasCreate(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseHonoApiParams(antennasCreateParamDef, body);

	if (params.keywords.flat().every(x => x === '') && params.excludeKeywords.flat().every(x => x === '')) {
		throw emptyKeywordError('53ee222e-1ddd-4f9a-92e5-9fb82ddb463a');
	}

	const policies = await getHonoApiRolePolicies(deps, me);
	const currentAntennasCount = await countAntennasByUserIdFromDatabase(deps.db, me.id);
	if (currentAntennasCount >= policies.antennaLimit) {
		throw new HonoApiError({ status: 400, message: 'You cannot create antenna any more.', code: 'TOO_MANY_ANTENNAS', id: 'faf47050-e8b5-438c-913c-db2b1576fde4' });
	}

	let userList;
	if (params.src === 'list' && params.userListId) {
		userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.userListId, me.id);
		if (userList == null) throw noSuchUserListError('95063e93-a283-4b8b-9aa5-bcdb8df69a7f');
	}

	const now = new Date();
	const antenna = await createAntennaInDatabase(deps.db, {
		id: genId(deps.config, now.getTime()),
		lastUsedAt: now,
		userId: me.id,
		name: params.name,
		src: params.src,
		userListId: userList ? userList.id : null,
		keywords: params.keywords,
		excludeKeywords: params.excludeKeywords,
		users: params.users,
		caseSensitive: params.caseSensitive,
		localOnly: params.localOnly ?? false,
		excludeBots: params.excludeBots ?? false,
		withReplies: params.withReplies,
		withFile: params.withFile,
		excludeNotesInSensitiveChannel: params.excludeNotesInSensitiveChannel ?? false,
	});

	deps.publishInternalEvent?.('antennaCreated', antenna);

	return await packAntennaForHonoApi(deps, antenna);
}

const antennasUpdateParamDef = {
	type: 'object',
	properties: {
		antennaId: { type: 'string', format: 'misskey:id' },
		name: { type: 'string', minLength: 1, maxLength: 100 },
		src: { type: 'string', enum: antennaSrcEnum },
		userListId: { type: 'string', format: 'misskey:id', nullable: true },
		keywords: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
		excludeKeywords: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
		users: { type: 'array', items: { type: 'string' } },
		caseSensitive: { type: 'boolean' },
		localOnly: { type: 'boolean' },
		excludeBots: { type: 'boolean' },
		withReplies: { type: 'boolean' },
		withFile: { type: 'boolean' },
		excludeNotesInSensitiveChannel: { type: 'boolean' },
	},
	required: ['antennaId'],
} as const;

type AntennasUpdateParams = {
	antennaId: string;
	name?: string;
	src?: typeof antennaSrcEnum[number];
	userListId?: string | null;
	keywords?: string[][];
	excludeKeywords?: string[][];
	users?: string[];
	caseSensitive?: boolean;
	localOnly?: boolean;
	excludeBots?: boolean;
	withReplies?: boolean;
	withFile?: boolean;
	excludeNotesInSensitiveChannel?: boolean;
};

export async function handleHonoApiAntennasUpdate(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseHonoApiParams(antennasUpdateParamDef, body);

	if (params.keywords && params.excludeKeywords) {
		if (params.keywords.flat().every(x => x === '') && params.excludeKeywords.flat().every(x => x === '')) {
			throw emptyKeywordError('721aaff6-4e1b-4d88-8de6-877fae9f68c4');
		}
	}

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('10c673ac-8852-48eb-aa1f-f5b67f069290');

	let userList;
	if ((params.src === 'list' || antenna.src === 'list') && params.userListId) {
		userList = await fetchUserListByIdAndUserIdFromDatabase(deps.db, params.userListId, me.id);
		if (userList == null) throw noSuchUserListError('1c6b35c9-943e-48c2-81e4-2844989407f7');
	}

	await updateAntennaInDatabase(deps.db, antenna.id, {
		name: params.name,
		src: params.src,
		userListId: params.userListId !== undefined ? (userList ? userList.id : null) : undefined,
		keywords: params.keywords,
		excludeKeywords: params.excludeKeywords,
		users: params.users,
		caseSensitive: params.caseSensitive,
		localOnly: params.localOnly,
		excludeBots: params.excludeBots,
		withReplies: params.withReplies,
		withFile: params.withFile,
		excludeNotesInSensitiveChannel: params.excludeNotesInSensitiveChannel,
		isActive: true,
		lastUsedAt: new Date(),
	});

	deps.publishInternalEvent?.('antennaUpdated', await fetchAntennaByIdOrFailFromDatabase(deps.db, antenna.id));

	return await packAntennaForHonoApi(deps, antenna.id);
}

const antennasDeleteParamDef = {
	type: 'object',
	properties: {
		antennaId: { type: 'string', format: 'misskey:id' },
	},
	required: ['antennaId'],
} as const;

type AntennasDeleteParams = {
	antennaId: string;
};

export async function handleHonoApiAntennasDelete(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(antennasDeleteParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('b34dcf9d-348f-44bb-99d0-6c9314cfe2df');

	await deleteAntennaFromDatabase(deps.db, antenna.id);

	deps.publishInternalEvent?.('antennaDeleted', antenna);
}

const antennasListParamDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

export async function handleHonoApiAntennasList(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>[]> {
	parseHonoApiParams(antennasListParamDef, body);

	const antennas = await listAntennasByUserIdFromDatabase(deps.db, me.id);

	return await Promise.all(antennas.map(x => packAntennaForHonoApi(deps, x)));
}

const antennasShowParamDef = {
	type: 'object',
	properties: {
		antennaId: { type: 'string', format: 'misskey:id' },
	},
	required: ['antennaId'],
} as const;

type AntennasShowParams = {
	antennaId: string;
};

export async function handleHonoApiAntennasShow(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Antenna'>> {
	const params = parseHonoApiParams(antennasShowParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('c06569fb-b025-4f23-b22d-1fcd20d2816b');

	return await packAntennaForHonoApi(deps, antenna);
}

const antennasRemoveNoteParamDef = {
	type: 'object',
	properties: {
		antennaId: { type: 'string', format: 'misskey:id' },
		noteId: { type: 'string', format: 'misskey:id' },
	},
	required: ['antennaId', 'noteId'],
} as const;

type AntennasRemoveNoteParams = {
	antennaId: string;
	noteId: string;
};

export async function handleHonoApiAntennasRemoveNote(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(antennasRemoveNoteParamDef, body);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');

	await deps.redis.lrem(`list:antennaTimeline:${antenna.id}`, 1, params.noteId);
}

const antennasNotesParamDef = {
	type: 'object',
	properties: {
		antennaId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['antennaId'],
} as const;

type AntennasNotesParams = {
	antennaId: string;
	limit: number;
	sinceId?: string;
	untilId?: string;
	sinceDate?: number;
	untilDate?: number;
};

export async function handleHonoApiAntennasNotes(
	deps: HonoApiAntennaDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Note'>[]> {
	const params = parseHonoApiParams(antennasNotesParamDef, body);
	const untilId = params.untilId ?? (params.untilDate ? genId(deps.config, params.untilDate) : null);
	const sinceId = params.sinceId ?? (params.sinceDate ? genId(deps.config, params.sinceDate) : null);

	const antenna = await fetchAntennaByIdAndUserIdFromDatabase(deps.db, params.antennaId, me.id);
	if (antenna == null) throw noSuchAntennaError('850926e0-fd3b-49b6-b69a-b28a5dbd82fe');

	const needPublishEvent = !antenna.isActive;
	antenna.isActive = true;
	antenna.lastUsedAt = new Date();
	trackPromise(updateAntennaInDatabase(deps.db, antenna.id, {
		isActive: antenna.isActive,
		lastUsedAt: antenna.lastUsedAt,
	}));

	if (needPublishEvent) {
		deps.publishInternalEvent?.('antennaUpdated', antenna);
	}

	const rawIds = await deps.redis.lrange(`list:antennaTimeline:${antenna.id}`, 0, -1);
	let noteIds = untilId && sinceId
		? rawIds.filter(id => id < untilId && id > sinceId).sort((a, b) => a > b ? -1 : 1)
		: untilId
			? rawIds.filter(id => id < untilId).sort((a, b) => a > b ? -1 : 1)
			: sinceId
				? rawIds.filter(id => id > sinceId).sort((a, b) => a < b ? -1 : 1)
				: rawIds.sort((a, b) => a > b ? -1 : 1);
	noteIds = noteIds.slice(0, params.limit);

	if (noteIds.length === 0) return [];

	const mutingChannelIds = await fetchActiveMutedChannelIdsFromDatabase(deps.db, me.id, new Date());

	const notes = await listFilteredTimelineNotesByIdsFromDatabase(deps.db, {
		ids: noteIds,
		me,
		blockedHosts: deps.meta.blockedHosts,
		mutingChannelIds,
	});
	if (sinceId != null && untilId == null) {
		notes.sort((a, b) => a.id < b.id ? -1 : 1);
	} else {
		notes.sort((a, b) => a.id > b.id ? -1 : 1);
	}

	return await packNoteManyForHonoApi(deps, notes, me);
}
