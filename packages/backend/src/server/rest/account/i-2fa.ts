/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { endpointMetas as iContracts } from '@/server/rest/contracts/i.js';
import type { ContractErrors } from '../endpoint-contract.js';
import type { Params } from '../validation.js';
import { comparePassword } from '@/misc/password.js';
import * as OTPAuth from 'otpauth';
import { z } from 'zod';
import type { RegistrationResponseJSON } from '@simplewebauthn/server';
import {
	countUserSecurityKeysByUserIdFromDatabase,
	createUserSecurityKeyInDatabase,
	deleteUserSecurityKeyByIdAndUserIdFromDatabase,
	fetchUserSecurityKeyByIdFromDatabase,
	updateUserSecurityKeyNameByIdInDatabase,
} from '@/core/account/user-security-key-store.js';
import {
	fetchUserProfileByUserIdFromDatabase,
	fetchUserProfileByUserIdOrFailFromDatabase,
	updateUserProfileInDatabase,
} from '@/core/user/user-profile-store.js';
import type { UserAuthService } from '@/core/account/user-auth-service.js';
import type { WebAuthnService } from '@/core/account/webauthn-service.js';
import type { MiLocalUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';
import { ApiError } from '../error.js';
import type { MainStreamPublisher } from '../../../core/events.js';
import { packMeDetailed } from '../user/user.js';
import type { UserPackingDependencies } from '../../../core/user/user-packing.js';
import { parseApiParams } from '../validation.js';

export type I2faDependencies = UserPackingDependencies & {
	userAuthService: Pick<UserAuthService, 'twoFactorAuthenticate' | 'validateOtp'>;
	webAuthnService: Pick<WebAuthnService, 'initiateRegistration' | 'verifyRegistration'>;
	publishMainStream?: MainStreamPublisher;
};

// 2FA のコード誤りは利用者の入力ミスなので、契約で宣言した 400 のエラーとして返す (生の Error は 500 になる)。
function twoFactorAuthenticationFailedError(id: string): ApiError {
	return new ApiError({
		status: 400,
		message: 'Two-factor authentication failed.',
		code: 'TWO_FACTOR_AUTHENTICATION_FAILED',
		id,
	});
}

async function assertTwoFactorAuthenticated(
	deps: I2faDependencies,
	profile: MiUserProfile,
	token: string | null | undefined,
	errorId: string,
): Promise<void> {
	if (!profile.twoFactorEnabled) {
		return;
	}
	if (token == null) {
		throw twoFactorAuthenticationFailedError(errorId);
	}

	try {
		await deps.userAuthService.twoFactorAuthenticate(profile, token);
	} catch {
		throw twoFactorAuthenticationFailedError(errorId);
	}
}

function incorrectPasswordError(id: string): ApiError {
	return new ApiError({ status: 400, message: 'Incorrect password.', code: 'INCORRECT_PASSWORD', id });
}

async function assertPasswordMatched(profile: MiUserProfile, password: string, errorId: string): Promise<void> {
	const passwordMatched = await comparePassword(password, profile.password ?? '');
	if (!passwordMatched) {
		throw incorrectPasswordError(errorId);
	}
}

async function publishMeUpdated(deps: I2faDependencies, me: MiLocalUser): Promise<void> {
	deps.publishMainStream?.(me.id, 'meUpdated', await packMeDetailed(deps, me, { includeSecrets: true }));
}

export const i2faRegisterParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

export async function handleApiI2faRegister(
	deps: I2faDependencies,
	me: MiLocalUser,
	params: Params<typeof i2faRegisterParamDef>,
): Promise<{ url: string; secret: string; label: string; issuer: string }> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticated(deps, profile, params.token, 'cba2a877-23c6-4765-a4b9-882096bf04a8');
	await assertPasswordMatched(profile, params.password, '78d6c839-20c9-4c66-b90a-fc0542168b48');

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
	// QR はクライアントが url から描く (サーバー側で画像を作らない)。
	return {
		url: totp.toString(),
		secret: secret.base32,
		label: me.username,
		issuer: deps.config.runtime.host,
	};
}

export const i2faDoneParamDef = z.object({
	token: z.string(),
});

export async function handleApiI2faDone(
	deps: I2faDependencies,
	me: MiLocalUser,
	params: Params<typeof i2faDoneParamDef>,
): Promise<{ backupCodes: string[] }> {
	const token = params.token.replaceAll(/\s/g, '');

	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);

	if (profile.twoFactorTempSecret == null) {
		throw new ApiError({
			status: 400,
			message: 'Two-factor authentication setup has not been started.',
			code: 'TWO_FACTOR_NOT_STARTED',
			id: '43f195f1-ac52-4429-821b-781d3323cc28',
		});
	}

	if (!(await deps.userAuthService.validateOtp(profile.userId, profile.twoFactorTempSecret, token))) {
		throw twoFactorAuthenticationFailedError('f00afb51-beeb-4ca5-84df-10c3e7ded193');
	}

	const backupCodes = Array.from({ length: 5 }, () => new OTPAuth.Secret().base32);

	await updateUserProfileInDatabase(deps.db, me.id, {
		twoFactorSecret: profile.twoFactorTempSecret,
		twoFactorBackupSecret: backupCodes,
		twoFactorEnabled: true,
	});

	await publishMeUpdated(deps, me);

	return { backupCodes };
}

