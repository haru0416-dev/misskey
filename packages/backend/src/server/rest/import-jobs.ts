/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { Config } from '@/config.js';
import { addDbJob, type DbQueue } from '@/core/queues.js';
import { queueRetentionOptions } from '@/queue/const.js';
import type { DownloadService } from '@/core/DownloadService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { countAntennasByUserIdFromDatabase } from '@/core/AntennaStore.js';
import { fetchDriveFileByIdAndUserIdFromDatabase } from '@/core/DriveFileStore.js';
import { fetchUserByIdFromDatabase, listUsersByIdsFromDatabase } from '@/core/UserStore.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiAntenna } from '@/models/Antenna.js';
import type { MiLocalUser } from '@/models/User.js';
import { HonoApiError } from './error.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { resolveAlsoKnownAsForHonoApi, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiImportJobDependencies = UserPackingDependencies & {
	config: Config;
	db: MiDrizzleDatabase;
	dbQueue: DbQueue;
};

export type HonoApiIImportAntennasDependencies = HonoApiImportJobDependencies & HonoApiRolePolicyDependencies & {
	downloadService: Pick<DownloadService, 'downloadTextFile'>;
};

const importJobOptions = (config: Pick<Config, 'queues'>) => ({
	attempts: 3,
	backoff: {
		type: 'exponential',
		delay: 1000,
	},
	...queueRetentionOptions(config),
});

async function checkRecentlyMovedForHonoApi(deps: HonoApiImportJobDependencies, me: MiLocalUser): Promise<boolean> {
	const oldSelfIds = await resolveAlsoKnownAsForHonoApi(deps, me.alsoKnownAs);
	if (!oldSelfIds || oldSelfIds.length === 0) return false;

	const meUri = `${deps.config.instance.url}/users/${me.id}`;
	const oldSelfs = await listUsersByIdsFromDatabase(deps.db, oldSelfIds, { includeSuspended: true });

	for (const oldSelf of oldSelfs) {
		if (oldSelf.movedToUri !== meUri) continue;
		if (oldSelf.movedAt && oldSelf.movedAt.getTime() + 1000 * 60 * 60 * 2 > Date.now()) return true;
	}

	return false;
}

type ImportFileErrors = {
	noSuchFile: { message: string; code: string; id: string };
	tooBigFile: { message: string; code: string; id: string };
	emptyFile: { message: string; code: string; id: string };
};

async function validateImportFile(
	deps: HonoApiImportJobDependencies,
	me: MiLocalUser,
	fileId: string,
	errors: ImportFileErrors,
): Promise<{ id: string }> {
	const file = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, fileId, me.id);

	if (file == null) throw new HonoApiError({ status: 400, kind: 'client', ...errors.noSuchFile });
	if (file.size === 0) throw new HonoApiError({ status: 400, kind: 'client', ...errors.emptyFile });

	const checkMoving = await checkRecentlyMovedForHonoApi(deps, me);
	if (checkMoving ? file.size > 32 * 1024 * 1024 : file.size > 64 * 1024) {
		throw new HonoApiError({ status: 400, kind: 'client', ...errors.tooBigFile });
	}

	return { id: file.id };
}

export const importBlockingParamDef = z.object({
	fileId: misskeyId(),
});

type ImportBlockingParams = { fileId: string };

export async function handleHonoApiIImportBlocking(
	deps: HonoApiImportJobDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(importBlockingParamDef, body);
	const file = await validateImportFile(deps, me, params.fileId, {
		noSuchFile: { message: 'No such file.', code: 'NO_SUCH_FILE', id: 'ebb53e5f-6574-9c0c-0b92-7ca6def56d7e' },
		tooBigFile: { message: 'That file is too big.', code: 'TOO_BIG_FILE', id: 'b7fbf0b1-aeef-3b21-29ef-fadd4cb72ccf' },
		emptyFile: { message: 'That file is empty.', code: 'EMPTY_FILE', id: '6f3a4dcc-f060-a707-4950-806fbdbe60d6' },
	});

	void addDbJob(deps.dbQueue, {
		name: 'importBlocking',
		data: { user: { id: me.id }, fileId: file.id },
		opts: importJobOptions(deps.config),
	});
}

export const importFollowingParamDef = z.object({
	fileId: misskeyId(),
	withReplies: z.boolean().optional(),
});

type ImportFollowingParams = { fileId: string; withReplies?: boolean };

