/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { hashPasswordSync } from '@/misc/password.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import { fetchUserByIdFromDatabase, updateUserInDatabase } from '@/core/UserStore.js';
import {
	fetchUserProfileByUserIdOrFailFromDatabase,
	unsetUserMfaInDatabase,
	updateUserProfileInDatabase,
} from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError, rolePermissionDeniedError } from './error.js';
import { isHonoApiAdministrator } from './role-policy.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAdminUserMaintenanceDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

export const adminUserMaintenanceParamDef = z.object({
	userId: misskeyId(),
});

export const adminUpdateUserNoteParamDef = z.object({
	userId: misskeyId(),
	text: z.string(),
});

type ResetPasswordResponse = {
	password: string;
};

function noSuchUserError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'No such user.',
		code: 'NO_SUCH_USER',
		id: 'ccafc7fe-5074-4edd-9dc0-8ef9ef6a701d',
	});
}

function cannotResetPasswordOfRootUserError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Cannot reset password of the root user.',
		code: 'CANNOT_RESET_PASSWORD_OF_ROOT_USER',
		id: 'f28fc207-42ca-44c7-a577-44b4f0ec5999',
	});
}

async function assertCanMaintainUser(
	deps: HonoApiAdminUserMaintenanceDependencies,
	me: MiLocalUser,
	user: MiUser,
): Promise<void> {
	if (!(await isHonoApiAdministrator(deps, me)) && (await isHonoApiAdministrator(deps, user))) {
		throw rolePermissionDeniedError();
	}
}

export async function handleHonoApiAdminResetPassword(
	deps: HonoApiAdminUserMaintenanceDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<ResetPasswordResponse> {
	const params = parseHonoApiParams(adminUserMaintenanceParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw noSuchUserError();
	if (deps.meta.rootUserId === user.id) throw cannotResetPasswordOfRootUserError();
	await assertCanMaintainUser(deps, me, user);

	const passwd = secureRndstr(8);
	await updateUserProfileInDatabase(deps.db, user.id, {
		password: hashPasswordSync(passwd),
	});

	await logModerationEventInDatabase(deps, me, 'resetPassword', {
		userId: user.id,
		userUsername: user.username,
		userHost: user.host,
	});

	return { password: passwd };
}

export async function handleHonoApiAdminUnsetMfa(
	deps: HonoApiAdminUserMaintenanceDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminUserMaintenanceParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw noSuchUserError();
	if (deps.meta.rootUserId === user.id) throw rolePermissionDeniedError();
	await assertCanMaintainUser(deps, me, user);

	await unsetUserMfaInDatabase(deps.db, user.id);
	await logModerationEventInDatabase(deps, me, 'unsetMfa', {
		userId: user.id,
		userUsername: user.username,
		userHost: user.host,
	});
}

export async function handleHonoApiAdminUnsetUserAvatar(
	deps: HonoApiAdminUserMaintenanceDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminUserMaintenanceParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw new Error('user not found');
	if (user.avatarId == null) return;

	await updateUserInDatabase(deps.db, user.id, {
		avatarId: null,
		avatarUrl: null,
		avatarBlurhash: null,
	});

	await logModerationEventInDatabase(deps, me, 'unsetUserAvatar', {
		userId: user.id,
		userUsername: user.username,
		userHost: user.host,
		fileId: user.avatarId,
	});
}

export async function handleHonoApiAdminUnsetUserBanner(
	deps: HonoApiAdminUserMaintenanceDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminUserMaintenanceParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw new Error('user not found');
	if (user.bannerId == null) return;

	await updateUserInDatabase(deps.db, user.id, {
		bannerId: null,
		bannerUrl: null,
		bannerBlurhash: null,
	});

	await logModerationEventInDatabase(deps, me, 'unsetUserBanner', {
		userId: user.id,
		userUsername: user.username,
		userHost: user.host,
		fileId: user.bannerId,
	});
}

export async function handleHonoApiAdminUpdateUserNote(
	deps: HonoApiAdminUserMaintenanceDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminUpdateUserNoteParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw new Error('user not found');

	const currentProfile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	await updateUserProfileInDatabase(deps.db, user.id, {
		moderationNote: params.text,
	});

	await logModerationEventInDatabase(deps, me, 'updateUserNote', {
		userId: user.id,
		userUsername: user.username,
		userHost: user.host,
		before: currentProfile.moderationNote,
		after: params.text,
	});
}
