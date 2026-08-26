/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { comparePassword } from '@/misc/password.js';
import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';
import { z } from 'zod';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
	countUserSecurityKeysByUserIdFromDatabase,
	createUserSecurityKeyInDatabase,
	deleteUserSecurityKeyByIdAndUserIdFromDatabase,
	fetchUserSecurityKeyByIdFromDatabase,
	updateUserSecurityKeyNameByIdInDatabase,
} from '@/core/account/UserSecurityKeyStore.js';
import {
	fetchUserProfileByUserIdFromDatabase,
	fetchUserProfileByUserIdOrFailFromDatabase,
	updateUserProfileInDatabase,
} from '@/core/user/UserProfileStore.js';
import type { UserAuthService } from '@/core/account/UserAuthService.js';
import type { WebAuthnService } from '@/core/account/WebAuthnService.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { HonoApiError } from '../error.js';
import type { HonoApiMainStreamPublisher } from '../events.js';
import { packMeDetailedForHonoApi, type UserPackingDependencies } from '../user/user.js';
import { parseHonoApiParams } from '../validation.js';

export type HonoApiI2faDependencies = UserPackingDependencies & {
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate' | 'validateOtp'>;
	webAuthnService: Pick<WebAuthnService, 'initiateRegistration' | 'verifyRegistration'>;
	publishMainStream?: HonoApiMainStreamPublisher;
};

async function assertTwoFactorAuthenticatedForHonoApi(
	deps: HonoApiI2faDependencies,
	profile: MiUserProfile,
	token: string | null | undefined,
): Promise<void> {
	if (!profile.twoFactorEnabled) return;
	if (token == null) throw new Error('authentication failed');

	try {
		await deps.userAuthService.twoFactorAuthenticate(profile, token);
	} catch (_) {
		throw new Error('authentication failed', { cause: _ });
	}
}

function incorrectPasswordError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: 'Incorrect password.', code: 'INCORRECT_PASSWORD', id });
}

async function assertPasswordMatchedForHonoApi(
	profile: MiUserProfile,
	password: string,
	errorId: string,
): Promise<void> {
	const passwordMatched = await comparePassword(password, profile.password ?? '');
	if (!passwordMatched) throw incorrectPasswordError(errorId);
}

async function publishMeUpdatedForHonoApi(deps: HonoApiI2faDependencies, me: MiLocalUser): Promise<void> {
	deps.publishMainStream?.(me.id, 'meUpdated', await packMeDetailedForHonoApi(deps, me, { includeSecrets: true }));
}

export const i2faRegisterParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

type I2faRegisterParams = {
	password: string;
	token?: string | null;
};

export async function handleHonoApiI2faRegister(
	deps: HonoApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ qr: string; url: string; secret: string; label: string; issuer: string }> {
	const params = parseHonoApiParams(i2faRegisterParamDef, body);

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticatedForHonoApi(deps, profile, params.token);
	await assertPasswordMatchedForHonoApi(profile, params.password, '78d6c839-20c9-4c66-b90a-fc0542168b48');

	const secret = new OTPAuth.Secret();

	await updateUserProfileInDatabase(deps.db, me.id, {
		twoFactorTempSecret: secret.base32,
	});

	const totp = new OTPAuth.TOTP({
		secret,
		digits: 6,
		label: me.username,
		issuer: deps.config.runtime.host,
	});
	const url = totp.toString();
	const qr = await QRCode.toDataURL(url);

	return {
		qr,
		url,
		secret: secret.base32,
		label: me.username,
		issuer: deps.config.runtime.host,
	};
}

export const i2faDoneParamDef = z.object({
	token: z.string(),
});

type I2faDoneParams = {
	token: string;
};

export async function handleHonoApiI2faDone(
	deps: HonoApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ backupCodes: string[] }> {
	const params = parseHonoApiParams(i2faDoneParamDef, body);
	const token = params.token.replace(/\s/g, '');

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	if (profile.twoFactorTempSecret == null) {
		throw new Error('二段階認証の設定が開始されていません');
	}

	if (!(await deps.userAuthService.validateOtp(profile.userId, profile.twoFactorTempSecret, token))) {
		throw new Error('not verified');
	}

	const backupCodes = Array.from({ length: 5 }, () => new OTPAuth.Secret().base32);

	await updateUserProfileInDatabase(deps.db, me.id, {
		twoFactorSecret: profile.twoFactorTempSecret,
		twoFactorBackupSecret: backupCodes,
		twoFactorEnabled: true,
	});

	await publishMeUpdatedForHonoApi(deps, me);

	return { backupCodes };
}

export const i2faRegisterKeyParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

type I2faRegisterKeyParams = {
	password: string;
	token?: string | null;
};

function userNotFoundError(): HonoApiError {
	return new HonoApiError({
		status: 400,
		message: 'User not found.',
		code: 'USER_NOT_FOUND',
		id: '652f899f-66d4-490e-993e-6606c8ec04c3',
	});
}

function twoFactorNotEnabledError(id: string): HonoApiError {
	return new HonoApiError({ status: 400, message: '2fa not enabled.', code: 'TWO_FACTOR_NOT_ENABLED', id });
}

export async function handleHonoApiI2faRegisterKey(
	deps: HonoApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<unknown> {
	const params = parseHonoApiParams(i2faRegisterKeyParamDef, body);

	const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, me.id);
	if (profile == null) throw userNotFoundError();

	await assertTwoFactorAuthenticatedForHonoApi(deps, profile, params.token);
	await assertPasswordMatchedForHonoApi(profile, params.password, '38769596-efe2-4faf-9bec-abbb3f2cd9ba');

	if (!profile.twoFactorEnabled) throw twoFactorNotEnabledError('bf32b864-449b-47b8-974e-f9a5468546f1');

	return await deps.webAuthnService.initiateRegistration(me.id, me.username, me.name ?? undefined);
}

