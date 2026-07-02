/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import bcrypt from 'bcryptjs';
import RE2 from 're2';
import type { Config } from '@/config.js';
import { createSignupAccountInDatabase } from '@/core/SignupStore.js';
import { updateMetaInDatabase } from '@/core/MetaStore.js';
import { isUsedUsername } from '@/core/UsedUsernameStore.js';
import { isLocalUsernameTaken } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genRsaKeyPair } from '@/misc/gen-key-pair.js';
import { genId } from '@/misc/id/gen-id.js';
import { generateNativeUserToken } from '@/misc/token.js';
import type { MiMeta } from '@/models/_.js';
import type { MiUser } from '@/models/User.js';
import { signupValidationError } from './hono-api-error.js';
import { packMeDetailedForHonoApi } from './hono-api-user.js';

type SignupBody = {
	username?: unknown;
	password?: unknown;
	host?: unknown;
	invitationCode?: unknown;
	emailAddress?: unknown;
};

type SignupResponse = Record<string, unknown> & {
	token: string;
};

export type SignupInternalEventPublisher = (
	type: 'metaUpdated',
	value: { before?: MiMeta; after: MiMeta },
) => void;

export type SignupDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
	publishInternalEvent?: SignupInternalEventPublisher;
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

function isKeywordIncluded(text: string, keywords: string[]): boolean {
	if (keywords.length === 0) return false;
	if (text === '') return false;

	const regexpPattern = /^\/(.+)\/(.*)$/;

	return keywords.some(filter => {
		const regexp = filter.match(regexpPattern);
		if (!regexp) {
			const words = filter.split(' ');
			return words.every(keyword => text.includes(keyword));
		}

		try {
			return new RE2(regexp[1], regexp[2]).test(text);
		} catch {
			return false;
		}
	});
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

async function assignRootUserIfMissing(deps: SignupDependencies, userId: MiUser['id']): Promise<void> {
	if (deps.meta.rootUserId != null) return;

	const { before, after } = await updateMetaInDatabase(deps.db, { rootUserId: userId });
	Object.assign(deps.meta, after);
	deps.meta.rootUser = null;
	deps.publishInternalEvent?.('metaUpdated', { before, after });
}

async function packSignupUser(deps: SignupDependencies, user: MiUser, token: string): Promise<SignupResponse> {
	return {
		...await packMeDetailedForHonoApi(deps, user, { includeSecrets: true }),
		token,
	};
}

export async function signupWithHonoApi(deps: SignupDependencies, body: SignupBody): Promise<SignupResponse> {
	assertSignupGateOpen(deps.meta);
	validateUsername(body.username);
	validatePassword(body.password);

	const username = body.username;
	const normalizedHost = process.env.NODE_ENV === 'test' ? normalizeHost(body.host) : null;

	if (await isLocalUsernameTaken(deps.db, username)) {
		throw signupValidationError('DUPLICATED_USERNAME');
	}

	if (await isUsedUsername(deps.db, username)) {
		throw signupValidationError('USED_USERNAME');
	}

	if (deps.meta.rootUserId != null) {
		const usernameLower = username.toLowerCase();
		if (deps.meta.preservedUsernames.map(x => x.toLowerCase()).includes(usernameLower)) {
			throw signupValidationError('USED_USERNAME');
		}

		if (isKeywordIncluded(usernameLower, deps.meta.prohibitedWordsForNameOfUser)) {
			throw signupValidationError('USED_USERNAME');
		}
	}

	const salt = await bcrypt.genSalt(8);
	const hash = await bcrypt.hash(body.password, salt);
	const token = generateNativeUserToken();
	const keyPair = await genRsaKeyPair();
	const remoteUri = normalizedHost == null ? null : `https://${normalizedHost}/users/${username}`;
	const account = await createSignupAccountInDatabase(deps.db, {
		id: genId(deps.config),
		username,
		usernameLower: username.toLowerCase(),
		host: normalizedHost,
		uri: remoteUri,
		inbox: remoteUri == null ? null : `${remoteUri}/inbox`,
		sharedInbox: normalizedHost == null ? null : `https://${normalizedHost}/inbox`,
		followersUri: remoteUri == null ? null : `${remoteUri}/followers`,
		token,
		passwordHash: hash,
		publicKey: keyPair.publicKey,
		privateKey: keyPair.privateKey,
	});

	await assignRootUserIfMissing(deps, account.id);

	return await packSignupUser(deps, account, token);
}
