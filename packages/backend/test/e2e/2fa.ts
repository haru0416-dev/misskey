/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */


import * as assert from 'assert';
import * as crypto from 'node:crypto';
import { encode as encodeToCbor } from 'cbor2';
import * as OTPAuth from 'otpauth';
import {
	fixtureConfig,
	openTestDatabase,
	type TestDatabase,
	updateUserInDatabase,
	updateUserProfileInDatabase,
} from '../fixtures.js';
import { api, castAsError, signup, sendEnvUpdateRequest } from '../utils.js';
import type {
	AuthenticationResponseJSON,
	AuthenticatorAssertionResponseJSON,
	AuthenticatorAttestationResponseJSON,
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
	RegistrationResponseJSON,
} from '@simplewebauthn/server';
import type * as misskey from 'misskey-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
/*
 * アサーションは vitest の expect に寄せているが、判別可能ユニオンの分岐を確定させる箇所だけ
 * node:assert を使う。expect の matcher は `asserts` 述語を持たないため、判別子を検査しても
 * 後続のプロパティアクセスが型エラーになる。
 */

describe('2要素認証', () => {
	let alice: misskey.entities.SignupResponse;
	let database: TestDatabase;

	const config = fixtureConfig;
	const password = 'test';
	const username = 'alice';

	// https://datatracker.ietf.org/doc/html/rfc8152
	// 各値の定義は上記規格に基づく。鍵ペアは適当に生成したやつ
	const coseKtyEc2 = 2;
	const coseKid = 'meriadoc.brandybuck@buckland.example';
	const coseAlgEs256 = -7;
	const coseEc2CrvP256 = 1;
	const coseEc2X = '4932eaacc657565705e4287e7870ce3aad55545d99d35a98a472dc52880cfc8f';
	const coseEc2Y = '5ca68303bf2c0433473e3d5cb8586bc2c8c43a4945a496fce8dbeda8b23ab0b1';

	// この秘密鍵はテストデータとしてのみ使用する。
	const pemToSign =
		'-----BEGIN EC PRIVATE KEY-----\n' +
		'MHcCAQEEIHqe/keuXyolbXzgLOu+YFJjDBGWVgXc3QCXfyqwDPf2oAoGCCqGSM49\n' +
		'AwEHoUQDQgAESTLqrMZXVlcF5Ch+eHDOOq1VVF2Z01qYpHLcUogM/I9cpoMDvywE\n' +
		'M0c+PVy4WGvCyMQ6SUWklvzo2+2osjqwsQ==\n' +
		'-----END EC PRIVATE KEY-----\n';

	const otpToken = (secret: string): string => {
		return OTPAuth.TOTP.generate({
			secret: OTPAuth.Secret.fromBase32(secret),
			digits: 6,
		});
	};

	const enableTotp = async (user: misskey.entities.SignupResponse): Promise<string> => {
		const registerResponse = await api(
			'i/2fa/register',
			{
				password,
			},
			user,
		);
		expect(registerResponse.status).toBe(200);

		const doneResponse = await api(
			'i/2fa/done',
			{
				token: otpToken(registerResponse.body.secret),
			},
			user,
		);
		expect(doneResponse.status).toBe(200);

		return registerResponse.body.secret;
	};

	const invalidOtpToken = (secret: string): string => {
		return otpToken(secret) === '000000' ? '000001' : '000000';
	};

	const rpIdHash = (): Buffer => {
		return crypto.createHash('sha256').update(Buffer.from(config.runtime.host, 'utf-8')).digest();
	};

	const keyDoneParam = (param: {
		token: string;
		keyName: string;
		credentialId: Uint8Array;
		creationOptions: PublicKeyCredentialCreationOptionsJSON;
	}): {
		token: string;
		password: string;
		name: string;
		credential: RegistrationResponseJSON;
	} => {
		// COSE 形式でエンコードした公開鍵
		const credentialPublicKey = encodeToCbor(
			new Map<number, unknown>([
				[-1, coseEc2CrvP256],
				[-2, Uint8Array.from(Buffer.from(coseEc2X, 'hex'))],
				[-3, Uint8Array.from(Buffer.from(coseEc2Y, 'hex'))],
				[1, coseKtyEc2],
				[2, coseKid],
				[3, coseAlgEs256],
			]),
		);

		// AuthenticatorAssertionResponse.authenticatorData
		// https://developer.mozilla.org/en-US/docs/Web/API/AuthenticatorAssertionResponse/authenticatorData
		const credentialIdLength = Buffer.allocUnsafe(2);
		credentialIdLength.writeUInt16BE(param.credentialId.length, 0);
		const authData = Buffer.concat([
			rpIdHash(), // rpIdHash(32)
			new Uint8Array([0x45]), // flags(1)
			new Uint8Array(4), // signCount(4)
			new Uint8Array(16), // AAGUID(16)
			credentialIdLength,
			param.credentialId,
			credentialPublicKey,
		]);

		const credentialIdBase64url = Buffer.from(param.credentialId).toString('base64url');

		return {
			password,
			token: param.token,
			name: param.keyName,
			credential: <RegistrationResponseJSON>{
				id: credentialIdBase64url,
				rawId: credentialIdBase64url,
				response: <AuthenticatorAttestationResponseJSON>{
					clientDataJSON: Buffer.from(
						JSON.stringify({
							type: 'webauthn.create',
							challenge: param.creationOptions.challenge,
							origin: config.instance.url,
							androidPackageName: 'org.mozilla.firefox',
						}),
						'utf-8',
					).toString('base64url'),
					attestationObject: Buffer.from(
						encodeToCbor({
							fmt: 'none',
							attStmt: {},
							authData: new Uint8Array(authData),
						}),
					).toString('base64url'),
				},
				clientExtensionResults: {},
				type: 'public-key',
			},
		};
	};

	const signinParam = (): {
		username: string;
		password: string;
		'g-recaptcha-response'?: string | null;
		'hcaptcha-response'?: string | null;
	} => {
		return {
			username,
			password,
			'g-recaptcha-response': null,
			'hcaptcha-response': null,
		};
	};

	const signinWithSecurityKeyParam = (param: {
		keyName: string;
		credentialId: Buffer;
		requestOptions: PublicKeyCredentialRequestOptionsJSON;
		signCount?: number;
	}): misskey.entities.SigninFlowRequest => {
		// AuthenticatorAssertionResponse.authenticatorData
		// https://developer.mozilla.org/en-US/docs/Web/API/AuthenticatorAssertionResponse/authenticatorData
		const signCount = Buffer.alloc(4);
		signCount.writeUInt32BE(param.signCount ?? 1);
		const authenticatorData = Buffer.concat([
			rpIdHash(),
			Buffer.from([0x05]), // flags(1)
			signCount,
		]);
		const clientDataJSONBuffer = Buffer.from(
			JSON.stringify({
				type: 'webauthn.get',
				challenge: param.requestOptions.challenge,
				origin: config.instance.url,
				androidPackageName: 'org.mozilla.firefox',
			}),
			'utf-8',
		);
		const hashedclientDataJSON = crypto.createHash('sha256').update(clientDataJSONBuffer).digest();
		const privateKey = crypto.createPrivateKey(pemToSign);
		const signature = crypto
			.createSign('SHA256')
			.update(Buffer.concat([authenticatorData, hashedclientDataJSON]))
			.sign(privateKey);
		return {
			username,
			password,
			credential: <AuthenticationResponseJSON>{
				id: param.credentialId.toString('base64url'),
				rawId: param.credentialId.toString('base64url'),
				response: <AuthenticatorAssertionResponseJSON>{
					clientDataJSON: clientDataJSONBuffer.toString('base64url'),
					authenticatorData: authenticatorData.toString('base64url'),
					signature: signature.toString('base64url'),
				},
				clientExtensionResults: {},
				type: 'public-key',
			},
			'g-recaptcha-response': null,
			'hcaptcha-response': null,
		};
	};

	beforeAll(
		async () => {
			database = openTestDatabase();
			alice = await signup({ username, password });
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await database.close();
	});

	beforeEach(async () => {
		await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
	});

	afterEach(async () => {
		await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
	});

	test('が設定でき、OTPでログインできる。', async () => {
		const registerResponse = await api(
			'i/2fa/register',
			{
				password,
			},
			alice,
		);
		expect(registerResponse.status).toBe(200);
		expect(registerResponse.body.qr).toEqual(expect.anything());
		expect(registerResponse.body.url).toEqual(expect.anything());
		expect(registerResponse.body.secret).toEqual(expect.anything());
		expect(registerResponse.body.label).toBe(username);
		expect(registerResponse.body.issuer).toBe(config.runtime.host);

		const doneResponse = await api(
			'i/2fa/done',
			{
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
		expect(doneResponse.status).toBe(200);

		const signinWithoutTokenResponse = await api('signin-flow', {
			...signinParam(),
		});
		expect(signinWithoutTokenResponse.status).toBe(200);
		expect(signinWithoutTokenResponse.body).toStrictEqual({
			finished: false,
			next: 'totp',
		});

		const signinResponse = await api('signin-flow', {
			...signinParam(),
			token: otpToken(registerResponse.body.secret),
		});
		expect(signinResponse.status).toBe(200);
		assert.strictEqual(signinResponse.body.finished, true);
		expect(signinResponse.body.i).toEqual(expect.anything());

		// 後片付け
		await api(
			'i/2fa/unregister',
			{
				password,
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
	});

	test('が設定でき、セキュリティキーでログインできる。', async () => {
		const registerResponse = await api(
			'i/2fa/register',
			{
				password,
			},
			alice,
		);
		expect(registerResponse.status).toBe(200);

		const doneResponse = await api(
			'i/2fa/done',
			{
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
		expect(doneResponse.status).toBe(200);

		const registerKeyResponse = await api(
			'i/2fa/register-key',
			{
				password,
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
		expect(registerKeyResponse.status).toBe(200);
		expect(registerKeyResponse.body.rp).toEqual(expect.anything());
		expect(registerKeyResponse.body.challenge).toEqual(expect.anything());

		const keyName = 'example-key';
		const credentialId = crypto.randomBytes(0x41);
		const keyDoneResponse = await api(
			'i/2fa/key-done',
			keyDoneParam({
				token: otpToken(registerResponse.body.secret),
				keyName,
				credentialId,
				creationOptions: registerKeyResponse.body,
			} as any) as any,
			alice,
		);
		expect(keyDoneResponse.status).toBe(200);
		expect(keyDoneResponse.body.id).toBe(credentialId.toString('base64url'));
		expect(keyDoneResponse.body.name).toBe(keyName);

		const signinResponse = await api('signin-flow', {
			...signinParam(),
		});
		expect(signinResponse.status).toBe(200);
		assert.strictEqual(signinResponse.body.finished, false);
		assert.strictEqual(signinResponse.body.next, 'passkey');
		expect(signinResponse.body.authRequest.challenge).toEqual(expect.anything());
		expect(signinResponse.body.authRequest.allowCredentials).toEqual(expect.anything());
		expect(
			signinResponse.body.authRequest.allowCredentials && signinResponse.body.authRequest.allowCredentials[0]?.id,
		).toBe(credentialId.toString('base64url'));

		const signinResponse2 = await api(
			'signin-flow',
			signinWithSecurityKeyParam({
				keyName,
				credentialId,
				requestOptions: signinResponse.body.authRequest,
			}),
		);
		expect(signinResponse2.status).toBe(200);
		assert.strictEqual(signinResponse2.body.finished, true);
		expect(signinResponse2.body.i).toEqual(expect.anything());

		// 後片付け
		await api(
			'i/2fa/unregister',
			{
				password,
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
	});

	test('が設定でき、セキュリティキーでパスワードレスログインできる。', async () => {
		const registerResponse = await api(
			'i/2fa/register',
			{
				password,
			},
			alice,
		);
		expect(registerResponse.status).toBe(200);

		const doneResponse = await api(
			'i/2fa/done',
			{
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
		expect(doneResponse.status).toBe(200);

		const registerKeyResponse = await api(
			'i/2fa/register-key',
			{
				token: otpToken(registerResponse.body.secret),
				password,
			},
			alice,
		);
		expect(registerKeyResponse.status).toBe(200);

		const keyName = 'example-key';
		const credentialId = crypto.randomBytes(0x41);
		const keyDoneResponse = await api(
			'i/2fa/key-done',
			keyDoneParam({
				token: otpToken(registerResponse.body.secret),
				keyName,
				credentialId,
				creationOptions: registerKeyResponse.body,
			} as any) as any,
			alice,
		);
		expect(keyDoneResponse.status).toBe(200);

		const passwordLessResponse = await api(
			'i/2fa/password-less',
			{
				value: true,
			},
			alice,
		);
		expect(passwordLessResponse.status).toBe(204);

		const iResponse = await api('i', {}, alice);
		expect(iResponse.status).toBe(200);
		expect(iResponse.body.usePasswordLessLogin).toBe(true);

		const signinResponse = await api('signin-flow', {
			...signinParam(),
			password: '',
		});
		expect(signinResponse.status).toBe(200);
		assert.strictEqual(signinResponse.body.finished, false);
		assert.strictEqual(signinResponse.body.next, 'passkey');
		expect(signinResponse.body.authRequest.challenge).toEqual(expect.anything());
		expect(signinResponse.body.authRequest.allowCredentials).toEqual(expect.anything());

		const signinResponse2 = await api('signin-flow', {
			...signinWithSecurityKeyParam({
				keyName,
				credentialId,
				requestOptions: signinResponse.body.authRequest,
			} as any),
			password: '',
		});
		expect(signinResponse2.status).toBe(200);
		assert.strictEqual(signinResponse2.body.finished, true);
		expect(signinResponse2.body.i).toEqual(expect.anything());

		// 後片付け
		await api(
			'i/2fa/unregister',
			{
				password,
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
	});

	test('専用パスキーサインインが完了し、不正なcontext・credential・ユーザー状態を拒否する。', async () => {
		const passkeyUser = await signup({ username: `pk_${crypto.randomBytes(4).toString('hex')}`, password });
		const registerResponse = await api('i/2fa/register', { password }, passkeyUser);
		expect(registerResponse.status).toBe(200);

		const doneResponse = await api(
			'i/2fa/done',
			{
				token: otpToken(registerResponse.body.secret),
			},
			passkeyUser,
		);
		expect(doneResponse.status).toBe(200);

		const registerKeyResponse = await api(
			'i/2fa/register-key',
			{
				password,
				token: otpToken(registerResponse.body.secret),
			},
			passkeyUser,
		);
		expect(registerKeyResponse.status).toBe(200);

		const credentialId = crypto.randomBytes(0x41);
		const keyDoneResponse = await api(
			'i/2fa/key-done',
			keyDoneParam({
				token: otpToken(registerResponse.body.secret),
				keyName: 'dedicated-signin-key',
				credentialId,
				creationOptions: registerKeyResponse.body,
			} as any) as any,
			passkeyUser,
		);
		expect(keyDoneResponse.status).toBe(200);

		let lastPasskeyCallAt = 0;
		const callPasskey = async <P extends misskey.entities.SigninWithPasskeyRequest>(params: P) => {
			const wait = lastPasskeyCallAt + 300 - Date.now();
			if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
			lastPasskeyCallAt = Date.now();
			return await api('signin-with-passkey', params);
		};

		let signCount = 0;
		const createCredential = async (id = credentialId) => {
			const init = await callPasskey({});
			expect(init.status).toBe(200);
			const request = signinWithSecurityKeyParam({
				keyName: 'dedicated-signin-key',
				credentialId: id,
				requestOptions: init.body.option,
				signCount: ++signCount,
			});
			assert.ok(request.credential);
			return { context: init.body.context, credential: request.credential };
		};

		try {
			const contextMismatch = await createCredential();
			const contextMismatchResponse = await callPasskey({
				...contextMismatch,
				context: crypto.randomUUID(),
			});
			expect(contextMismatchResponse.status).toBe(403);
			expect(castAsError(contextMismatchResponse.body as any).error.id).toBe('2d16e51c-007b-4edd-afd2-f7dd02c947f6');

			const invalidCredential = await createCredential(crypto.randomBytes(0x41));
			const invalidCredentialResponse = await callPasskey(invalidCredential);
			expect(invalidCredentialResponse.status).toBe(403);
			expect(castAsError(invalidCredentialResponse.body as any).error.id).toBe('36b96a7d-b547-412d-aeed-2d611cdc8cdc');

			const passwordlessDisabled = await callPasskey(await createCredential());
			expect(passwordlessDisabled.status).toBe(403);
			expect(castAsError(passwordlessDisabled.body as any).error.id).toBe('2d84773e-f7b7-4d0b-8f72-bb69b584c912');

			await updateUserProfileInDatabase(database, passkeyUser.id, { usePasswordLessLogin: true });
			await updateUserInDatabase(database, passkeyUser.id, { isSuspended: true });

			const suspended = await callPasskey(await createCredential());
			expect(suspended.status).toBe(403);
			expect(castAsError(suspended.body as any).error.id).toBe('e03a5f46-d309-4865-9b69-56282d94e1eb');

			await updateUserInDatabase(database, passkeyUser.id, { isSuspended: false });

			const completed = await callPasskey(await createCredential());
			expect(completed.status).toBe(200);
			const completedBody = completed.body as unknown as misskey.entities.SigninWithPasskeyResponse;
			expect(completedBody.signinResponse.finished).toBe(true);
			expect(completedBody.signinResponse.i).toEqual(expect.anything());
		} finally {
			await updateUserInDatabase(database, passkeyUser.id, { isSuspended: false });
			await updateUserProfileInDatabase(database, passkeyUser.id, { usePasswordLessLogin: false });
			await api(
				'i/2fa/unregister',
				{
					password,
					token: otpToken(registerResponse.body.secret),
				},
				passkeyUser,
			);
		}
	});

	test('が設定でき、設定したセキュリティキーの名前を変更できる。', async () => {
		const registerResponse = await api(
			'i/2fa/register',
			{
				password,
			},
			alice,
		);
		expect(registerResponse.status).toBe(200);

		const doneResponse = await api(
			'i/2fa/done',
			{
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
		expect(doneResponse.status).toBe(200);

		const registerKeyResponse = await api(
			'i/2fa/register-key',
			{
				token: otpToken(registerResponse.body.secret),
				password,
			},
			alice,
		);
		expect(registerKeyResponse.status).toBe(200);

		const keyName = 'example-key';
		const credentialId = crypto.randomBytes(0x41);
		const keyDoneResponse = await api(
			'i/2fa/key-done',
			keyDoneParam({
				token: otpToken(registerResponse.body.secret),
				keyName,
				credentialId,
				creationOptions: registerKeyResponse.body,
			} as any) as any,
			alice,
		);
		expect(keyDoneResponse.status).toBe(200);

		const renamedKey = 'other-key';
		const updateKeyResponse = await api(
			'i/2fa/update-key',
			{
				name: renamedKey,
				credentialId: credentialId.toString('base64url'),
			},
			alice,
		);
		expect(updateKeyResponse.status).toBe(200);

		const iResponse = await api('i', {}, alice);
		expect(iResponse.status).toBe(200);
		assert.ok(iResponse.body.securityKeysList);
		const securityKeys = iResponse.body.securityKeysList.filter(
			(s: { id: string }) => s.id === credentialId.toString('base64url'),
		);
		expect(securityKeys.length).toBe(1);
		const securityKey = securityKeys[0];
		assert.ok(securityKey);
		expect(securityKey.name).toBe(renamedKey);
		expect(securityKey.lastUsed).toEqual(expect.anything());

		// 後片付け
		await api(
			'i/2fa/unregister',
			{
				password,
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
	});

	test('が設定でき、設定したセキュリティキーを削除できる。', async () => {
		const registerResponse = await api(
			'i/2fa/register',
			{
				password,
			},
			alice,
		);
		expect(registerResponse.status).toBe(200);

		const doneResponse = await api(
			'i/2fa/done',
			{
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
		expect(doneResponse.status).toBe(200);

		const registerKeyResponse = await api(
			'i/2fa/register-key',
			{
				token: otpToken(registerResponse.body.secret),
				password,
			},
			alice,
		);
		expect(registerKeyResponse.status).toBe(200);

		const keyName = 'example-key';
		const credentialId = crypto.randomBytes(0x41);
		const keyDoneResponse = await api(
			'i/2fa/key-done',
			keyDoneParam({
				token: otpToken(registerResponse.body.secret),
				keyName,
				credentialId,
				creationOptions: registerKeyResponse.body,
			} as any) as any,
			alice,
		);
		expect(keyDoneResponse.status).toBe(200);

		// テストの実行順によっては複数残ってるので全部消す
		const beforeIResponse = await api('i', {}, alice);
		expect(beforeIResponse.status).toBe(200);
		assert.ok(beforeIResponse.body.securityKeysList);
		for (const key of beforeIResponse.body.securityKeysList) {
			const removeKeyResponse = await api(
				'i/2fa/remove-key',
				{
					token: otpToken(registerResponse.body.secret),
					password,
					credentialId: key.id,
				},
				alice,
			);
			expect(removeKeyResponse.status).toBe(200);
		}

		const afterIResponse = await api('i', {}, alice);
		expect(afterIResponse.status).toBe(200);
		expect(afterIResponse.body.securityKeys).toBe(false);

		const signinResponse = await api('signin-flow', {
			...signinParam(),
			token: otpToken(registerResponse.body.secret),
		});
		expect(signinResponse.status).toBe(200);
		assert.strictEqual(signinResponse.body.finished, true);
		expect(signinResponse.body.i).toEqual(expect.anything());

		// 後片付け
		await api(
			'i/2fa/unregister',
			{
				password,
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
	});

	test('が設定でき、設定解除できる。（パスワードのみでログインできる。）', async () => {
		const registerResponse = await api(
			'i/2fa/register',
			{
				password,
			},
			alice,
		);
		expect(registerResponse.status).toBe(200);

		const doneResponse = await api(
			'i/2fa/done',
			{
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
		expect(doneResponse.status).toBe(200);

		const iResponse = await api('i', {}, alice);
		expect(iResponse.status).toBe(200);
		expect(iResponse.body.twoFactorEnabled).toBe(true);

		const unregisterResponse = await api(
			'i/2fa/unregister',
			{
				token: otpToken(registerResponse.body.secret),
				password,
			},
			alice,
		);
		expect(unregisterResponse.status).toBe(204);

		const signinResponse = await api('signin-flow', {
			...signinParam(),
		});
		expect(signinResponse.status).toBe(200);
		assert.strictEqual(signinResponse.body.finished, true);
		expect(signinResponse.body.i).toEqual(expect.anything());

		// 後片付け
		await api(
			'i/2fa/unregister',
			{
				password,
				token: otpToken(registerResponse.body.secret),
			},
			alice,
		);
	});

	test('が有効な場合、パスワード変更はTOTPなしまたは不正なTOTPでは失敗し、パスワードを変更しない。', async () => {
		const user = await signup({ username: `tfcp_${crypto.randomBytes(4).toString('hex')}`, password });
		const secret = await enableTotp(user);
		const newPassword = 'new-password';

		const assertPasswordUnchanged = async (): Promise<void> => {
			const oldPasswordResponse = await api('signin-flow', {
				username: user.username,
				password,
				token: otpToken(secret),
			});
			expect(oldPasswordResponse.status).toBe(200);
			assert.strictEqual(oldPasswordResponse.body.finished, true);

			const newPasswordResponse = await api('signin-flow', {
				username: user.username,
				password: newPassword,
			});
			expect(newPasswordResponse.status).toBe(403);
		};

		try {
			const missingTokenResponse = await api(
				'i/change-password',
				{
					currentPassword: password,
					newPassword,
				},
				user,
			);
			// 2FA失敗は利用者の入力ミスなので、500 INTERNAL_ERROR ではなく明示的なAPIエラーであること
			expect(missingTokenResponse.status, JSON.stringify(missingTokenResponse.body)).toBe(400);
			expect(castAsError(missingTokenResponse.body as any).error.code).toBe('TWO_FACTOR_AUTHENTICATION_FAILED');
			await assertPasswordUnchanged();

			await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '1' });
			try {
				const invalidTokenResponse = await api(
					'i/change-password',
					{
						currentPassword: password,
						newPassword,
						token: invalidOtpToken(secret),
					},
					user,
				);
				expect(invalidTokenResponse.status, JSON.stringify(invalidTokenResponse.body)).toBe(400);
				expect(castAsError(invalidTokenResponse.body as any).error.code).toBe('TWO_FACTOR_AUTHENTICATION_FAILED');
			} finally {
				await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
			}
			await assertPasswordUnchanged();
		} finally {
			await api(
				'i/2fa/unregister',
				{
					password,
					token: otpToken(secret),
				},
				user,
			);
		}
	});

	test('が有効な場合、メールアドレス変更はTOTPなしまたは不正なTOTPでは失敗し、メールアドレスを変更しない。', async () => {
		const user = await signup({ username: `tfem_${crypto.randomBytes(4).toString('hex')}`, password });
		const secret = await enableTotp(user);
		const beforeResponse = await api('i', {}, user);
		expect(beforeResponse.status).toBe(200);

		const assertEmailUnchanged = async (): Promise<void> => {
			const afterResponse = await api('i', {}, user);
			expect(afterResponse.status).toBe(200);
			expect(afterResponse.body.email).toBe(beforeResponse.body.email);
			expect(afterResponse.body.emailVerified).toBe(beforeResponse.body.emailVerified);
		};

		try {
			const missingTokenResponse = await api(
				'i/update-email',
				{
					password,
					email: 'missing-token@example.com',
				},
				user,
			);
			expect(missingTokenResponse.status, JSON.stringify(missingTokenResponse.body)).toBe(400);
			expect(castAsError(missingTokenResponse.body as any).error.code).toBe('TWO_FACTOR_AUTHENTICATION_FAILED');
			await assertEmailUnchanged();

			await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '1' });
			try {
				const invalidTokenResponse = await api(
					'i/update-email',
					{
						password,
						email: 'invalid-token@example.com',
						token: invalidOtpToken(secret),
					},
					user,
				);
				expect(invalidTokenResponse.status, JSON.stringify(invalidTokenResponse.body)).toBe(400);
				expect(castAsError(invalidTokenResponse.body as any).error.code).toBe('TWO_FACTOR_AUTHENTICATION_FAILED');
			} finally {
				await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
			}
			await assertEmailUnchanged();
		} finally {
			await api(
				'i/2fa/unregister',
				{
					password,
					token: otpToken(secret),
				},
				user,
			);
		}
	});

	test('が有効な場合、アカウント削除はTOTPなしまたは不正なTOTPでは失敗し、アカウントを削除しない。', async () => {
		const user = await signup({ username: `tfdel_${crypto.randomBytes(4).toString('hex')}`, password });
		const secret = await enableTotp(user);

		const assertAccountNotDeleted = async (): Promise<void> => {
			const iResponse = await api('i', {}, user);
			expect(iResponse.status).toBe(200);
			expect(iResponse.body.isDeleted).toBe(false);
		};

		try {
			const missingTokenResponse = await api(
				'i/delete-account',
				{
					password,
				},
				user,
			);
			expect(missingTokenResponse.status, JSON.stringify(missingTokenResponse.body)).toBe(400);
			expect(castAsError(missingTokenResponse.body as any).error.code).toBe('TWO_FACTOR_AUTHENTICATION_FAILED');
			await assertAccountNotDeleted();

			await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '1' });
			try {
				const invalidTokenResponse = await api(
					'i/delete-account',
					{
						password,
						token: invalidOtpToken(secret),
					},
					user,
				);
				expect(invalidTokenResponse.status, JSON.stringify(invalidTokenResponse.body)).toBe(400);
				expect(castAsError(invalidTokenResponse.body as any).error.code).toBe('TWO_FACTOR_AUTHENTICATION_FAILED');
			} finally {
				await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
			}
			await assertAccountNotDeleted();
		} finally {
			await api(
				'i/2fa/unregister',
				{
					password,
					token: otpToken(secret),
				},
				user,
			);
		}
	});

	test('のTOTPトークンは一度使うと同じトークンは再利用できない。', async () => {
		await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '1' });

		const registerResponse = await api(
			'i/2fa/register',
			{
				password,
			},
			alice,
		);
		expect(registerResponse.status).toBe(200);

		const sharedOtpToken = otpToken(registerResponse.body.secret);
		const doneResponse = await api(
			'i/2fa/done',
			{
				token: sharedOtpToken,
			},
			alice,
		);
		expect(doneResponse.status).toBe(200);

		try {
			const signinResponse = await api('signin-flow', {
				...signinParam(),
				token: sharedOtpToken,
			});
			expect(signinResponse.status).toBe(403);
		} finally {
			await sendEnvUpdateRequest({ key: 'MISSKEY_TEST_CHECK_DUPLICATED_TOTP', value: '' });
			await api(
				'i/2fa/unregister',
				{
					password,
					token: otpToken(registerResponse.body.secret),
				},
				alice,
			);
		}
	});
});