export const i2faKeyDoneParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
	name: z.string().min(1).max(30),
	credential: z.record(z.string(), z.unknown()),
});

type I2faKeyDoneParams = {
	password: string;
	token?: string | null;
	name: string;
	credential: Record<string, unknown>;
};

export async function handleHonoApiI2faKeyDone(
	deps: HonoApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
	const params = parseHonoApiParams(i2faKeyDoneParamDef, body);

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticatedForHonoApi(deps, profile, params.token);
	await assertPasswordMatchedForHonoApi(profile, params.password, '0d7ec6d2-e652-443e-a7bf-9ee9a0cd77b0');

	if (!profile.twoFactorEnabled) throw twoFactorNotEnabledError('798d6847-b1ed-4f9c-b1f9-163c42655995');

	const keyInfo = await deps.webAuthnService.verifyRegistration(
		me.id,
		params.credential as unknown as RegistrationResponseJSON,
	);
	const keyId = keyInfo.credentialID;

	await createUserSecurityKeyInDatabase(deps.db, {
		id: keyId,
		userId: me.id,
		name: params.name,
		publicKey: Buffer.from(keyInfo.credentialPublicKey).toString('base64url'),
		counter: keyInfo.counter,
		credentialDeviceType: keyInfo.credentialDeviceType,
		credentialBackedUp: keyInfo.credentialBackedUp,
		transports: keyInfo.transports,
	});

	await publishMeUpdatedForHonoApi(deps, me);

	return {
		id: keyId,
		name: params.name,
	};
}

export const i2faUpdateKeyParamDef = z.object({
	name: z.string().min(1).max(30),
	credentialId: z.string(),
});

type I2faUpdateKeyParams = {
	name: string;
	credentialId: string;
};

export async function handleHonoApiI2faUpdateKey(
	deps: HonoApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, never>> {
	const params = parseHonoApiParams(i2faUpdateKeyParamDef, body);

	const key = await fetchUserSecurityKeyByIdFromDatabase(deps.db, params.credentialId);
	if (key == null) {
		throw new HonoApiError({
			status: 400,
			message: 'No such key.',
			code: 'NO_SUCH_KEY',
			id: 'f9c5467f-d492-4d3c-9a8g-a70dacc86512',
		});
	}
	if (key.userId !== me.id) {
		throw new HonoApiError({
			status: 400,
			message: 'You do not have edit privilege of this key.',
			code: 'ACCESS_DENIED',
			id: '1fb7cb09-d46a-4fff-b8df-057708cce513',
		});
	}

	await updateUserSecurityKeyNameByIdInDatabase(deps.db, key.id, params.name);

	await publishMeUpdatedForHonoApi(deps, me);

	return {};
}

export const i2faRemoveKeyParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
	credentialId: z.string(),
});

type I2faRemoveKeyParams = {
	password: string;
	token?: string | null;
	credentialId: string;
};

export async function handleHonoApiI2faRemoveKey(
	deps: HonoApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, never>> {
	const params = parseHonoApiParams(i2faRemoveKeyParamDef, body);

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticatedForHonoApi(deps, profile, params.token);
	await assertPasswordMatchedForHonoApi(profile, params.password, '141c598d-a825-44c8-9173-cfb9d92be493');

	await deleteUserSecurityKeyByIdAndUserIdFromDatabase(deps.db, params.credentialId, me.id);

	const keyCount = await countUserSecurityKeysByUserIdFromDatabase(deps.db, me.id);
	if (keyCount === 0) {
		await updateUserProfileInDatabase(deps.db, me.id, {
			usePasswordLessLogin: false,
		});
	}

	await publishMeUpdatedForHonoApi(deps, me);

	return {};
}

export const i2faUnregisterParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

type I2faUnregisterParams = {
	password: string;
	token?: string | null;
};

export async function handleHonoApiI2faUnregister(
	deps: HonoApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(i2faUnregisterParamDef, body);

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticatedForHonoApi(deps, profile, params.token);
	await assertPasswordMatchedForHonoApi(profile, params.password, '7add0395-9901-4098-82f9-4f67af65f775');

	await updateUserProfileInDatabase(deps.db, me.id, {
		twoFactorSecret: null,
		twoFactorBackupSecret: null,
		twoFactorEnabled: false,
		usePasswordLessLogin: false,
	});

	await publishMeUpdatedForHonoApi(deps, me);
}

export const i2faPasswordLessParamDef = z.object({
	value: z.boolean(),
});

type I2faPasswordLessParams = {
	value: boolean;
};

export async function handleHonoApiI2faPasswordLess(
	deps: HonoApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(i2faPasswordLessParamDef, body);

	if (params.value === true) {
		const keyCount = await countUserSecurityKeysByUserIdFromDatabase(deps.db, me.id);
		if (keyCount === 0) {
			await updateUserProfileInDatabase(deps.db, me.id, {
				usePasswordLessLogin: false,
			});
			throw new HonoApiError({
				status: 400,
				message: 'No security key.',
				code: 'NO_SECURITY_KEY',
				id: 'f9c54d7f-d4c2-4d3c-9a8g-a70daac86512',
			});
		}
	}

	await updateUserProfileInDatabase(deps.db, me.id, {
		usePasswordLessLogin: params.value,
	});

	await publishMeUpdatedForHonoApi(deps, me);
}
