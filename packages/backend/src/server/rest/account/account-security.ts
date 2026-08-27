/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { hashPassword, comparePassword } from '@/misc/password.js';
import { deleteAccountWithSideEffects } from '@/core/account/DeleteAccountLogic.js';
import type { EmailService } from '@/core/email/EmailService.js';
import type { DbQueue, DeliverQueue } from '@/core/queue/queues.js';
import type { UserAuthService } from '@/core/account/UserAuthService.js';
import { fetchUserByIdOrFailFromDatabase, updateUserInDatabase } from '@/core/user/UserStore.js';
import {
	fetchUserProfileByUserIdOrFailFromDatabase,
	updateUserProfileInDatabase,
} from '@/core/user/UserProfileStore.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';
import { omitUndefined } from '@/misc/clone.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { ApiError } from '../error.js';
import type { ApiInternalEventPublisher, ApiMainStreamPublisher } from '../events.js';
import { packMeDetailedForApi, type MeDetailedApiResponse, type UserPackingDependencies } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiAccountSecurityDependencies = UserPackingDependencies & {
	config: Config;
	meta: MiMeta;
	db: MiDrizzleDatabase;
	dbQueue: DbQueue;
	deliverQueue: DeliverQueue;
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate'>;
	emailService: Pick<EmailService, 'sendEmail' | 'validateEmailForAccount'>;
	publishInternalEvent?: ApiInternalEventPublisher;
	publishMainStream?: ApiMainStreamPublisher;
};

// パスワード誤入力も2FA失敗も利用者の入力ミスであってサーバー内部の異常ではない。
// 生の Error を投げると 500 INTERNAL_ERROR になり、クライアントが原因を出し分けられないうえ
// 予期しない例外としてサーバーログに残り続けるので、明示的なAPIエラーとして返す
function incorrectPasswordError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'Incorrect password.', code: 'INCORRECT_PASSWORD', id });
}

function twoFactorAuthenticationFailedError(id: string): ApiError {
	return new ApiError({
		status: 400,
		message: 'Two-factor authentication failed.',
		code: 'TWO_FACTOR_AUTHENTICATION_FAILED',
		id,
	});
}

async function assertApiTwoFactorIfEnabled(
	deps: Pick<ApiAccountSecurityDependencies, 'userAuthService'>,
	profile: MiUserProfile,
	token: string | null | undefined,
	errorId: string,
): Promise<void> {
	if (!profile.twoFactorEnabled) return;

	if (token == null) {
		throw twoFactorAuthenticationFailedError(errorId);
	}

	try {
		await deps.userAuthService.twoFactorAuthenticate(profile, token);
	} catch {
		throw twoFactorAuthenticationFailedError(errorId);
	}
}

export const changePasswordParamDef = z.object({
	currentPassword: z.string(),
	newPassword: z.string().min(1),
	token: z.string().nullable().optional(),
});

export async function handleApiIChangePassword(
	deps: ApiAccountSecurityDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(changePasswordParamDef, body);
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	await assertApiTwoFactorIfEnabled(deps, profile, params.token, '540239bb-cf8b-4870-8ca7-3a7f2bf8d0a1');

	const passwordMatched = await comparePassword(params.currentPassword, profile.password!);
	if (!passwordMatched) {
		throw incorrectPasswordError('b31b9d69-a1cc-47d9-a494-750046029bef');
	}

	const hash = await hashPassword(params.newPassword);

	await updateUserProfileInDatabase(deps.db, me.id, {
		password: hash,
	});
}

export const regenerateTokenParamDef = z.object({
	password: z.string(),
});

export async function handleApiIRegenerateToken(
	deps: ApiAccountSecurityDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(regenerateTokenParamDef, body);
	const freshUser = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);
	const oldToken = freshUser.token!;

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	const same = await comparePassword(params.password, profile.password!);
	if (!same) {
		throw incorrectPasswordError('0fef3578-b802-47b5-abb6-38d737baaf03');
	}

	const newToken = generateNativeUserToken();

	await updateUserInDatabase(deps.db, me.id, {
		token: newToken,
	});

	deps.publishInternalEvent?.('userTokenRegenerated', { id: me.id, oldToken, newToken });
	deps.publishMainStream?.(me.id, 'myTokenRegenerated');
}

export const deleteAccountParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

export async function handleApiIDeleteAccount(
	deps: ApiAccountSecurityDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(deleteAccountParamDef, body);
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	await assertApiTwoFactorIfEnabled(deps, profile, params.token, '05b2bab3-0825-4a3e-a13d-8793701af4de');

	const userDetailed = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);
	if (userDetailed.isDeleted) return;

	const passwordMatched = await comparePassword(params.password, profile.password!);
	if (!passwordMatched) {
		throw incorrectPasswordError('e7a9051d-adf7-454d-bfa7-95b3e5e2f5ac');
	}

	await deleteAccountWithSideEffects(deps, me);
}

function iUpdateEmailIncorrectPasswordError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Incorrect password.',
		code: 'INCORRECT_PASSWORD',
		id: 'e54c1d7e-e7d6-4103-86b6-0a95069b4ad3',
	});
}
function iUpdateEmailUnavailableError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Unavailable email address.',
		code: 'UNAVAILABLE',
		id: 'a2defefb-f220-8849-0af6-17f816099323',
	});
}
function iUpdateEmailRequiredError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Email address is required.',
		code: 'EMAIL_REQUIRED',
		id: '324c7a88-59f2-492f-903f-89134f93e47e',
	});
}

export const updateEmailParamDef = z.object({
	password: z.string(),
	email: z.string().nullable().optional(),
	token: z.string().nullable().optional(),
});

export async function handleApiIUpdateEmail(
	deps: ApiAccountSecurityDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<MeDetailedApiResponse> {
	const params = parseApiParams(updateEmailParamDef, body);
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	await assertApiTwoFactorIfEnabled(deps, profile, params.token, '624fde07-67a7-4da7-b27d-086e529666b6');

	const passwordMatched = await comparePassword(params.password, profile.password!);
	if (!passwordMatched) throw iUpdateEmailIncorrectPasswordError();

	if (params.email != null) {
		const res = await deps.emailService.validateEmailForAccount(params.email);
		if (!res.available) throw iUpdateEmailUnavailableError();
	} else if (deps.meta.emailRequiredForSignup) {
		throw iUpdateEmailRequiredError();
	}

	await updateUserProfileInDatabase(
		deps.db,
		me.id,
		omitUndefined({
			email: params.email,
			emailVerified: false,
			emailVerifyCode: null,
		}),
	);

	const iObj = await packMeDetailedForApi(deps, me, { includeSecrets: true });

	deps.publishMainStream?.(me.id, 'meUpdated', iObj);

	if (params.email != null) {
		const code = secureRndstr(16, { chars: L_CHARS });

		await updateUserProfileInDatabase(deps.db, me.id, {
			emailVerifyCode: code,
		});

		const link = `${deps.config.instance.url}/verify-email/${code}`;

		void deps.emailService.sendEmail(
			params.email,
			'Email verification',
			`To verify email, please click this link:<br><a href="${link}">${link}</a>`,
			`To verify email, please click this link: ${link}`,
		);
	}

	return iObj;
}
