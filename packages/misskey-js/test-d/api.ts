import { describe, expectTypeOf, test } from 'vitest';
import * as Misskey from '../src/index.js';

describe('API', () => {
	test('conditional response type (meta)', async () => {
		const cli = new Misskey.api.APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN'
		});

		const res = await cli.request('meta', { detail: true });
		expectTypeOf(res).toEqualTypeOf<Misskey.entities.MetaResponse>();

		const res2 = await cli.request('meta', { detail: false });
		expectTypeOf(res2).toEqualTypeOf<Misskey.entities.MetaResponse>();

		const res3 = await cli.request('meta', { });
		expectTypeOf(res3).toEqualTypeOf<Misskey.entities.MetaResponse>();

		const res4 = await cli.request('meta', { detail: true as boolean });
		expectTypeOf(res4).toEqualTypeOf<Misskey.entities.MetaResponse>();
	});

	test('admin/roles/create accepts policy overrides', async () => {
		const cli = new Misskey.api.APIClient({ origin: 'https://misskey.test' });
		const response = await cli.request('admin/roles/create', {
			name: 'aaa',
			asBadge: false,
			canEditMembersByModerator: false,
			color: '#123456',
			condFormula: {},
			description: '',
			displayOrder: 0,
			iconUrl: '',
			isAdministrator: false,
			isExplorable: false,
			isModerator: false,
			isPublic: false,
			policies: {
				ltlAvailable: {
					value: true,
					priority: 0,
					useDefault: false,
				},
			},
			target: 'manual',
		});
		expectTypeOf(response).toEqualTypeOf<Misskey.entities.AdminRolesCreateResponse>();
	});

	test('conditional response type (users/show)', async () => {
		const cli = new Misskey.api.APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN'
		});

		const res = await cli.request('users/show', { userId: 'xxxxxxxx' });
		expectTypeOf(res).toEqualTypeOf<Misskey.entities.UserDetailed>();

		const res2 = await cli.request('users/show', { userIds: ['xxxxxxxx'] });
		expectTypeOf(res2).toEqualTypeOf<Misskey.entities.UserDetailed[]>();

		// @ts-expect-error 型エラーになることを確かめる

		void cli.request('users/show');
	});

	test('optional request body and no-content response types', async () => {
		const cli = new Misskey.api.APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN'
		});

		const meta = await cli.request('meta');
		expectTypeOf(meta).toEqualTypeOf<Misskey.entities.MetaResponse>();
		const cancellableMeta = await cli.request('meta', undefined, null, new AbortController().signal);
		expectTypeOf(cancellableMeta).toEqualTypeOf<Misskey.entities.MetaResponse>();
		const passkeyInit = await cli.request('signin-with-passkey');
		expectTypeOf(passkeyInit).toEqualTypeOf<Misskey.entities.SigninWithPasskeyInitResponse>();
		await cli.request('clear-browser-cache');

		const translated = await cli.request('notes/translate', { noteId: 'xxxxxxxx', targetLang: 'en' }, undefined, new AbortController().signal);
		expectTypeOf(translated).toEqualTypeOf<{ sourceLang: string; text: string } | null>();

		const deleted = await cli.request('admin/emoji/delete', { id: 'xxxxxxxx' });
		expectTypeOf(deleted).toEqualTypeOf<null>();

		const updatedKey = await cli.request('i/2fa/update-key', { name: 'renamed', credentialId: 'xxxxxxxx' });
		expectTypeOf(updatedKey).toEqualTypeOf<Record<string, never>>();
		const removedKey = await cli.request('i/2fa/remove-key', { password: 'password', credentialId: 'xxxxxxxx' });
		expectTypeOf(removedKey).toEqualTypeOf<Record<string, never>>();
	});

	test('conditional responses include every possible branch for widened params', async () => {
		const cli = new Misskey.api.APIClient({ origin: 'https://misskey.test' });
		const params = {} as Misskey.Endpoints['users/show']['req'];
		const response = await cli.request('users/show', params);
		expectTypeOf(response).toEqualTypeOf<Misskey.entities.UserDetailed | Misskey.entities.UserDetailed[]>();

		// @ts-expect-error 型エラーになることを確かめる

		void cli.request('signin-with-passkey', { context: 'invalid-without-credential' });
		const passkeyParams = {} as Misskey.Endpoints['signin-with-passkey']['req'];
		const passkeyResponse = await cli.request('signin-with-passkey', passkeyParams);
		expectTypeOf(passkeyResponse).toEqualTypeOf<Misskey.entities.SigninWithPasskeyInitResponse | Misskey.entities.SigninWithPasskeyResponse>();
	});

	test('APIErrorBody matches the runtime error schema', () => {
		const error: Misskey.api.APIErrorBody = {
			id: '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31',
			code: 'YOUR_ACCOUNT_MOVED',
			message: 'You have moved your account.',
			kind: 'permission',
		};
		expectTypeOf(error).toEqualTypeOf<Misskey.api.APIErrorBody>();
	});

	test('isAPIError narrows code to the errors of the endpoint', (reason: unknown) => {
		if (Misskey.api.isAPIError(reason, 'notes/create')) {
			expectTypeOf(reason).toEqualTypeOf<Misskey.api.APIError<'notes/create'>>();
			expectTypeOf(reason.code).toEqualTypeOf<Misskey.api.APIErrorCode<'notes/create'>>();
			// 仕様書に載っているエラーコードだけを受け付ける。
			const known: Misskey.api.APIErrorCode<'notes/create'> = 'CANNOT_RENOTE_TO_A_PURE_RENOTE';
			void known;
			// @ts-expect-error notes/create は返さないコード
			const unknownCode: Misskey.api.APIErrorCode<'notes/create'> = 'NO_SUCH_FILE_THAT_DOES_NOT_EXIST';
			void unknownCode;
		}
	});
});
