/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { z } from 'zod';
import { createMutingInDatabase, deleteMutingsByIdsFromDatabase, fetchMutingByMuterIdAndMuteeIdFromDatabase, listMuteeIdsByMuterIdFromDatabase, listMutingsByMuterIdWithPaginationFromDatabase, mutingExistsInDatabase, resolveMutingPagination } from '@/core/MutingStore.js';
import { createRenoteMutingInDatabase, deleteRenoteMutingsByIdsFromDatabase, fetchRenoteMutingFromDatabase, listRenoteMuteeIdsByMuterIdFromDatabase, listRenoteMutingsByMuterIdFromDatabase, renoteMutingExistsInDatabase } from '@/core/RenoteMutingStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMuting } from '@/models/Muting.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { RenoteMutingRow } from '@/db/schema/renote-muting.js';
import { HonoApiError, clientError } from './error.js';
import type { HonoApiInternalEventPublisher } from './events.js';
import { packUserDetailedNotMeForHonoApi, packUserDetailedNotMeManyForHonoApi, type UserDetailedNotMeHonoApiResponse, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAccountMuteDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	publishInternalEvent?: HonoApiInternalEventPublisher;
};

export const muteCreateParamDef = z.object({
	userId: misskeyId(),
	expiresAt: z.number().int().nullable().optional(),
});

export const userIdParamDef = z.object({
	userId: misskeyId(),
});

export const muteListParamDef = z.object({
	limit: z.number().int().min(1).max(100).default(30),
	sinceId: misskeyId().optional(),
	untilId: misskeyId().optional(),
	sinceDate: z.number().int().optional(),
	untilDate: z.number().int().optional(),
});


type HonoApiMutingResponse = {
	id: string;
	createdAt: string;
	expiresAt: string | null;
	muteeId: MiUser['id'];
	mutee: UserDetailedNotMeHonoApiResponse;
};

type HonoApiRenoteMutingResponse = {
	id: string;
	createdAt: string;
	muteeId: MiUser['id'];
	mutee: UserDetailedNotMeHonoApiResponse;
};

function muteCreateNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '6fef56f3-e765-4957-88e5-c6f65329b8a5');
}

function muteDeleteNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', 'b851d00b-8ab1-4a56-8b1b-e24187cb48ef');
}

function renoteMuteCreateNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '5e0a5dff-1e94-4202-87ae-4d9c89eb2271');
}

function renoteMuteDeleteNoSuchUserError(): HonoApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '9b6728cf-638c-4aa1-bedb-e07d8101474d');
}

async function getTargetUserOrThrow(
	deps: HonoApiAccountMuteDependencies,
	userId: MiUser['id'],
	errorFactory: () => HonoApiError,
): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) throw errorFactory();

	return user;
}

export async function refreshUserMutingsCache(deps: { db: MiDrizzleDatabase; redis: Redis.Redis }, muterId: MiUser['id']): Promise<void> {
	const muteeIds = await listMuteeIdsByMuterIdFromDatabase(deps.db, muterId);
	await deps.redis.set(`kvcache:userMutings:${muterId}`, JSON.stringify(muteeIds), 'EX', 60 * 30);
}

async function refreshRenoteMutingsCache(deps: HonoApiAccountMuteDependencies, muterId: MiUser['id']): Promise<void> {
	const muteeIds = await listRenoteMuteeIdsByMuterIdFromDatabase(deps.db, muterId);
	await deps.redis.set(`kvcache:renoteMutings:${muterId}`, JSON.stringify(muteeIds), 'EX', 60 * 30);
}

async function packHonoApiMuting(
	deps: HonoApiAccountMuteDependencies,
	muting: MiMuting,
	me: { id: MiUser['id'] },
	packedMutee?: UserDetailedNotMeHonoApiResponse,
): Promise<HonoApiMutingResponse> {
	const mutee = packedMutee ?? await packUserDetailedNotMeForHonoApi(
		deps,
		muting.mutee ?? await getTargetUserOrThrow(deps, muting.muteeId, muteCreateNoSuchUserError),
		me,
	);

	return {
		id: muting.id,
		createdAt: parseId(muting.id).date.toISOString(),
		expiresAt: muting.expiresAt ? muting.expiresAt.toISOString() : null,
		muteeId: muting.muteeId,
		mutee,
	};
}

async function packHonoApiRenoteMuting(
	deps: HonoApiAccountMuteDependencies,
	muting: RenoteMutingRow,
	me: { id: MiUser['id'] },
	packedMutee?: UserDetailedNotMeHonoApiResponse,
): Promise<HonoApiRenoteMutingResponse> {
	const mutee = packedMutee ?? await packUserDetailedNotMeForHonoApi(
		deps,
		await getTargetUserOrThrow(deps, muting.muteeId, renoteMuteCreateNoSuchUserError),
		me,
	);

	return {
		id: muting.id,
		createdAt: parseId(muting.id).date.toISOString(),
		muteeId: muting.muteeId,
		mutee,
	};
}

