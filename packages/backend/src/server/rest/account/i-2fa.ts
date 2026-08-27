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
import { ApiError } from '../error.js';
import type { ApiMainStreamPublisher } from '../events.js';
import { packMeDetailedForApi, type UserPackingDependencies } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiI2faDependencies = UserPackingDependencies & {
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate' | 'validateOtp'>;
	webAuthnService: Pick<WebAuthnService, 'initiateRegistration' | 'verifyRegistration'>;
	publishMainStream?: ApiMainStreamPublisher;
};

async function assertTwoFactorAuthenticatedForApi(
	deps: ApiI2faDependencies,
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

function incorrectPasswordError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'Incorrect password.', code: 'INCORRECT_PASSWORD', id });
}

async function assertPasswordMatchedForApi(profile: MiUserProfile, password: string, errorId: string): Promise<void> {
	const passwordMatched = await comparePassword(password, profile.password ?? '');
	if (!passwordMatched) throw incorrectPasswordError(errorId);
}

async function publishMeUpdatedForApi(deps: ApiI2faDependencies, me: MiLocalUser): Promise<void> {
	deps.publishMainStream?.(me.id, 'meUpdated', await packMeDetailedForApi(deps, me, { includeSecrets: true }));
}

export const i2faRegisterParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

export async function handleApiI2faRegister(
	deps: ApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ qr: string; url: string; secret: string; label: string; issuer: string }> {
	const params = parseApiParams(i2faRegisterParamDef, body);

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticatedForApi(deps, profile, params.token);
	await assertPasswordMatchedForApi(profile, params.password, '78d6c839-20c9-4c66-b90a-fc0542168b48');

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

export async function handleApiI2faDone(
	deps: ApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ backupCodes: string[] }> {
	const params = parseApiParams(i2faDoneParamDef, body);
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

	await publishMeUpdatedForApi(deps, me);

	return { backupCodes };
}

export const i2faRegisterKeyParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

function userNotFoundError(): ApiError {
	return new ApiError({
		status: 400,
		message: 'User not found.',
		code: 'USER_NOT_FOUND',
		id: '652f899f-66d4-490e-993e-6606c8ec04c3',
	});
}

function twoFactorNotEnabledError(id: string): ApiError {
	return new ApiError({ status: 400, message: '2fa not enabled.', code: 'TWO_FACTOR_NOT_ENABLED', id });
}

export async function handleApiI2faRegisterKey(
	deps: ApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<unknown> {
	const params = parseApiParams(i2faRegisterKeyParamDef, body);

	const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, me.id);
	if (profile == null) throw userNotFoundError();

	await assertTwoFactorAuthenticatedForApi(deps, profile, params.token);
	await assertPasswordMatchedForApi(profile, params.password, '38769596-efe2-4faf-9bec-abbb3f2cd9ba');

	if (!profile.twoFactorEnabled) throw twoFactorNotEnabledError('bf32b864-449b-47b8-974e-f9a5468546f1');

	return await deps.webAuthnService.initiateRegistration(me.id, me.username, me.name ?? undefined);
}

export const i2faKeyDoneParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
	name: z.string().min(1).max(30),
	credential: z.record(z.string(), z.unknown()),
});

export async function handleApiI2faKeyDone(
	deps: ApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<{ id: string; name: string }> {
	const params = parseApiParams(i2faKeyDoneParamDef, body);

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticatedForApi(deps, profile, params.token);
	await assertPasswordMatchedForApi(profile, params.password, '0d7ec6d2-e652-443e-a7bf-9ee9a0cd77b0');

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

	await publishMeUpdatedForApi(deps, me);

	return {
		id: keyId,
		name: params.name,
	};
}

export const i2faUpdateKeyParamDef = z.object({
	name: z.string().min(1).max(30),
	credentialId: z.string(),
});

export async function handleApiI2faUpdateKey(
	deps: ApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, never>> {
	const params = parseApiParams(i2faUpdateKeyParamDef, body);

	const key = await fetchUserSecurityKeyByIdFromDatabase(deps.db, params.credentialId);
	if (key == null) {
		throw new ApiError({
			status: 400,
			message: 'No such key.',
			code: 'NO_SUCH_KEY',
			id: 'f9c5467f-d492-4d3c-9a8g-a70dacc86512',
		});
	}
	if (key.userId !== me.id) {
		throw new ApiError({
			status: 400,
			message: 'You do not have edit privilege of this key.',
			code: 'ACCESS_DENIED',
			id: '1fb7cb09-d46a-4fff-b8df-057708cce513',
		});
	}

	await updateUserSecurityKeyNameByIdInDatabase(deps.db, key.id, params.name);

	await publishMeUpdatedForApi(deps, me);

	return {};
}

export const i2faRemoveKeyParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
	credentialId: z.string(),
});

export async function handleApiI2faRemoveKey(
	deps: ApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<Record<string, never>> {
	const params = parseApiParams(i2faRemoveKeyParamDef, body);

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticatedForApi(deps, profile, params.token);
	await assertPasswordMatchedForApi(profile, params.password, '141c598d-a825-44c8-9173-cfb9d92be493');

	await deleteUserSecurityKeyByIdAndUserIdFromDatabase(deps.db, params.credentialId, me.id);

	const keyCount = await countUserSecurityKeysByUserIdFromDatabase(deps.db, me.id);
	if (keyCount === 0) {
		await updateUserProfileInDatabase(deps.db, me.id, {
			usePasswordLessLogin: false,
		});
	}

	await publishMeUpdatedForApi(deps, me);

	return {};
}

export const i2faUnregisterParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

export async function handleApiI2faUnregister(
	deps: ApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(i2faUnregisterParamDef, body);

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticatedForApi(deps, profile, params.token);
	await assertPasswordMatchedForApi(profile, params.password, '7add0395-9901-4098-82f9-4f67af65f775');

	await updateUserProfileInDatabase(deps.db, me.id, {
		twoFactorSecret: null,
		twoFactorBackupSecret: null,
		twoFactorEnabled: false,
		usePasswordLessLogin: false,
	});

	await publishMeUpdatedForApi(deps, me);
}

export const i2faPasswordLessParamDef = z.object({
	value: z.boolean(),
});

export async function handleApiI2faPasswordLess(
	deps: ApiI2faDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(i2faPasswordLessParamDef, body);

	if (params.value === true) {
		const keyCount = await countUserSecurityKeysByUserIdFromDatabase(deps.db, me.id);
		if (keyCount === 0) {
			await updateUserProfileInDatabase(deps.db, me.id, {
				usePasswordLessLogin: false,
			});
			throw new ApiError({
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

	await publishMeUpdatedForApi(deps, me);
}
