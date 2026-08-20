/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import {
	createUserNotePiningWithinLimitInDatabase,
	deleteUserNotePiningFromDatabase,
} from '@/core/UserNotePiningStore.js';
import { fetchNoteByIdAndUserIdFromDatabase } from '@/core/NoteStore.js';
import type { Config } from '@/config.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { genId } from '@/misc/id/gen-id.js';
import { HonoApiError } from './error.js';
import { genLocalUserUri } from './following.js';
import {
	addActivityContext,
	deliverNoteActivityForHonoApi,
	deliverToRelaysForHonoApi,
	type HonoApiRelayDeliverDependencies,
} from './notes-ap.js';
import { getHonoApiRolePolicies, type HonoApiRolePolicyDependencies } from './role-policy.js';
import { packMeDetailedForHonoApi, type MeDetailedHonoApiResponse, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAccountPinDependencies = HonoApiRolePolicyDependencies &
	HonoApiRelayDeliverDependencies &
	UserPackingDependencies;

function iPinNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '56734f8b-3928-431e-bf80-6ff87df40cb3',
	});
}
function iPinLimitExceededError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'You can not pin notes any more.',
		code: 'PIN_LIMIT_EXCEEDED',
		id: '72dab508-c64d-498f-8740-a8eec1ba385a',
	});
}
function iPinAlreadyPinnedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'That note has already been pinned.',
		code: 'ALREADY_PINNED',
		id: '8b18c2b7-68fe-4edb-9892-c0cbaeb6c913',
	});
}
function iUnpinNoSuchNoteError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '454170ce-9d63-4a43-9da1-ea10afe81e21',
	});
}

export const iPinOrUnpinParamDef = z.object({
	noteId: misskeyId(),
});

type IPinOrUnpinParams = {
	noteId: string;
};

function renderAddForHonoApi(
	config: Pick<Config, 'instance'>,
	user: { id: MiUser['id'] },
	target: string,
	object: string,
): Record<string, unknown> {
	return { type: 'Add', actor: genLocalUserUri(config, user.id), target, object };
}

function renderRemoveForHonoApi(
	config: Pick<Config, 'instance'>,
	user: { id: MiUser['id'] },
	target: string,
	object: string,
): Record<string, unknown> {
	return { type: 'Remove', actor: genLocalUserUri(config, user.id), target, object };
}

async function deliverPinnedChangeForHonoApi(
	deps: HonoApiAccountPinDependencies,
	user: MiLocalUser,
	noteId: string,
	isAddition: boolean,
): Promise<void> {
	const target = `${deps.config.instance.url}/users/${user.id}/collections/featured`;
	const item = `${deps.config.instance.url}/notes/${noteId}`;
	const content = addActivityContext(
		deps.config,
		isAddition
			? renderAddForHonoApi(deps.config, user, target, item)
			: renderRemoveForHonoApi(deps.config, user, target, item),
	);

	await deliverNoteActivityForHonoApi(deps, user, content, { directRecipients: [], deliverToFollowers: true });
	// リレー配信は fire-and-forget とし、ピン留め処理の完了を待たせない。
	void deliverToRelaysForHonoApi(deps, { id: user.id, host: null }, content).catch(() => {});
}

export async function addPinnedForHonoApi(
	deps: HonoApiAccountPinDependencies,
	user: { id: MiUser['id']; host: MiUser['host'] },
	noteId: string,
): Promise<void> {
	const note = await fetchNoteByIdAndUserIdFromDatabase(deps.db, noteId, user.id);
	if (note == null) throw iPinNoSuchNoteError();

	const policies = await getHonoApiRolePolicies(deps, user as MiUser);
	const result = await createUserNotePiningWithinLimitInDatabase(
		deps.db,
		{
			id: genId(),
			userId: user.id,
			noteId: note.id,
		},
		policies.pinLimit,
	);
	if (result === 'limitExceeded') throw iPinLimitExceededError();
	if (result === 'alreadyPinned') throw iPinAlreadyPinnedError();

	if (user.host == null && !note.localOnly && (note.visibility === 'public' || note.visibility === 'home')) {
		void deliverPinnedChangeForHonoApi(deps, user as MiLocalUser, note.id, true).catch(() => {});
	}
}

export async function removePinnedForHonoApi(
	deps: HonoApiAccountPinDependencies,
	user: { id: MiUser['id']; host: MiUser['host'] },
	noteId: string,
): Promise<void> {
	const note = await fetchNoteByIdAndUserIdFromDatabase(deps.db, noteId, user.id);
	if (note == null) throw iUnpinNoSuchNoteError();

	await deleteUserNotePiningFromDatabase(deps.db, { userId: user.id, noteId: note.id });

	if (user.host == null && !note.localOnly && (note.visibility === 'public' || note.visibility === 'home')) {
		void deliverPinnedChangeForHonoApi(deps, user as MiLocalUser, note.id, false).catch(() => {});
	}
}

export async function handleHonoApiIPin(
	deps: HonoApiAccountPinDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<MeDetailedHonoApiResponse> {
	const params = parseHonoApiParams(iPinOrUnpinParamDef, body);

	await addPinnedForHonoApi(deps, me, params.noteId);

	return await packMeDetailedForHonoApi(deps, me, { includeSecrets: false });
}

export async function handleHonoApiIUnpin(
	deps: HonoApiAccountPinDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<MeDetailedHonoApiResponse> {
	const params = parseHonoApiParams(iPinOrUnpinParamDef, body);

	await removePinnedForHonoApi(deps, me, params.noteId);

	return await packMeDetailedForHonoApi(deps, me, { includeSecrets: false });
}
