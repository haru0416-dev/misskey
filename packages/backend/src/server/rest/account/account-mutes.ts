/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import {
	createMutingInDatabase,
	deleteMutingsByIdsFromDatabase,
	fetchMutingByMuterIdAndMuteeIdFromDatabase,
	listMutingsByMuterIdWithPaginationFromDatabase,
	mutingExistsInDatabase,
	resolveMutingPagination,
} from '@/core/user/MutingStore.js';
import {
	createRenoteMutingInDatabase,
	deleteRenoteMutingsByIdsFromDatabase,
	fetchRenoteMutingFromDatabase,
	listRenoteMutingsByMuterIdFromDatabase,
	renoteMutingExistsInDatabase,
} from '@/core/user/RenoteMutingStore.js';
import { fetchUserByIdFromDatabase } from '@/core/user/UserStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import { parseId } from '@/misc/id/parse-id.js';
import type { Packed } from '@/misc/json-schema.js';
import { misskeyId, paginationParams } from '@/misc/zod-params.js';
import type { MiMuting } from '@/models/Muting.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { RenoteMutingRow } from '@/db/schema/renote-muting.js';
import { ApiError, clientError } from '../error.js';
import type { ApiInternalEventPublisher } from '../events.js';
import {
	packUserDetailedNotMeForApi,
	packUserDetailedNotMeManyForApi,
	type UserDetailedNotMeApiResponse,
	type UserPackingDependencies,
} from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiAccountMuteDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	publishInternalEvent?: ApiInternalEventPublisher;
};

export const muteCreateParamDef = z.object({
	userId: misskeyId(),
	expiresAt: z.int().nullable().optional(),
});

export const userIdParamDef = z.object({
	userId: misskeyId(),
});

export const muteListParamDef = z.object({
	limit: z.int().min(1).max(100).default(30),
	...paginationParams,
});

type ApiMutingResponse = {
	id: string;
	createdAt: string;
	expiresAt: string | null;
	muteeId: MiUser['id'];
	mutee: UserDetailedNotMeApiResponse;
};

type ApiRenoteMutingResponse = {
	id: string;
	createdAt: string;
	muteeId: MiUser['id'];
	mutee: UserDetailedNotMeApiResponse;
};

function muteCreateNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '6fef56f3-e765-4957-88e5-c6f65329b8a5');
}

function muteDeleteNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', 'b851d00b-8ab1-4a56-8b1b-e24187cb48ef');
}

function renoteMuteCreateNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '5e0a5dff-1e94-4202-87ae-4d9c89eb2271');
}

function renoteMuteDeleteNoSuchUserError(): ApiError {
	return clientError('No such user.', 'NO_SUCH_USER', '9b6728cf-638c-4aa1-bedb-e07d8101474d');
}

async function getTargetUserOrThrow(
	deps: ApiAccountMuteDependencies,
	userId: MiUser['id'],
	errorFactory: () => ApiError,
): Promise<MiUser> {
	const user = await fetchUserByIdFromDatabase(deps.db, userId);
	if (user == null) throw errorFactory();

	return user;
}

async function packApiMuting(
	deps: ApiAccountMuteDependencies,
	muting: MiMuting,
	me: { id: MiUser['id'] },
	packedMutee?: UserDetailedNotMeApiResponse,
): Promise<ApiMutingResponse> {
	const mutee =
		packedMutee ??
		(await packUserDetailedNotMeForApi(
			deps,
			muting.mutee ?? (await getTargetUserOrThrow(deps, muting.muteeId, muteCreateNoSuchUserError)),
			me,
		));

	return {
		id: muting.id,
		createdAt: parseId(muting.id).date.toISOString(),
		expiresAt: muting.expiresAt ? muting.expiresAt.toISOString() : null,
		muteeId: muting.muteeId,
		mutee,
	};
}

