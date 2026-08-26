/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
	createUserWithProfileAndPublickeyInDatabase,
	genId,
	openTestDatabase,
	type TestDatabase,
} from '../fixtures.js';
import { api, channel, clip, galleryPost, page, play, post, signup, simpleGet, uploadFile } from '../utils.js';
import type { SimpleGetResponse } from '../utils.js';
import type * as misskey from 'misskey-js';

// Accept ヘッダーを小文字で送信する。
const ONLY_AP = 'application/activity+json';
const PREFER_AP = 'application/activity+json, */*';
const PREFER_HTML = 'text/html, */*';
const UNSPECIFIED = '*/*';

// Content-Type ヘッダーを小文字で返す。
const AP = 'application/activity+json; charset=utf-8';
const HTML = 'text/html; charset=utf-8';
const JSON_UTF8 = 'application/json; charset=utf-8';

describe('Webリソース', () => {
	let alice: misskey.entities.SignupResponse;
	let aliceUploadedFile: misskey.entities.DriveFile | null;
	let alicesPost: misskey.entities.Note;
	let alicePage: misskey.entities.Page;
	let alicePlay: misskey.entities.Flash;
	let aliceClip: misskey.entities.Clip;
	let aliceGalleryPost: misskey.entities.GalleryPost;
	let aliceChannel: misskey.entities.Channel;

	let bob: misskey.entities.SignupResponse;

	let database: TestDatabase;
	// DBに直接用意したリモートユーザー (連合の実サーバーは立てない)
	let remoteUserAcct: string;
	let remoteUserUri: string;

	type Request = {
		path: string;
		accept?: string;
		cookie?: string;
	};
	const ok = async (
		param: Request & {
			type?: string;
		},
	): Promise<SimpleGetResponse> => {
		const { path, accept, cookie, type } = param;
		const res = await simpleGet(path, accept, cookie);
		expect(res.status).toBe(200);
		// ヘッダー値は大文字小文字を区別しない。
		expect(res.type?.toLowerCase()).toBe((type ?? HTML).toLowerCase());
		return res;
	};

	const notOk = async (
		param: Request & {
			status?: number;
			code?: string;
		},
	): Promise<SimpleGetResponse> => {
		const { path, accept, cookie, status, code } = param;
		const res = await simpleGet(path, accept, cookie);
		expect(res.status).not.toBe(200);
		if (status != null) {
			expect(res.status).toBe(status);
		}
		if (code != null) {
			expect(res.body.error.code).toBe(code);
		}
		return res;
	};

	const notFound = async (param: Request): Promise<SimpleGetResponse> => {
		return await notOk({
			...param,
			status: 404,
		});
	};

	const metaTag = (res: SimpleGetResponse, key: string, superkey = 'name'): string => {
		return res.body.querySelector('meta[' + superkey + '="' + key + '"]')?.attributes.content;
	};

	beforeAll(
		async () => {
			alice = await signup({ username: 'alice' });
			await api('admin/update-meta', { federation: 'all' }, alice as misskey.entities.SignupResponse);
			aliceUploadedFile = (await uploadFile(alice)).body;
			alicesPost = await post(alice, {
				text: 'test',
			});
			alicePage = await page(alice, {});
			alicePlay = await play(alice, {});
			aliceClip = await clip(alice, {});
			aliceGalleryPost = await galleryPost(alice, {
				fileIds: [aliceUploadedFile!.id],
			});
			aliceChannel = await channel(alice, {});

			bob = await signup({ username: 'bob' });

			database = openTestDatabase();
			const suffix = Date.now().toString(36).slice(-8);
			const remoteHost = `fetch-remote-${suffix}.example`;
			const remoteUserId = genId();
			remoteUserAcct = `fetchremote${suffix}@${remoteHost}`;
			remoteUserUri = `https://${remoteHost}/users/${remoteUserId}`;
			await createUserWithProfileAndPublickeyInDatabase(database, {
				user: {
					id: remoteUserId,
					username: `fetchremote${suffix}`,
					usernameLower: `fetchremote${suffix}`,
					host: remoteHost,
					inbox: `https://${remoteHost}/inbox`,
					uri: remoteUserUri,
					isExplorable: false,
				},
				profile: {
					userId: remoteUserId,
					userHost: remoteHost,
				},
			});
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await database.close();
	});

	describe.each([
		{ path: '/', type: HTML },
		{ path: '/docs/ja-JP/about', type: HTML }, // "指定されたURLに該当するページはありませんでした。"
		{ path: '/api-doc', type: HTML },
		{ path: '/api.json', type: JSON_UTF8 },
		{ path: '/api-console', type: HTML },
		{ path: '/_info_card_', type: HTML },
		{ path: '/bios', type: HTML },
		{ path: '/cli', type: HTML },
		{ path: '/flush', type: HTML },
		{ path: '/robots.txt', type: 'text/plain; charset=UTF-8' },
		{ path: '/favicon.ico', type: 'image/vnd.microsoft.icon' },
		{ path: '/opensearch.xml', type: 'application/opensearchdescription+xml' },
		{ path: '/apple-touch-icon.png', type: 'image/png' },
		{ path: '/twemoji/2764.svg', type: 'image/svg+xml' },
		{ path: '/twemoji/2764-fe0f-200d-1f525.svg', type: 'image/svg+xml' },
		{ path: '/twemoji-badge/2764.png', type: 'image/png' },
		{ path: '/twemoji-badge/2764-fe0f-200d-1f525.png', type: 'image/png' },
		{ path: '/fluent-emoji/2764.png', type: 'image/png' },
		{ path: '/fluent-emoji/2764-fe0f-200d-1f525.png', type: 'image/png' },
	])('$path', (p) => {
		test('がGETできる。', async () => await ok({ ...p }));

		// 注意: Webページが200で取得できても、実際のHTMLが正しく表示できるとは限らない
		//      例えば、 /@xxx/pages/yyy に存在しないIDを渡した場合、HTTPレスポンスではエラーを区別できない
		//      こういったアサーションはフロントエンドE2EやAPI Endpointのテストで担保する。
	});

	describe.each([
		{ path: '/twemoji/2764.png' },
		{ path: '/twemoji/2764-fe0f-200d-1f525.png' },
		{ path: '/twemoji-badge/2764.svg' },
		{ path: '/twemoji-badge/2764-fe0f-200d-1f525.svg' },
		{ path: '/fluent-emoji/2764.svg' },
		{ path: '/fluent-emoji/2764-fe0f-200d-1f525.svg' },
	])('$path', ({ path }) => {
		test('はGETできない。', async () => await notFound({ path }));
	});

	describe.each([
		{ ext: 'rss', type: 'application/rss+xml; charset=utf-8' },
		{ ext: 'atom', type: 'application/atom+xml; charset=utf-8' },
		{ ext: 'json', type: 'application/json; charset=utf-8' },
	])('/@:username.$ext', ({ ext, type }) => {
		const path = (username: string): string => `/@${username}.${ext}`;

		test('がGETできる。', async () =>
			await ok({
				path: path(alice.username),
				type,
			}));

		test('がGETできる。(ノートが存在しない場合でも。)', async () =>
			await ok({
				path: path(bob.username),
				type,
			}));

		test('は存在しないユーザーはGETできない。', async () =>
			await notOk({
				path: path('nonexisting'),
				status: 404,
			}));

		describe(' has entry such ', () => {
			beforeEach(() => {
				post(alice, { text: '**a**' });
			});

			test('MFMを含まない。', async () => {
				const content = await simpleGet(path(alice.username), '*/*', undefined, (res) => res.text());
				const _body: unknown = content.body;
				// JSONフィードのときは改めて文字列化する
				const body: string = typeof _body === 'object' ? JSON.stringify(_body) : (_body as string);

				if (body.includes('**a**')) {
					throw new Error("MFM shouldn't be included");
				}
			});
		});
	});

	describe.each([{ path: '/api/foo' }])('$path', ({ path }) => {
		test('はGETできない。', async () =>
			await notOk({
				path,
				status: 404,
				code: 'UNKNOWN_API_ENDPOINT',
			}));
	});

	describe.each([{ path: '/streaming' }])('$path', ({ path }) => {
		test('はGETできない。', async () =>
			await notOk({
				path,
				status: 503,
			}));
	});

	describe('/@:username', () => {
		const path = (username: string): string => `/@${username}`;

		describe.each([{ accept: PREFER_HTML }, { accept: UNSPECIFIED }])('(Acceptヘッダ: $accept)', ({ accept }) => {
			test('はHTMLとしてGETできる。', async () => {
				const res = await ok({
					path: path(alice.username),
					accept,
					type: HTML,
				});
				expect(metaTag(res, 'misskey:user-username')).toBe(alice.username);
				expect(metaTag(res, 'misskey:user-id')).toBe(alice.id);

				// TODO ogタグの検証
				// TODO profile.noCrawleの検証
				// TODO twitter:creatorの検証
				// TODO <link rel="me" ...>の検証
			});
			test('はHTMLとしてGETできる。(存在しないIDでも。)', async () =>
				await ok({
					path: path('xxxxxxxxxx'),
					type: HTML,
				}));
			test('はHTMLとしてGETできる。(リモートユーザーでもリダイレクトせず)', async () => {
				const res = await ok({
					path: path(remoteUserAcct),
					accept,
					type: HTML,
				});
				expect(res.location).toBe(null);
			});
		});

		describe.each([{ accept: ONLY_AP }, { accept: PREFER_AP }])('(Acceptヘッダ: $accept)', ({ accept }) => {
			test('はActivityPubとしてGETできる。', async () => {
				const res = await ok({
					path: path(alice.username),
					accept,
					type: AP,
				});
				expect(res.body.type).toBe('Person');
			});

			test('は存在しないIDのときActivityPubとしてGETできない。', async () =>
				await notFound({
					path: path('xxxxxxxxxx'),
					accept,
				}));
			test('はオリジナルにリダイレクトされる。(リモートユーザー)', async () => {
				const res = await simpleGet(path(remoteUserAcct), accept);
				expect(res.status).toBe(301);
				expect(res.location).toBe(remoteUserUri);
			});
		});
	});

	describe.each([
		// 実際のハンドルはフロントエンド(index.vue)で行われる
		{ sub: 'home' },
		{ sub: 'notes' },
		{ sub: 'activity' },
		{ sub: 'achievements' },
		{ sub: 'reactions' },
		{ sub: 'clips' },
		{ sub: 'pages' },
		{ sub: 'gallery' },
	])('/@:username/$sub', ({ sub }) => {
		const path = (username: string): string => `/@${username}/${sub}`;

		test('はHTMLとしてGETできる。', async () => {
			const res = await ok({
				path: path(alice.username),
			});
			expect(metaTag(res, 'misskey:user-username')).toBe(alice.username);
			expect(metaTag(res, 'misskey:user-id')).toBe(alice.id);
		});
	});

	describe('/@:user/pages/:page', () => {
		const path = (username: string, pagename: string): string => `/@${username}/pages/${pagename}`;

		test('はHTMLとしてGETできる。', async () => {
			const res = await ok({
				path: path(alice.username, alicePage.name),
			});
			expect(metaTag(res, 'misskey:user-username')).toBe(alice.username);
			expect(metaTag(res, 'misskey:user-id')).toBe(alice.id);
			expect(metaTag(res, 'misskey:page-id')).toBe(alicePage.id);

			// TODO ogタグの検証
			// TODO profile.noCrawleの検証
			// TODO twitter:creatorの検証
		});

		test('はGETできる。(存在しないIDでも。)', async () =>
			await ok({
				path: path(alice.username, 'xxxxxxxxxx'),
			}));
	});

	describe('/users/:id', () => {
		const path = (id: string): string => `/users/${id}`;

		describe.each([{ accept: PREFER_HTML }, { accept: UNSPECIFIED }])('(Acceptヘッダ: $accept)', ({ accept }) => {
			test('は/@:usernameにリダイレクトする', async () => {
				const res = await simpleGet(path(alice.id), accept);
				expect(res.status).toBe(302);
				expect(res.location).toBe(`/@${alice.username}`);
			});

			test('は存在しないユーザーはGETできない。', async () =>
				await notFound({
					path: path('xxxxxxxx'),
				}));
		});

		describe.each([{ accept: ONLY_AP }, { accept: PREFER_AP }])('(Acceptヘッダ: $accept)', ({ accept }) => {
			test('はActivityPubとしてGETできる。', async () => {
				const res = await ok({
					path: path(alice.id),
					accept,
					type: AP,
				});
				expect(res.body.type).toBe('Person');
			});

			test('は存在しないIDのときActivityPubとしてGETできない。', async () =>
				await notOk({
					path: path('xxxxxxxx'),
					accept,
					status: 404,
				}));
		});
	});

	describe('/users/inbox', () => {
		test('がGETできる。(POST専用だけど4xx/5xxにならずHTMLが返ってくる)', async () =>
			await ok({
				path: '/inbox',
			}));

		// test.todo('POSTできる？');
	});

	describe('/users/:id/inbox', () => {
		const path = (id: string): string => `/users/${id}/inbox`;

		test('がGETできる。(POST専用だけど4xx/5xxにならずHTMLが返ってくる)', async () =>
			await ok({
				path: path(alice.id),
			}));

		// test.todo('POSTできる？');
	});

	describe('/users/:id/outbox', () => {
		const path = (id: string): string => `/users/${id}/outbox`;

		test('がGETできる。', async () => {
			const res = await ok({
				path: path(alice.id),
				type: AP,
			});
			expect(res.body.type).toBe('OrderedCollection');
		});
	});

	describe('/notes/:id', () => {
		const path = (noteId: string): string => `/notes/${noteId}`;

		describe.each([{ accept: PREFER_HTML }, { accept: UNSPECIFIED }])('(Acceptヘッダ: $accept)', ({ accept }) => {
			test('はHTMLとしてGETできる。', async () => {
				const res = await ok({
					path: path(alicesPost.id),
					accept,
					type: HTML,
				});
				expect(metaTag(res, 'misskey:user-username')).toBe(alice.username);
				expect(metaTag(res, 'misskey:user-id')).toBe(alice.id);
				expect(metaTag(res, 'misskey:note-id')).toBe(alicesPost.id);

				// TODO ogタグの検証
				// TODO profile.noCrawleの検証
				// TODO twitter:creatorの検証
			});

			test('はHTMLとしてGETできる。(存在しないIDでも。)', async () =>
				await ok({
					path: path('xxxxxxxxxx'),
				}));
		});

		describe.each([{ accept: ONLY_AP }, { accept: PREFER_AP }])('(Acceptヘッダ: $accept)', ({ accept }) => {
			test('はActivityPubとしてGETできる。', async () => {
				const res = await ok({
					path: path(alicesPost.id),
					accept,
					type: AP,
				});
				expect(res.body.type).toBe('Note');
			});

			test('は存在しないIDのときActivityPubとしてGETできない。', async () =>
				await notFound({
					path: path('xxxxxxxxxx'),
					accept,
				}));
		});
	});

	describe('/play/:id', () => {
		const path = (playid: string): string => `/play/${playid}`;

		test('がGETできる。', async () => {
			const res = await ok({
				path: path(alicePlay.id),
			});
			expect(metaTag(res, 'misskey:user-username')).toBe(alice.username);
			expect(metaTag(res, 'misskey:user-id')).toBe(alice.id);
			expect(metaTag(res, 'misskey:flash-id')).toBe(alicePlay.id);

			// TODO ogタグの検証
			// TODO profile.noCrawleの検証
			// TODO twitter:creatorの検証
		});

		test('がGETできる。(存在しないIDでも。)', async () =>
			await ok({
				path: path('xxxxxxxxxx'),
			}));
	});

	describe('/clips/:clip', () => {
		const path = (clip: string): string => `/clips/${clip}`;

		test('がGETできる。', async () => {
			const res = await ok({
				path: path(aliceClip.id),
			});
			expect(metaTag(res, 'misskey:user-username')).toBe(alice.username);
			expect(metaTag(res, 'misskey:user-id')).toBe(alice.id);
			expect(metaTag(res, 'misskey:clip-id')).toBe(aliceClip.id);

			// TODO ogタグの検証
			// TODO profile.noCrawleの検証
		});

		test('がGETできる。(存在しないIDでも。)', async () =>
			await ok({
				path: path('xxxxxxxxxx'),
			}));
	});

	describe('/gallery/:post', () => {
		const path = (post: string): string => `/gallery/${post}`;

		test('がGETできる。', async () => {
			const res = await ok({
				path: path(aliceGalleryPost.id),
			});
			expect(metaTag(res, 'misskey:user-username')).toBe(alice.username);
			expect(metaTag(res, 'misskey:user-id')).toBe(alice.id);

			// FIXME: misskey:gallery-post-idみたいなmetaタグの設定がない
			// TODO profile.noCrawleの検証
			// TODO twitter:creatorの検証
		});

		test('がGETできる。(存在しないIDでも。)', async () =>
			await ok({
				path: path('xxxxxxxxxx'),
			}));
	});

	describe('/channels/:channel', () => {
		const path = (channel: string): string => `/channels/${channel}`;

		test('はGETできる。', async () => {
			const res = await ok({
				path: path(aliceChannel.id),
			});

			// FIXME: misskey関連のmetaタグの設定がない
			// TODO ogタグの検証
		});

		test('がGETできる。(存在しないIDでも。)', async () =>
			await ok({
				path: path('xxxxxxxxxx'),
			}));
	});
});
