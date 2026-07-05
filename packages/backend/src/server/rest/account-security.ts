/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import bcrypt from 'bcryptjs';
import { deleteAccountWithSideEffects } from '@/core/DeleteAccountLogic.js';
import type { EmailService } from '@/core/EmailService.js';
import type { DbQueue, DeliverQueue } from '@/core/QueueModule.js';
import type { UserAuthService } from '@/core/UserAuthService.js';
import { fetchUserByIdOrFailFromDatabase, updateUserInDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import { generateNativeUserToken } from '@/misc/token.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { HonoApiError } from './error.js';
import type { HonoApiInternalEventPublisher, HonoApiMainStreamPublisher } from './events.js';
import { packMeDetailedForHonoApi, type MeDetailedHonoApiResponse, type UserPackingDependencies } from './user.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiAccountSecurityDependencies = UserPackingDependencies & {
	config: Config;
	meta: MiMeta;
	db: MiDrizzleDatabase;
	dbQueue: DbQueue;
	deliverQueue: DeliverQueue;
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate'>;
	emailService: Pick<EmailService, 'sendEmail' | 'validateEmailForAccount'>;
	publishInternalEvent?: HonoApiInternalEventPublisher;
	publishMainStream?: HonoApiMainStreamPublisher;
};

async function assertHonoApiTwoFactorIfEnabled(
	deps: Pick<HonoApiAccountSecurityDependencies, 'userAuthService'>,
	profile: MiUserProfile,
	token: string | null | undefined,
): Promise<void> {
	if (!profile.twoFactorEnabled) return;

	if (token == null) {
		throw new Error('authentication failed');
	}

	try {
		await deps.userAuthService.twoFactorAuthenticate(profile, token);
	} catch {
		throw new Error('authentication failed');
	}
}

const changePasswordParamDef = {
	type: 'object',
	properties: {
		currentPassword: { type: 'string' },
		newPassword: { type: 'string', minLength: 1 },
		token: { type: 'string', nullable: true },
	},
	required: ['currentPassword', 'newPassword'],
} as const;

type ChangePasswordParams = {
	currentPassword: string;
	newPassword: string;
	token?: string | null;
};

export async function handleHonoApiIChangePassword(
	deps: HonoApiAccountSecurityDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(changePasswordParamDef, body) as ChangePasswordParams;
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	await assertHonoApiTwoFactorIfEnabled(deps, profile, params.token);

	const passwordMatched = await bcrypt.compare(params.currentPassword, profile.password!);
	if (!passwordMatched) {
		throw new Error('incorrect password');
	}

	const salt = await bcrypt.genSalt(8);
	const hash = await bcrypt.hash(params.newPassword, salt);

	await updateUserProfileInDatabase(deps.db, me.id, {
		password: hash,
	});
}

const regenerateTokenParamDef = {
	type: 'object',
	properties: {
		password: { type: 'string' },
	},
	required: ['password'],
} as const;

type RegenerateTokenParams = {
	password: string;
};

export async function handleHonoApiIRegenerateToken(
	deps: HonoApiAccountSecurityDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(regenerateTokenParamDef, body) as RegenerateTokenParams;
	const freshUser = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);
	const oldToken = freshUser.token!;

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	const same = await bcrypt.compare(params.password, profile.password!);
	if (!same) {
		throw new Error('incorrect password');
	}

	const newToken = generateNativeUserToken();

	await updateUserInDatabase(deps.db, me.id, {
		token: newToken,
	});

	deps.publishInternalEvent?.('userTokenRegenerated', { id: me.id, oldToken, newToken });
	deps.publishMainStream?.(me.id, 'myTokenRegenerated');
}

const deleteAccountParamDef = {
	type: 'object',
	properties: {
		password: { type: 'string' },
		token: { type: 'string', nullable: true },
	},
	required: ['password'],
} as const;

type DeleteAccountParams = {
	password: string;
	token?: string | null;
};

export async function handleHonoApiIDeleteAccount(
	deps: HonoApiAccountSecurityDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(deleteAccountParamDef, body) as DeleteAccountParams;
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	await assertHonoApiTwoFactorIfEnabled(deps, profile, params.token);

	const userDetailed = await fetchUserByIdOrFailFromDatabase(deps.db, me.id);
	if (userDetailed.isDeleted) return;

	const passwordMatched = await bcrypt.compare(params.password, profile.password!);
	if (!passwordMatched) {
		throw new Error('incorrect password');
	}

	await deleteAccountWithSideEffects(deps, me);
}

function iUpdateEmailIncorrectPasswordError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Incorrect password.', code: 'INCORRECT_PASSWORD', id: 'e54c1d7e-e7d6-4103-86b6-0a95069b4ad3' });
}
function iUpdateEmailUnavailableError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Unavailable email address.', code: 'UNAVAILABLE', id: 'a2defefb-f220-8849-0af6-17f816099323' });
}
function iUpdateEmailRequiredError(): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Email address is required.', code: 'EMAIL_REQUIRED', id: '324c7a88-59f2-492f-903f-89134f93e47e' });
}

const updateEmailParamDef = {
	type: 'object',
	properties: {
		password: { type: 'string' },
		email: { type: 'string', nullable: true },
		token: { type: 'string', nullable: true },
	},
	required: ['password'],
} as const;

type UpdateEmailParams = {
	password: string;
	email?: string | null;
	token?: string | null;
};

export async function handleHonoApiIUpdateEmail(
	deps: HonoApiAccountSecurityDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<MeDetailedHonoApiResponse> {
	const params = parseHonoApiParams(updateEmailParamDef, body) as UpdateEmailParams;
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	await assertHonoApiTwoFactorIfEnabled(deps, profile, params.token);

	const passwordMatched = await bcrypt.compare(params.password, profile.password!);
	if (!passwordMatched) throw iUpdateEmailIncorrectPasswordError();

	if (params.email != null) {
		const res = await deps.emailService.validateEmailForAccount(params.email);
		if (!res.available) throw iUpdateEmailUnavailableError();
	} else if (deps.meta.emailRequiredForSignup) {
		throw iUpdateEmailRequiredError();
	}

	await updateUserProfileInDatabase(deps.db, me.id, {
		email: params.email,
		emailVerified: false,
		emailVerifyCode: null,
	});

	const iObj = await packMeDetailedForHonoApi(deps, me, { includeSecrets: true });

	deps.publishMainStream?.(me.id, 'meUpdated', iObj);

	if (params.email != null) {
		const code = secureRndstr(16, { chars: L_CHARS });

		await updateUserProfileInDatabase(deps.db, me.id, {
			emailVerifyCode: code,
		});

		const link = `${deps.config.url}/verify-email/${code}`;

		void deps.emailService.sendEmail(
			params.email,
			'Email verification',
			`To verify email, please click this link:<br><a href="${link}">${link}</a>`,
			`To verify email, please click this link: ${link}`,
		);
	}

	return iObj;
}
