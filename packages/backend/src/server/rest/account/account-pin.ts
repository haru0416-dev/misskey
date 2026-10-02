/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Params } from '../validation.js';
import { z } from 'zod';
import {
	createUserNotePiningWithinLimitInDatabase,
	deleteUserNotePiningFromDatabase,
} from '@/core/user/user-note-pining-store.js';
import { fetchNoteByIdAndUserIdFromDatabase } from '@/core/note/note-store.js';
import type { Config } from '@/config.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { genId } from '@/misc/id/gen-id.js';
import { ApiError } from '../error.js';
import { genLocalUserUri } from '../user/following.js';
import {
	addActivityContext,
	deliverNoteActivity,
	deliverToRelays,
	renderOnce,
} from '../../../core/activitypub/notes-ap.js';
import type { RelayDeliverDependencies } from '../../../core/activitypub/notes-ap.js';
import { fetchRolePolicies } from '../../../core/role/role-policy.js';
import type { RolePolicyDependencies } from '../../../core/role/role-policy.js';
import { packMeDetailed } from '../user/user.js';
import type { UserPackingDependencies } from '../../../core/user/user-packing.js';
import type { MeDetailedApiResponse } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type AccountPinDependencies = RolePolicyDependencies & RelayDeliverDependencies & UserPackingDependencies;

function iPinNoSuchNoteError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '56734f8b-3928-431e-bf80-6ff87df40cb3',
	});
}
function iPinLimitExceededError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'You can not pin notes any more.',
		code: 'PIN_LIMIT_EXCEEDED',
		id: '72dab508-c64d-498f-8740-a8eec1ba385a',
	});
}
function iPinAlreadyPinnedError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'That note has already been pinned.',
		code: 'ALREADY_PINNED',
		id: '8b18c2b7-68fe-4edb-9892-c0cbaeb6c913',
	});
}
function iUnpinNoSuchNoteError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'No such note.',
		code: 'NO_SUCH_NOTE',
		id: '454170ce-9d63-4a43-9da1-ea10afe81e21',
	});
}

export const iPinOrUnpinParamDef = z.object({
	noteId: misskeyId(),
});

function renderAdd(
	config: Pick<Config, 'instance'>,
	user: { id: MiUser['id'] },
	target: string,
	object: string,
): Record<string, unknown> {
	return { type: 'Add', actor: genLocalUserUri(config, user.id), target, object };
}

function renderRemove(
	config: Pick<Config, 'instance'>,
	user: { id: MiUser['id'] },
	target: string,
	object: string,
): Record<string, unknown> {
	return { type: 'Remove', actor: genLocalUserUri(config, user.id), target, object };
}

async function deliverPinnedChange(
	deps: AccountPinDependencies,
	user: MiLocalUser,
	noteId: string,
	isAddition: boolean,
): Promise<void> {
	const target = `${deps.config.instance.url}/users/${user.id}/collections/featured`;
	const item = `${deps.config.instance.url}/notes/${noteId}`;
	const content = renderOnce(() =>
		addActivityContext(
			deps.config,
			isAddition ? renderAdd(deps.config, user, target, item) : renderRemove(deps.config, user, target, item),
		),
	);

	await deliverNoteActivity(deps, user, content, { directRecipients: [], deliverToFollowers: true });
	// リレー配信は fire-and-forget とし、ピン留め処理の完了を待たせない。
	void deliverToRelays(deps, { id: user.id, host: null }, content).catch(() => {});
}

export async function addPinned(deps: AccountPinDependencies, user: MiUser, noteId: string): Promise<void> {
	const note = await fetchNoteByIdAndUserIdFromDatabase(deps.db, noteId, user.id);
	if (note == null) {
		throw iPinNoSuchNoteError();
	}

	const policies = await fetchRolePolicies(deps, user);
	const result = await createUserNotePiningWithinLimitInDatabase(
		deps.db,
		{
			id: genId(),
			userId: user.id,
			noteId: note.id,
		},
		policies.pinLimit,
	);
	if (result === 'limitExceeded') {
		throw iPinLimitExceededError();
	}
	if (result === 'alreadyPinned') {
		throw iPinAlreadyPinnedError();
	}

	if (user.host == null && !note.localOnly && (note.visibility === 'public' || note.visibility === 'home')) {
		void deliverPinnedChange(deps, user as MiLocalUser, note.id, true).catch(() => {});
	}
}

export async function removePinned(
	deps: AccountPinDependencies,
	user: { id: MiUser['id']; host: MiUser['host'] },
	noteId: string,
): Promise<void> {
	const note = await fetchNoteByIdAndUserIdFromDatabase(deps.db, noteId, user.id);
	if (note == null) {
		throw iUnpinNoSuchNoteError();
	}

	await deleteUserNotePiningFromDatabase(deps.db, { userId: user.id, noteId: note.id });

	if (user.host == null && !note.localOnly && (note.visibility === 'public' || note.visibility === 'home')) {
		void deliverPinnedChange(deps, user as MiLocalUser, note.id, false).catch(() => {});
	}
}

export async function handleApiIPin(
	deps: AccountPinDependencies,
	me: MiLocalUser,
	params: Params<typeof iPinOrUnpinParamDef>,
): Promise<MeDetailedApiResponse> {
	await addPinned(deps, me, params.noteId);

	return await packMeDetailed(deps, me, { includeSecrets: false });
}

export async function handleApiIUnpin(
	deps: AccountPinDependencies,
	me: MiLocalUser,
	params: Params<typeof iPinOrUnpinParamDef>,
): Promise<MeDetailedApiResponse> {
	await removePinned(deps, me, params.noteId);

	return await packMeDetailed(deps, me, { includeSecrets: false });
}
