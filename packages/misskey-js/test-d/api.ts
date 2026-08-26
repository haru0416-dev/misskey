import { describe, test } from 'vitest';
import { expectError, expectType } from 'tsd';
import * as Misskey from '../src/index.js';

describe('API', () => {
	test('success', async () => {
		const cli = new Misskey.api.APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN'
		});
		const res = await cli.request('meta', { detail: true });
		expectType<Misskey.entities.MetaResponse>(res);
	});

	test('conditional response type (meta)', async () => {
		const cli = new Misskey.api.APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN'
		});

		const res = await cli.request('meta', { detail: true });
		expectType<Misskey.entities.MetaResponse>(res);

		const res2 = await cli.request('meta', { detail: false });
		expectType<Misskey.entities.MetaResponse>(res2);

		const res3 = await cli.request('meta', { });
		expectType<Misskey.entities.MetaResponse>(res3);

		const res4 = await cli.request('meta', { detail: true as boolean });
		expectType<Misskey.entities.MetaResponse>(res4);
	});

	test('conditional response type (users/show)', async () => {
		const cli = new Misskey.api.APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN'
		});

		const res = await cli.request('users/show', { userId: 'xxxxxxxx' });
		expectType<Misskey.entities.UserDetailed>(res);

		const res2 = await cli.request('users/show', { userIds: ['xxxxxxxx'] });
		expectType<Misskey.entities.UserDetailed[]>(res2);

		expectError(cli.request('users/show'));
	});

	test('optional request body and no-content response types', async () => {
		const cli = new Misskey.api.APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN'
		});

		const meta = await cli.request('meta');
		expectType<Misskey.entities.MetaResponse>(meta);
		const passkeyInit = await cli.request('signin-with-passkey');
		expectType<Misskey.entities.SigninWithPasskeyInitResponse>(passkeyInit);
		await cli.request('clear-browser-cache');

		const translated = await cli.request('notes/translate', { noteId: 'xxxxxxxx', targetLang: 'en' });
		expectType<{ sourceLang: string; text: string } | null>(translated);

		const deleted = await cli.request('admin/emoji/delete', { id: 'xxxxxxxx' });
		expectType<null>(deleted);

		const updatedKey = await cli.request('i/2fa/update-key', { name: 'renamed', credentialId: 'xxxxxxxx' });
		expectType<Record<string, never>>(updatedKey);
		const removedKey = await cli.request('i/2fa/remove-key', { password: 'password', credentialId: 'xxxxxxxx' });
		expectType<Record<string, never>>(removedKey);
	});

	test('conditional responses include every possible branch for widened params', async () => {
		const cli = new Misskey.api.APIClient({ origin: 'https://misskey.test' });
		const params = {} as Misskey.Endpoints['users/show']['req'];
		const response = await cli.request('users/show', params);
		expectType<Misskey.entities.UserDetailed | Misskey.entities.UserDetailed[]>(response);

		expectError(cli.request('signin-with-passkey', { context: 'invalid-without-credential' }));
		const passkeyParams = {} as Misskey.Endpoints['signin-with-passkey']['req'];
		const passkeyResponse = await cli.request('signin-with-passkey', passkeyParams);
		expectType<Misskey.entities.SigninWithPasskeyInitResponse | Misskey.entities.SigninWithPasskeyResponse>(passkeyResponse);
	});

	test('APIError matches the runtime error schema', () => {
		const error: Misskey.api.APIError = {
			id: '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31',
			code: 'YOUR_ACCOUNT_MOVED',
			message: 'You have moved your account.',
			kind: 'permission',
		};
		expectType<Misskey.api.APIError>(error);
	});
});
