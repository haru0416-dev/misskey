/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { hashPasswordSync } from '@/misc/password.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import { fetchUserByIdFromDatabase, updateUserInDatabase } from '@/core/user/UserStore.js';
import {
	fetchUserProfileByUserIdOrFailFromDatabase,
	unsetUserMfaInDatabase,
	updateUserProfileInDatabase,
} from '@/core/user/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import { misskeyId } from '@/misc/zod-params.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import { HonoApiError } from '../error.js';
import { isHonoApiAdministrator } from '../role/role-policy.js';
import { parseHonoApiParams } from '../validation.js';

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

function accessDeniedError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'Access denied.',
		code: 'ACCESS_DENIED',
		id: 'cda8f8ce-89a6-4f92-8055-33bbe0c1464d',
	});
}

/**
 * パスワードリセットと MFA 解除は対象アカウントの乗っ取りそのものなので、対象が管理者なら
 * 本人以外は一律に弾く (root は常に管理者扱い)。モデレーターからの管理者乗っ取りだけでなく、
 * 管理者どうしの横取りも防ぐ。
 */
async function assertCanTakeOverUser(
	deps: HonoApiAdminUserMaintenanceDependencies,
	me: MiLocalUser,
	user: MiUser,
): Promise<void> {
	if (me.id !== user.id && (await isHonoApiAdministrator(deps, user))) throw accessDeniedError();
}

export async function handleHonoApiAdminResetPassword(
	deps: HonoApiAdminUserMaintenanceDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<ResetPasswordResponse> {
	const params = parseHonoApiParams(adminUserMaintenanceParamDef, body);
	const user = await fetchUserByIdFromDatabase(deps.db, params.userId);
	if (user == null) throw noSuchUserError();
	await assertCanTakeOverUser(deps, me, user);

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
	await assertCanTakeOverUser(deps, me, user);

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
