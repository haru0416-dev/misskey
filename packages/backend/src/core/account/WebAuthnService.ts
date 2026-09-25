/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import type { AttestationFormat } from '@simplewebauthn/server/helpers';
import type { MiMeta, MiUser } from '@/models/_.js';
import type { Config } from '@/config.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import {
	fetchUserSecurityKeyByIdAndUserIdFromDatabase,
	fetchUserSecurityKeyByIdFromDatabase,
	listUserSecurityKeysByUserIdFromDatabase,
	recordUserSecurityKeyUsageByIdAndUserIdInDatabase,
	recordUserSecurityKeyUsageByIdInDatabase,
	updateUserSecurityKeyPublicKeyByIdAndUserIdInDatabase,
} from '@/core/account/UserSecurityKeyStore.js';
import type {
	AuthenticationResponseJSON,
	AuthenticatorTransportFuture,
	CredentialDeviceType,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from '@simplewebauthn/server';

/*
 * @simplewebauthn/server は読み込むだけで RSS が 8MB 増える (2026-09-03 実測) が、
 * 使うのはパスキーの登録・認証時だけなので、最初の要求まで読み込まない。
 */
const loadWebAuthn = () => import('@simplewebauthn/server');
const loadWebAuthnHelpers = () => import('@simplewebauthn/server/helpers');

/**
 * challenge はフローごとに別のキーへ置く。同じキーを共有すると、あるフローで発行した challenge を
 * 別のフローの検証で消費・流用できてしまう (パスキーの context はクライアントが送ってくる値)。
 */
function challengeKey(flow: 'registration' | 'authentication' | 'passkey', id: string): string {
	return `webauthn:challenge:${flow}:${id}`;
}

export function createWebAuthnService(config: Config, meta: MiMeta, redisClient: Redis.Redis, db: MiDrizzleDatabase) {
	function getRelyingParty(): { origin: string; rpId: string; rpName: string; rpIcon?: string } {
		return {
			origin: config.instance.url,
			rpId: config.runtime.hostname,
			rpName: meta.name ?? config.runtime.host,
			...(meta.iconUrl == null ? {} : { rpIcon: meta.iconUrl }),
		};
	}

	// 失敗の報告形式はパスキーログインと二要素認証で異なるため、例外への変換は呼び出し側が決める。
	async function verifyAuthenticationResponseWithKey(
		response: AuthenticationResponseJSON,
		challenge: string,
		key: { id: string; publicKey: string; counter: number; transports: string[] | null },
		toError: (error: unknown) => IdentifiableError,
	) {
		const relyingParty = getRelyingParty();

		try {
			return await (
				await loadWebAuthn()
			).verifyAuthenticationResponse({
				response,
				expectedChallenge: challenge,
				expectedOrigin: relyingParty.origin,
				expectedRPID: relyingParty.rpId,
				credential: {
					id: key.id,
					publicKey: Buffer.from(key.publicKey, 'base64url'),
					counter: key.counter,
					...(key.transports ? { transports: key.transports as AuthenticatorTransportFuture[] } : {}),
				},
				requireUserVerification: true,
			});
		} catch (error) {
			throw toError(error);
		}
	}

	async function initiateRegistration(
		userId: MiUser['id'],
		userName: string,
		userDisplayName?: string,
	): Promise<PublicKeyCredentialCreationOptionsJSON> {
		const relyingParty = getRelyingParty();
		const keys = await listUserSecurityKeysByUserIdFromDatabase(db, userId);

		const registrationOptions = await (
			await loadWebAuthn()
		).generateRegistrationOptions({
			rpName: relyingParty.rpName,
			rpID: relyingParty.rpId,
			userID: (await loadWebAuthnHelpers()).isoUint8Array.fromUTF8String(userId),
			userName,
			...(userDisplayName === undefined ? {} : { userDisplayName }),
			excludeCredentials: keys.map(
				(key) =>
					({
						id: key.id,
						...(key.transports == null ? {} : { transports: key.transports }),
					}) as { id: string; transports?: AuthenticatorTransportFuture[] },
			),
			authenticatorSelection: {
				residentKey: 'required',
				userVerification: 'preferred',
			},
		});

		await redisClient.setex(challengeKey('registration', userId), 90, registrationOptions.challenge);

		return registrationOptions;
	}

	async function verifyRegistration(
		userId: MiUser['id'],
		response: RegistrationResponseJSON,
	): Promise<{
		credentialID: string;
		credentialPublicKey: Uint8Array;
		attestationObject: Uint8Array;
		fmt: AttestationFormat;
		counter: number;
		userVerified: boolean;
		credentialDeviceType: CredentialDeviceType;
		credentialBackedUp: boolean;
		transports?: AuthenticatorTransportFuture[];
	}> {
		const challenge = await redisClient.getdel(challengeKey('registration', userId));

		if (!challenge) {
			throw new IdentifiableError('7dbfb66c-9216-4e2b-9c27-cef2ac8efb84', 'challenge not found');
		}

		const relyingParty = getRelyingParty();

		let verification;
		try {
			verification = await (
				await loadWebAuthn()
			).verifyRegistrationResponse({
				response,
				expectedChallenge: challenge,
				expectedOrigin: relyingParty.origin,
				expectedRPID: relyingParty.rpId,
				requireUserVerification: true,
			});
		} catch (error) {
			console.error(error);
			throw new IdentifiableError('5c1446f8-8ca7-4d31-9f39-656afe9c5d87', 'verification failed');
		}

		const { verified } = verification;

		if (!verified || !verification.registrationInfo) {
			throw new IdentifiableError('bb333667-3832-4a80-8bb5-c505be7d710d', 'verification failed');
		}

		const { registrationInfo } = verification;

		return {
			credentialID: registrationInfo.credential.id,
			credentialPublicKey: registrationInfo.credential.publicKey,
			attestationObject: registrationInfo.attestationObject,
			fmt: registrationInfo.fmt,
			counter: registrationInfo.credential.counter,
			userVerified: registrationInfo.userVerified,
			credentialDeviceType: registrationInfo.credentialDeviceType,
			credentialBackedUp: registrationInfo.credentialBackedUp,
			...(response.response.transports === undefined ? {} : { transports: response.response.transports }),
		};
	}

	async function initiateAuthentication(userId: MiUser['id']): Promise<PublicKeyCredentialRequestOptionsJSON> {
		const relyingParty = getRelyingParty();
		const keys = await listUserSecurityKeysByUserIdFromDatabase(db, userId);

		if (keys.length === 0) {
			throw new IdentifiableError('f27fd449-9af4-4841-9249-1f989b9fa4a4', 'no keys found');
		}

		const authenticationOptions = await (
			await loadWebAuthn()
		).generateAuthenticationOptions({
			rpID: relyingParty.rpId,
			allowCredentials: keys.map(
				(key) =>
					({
						id: key.id,
						transports: key.transports ?? undefined,
					}) as { id: string; transports?: AuthenticatorTransportFuture[] },
			),
			userVerification: 'preferred',
		});

		await redisClient.setex(challengeKey('authentication', userId), 90, authenticationOptions.challenge);

		return authenticationOptions;
	}

	async function initiateSignInWithPasskeyAuthentication(
		context: string,
	): Promise<PublicKeyCredentialRequestOptionsJSON> {
		const relyingParty = getRelyingParty();

		const authenticationOptions = await (
			await loadWebAuthn()
		).generateAuthenticationOptions({
			rpID: relyingParty.rpId,
			userVerification: 'preferred',
		});

		await redisClient.setex(challengeKey('passkey', context), 90, authenticationOptions.challenge);

		return authenticationOptions;
	}

	/**
	 * @throws IdentifiableError
	 * @returns 認証成功時はユーザーID、検証不成立時はnull。
	 */
	async function verifySignInWithPasskeyAuthentication(
		context: string,
		response: AuthenticationResponseJSON,
	): Promise<MiUser['id'] | null> {
		const challenge = await redisClient.getdel(challengeKey('passkey', context));

		if (!challenge) {
			throw new IdentifiableError('2d16e51c-007b-4edd-afd2-f7dd02c947f6', `challenge '${context}' not found`);
		}

		const key = await fetchUserSecurityKeyByIdFromDatabase(db, response.id);

		if (!key) {
			throw new IdentifiableError('36b96a7d-b547-412d-aeed-2d611cdc8cdc', 'Unknown Webauthn key');
		}

		const verification = await verifyAuthenticationResponseWithKey(
			response,
			challenge,
			key,
			(error) => new IdentifiableError('b18c89a7-5b5e-4cec-bb5b-0419f332d430', `verification failed: ${error}`),
		);

		const { verified, authenticationInfo } = verification;

		if (!verified) {
			return null;
		}

		await recordUserSecurityKeyUsageByIdInDatabase(db, response.id, {
			lastUsed: new Date(),
			counter: authenticationInfo.newCounter,
			credentialDeviceType: authenticationInfo.credentialDeviceType,
			credentialBackedUp: authenticationInfo.credentialBackedUp,
		});

		return key.userId;
	}

	async function verifyAuthentication(userId: MiUser['id'], response: AuthenticationResponseJSON): Promise<boolean> {
		const challenge = await redisClient.getdel(challengeKey('authentication', userId));

		if (!challenge) {
			throw new IdentifiableError('2d16e51c-007b-4edd-afd2-f7dd02c947f6', 'challenge not found');
		}

		const key = await fetchUserSecurityKeyByIdAndUserIdFromDatabase(db, response.id, userId);

		if (!key) {
			throw new IdentifiableError('36b96a7d-b547-412d-aeed-2d611cdc8cdc', 'unknown key');
		}

		// counterが0で87文字の公開鍵は、非圧縮EC公開鍵としてCOSE形式へ正規化する。
		if (key.counter === 0 && key.publicKey.length === 87) {
			const cert = new Uint8Array(Buffer.from(key.publicKey, 'base64url'));
			if (cert[0] === 0x04) {
				// 0x04は非圧縮EC公開鍵のプレフィックス。
				const halfLength = (cert.length - 1) / 2;

				const cborMap = new Map<number, number | Uint8Array>();
				cborMap.set(1, 2); // kty, EC2
				cborMap.set(3, -7); // alg, ES256
				cborMap.set(-1, 1); // crv, P256
				cborMap.set(-2, cert.slice(1, halfLength + 1)); // x
				cborMap.set(-3, cert.slice(halfLength + 1)); // y

				const cborPubKey = Buffer.from((await loadWebAuthnHelpers()).isoCBOR.encode(cborMap)).toString('base64url');
				await updateUserSecurityKeyPublicKeyByIdAndUserIdInDatabase(db, response.id, userId, cborPubKey);
				key.publicKey = cborPubKey;
			}
		}

		const verification = await verifyAuthenticationResponseWithKey(response, challenge, key, (error) => {
			console.error(error);
			return new IdentifiableError('b18c89a7-5b5e-4cec-bb5b-0419f332d430', 'verification failed');
		});

		const { verified, authenticationInfo } = verification;

		if (!verified) {
			return false;
		}

		await recordUserSecurityKeyUsageByIdAndUserIdInDatabase(db, response.id, userId, {
			lastUsed: new Date(),
			counter: authenticationInfo.newCounter,
			credentialDeviceType: authenticationInfo.credentialDeviceType,
			credentialBackedUp: authenticationInfo.credentialBackedUp,
		});

		return verified;
	}

	return {
		getRelyingParty,
		initiateRegistration,
		verifyRegistration,
		initiateAuthentication,
		initiateSignInWithPasskeyAuthentication,
		verifySignInWithPasskeyAuthentication,
		verifyAuthentication,
	};
}

export type WebAuthnService = ReturnType<typeof createWebAuthnService>;
