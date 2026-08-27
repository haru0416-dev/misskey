/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { hashPassword } from '@/misc/password.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import type { EmailService } from '@/core/email/EmailService.js';
import {
	consumePasswordResetRequestInDatabase,
	createPasswordResetRequestInDatabase,
	fetchPasswordResetRequestByTokenFromDatabase,
	isPasswordResetRequestExpired,
} from '@/core/account/PasswordResetRequestStore.js';
import { fetchLocalUserByUsernameFromDatabase } from '@/core/user/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/user/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';
import { passwordSchema } from '@/models/User.js';
import { ApiError, rateLimitExceededError } from '../error.js';
import { isApiRateLimited } from '../rate-limit.js';
import { parseApiParams } from '../validation.js';

export type ApiPasswordResetDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	emailService: Pick<EmailService, 'sendEmail'>;
};

export const requestResetPasswordParamDef = z.object({
	username: z.string(),
	email: z.string(),
});

type RequestResetPasswordParams = {
	username: string;
	email: string;
};

function invalidPasswordResetTokenError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'Invalid or expired token.',
		code: 'INVALID_TOKEN',
		id: 'e04a2320-6ee2-4a11-8ad2-c9ea9e2ab84f',
	});
}

export const resetPasswordParamDef = z.object({
	token: z.string(),
	password: passwordSchema,
});

type ResetPasswordParams = {
	token: string;
	password: string;
};

export async function handleApiRequestResetPassword(
	deps: ApiPasswordResetDependencies,
	body: Record<string, unknown>,
	ip: string,
): Promise<void> {
	const params = parseApiParams(requestResetPasswordParamDef, body);

	if (
		await isApiRateLimited(
			deps,
			{
				key: 'request-reset-password',
				duration: 60 * 60 * 1000,
				max: 3,
			},
			getIpHash(ip),
		)
	) {
		throw rateLimitExceededError();
	}

	const user = await fetchLocalUserByUsernameFromDatabase(deps.db, params.username);
	if (user == null) return;

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, user.id);
	if (profile.email !== params.email) return;
	if (!profile.emailVerified) return;

	const token = secureRndstr(64, { chars: L_CHARS });

	await createPasswordResetRequestInDatabase(deps.db, {
		id: genId(),
		userId: profile.userId,
		token,
	});

	const link = `${deps.config.instance.url}/reset-password/${token}`;

	trackPromise(
		deps.emailService.sendEmail(
			params.email,
			'Password reset requested',
			`To reset password, please click this link:<br><a href="${link}">${link}</a>`,
			`To reset password, please click this link: ${link}`,
		),
	);
}

export async function handleApiResetPassword(
	deps: ApiPasswordResetDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(resetPasswordParamDef, body);
	const req = await fetchPasswordResetRequestByTokenFromDatabase(deps.db, params.token);

	// メールのリンクは30分で切れる。これは利用者にとって普通に起こることなので、
	// 生の Error (= 500 INTERNAL_ERROR) ではなく理由の分かるAPIエラーを返す。
	// ハッシュ計算の前に弾くのは、無効なトークンの連投でCPUを浪費させないため
	if (req == null || isPasswordResetRequestExpired(req)) {
		throw invalidPasswordResetTokenError();
	}

	const hash = await hashPassword(params.password);

	const result = await consumePasswordResetRequestInDatabase(deps.db, params.token, hash);
	if (result !== 'ok') {
		throw invalidPasswordResetTokenError();
	}
}