async function packApiRenoteMuting(
	deps: ApiAccountMuteDependencies,
	muting: RenoteMutingRow,
	me: { id: MiUser['id'] },
	packedMutee?: UserDetailedNotMeApiResponse,
): Promise<ApiRenoteMutingResponse> {
	const mutee =
		packedMutee ??
		(await packUserDetailedNotMeForApi(
			deps,
			await getTargetUserOrThrow(deps, muting.muteeId, renoteMuteCreateNoSuchUserError),
			me,
		));

	return {
		id: muting.id,
		createdAt: parseId(muting.id).date.toISOString(),
		muteeId: muting.muteeId,
		mutee,
	};
}

export async function handleApiMuteCreate(
	deps: ApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(muteCreateParamDef, body);

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
	deps.publishInternalEvent?.('mute', { muterId: me.id, muteeId: mutee.id });
}

export async function handleApiMuteDelete(
	deps: ApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(userIdParamDef, body);

	if (me.id === params.userId) {
		throw clientError('Mutee is yourself.', 'MUTEE_IS_YOURSELF', 'f428b029-6b39-4d48-a1d2-cc1ae6dd5cf9');
	}

	const mutee = await getTargetUserOrThrow(deps, params.userId, muteDeleteNoSuchUserError);
	const muting = await fetchMutingByMuterIdAndMuteeIdFromDatabase(deps.db, me.id, mutee.id);

	if (muting == null) {
		throw clientError('You are not muting that user.', 'NOT_MUTING', '5467d020-daa9-4553-81e1-135c0c35a96d');
	}

	await deleteMutingsByIdsFromDatabase(deps.db, [muting.id]);
	deps.publishInternalEvent?.('unmute', { muterId: me.id, muteeId: mutee.id });
}

export async function handleApiMuteList(
	deps: ApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'Muting'>[]> {
	const params = parseApiParams(muteListParamDef, body);
	const mutings = await listMutingsByMuterIdWithPaginationFromDatabase(deps.db, me.id, {
		...resolveMutingPagination(
			{
				gen: (time) => genId(time),
			},
			params,
		),
		limit: params.limit,
	});

	const mutees = await packUserDetailedNotMeManyForApi(
		deps,
		mutings.map((muting) => muting.mutee ?? muting.muteeId),
		me,
	);
	return await Promise.all(
		mutings.map((muting, index) => packApiMuting(deps, muting, me, mutees[index]) as Promise<Packed<'Muting'>>),
	);
}

export async function handleApiRenoteMuteCreate(
	deps: ApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(userIdParamDef, body);

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
	deps.publishInternalEvent?.('renoteMute', { muterId: me.id, muteeId: mutee.id });
}

export async function handleApiRenoteMuteDelete(
	deps: ApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(userIdParamDef, body);

	if (me.id === params.userId) {
		throw clientError('Mutee is yourself.', 'MUTEE_IS_YOURSELF', '619b1314-0850-4597-a242-e245f3da42af');
	}

	const mutee = await getTargetUserOrThrow(deps, params.userId, renoteMuteDeleteNoSuchUserError);
	const muting = await fetchRenoteMutingFromDatabase(deps.db, me.id, mutee.id);

	if (muting == null) {
		throw clientError('You are not muting that user.', 'NOT_MUTING', '2e4ef874-8bf0-4b4b-b069-4598f6d05817');
	}

	await deleteRenoteMutingsByIdsFromDatabase(deps.db, [muting.id]);
	deps.publishInternalEvent?.('renoteUnmute', { muterId: me.id, muteeId: mutee.id });
}

export async function handleApiRenoteMuteList(
	deps: ApiAccountMuteDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Packed<'RenoteMuting'>[]> {
	const params = parseApiParams(muteListParamDef, body);
	const mutings = await listRenoteMutingsByMuterIdFromDatabase(deps.db, me.id, {
		limit: params.limit,
		...resolveDateIdPagination({ gen: (time) => genId(time) }, params),
	});

	const mutees = await packUserDetailedNotMeManyForApi(
		deps,
		mutings.map((muting) => muting.muteeId),
		me,
	);
	return await Promise.all(
		mutings.map(
			(muting, index) => packApiRenoteMuting(deps, muting, me, mutees[index]) as Promise<Packed<'RenoteMuting'>>,
		),
	);
}
