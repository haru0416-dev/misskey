/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import { hashPassword } from '@/misc/password.js';
import { z } from 'zod';
import type { Config } from '@/config.js';
import type { EmailService } from '@/core/EmailService.js';
import { consumePasswordResetRequestInDatabase, createPasswordResetRequestInDatabase, fetchPasswordResetRequestByTokenFromDatabase } from '@/core/PasswordResetRequestStore.js';
import { fetchLocalUserByUsernameFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { getIpHash } from '@/misc/get-ip-hash.js';
import { trackPromise } from '@/misc/promise-tracker.js';
import { L_CHARS, secureRndstr } from '@/misc/secure-rndstr.js';
import { passwordSchema } from '@/models/User.js';
import { rateLimitExceededError } from './error.js';
import { isHonoApiRateLimited } from './rate-limit.js';
import { parseHonoApiParams } from './validation.js';

export type HonoApiPasswordResetDependencies = {
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

export const resetPasswordParamDef = z.object({
	token: z.string(),
	password: passwordSchema,
});

type ResetPasswordParams = {
	token: string;
	password: string;
};

export async function handleHonoApiRequestResetPassword(
	deps: HonoApiPasswordResetDependencies,
	body: Record<string, unknown>,
	ip: string,
): Promise<void> {
	const params = parseHonoApiParams(requestResetPasswordParamDef, body);

	if (await isHonoApiRateLimited(deps, {
		key: 'request-reset-password',
		duration: 60 * 60 * 1000,
		max: 3,
	}, getIpHash(ip))) {
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

	const link = `${deps.config.url}/reset-password/${token}`;

	trackPromise(deps.emailService.sendEmail(params.email, 'Password reset requested',
		`To reset password, please click this link:<br><a href="${link}">${link}</a>`,
		`To reset password, please click this link: ${link}`));
}

export async function handleHonoApiResetPassword(
	deps: HonoApiPasswordResetDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(resetPasswordParamDef, body);
	const req = await fetchPasswordResetRequestByTokenFromDatabase(deps.db, params.token);

	if (Date.now() - parseId(req.id).date.getTime() > 1000 * 60 * 30) {
		throw new Error();
	}

	const hash = await hashPassword(params.password);

	await consumePasswordResetRequestInDatabase(deps.db, params.token, hash);
}
