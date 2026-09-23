import { vi, describe, test, expect } from 'vitest';
import { APIClient, isAPIError, requestAPI } from '../src/api.js';

describe('API', () => {
	test('success', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
			if (url === 'https://misskey.test/api/i' && options?.method === 'POST') {
				if (options.body) {
					const body = JSON.parse(options.body as string);
					if (body.i === 'TOKEN') {
						return new Response(JSON.stringify({ id: 'foo' }), { status: 200 });
					}
				}

				return new Response(null, { status: 400 });
			}

			return new Response(null, { status: 404 });
		});

		const cli = new APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN',
		});

		const res = await cli.request('i');

		expect(res).toEqual({
			id: 'foo',
		});

		expect(fetchMock).toHaveBeenCalledWith('https://misskey.test/api/i', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'omit',
			cache: 'no-cache',
			body: JSON.stringify({ i: 'TOKEN' }),
		});

		fetchMock.mockRestore();
	});

	test('with params', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
			if (url === 'https://misskey.test/api/notes/show' && options?.method === 'POST') {
				if (options.body) {
					const body = JSON.parse(options.body as string);
					if (body.i === 'TOKEN' && body.noteId === 'aaaaa') {
						return new Response(JSON.stringify({ id: 'foo' }), { status: 200 });
					}
				}
				return new Response(null, { status: 400 });
			}
			return new Response(null, { status: 404 });
		});

		const cli = new APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN',
		});

		const res = await cli.request('notes/show', { noteId: 'aaaaa' });

		expect(res).toEqual({
			id: 'foo',
		});

		expect(fetchMock).toHaveBeenCalledWith('https://misskey.test/api/notes/show', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'omit',
			cache: 'no-cache',
			body: JSON.stringify({ noteId: 'aaaaa', i: 'TOKEN' }),
		});

		fetchMock.mockRestore();
	});

	test('multipart/form-data', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
			if (url === 'https://misskey.test/api/drive/files/create' && options?.method === 'POST') {
				if (options.body instanceof FormData) {
					const file = options.body.get('file');
					if (file instanceof File && file.name === 'foo.txt' &&
						options.body.get('i') === 'TOKEN' &&
						!options.body.has('name') &&
						options.body.get('isSensitive') === 'false' &&
						new Headers(options.headers).get('Content-Type') === null) {
						return new Response(JSON.stringify({ id: 'foo' }), { status: 200 });
					}
				}
				return new Response(null, { status: 400 });
			}
			return new Response(null, { status: 404 });
		});

		const cli = new APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN',
		});

		const testFile = new File([], 'foo.txt');

		const res = await cli.request('drive/files/create', {
			file: testFile,
			name: null, // nullのパラメータは消える
			isSensitive: false,
		});

		expect(res).toEqual({
			id: 'foo',
		});

		expect(fetchMock).toHaveBeenCalledWith('https://misskey.test/api/drive/files/create', {
			method: 'POST',
			body: expect.any(FormData),
			headers: {},
			credentials: 'omit',
			cache: 'no-cache',
		});

		fetchMock.mockRestore();
	});

	test('204 No Content で null が返る', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
			if (url === 'https://misskey.test/api/reset-password' && options?.method === 'POST') {
				return new Response(null, { status: 204 });
			}
			return new Response(null, { status: 404 });
		});

		const cli = new APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN',
		});

		const res = await cli.request('reset-password', { token: 'aaa', password: 'aaa' });

		expect(res).toEqual(null);

		expect(fetchMock).toHaveBeenCalledWith('https://misskey.test/api/reset-password', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			credentials: 'omit',
			cache: 'no-cache',
			body: JSON.stringify({ token: 'aaa', password: 'aaa', i: 'TOKEN' }),
		});

		fetchMock.mockRestore();
	});

	test('インスタンスの credential が指定されていても引数で credential が null ならば null としてリクエストされる', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
			if (url === 'https://misskey.test/api/i' && options?.method === 'POST') {
				if (options.body) {
					const body = JSON.parse(options.body as string);
					if (typeof body.i === 'string') {
						return new Response(JSON.stringify({ id: 'foo' }), { status: 200 });
					}
					return new Response(
						JSON.stringify({
							error: {
								message: 'Credential required.',
								code: 'CREDENTIAL_REQUIRED',
								id: '1384574d-a912-4b81-8601-c7b1c4085df1',
								kind: 'client',
							},
						}),
						{ status: 401 },
					);
				}
				return new Response(null, { status: 400 });
			}
			return new Response(null, { status: 404 });
		});

		const cli = new APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN',
		});
		const error = await cli.request('i', {}, null).then(
			() => null,
			(reason) => reason,
		);

		expect(error).not.toBeNull();
		expect(isAPIError(error)).toEqual(true);
		expect(error).toMatchObject({ code: 'CREDENTIAL_REQUIRED', kind: 'client' });
		fetchMock.mockRestore();
	});

	test('api error', async () => {
		const error = {
			message: 'Internal error occurred. Please contact us if the error persists.',
			code: 'INTERNAL_ERROR',
			id: '5d37dbcb-891e-41ca-a3d6-e690c97775ac',
			kind: 'server',
		};
		const cli = new APIClient({
			origin: 'https://misskey.test',
			fetch: async () => new Response(JSON.stringify({ error }), { status: 500 }),
		});
		await expect(cli.request('i')).rejects.toMatchObject(error);
		const reason = await cli.request('i').catch((value) => value);
		expect(isAPIError(reason)).toBe(true);
	});

	test('non-object error response is not treated as an API error', async () => {
		const cli = new APIClient({
			origin: 'https://misskey.test',
			fetch: async () => new Response('null', { status: 500 }),
		});
		const reason = await cli.request('i').then(
			() => undefined,
			(error) => error,
		);

		expect(reason).toBeNull();
		expect(isAPIError(reason)).toBe(false);
	});

	test('network error', async () => {
		const error = new Error('Network error');
		const cli = new APIClient({
			origin: 'https://misskey.test',
			fetch: async () => { throw error; },
		});
		await expect(cli.request('i')).rejects.toBe(error);
		expect(isAPIError(error)).toBe(false);
	});

	test('json parse error', async () => {
		const cli = new APIClient({
			origin: 'https://misskey.test',
			fetch: async () => new Response('<html>I AM NOT JSON</html>', { status: 500 }),
		});
		await expect(cli.request('i')).rejects.toBeInstanceOf(SyntaxError);
	});

	test('malformed structured errors retain the response body', async () => {
		const body = { error: { code: 'INVALID', message: 'Missing error identity' } };
		const cli = new APIClient({
			origin: 'https://misskey.test',
			fetch: async () => new Response(JSON.stringify(body), { status: 400 }),
		});
		await expect(cli.request('i')).rejects.toEqual(body);
	});

	test('other successful HTTP statuses are not API successes', async () => {
		const body = { id: 'unexpected' };
		const cli = new APIClient({
			origin: 'https://misskey.test',
			fetch: async () => new Response(JSON.stringify(body), { status: 201 }),
		});
		await expect(cli.request('i')).rejects.toEqual(body);
	});

	test('cancellation reaches custom fetch without API error branding', async () => {
		const controller = new AbortController();
		const cli = new APIClient({
			origin: 'https://misskey.test',
			fetch: (_url, init) => {
				const { promise, reject } = Promise.withResolvers<Response>();
				const signal = init?.signal;
				signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
				return promise;
			},
		});
		const request = cli.request('i', {}, undefined, controller.signal);
		const reason = new DOMException('Cancelled', 'AbortError');
		controller.abort(reason);
		await expect(request).rejects.toBe(reason);
		expect(isAPIError(reason)).toBe(false);
	});

	test('GET transport serializes query values without a body', async () => {
		const result = await requestAPI({
			apiUrl: 'https://misskey.test/api',
			endpoint: 'notes/local-timeline',
			method: 'GET',
			data: { limit: 0, withFiles: false, untilId: null, sinceId: undefined, ids: ['a', 'b'], text: 'a b&c' },
			fetch: async (url, init) => {
				const request = new Request(url, init);
				expect(request.method).toBe('GET');
				expect(request.body).toBeNull();
				expect(new URL(url).searchParams.toString()).toBe('limit=0&withFiles=false&untilId=null&sinceId=undefined&ids=a%2Cb&text=a+b%26c');
				return new Response(null, { status: 204 });
			},
		});
		expect(result).toEqual({ status: 204, body: null });
	});

	test('admin/roles/create の型が合う', async () => {
		const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
			// レスポンスの型検証はこのテストの対象外のため、空のオブジェクトを返す。
			return new Response('{}', { status: 200 });
		});

		const cli = new APIClient({
			origin: 'https://misskey.test',
			credential: 'TOKEN',
		});
		await cli.request('admin/roles/create', {
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

		fetchMock.mockRestore();
	});
});