export async function handleHonoApiMuteCreate(
	deps: HonoApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(muteCreateParamDef, body);

	if (me.id === params.userId) {
		throw clientError('Mutee is yourself.', 'MUTEE_IS_YOURSELF', 'a4619cb2-5f23-484b-9301-94c903074e10');
	}

	const mutee = await getTargetUserOrThrow(deps, params.userId, muteCreateNoSuchUserError);
	if (await mutingExistsInDatabase(deps.db, me.id, mutee.id)) {
		throw clientError('You are already muting that user.', 'ALREADY_MUTING', '7e7359cb-160c-4956-b08f-4d1c653cd007');
	}

	if (params.expiresAt && params.expiresAt <= Date.now()) {
		return;
	}

	await createMutingInDatabase(deps.db, {
		id: genId(),
		expiresAt: params.expiresAt ? new Date(params.expiresAt) : null,
		muterId: me.id,
		muteeId: mutee.id,
	});
	await refreshUserMutingsCache(deps, me.id);
	deps.publishInternalEvent?.('mute', { muterId: me.id, muteeId: mutee.id });
}

export async function handleHonoApiMuteDelete(
	deps: HonoApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(userIdParamDef, body);

	if (me.id === params.userId) {
		throw clientError('Mutee is yourself.', 'MUTEE_IS_YOURSELF', 'f428b029-6b39-4d48-a1d2-cc1ae6dd5cf9');
	}

	const mutee = await getTargetUserOrThrow(deps, params.userId, muteDeleteNoSuchUserError);
	const muting = await fetchMutingByMuterIdAndMuteeIdFromDatabase(deps.db, me.id, mutee.id);

	if (muting == null) {
		throw clientError('You are not muting that user.', 'NOT_MUTING', '5467d020-daa9-4553-81e1-135c0c35a96d');
	}

	await deleteMutingsByIdsFromDatabase(deps.db, [muting.id]);
	await refreshUserMutingsCache(deps, me.id);
	deps.publishInternalEvent?.('unmute', { muterId: me.id, muteeId: mutee.id });
}

export async function handleHonoApiMuteList(
	deps: HonoApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Muting'>[]> {
	const params = parseHonoApiParams(muteListParamDef, body);
	const mutings = await listMutingsByMuterIdWithPaginationFromDatabase(deps.db, me.id, {
		...resolveMutingPagination({
			gen: time => genId(time),
		}, params),
		limit: params.limit,
	});

	const mutees = await packUserDetailedNotMeManyForHonoApi(deps, mutings.map(muting => muting.mutee ?? muting.muteeId), me);
	return await Promise.all(mutings.map((muting, index) => packHonoApiMuting(deps, muting, me, mutees[index]) as Promise<Packed<'Muting'>>));
}

export async function handleHonoApiRenoteMuteCreate(
	deps: HonoApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(userIdParamDef, body);

	if (me.id === params.userId) {
		throw clientError('Mutee is yourself.', 'MUTEE_IS_YOURSELF', '37285718-52f7-4aef-b7de-c38b8e8a8420');
	}

	const mutee = await getTargetUserOrThrow(deps, params.userId, renoteMuteCreateNoSuchUserError);
	if (await renoteMutingExistsInDatabase(deps.db, me.id, mutee.id)) {
		throw clientError('You are already muting that user.', 'ALREADY_MUTING', 'ccfecbe4-1f1c-4fc2-8a3d-c3ffee61cb7b');
	}

	await createRenoteMutingInDatabase(deps.db, {
		id: genId(),
		muterId: me.id,
		muteeId: mutee.id,
	});
	await refreshRenoteMutingsCache(deps, me.id);
	deps.publishInternalEvent?.('renoteMute', { muterId: me.id, muteeId: mutee.id });
}

export async function handleHonoApiRenoteMuteDelete(
	deps: HonoApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(userIdParamDef, body);

	if (me.id === params.userId) {
		throw clientError('Mutee is yourself.', 'MUTEE_IS_YOURSELF', '619b1314-0850-4597-a242-e245f3da42af');
	}

	const mutee = await getTargetUserOrThrow(deps, params.userId, renoteMuteDeleteNoSuchUserError);
	const muting = await fetchRenoteMutingFromDatabase(deps.db, me.id, mutee.id);

	if (muting == null) {
		throw clientError('You are not muting that user.', 'NOT_MUTING', '2e4ef874-8bf0-4b4b-b069-4598f6d05817');
	}

	await deleteRenoteMutingsByIdsFromDatabase(deps.db, [muting.id]);
	await refreshRenoteMutingsCache(deps, me.id);
	deps.publishInternalEvent?.('renoteUnmute', { muterId: me.id, muteeId: mutee.id });
}

export async function handleHonoApiRenoteMuteList(
	deps: HonoApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'RenoteMuting'>[]> {
	const params = parseHonoApiParams(muteListParamDef, body);
	const mutings = await listRenoteMutingsByMuterIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		...resolveDateIdPagination({ gen: time => genId(time) }, params),
	});

	const mutees = await packUserDetailedNotMeManyForHonoApi(deps, mutings.map(muting => muting.muteeId), me);
	return await Promise.all(mutings.map((muting, index) => packHonoApiRenoteMuting(deps, muting, me, mutees[index]) as Promise<Packed<'RenoteMuting'>>));
}
