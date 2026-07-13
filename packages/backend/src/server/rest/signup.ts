/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import { hashPassword } from '@/misc/password.js';
import type { Config } from '@/config.js';
import { isKeywordIncluded } from '@/misc/is-keyword-included.js';
import { createSignupAccountInDatabase } from '@/core/SignupStore.js';
import { fetchRegistrationTicketByPendingUserIdFromDatabase, updateRegistrationTicketInDatabase } from '@/core/RegistrationTicketStore.js';
import { isUsedUsername } from '@/core/UsedUsernameStore.js';
import { deleteUserPendingFromDatabase, fetchUserPendingByCodeFromDatabase } from '@/core/UserPendingStore.js';
import { isLocalUsernameTaken } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { genId } from '@/misc/id/gen-id.js';
import { parseId } from '@/misc/id/parse-id.js';
import { generateNativeUserToken } from '@/misc/token.js';
import type { MiMeta } from '@/models/_.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { HonoApiInternalEventPublisher } from './events.js';
import { enqueueSystemWebhookDeliverJob } from '@/core/SystemWebhookQueue.js';
import { listSystemWebhooksFromDatabase } from '@/core/SystemWebhookStore.js';
import type { SystemWebhookDeliverQueue } from '@/core/queues.js';
import { HonoApiError, signupValidationError } from './error.js';
import { completeHonoApiSignin, type HonoApiSigninDependencies, type HonoApiSigninFlowResult, type HonoApiSigninRequest } from './signin.js';
import { packMeDetailedForHonoApi, packUserLiteForHonoApi } from './user.js';

type SignupBody = {
	username?: unknown;
	password?: unknown;
	host?: unknown;
	invitationCode?: unknown;
	emailAddress?: unknown;
};

export type SignupResponse = Record<string, unknown> & {
	token: string;
};

export type SignupInternalEventPublisher = HonoApiInternalEventPublisher;

export type SignupDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	publishInternalEvent?: SignupInternalEventPublisher;
	/** userCreated system webhook の配送に必要。省略時は通知しない。 */
	systemWebhookDeliverQueue?: SystemWebhookDeliverQueue;
};

function validateUsername(username: unknown): asserts username is string {
	if (typeof username !== 'string' || !/^\w{1,20}$/.test(username)) {
		throw signupValidationError('INVALID_USERNAME');
	}
}

function validatePassword(password: unknown): asserts password is string {
	if (typeof password !== 'string' || password.length < 1) {
		throw signupValidationError('INVALID_PASSWORD');
	}
}

function normalizeHost(host: unknown): string | null {
	if (host == null) return null;
	if (typeof host !== 'string') throw signupValidationError('INVALID_HOST');

	const normalized = domainToASCII(host.toLowerCase());
	if (normalized === '') throw signupValidationError('INVALID_HOST');

	return normalized;
}

function assertSignupGateOpen(meta: MiMeta): void {
	if (process.env.NODE_ENV === 'test') return;

	if (meta.enableHcaptcha && meta.hcaptchaSecretKey) throw signupValidationError('CAPTCHA_REQUIRED');
	if (meta.enableMcaptcha && meta.mcaptchaSecretKey && meta.mcaptchaSitekey && meta.mcaptchaInstanceUrl) throw signupValidationError('CAPTCHA_REQUIRED');
	if (meta.enableRecaptcha && meta.recaptchaSecretKey) throw signupValidationError('CAPTCHA_REQUIRED');
	if (meta.enableTurnstile && meta.turnstileSecretKey) throw signupValidationError('CAPTCHA_REQUIRED');
	if (meta.enableTestcaptcha) throw signupValidationError('CAPTCHA_REQUIRED');
	if (meta.emailRequiredForSignup) throw signupValidationError('EMAIL_REQUIRED_FOR_SIGNUP');
	if (meta.disableRegistration) throw signupValidationError('INVITATION_REQUIRED');
}

export async function packSignupUser(deps: SignupDependencies, user: MiUser, token: string): Promise<SignupResponse> {
	return {
		...await packMeDetailedForHonoApi(deps, user, { includeSecrets: true }),
		token,
	};
}