export const i2faRegisterKeyParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

function twoFactorNotEnabledError(id: string): ApiError {
	return new ApiError({ status: 400, message: '2fa not enabled.', code: 'TWO_FACTOR_NOT_ENABLED', id });
}

export async function handleApiI2faRegisterKey(
	deps: I2faDependencies,
	me: MiLocalUser,
	params: Params<typeof i2faRegisterKeyParamDef>,
	errors: ContractErrors<(typeof iContracts)['i/2fa/register-key']>,
): Promise<unknown> {
	const profile = await fetchUserProfileByUserIdFromDatabase(deps.db, me.id);
	if (profile == null) {
		throw errors.userNotFound();
	}

	await assertTwoFactorAuthenticated(deps, profile, params.token, 'a01913f6-a955-4aad-85b8-3aea188e6f3c');
	await assertPasswordMatched(profile, params.password, '38769596-efe2-4faf-9bec-abbb3f2cd9ba');

	if (!profile.twoFactorEnabled) {
		throw twoFactorNotEnabledError('bf32b864-449b-47b8-974e-f9a5468546f1');
	}

	return await deps.webAuthnService.initiateRegistration(me.id, me.username, me.name ?? undefined);
}

export const i2faKeyDoneParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
	name: z.string().min(1).max(30),
	credential: z.record(z.string(), z.unknown()),
});

export async function handleApiI2faKeyDone(
	deps: I2faDependencies,
	me: MiLocalUser,
	params: Params<typeof i2faKeyDoneParamDef>,
): Promise<{ id: string; name: string }> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticated(deps, profile, params.token, 'a8c70e54-9aab-4b79-a245-8c80c80a79d0');
	await assertPasswordMatched(profile, params.password, '0d7ec6d2-e652-443e-a7bf-9ee9a0cd77b0');

	if (!profile.twoFactorEnabled) {
		throw twoFactorNotEnabledError('798d6847-b1ed-4f9c-b1f9-163c42655995');
	}

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

	await publishMeUpdated(deps, me);

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
	deps: I2faDependencies,
	me: MiLocalUser,
	params: Params<typeof i2faUpdateKeyParamDef>,
): Promise<Record<string, never>> {
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

	await publishMeUpdated(deps, me);

	return {};
}

export const i2faRemoveKeyParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
	credentialId: z.string(),
});

export async function handleApiI2faRemoveKey(
	deps: I2faDependencies,
	me: MiLocalUser,
	params: Params<typeof i2faRemoveKeyParamDef>,
): Promise<Record<string, never>> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticated(deps, profile, params.token, '030b29ed-d22d-421e-83fb-abe5bb1ae7ec');
	await assertPasswordMatched(profile, params.password, '141c598d-a825-44c8-9173-cfb9d92be493');

	await deleteUserSecurityKeyByIdAndUserIdFromDatabase(deps.db, params.credentialId, me.id);

	const keyCount = await countUserSecurityKeysByUserIdFromDatabase(deps.db, me.id);
	if (keyCount === 0) {
		await updateUserProfileInDatabase(deps.db, me.id, {
			usePasswordLessLogin: false,
		});
	}

	await publishMeUpdated(deps, me);

	return {};
}

export const i2faUnregisterParamDef = z.object({
	password: z.string(),
	token: z.string().nullable().optional(),
});

export async function handleApiI2faUnregister(
	deps: I2faDependencies,
	me: MiLocalUser,
	params: Params<typeof i2faUnregisterParamDef>,
): Promise<void> {
	const profile = await fetchUserProfileByUserIdOrFailFromDatabase(deps.db, me.id);
	await assertTwoFactorAuthenticated(deps, profile, params.token, '80545d28-42fb-4594-bc46-a4ac365bd726');
	await assertPasswordMatched(profile, params.password, '7add0395-9901-4098-82f9-4f67af65f775');

	await updateUserProfileInDatabase(deps.db, me.id, {
		twoFactorSecret: null,
		twoFactorBackupSecret: null,
		twoFactorEnabled: false,
		usePasswordLessLogin: false,
	});

	await publishMeUpdated(deps, me);
}

export const i2faPasswordLessParamDef = z.object({
	value: z.boolean(),
});

export async function handleApiI2faPasswordLess(
	deps: I2faDependencies,
	me: MiLocalUser,
	params: Params<typeof i2faPasswordLessParamDef>,
): Promise<void> {
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

	await publishMeUpdated(deps, me);
}