export async function handleHonoApiIImportFollowing(
	deps: HonoApiImportJobDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(importFollowingParamDef, body);
	const file = await validateImportFile(deps, me, params.fileId, {
		noSuchFile: { message: 'No such file.', code: 'NO_SUCH_FILE', id: 'b98644cf-a5ac-4277-a502-0b8054a709a3' },
		tooBigFile: { message: 'That file is too big.', code: 'TOO_BIG_FILE', id: 'dee9d4ed-ad07-43ed-8b34-b2856398bc60' },
		emptyFile: { message: 'That file is empty.', code: 'EMPTY_FILE', id: '31a1b42c-06f7-42ae-8a38-a661c5c9f691' },
	});

	void addDbJob(deps.dbQueue, {
		name: 'importFollowing',
		data: {
			user: { id: me.id },
			fileId: file.id,
			withReplies: params.withReplies,
		},
		opts: importJobOptions(deps.config),
	});
}

export const importMutingParamDef = z.object({
	fileId: misskeyId(),
});

type ImportMutingParams = { fileId: string };

export async function handleHonoApiIImportMuting(
	deps: HonoApiImportJobDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(importMutingParamDef, body);
	const file = await validateImportFile(deps, me, params.fileId, {
		noSuchFile: { message: 'No such file.', code: 'NO_SUCH_FILE', id: 'e674141e-bd2a-ba85-e616-aefb187c9c2a' },
		tooBigFile: { message: 'That file is too big.', code: 'TOO_BIG_FILE', id: '9b4ada6d-d7f7-0472-0713-4f558bd1ec9c' },
		emptyFile: { message: 'That file is empty.', code: 'EMPTY_FILE', id: 'd2f12af1-e7b4-feac-86a3-519548f2728e' },
	});

	void addDbJob(deps.dbQueue, {
		name: 'importMuting',
		data: { user: { id: me.id }, fileId: file.id },
		opts: importJobOptions(deps.config),
	});
}

export const importUserListsParamDef = z.object({
	fileId: misskeyId(),
});

type ImportUserListsParams = { fileId: string };

export async function handleHonoApiIImportUserLists(
	deps: HonoApiImportJobDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(importUserListsParamDef, body);
	const file = await validateImportFile(deps, me, params.fileId, {
		noSuchFile: { message: 'No such file.', code: 'NO_SUCH_FILE', id: 'ea9cc34f-c415-4bc6-a6fe-28ac40357049' },
		tooBigFile: { message: 'That file is too big.', code: 'TOO_BIG_FILE', id: 'ae6e7a22-971b-4b52-b2be-fc0b9b121fe9' },
		emptyFile: { message: 'That file is empty.', code: 'EMPTY_FILE', id: '99efe367-ce6e-4d44-93f8-5fae7b040356' },
	});

	void addDbJob(deps.dbQueue, {
		name: 'importUserLists',
		data: { user: { id: me.id }, fileId: file.id },
		opts: importJobOptions(deps.config),
	});
}

export const importAntennasParamDef = z.object({
	fileId: misskeyId(),
});

type ImportAntennasParams = { fileId: string };

function importAntennasNoSuchFileError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such file.', code: 'NO_SUCH_FILE', id: '3b71d086-c3fa-431c-b01d-ded65a777172' });
}

function importAntennasNoSuchUserError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'No such user.', code: 'NO_SUCH_USER', id: 'e842c379-8ac7-4cf7-b07a-4d4de7e4671c' });
}

function importAntennasEmptyFileError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'That file is empty.', code: 'EMPTY_FILE', id: '7f60115d-8d93-4b0f-bd0e-3815dcbb389f' });
}

function importAntennasTooManyAntennasError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'You cannot create antenna any more.', code: 'TOO_MANY_ANTENNAS', id: '600917d4-a4cb-4cc5-8ba8-7ac8ea3c7779' });
}

export async function handleHonoApiIImportAntennas(
	deps: HonoApiIImportAntennasDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(importAntennasParamDef, body);

	const user = await fetchUserByIdFromDatabase(deps.db, me.id);
	if (user == null) throw importAntennasNoSuchUserError();

	const file = await fetchDriveFileByIdAndUserIdFromDatabase(deps.db, params.fileId, me.id);
	if (file == null) throw importAntennasNoSuchFileError();
	if (file.size === 0) throw importAntennasEmptyFileError();

	const antennas: (MiAntenna & { userListAccts: string[] | null })[] = JSON.parse(await deps.downloadService.downloadTextFile(file.url));

	const currentAntennasCount = await countAntennasByUserIdFromDatabase(deps.db, me.id);
	const policies = await getHonoApiRolePolicies(deps, me);
	if (currentAntennasCount + antennas.length >= policies.antennaLimit) {
		throw importAntennasTooManyAntennasError();
	}

	void addDbJob(deps.dbQueue, {
		name: 'importAntennas',
		data: { user: { id: me.id }, antenna: antennas },
		opts: importJobOptions(deps.config),
	});
}