export async function createLocalSignupAccount(
	deps: SignupDependencies,
	params: {
		username: string;
		passwordHash: string | null;
		host: string | null;
		ignorePreservedUsernames?: boolean;
	},
): Promise<{
	account: MiUser;
	token: string;
}> {
	const usernameLower = params.username.toLowerCase();

	if (await isLocalUsernameTaken(deps.db, params.username)) {
		throw signupValidationError('DUPLICATED_USERNAME');
	}

	if (await isUsedUsername(deps.db, params.username)) {
		throw signupValidationError('USED_USERNAME');
	}

	if (!params.ignorePreservedUsernames && deps.meta.rootUserId != null) {
		if (deps.meta.preservedUsernames.map(x => x.toLowerCase()).includes(usernameLower)) {
			throw signupValidationError('USED_USERNAME');
		}

		if (isKeywordIncluded(usernameLower, deps.meta.prohibitedWordsForNameOfUser)) {
			throw signupValidationError('USED_USERNAME');
		}
	}

	const token = generateNativeUserToken();
	const keyPair = await genRsaKeyPair();
	const remoteUri = params.host == null ? null : `https://${params.host}/users/${params.username}`;
	const beforeMeta = { ...deps.meta };
	const { account, rootClaimed } = await createSignupAccountInDatabase(deps.db, {
		id: genId(),
		username: params.username,
		usernameLower,
		host: params.host,
		uri: remoteUri,
		inbox: remoteUri == null ? null : `${remoteUri}/inbox`,
		sharedInbox: params.host == null ? null : `https://${params.host}/inbox`,
		followersUri: remoteUri == null ? null : `${remoteUri}/followers`,
		token,
		passwordHash: params.passwordHash,
		publicKey: keyPair.publicKey,
		privateKey: keyPair.privateKey,
		claimRoot: deps.meta.rootUserId == null,
	});

	if (rootClaimed) {
		deps.meta.rootUserId = account.id;
		deps.meta.rootUser = null;
		deps.publishInternalEvent?.('metaUpdated', { before: beforeMeta, after: deps.meta });
	}

	// SignupService.signup 相当: userCreated system webhook をエンキューする (原典同様 await しない)。
	if (deps.systemWebhookDeliverQueue != null) {
		const queue = deps.systemWebhookDeliverQueue;
		void (async () => {
			const webhooks = await listSystemWebhooksFromDatabase(deps.db, { isActive: true, on: ['userCreated'] });
			if (webhooks.length === 0) return;
			const packed = await packUserLiteForHonoApi(deps, account);
			await Promise.all(webhooks.map(webhook => enqueueSystemWebhookDeliverJob(queue, webhook, 'userCreated', packed)));
		})().catch(() => {});
	}

	return { account, token };
}

export async function signupWithHonoApi(deps: SignupDependencies, body: SignupBody): Promise<SignupResponse> {
	assertSignupGateOpen(deps.meta);
	validateUsername(body.username);
	validatePassword(body.password);

	const username = body.username;
	const normalizedHost = process.env.NODE_ENV === 'test' ? normalizeHost(body.host) : null;

	const hash = await hashPassword(body.password);
	const { account, token } = await createLocalSignupAccount(deps, {
		username,
		host: normalizedHost,
		passwordHash: hash,
	});

	return await packSignupUser(deps, account, token);
}

export async function signupPendingWithHonoApi(
	deps: SignupDependencies & HonoApiSigninDependencies,
	request: HonoApiSigninRequest,
): Promise<HonoApiSigninFlowResult> {
	const code = request.body.code;
	if (typeof code !== 'string') {
		throw signupValidationError('INVALID_PARAM');
	}

	try {
		const pendingUser = await fetchUserPendingByCodeFromDatabase(deps.db, code);

		if (parseId(pendingUser.id).date.getTime() + (1000 * 60 * 30) < Date.now()) {
			throw signupValidationError('EXPIRED');
		}

		validateUsername(pendingUser.username);
		const { account } = await createLocalSignupAccount(deps, {
			username: pendingUser.username,
			passwordHash: pendingUser.password,
			host: null,
		});

		await deleteUserPendingFromDatabase(deps.db, pendingUser.id);

		const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, account.id);

		await updateUserProfileInDatabase(deps.db, profile.userId, {
			email: pendingUser.email,
			emailVerified: true,
			emailVerifyCode: null,
		});

		const ticket = await fetchRegistrationTicketByPendingUserIdFromDatabase(deps.db, pendingUser.id);
		if (ticket) {
			await updateRegistrationTicketInDatabase(deps.db, ticket.id, {
				usedById: account.id,
				pendingUserId: null,
			});
		}

		return completeHonoApiSignin(deps, request, account as MiLocalUser);
	} catch (err) {
		if (err instanceof HonoApiError) {
			throw err;
		}

		throw signupValidationError(typeof err === 'string' ? err : (err as Error).message);
	}
}
