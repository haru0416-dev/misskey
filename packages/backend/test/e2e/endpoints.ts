/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import bcrypt from 'bcryptjs';
import { describe, beforeAll, afterAll, test, expect } from 'vitest';
// node-fetch only supports it's own Blob yet
// https://github.com/node-fetch/node-fetch/pull/1664
import { Blob } from 'node-fetch';
import { loadConfig } from '@/config.js';
import { insertEmojiInDatabase } from '@/core/EmojiStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import { createUserPendingInDatabase } from '@/core/UserPendingStore.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { api, castAsError, post, relativeFetch, role, signup, simpleGet, uploadFile } from '../utils.js';
import type * as misskey from 'misskey-js';

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let carol: misskey.entities.SignupResponse;
	let dave: misskey.entities.SignupResponse;
	let db: MiDrizzleDatabase;
	let pool: MiDrizzlePool | undefined;

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		alice = await signup({ username: 'alice' });
		bob = await signup({ username: 'bob' });
		carol = await signup({ username: 'carol' });
		dave = await signup({ username: 'dave' });
		await api('admin/update-meta', { federation: 'all' }, alice as misskey.entities.SignupResponse);
	}, 1000 * 60 * 2);

	afterAll(async () => {
		await pool?.end();
	});

	describe('signup', () => {
		test('不正なユーザー名でアカウントが作成できない', async () => {
			const res = await api('signup', {
				username: 'test.',
				password: 'test',
			});
			assert.strictEqual(res.status, 400);
		});

		test('空のパスワードでアカウントが作成できない', async () => {
			const res = await api('signup', {
				username: 'test',
				password: '',
			});
			assert.strictEqual(res.status, 400);
		});

		test('正しくアカウントが作成できる', async () => {
			const me = {
				username: 'test1',
				password: 'test1',
			};

			const res = await api('signup', me);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.username, me.username);
		});

		test('同じユーザー名のアカウントは作成できない', async () => {
			const res = await api('signup', {
				username: 'test1',
				password: 'test1',
			});

			assert.strictEqual(res.status, 400);
		});
	});

	describe('signup-pending', () => {
		test('pending user can complete signup and sign in', async () => {
			const config = loadConfig();
			const password = 'pending-password';
			const salt = await bcrypt.genSalt(8);
			const pending = await createUserPendingInDatabase(db, {
				id: genId(config),
				code: 'pending-signup-test',
				username: 'pendinguser',
				email: 'pending@example.test',
				password: await bcrypt.hash(password, salt),
			});

			const res = await api('signup-pending', {
				code: pending.code,
			});

			assert.strictEqual(res.status, 200);
			const body = res.body as misskey.entities.SigninFlowResponse & { finished: true };
			assert.strictEqual(body.finished, true);
			assert.strictEqual(typeof body.i, 'string');

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, body.id);
			assert.strictEqual(profile.email, pending.email);
			assert.strictEqual(profile.emailVerified, true);
		});
	});

	describe('api metadata', () => {
		test('endpoints returns known endpoint names', async () => {
			const res = await api('endpoints', {});

			assert.strictEqual(res.status, 200);
			assert.ok(Array.isArray(res.body));
			assert.ok(res.body.includes('endpoint'));
			assert.ok(res.body.includes('endpoints'));
			assert.ok(res.body.includes('i'));
		});

		test('endpoint returns parameter metadata and null for missing endpoint', async () => {
			const res = await api('endpoint', {
				endpoint: 'i/update',
			});

			assert.strictEqual(res.status, 200);
			if (res.body == null) assert.fail('endpoint metadata is missing');
			assert.ok(Array.isArray(res.body.params));
			assert.ok(res.body.params.some(param => param.name === 'name' && param.type === 'String'));

			const missing = await api('endpoint', {
				endpoint: 'missing/endpoint',
			});

			assert.strictEqual(missing.status, 200);
			assert.strictEqual(missing.body, null);
		});
	});

	describe('basic meta endpoints', () => {
		test('ping returns current timestamp', async () => {
			const before = Date.now();
			const res = await api('ping', {});
			const after = Date.now();

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body.pong, 'number');
			assert.ok(res.body.pong >= before);
			assert.ok(res.body.pong <= after);
		});

		test('server-info supports GET and cache header', async () => {
			const res = await relativeFetch('api/server-info');

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=60');

			const body = await res.json() as {
				machine: unknown;
				cpu?: { model?: unknown; cores?: unknown };
				mem?: { total?: unknown };
				fs?: { total?: unknown; used?: unknown };
			};
			assert.strictEqual(typeof body.machine, 'string');
			assert.strictEqual(typeof body.cpu?.model, 'string');
			assert.strictEqual(typeof body.cpu?.cores, 'number');
			assert.strictEqual(typeof body.mem?.total, 'number');
			assert.strictEqual(typeof body.fs?.total, 'number');
			assert.strictEqual(typeof body.fs?.used, 'number');
		});

		test('test endpoint validates params and applies defaults', async () => {
			const res = await api('test', {
				required: true,
			});

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.required, true);
			assert.strictEqual(res.body.default, 'hello');
			assert.strictEqual(res.body.nullableDefault, 'hello');

			const invalid = await relativeFetch('api/test', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ required: 'yes' }),
			});

			assert.strictEqual(invalid.status, 400);
			assert.strictEqual(castAsError(await invalid.json() as Record<string, unknown>).error.code, 'INVALID_PARAM');
		});
	});

	describe('availability endpoints', () => {
		test('username availability reflects existing local users', async () => {
			const available = await api('username/available', {
				username: 'availableuser',
			});
			assert.strictEqual(available.status, 200);
			assert.strictEqual(available.body.available, true);

			const taken = await api('username/available', {
				username: alice.username,
			});
			assert.strictEqual(taken.status, 200);
			assert.strictEqual(taken.body.available, false);

			const invalid = await api('username/available', {
				username: 'invalid.user',
			});
			assert.strictEqual(invalid.status, 400);
		});

		test('email address availability validates format', async () => {
			const available = await api('email-address/available', {
				emailAddress: 'available@example.com',
			});
			assert.strictEqual(available.status, 200);
			assert.strictEqual(available.body.available, true);
			assert.strictEqual(available.body.reason, null);

			const invalid = await api('email-address/available', {
				emailAddress: 'invalid-email',
			});
			assert.strictEqual(invalid.status, 200);
			assert.strictEqual(invalid.body.available, false);
			assert.strictEqual(invalid.body.reason, 'format');
		});

		test('online users count supports GET and cache header', async () => {
			const res = await relativeFetch('api/get-online-users-count');

			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=60');

			const body = await res.json() as { count?: unknown };
			assert.strictEqual(typeof body.count, 'number');
		});
	});

	describe('emoji endpoints', () => {
		test('emojis and emoji return packed local emoji data', async () => {
			const config = loadConfig();
			const emoji = await insertEmojiInDatabase(db, {
				id: genId(config),
				name: 'hono_emoji',
				host: null,
				category: 'frameworks',
				originalUrl: 'https://example.com/original.png',
				publicUrl: 'https://example.com/public.png',
				aliases: ['hono'],
				license: 'example license',
				localOnly: true,
				isSensitive: true,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			const list = await relativeFetch('api/emojis');
			assert.strictEqual(list.status, 200);
			assert.strictEqual(list.headers.get('cache-control'), 'public, max-age=3600');

			const listBody = await list.json() as {
				emojis?: {
					name?: unknown;
					url?: unknown;
					category?: unknown;
					aliases?: unknown;
					localOnly?: unknown;
					isSensitive?: unknown;
				}[];
			};
			const listedEmoji = listBody.emojis?.find(item => item.name === emoji.name);
			assert.ok(listedEmoji);
			assert.strictEqual(listedEmoji.url, emoji.publicUrl);
			assert.strictEqual(listedEmoji.category, emoji.category);
			assert.deepStrictEqual(listedEmoji.aliases, emoji.aliases);
			assert.strictEqual(listedEmoji.localOnly, true);
			assert.strictEqual(listedEmoji.isSensitive, true);

			const detail = await api('emoji', {
				name: emoji.name,
			});
			assert.strictEqual(detail.status, 200);
			assert.strictEqual(detail.body.id, emoji.id);
			assert.strictEqual(detail.body.name, emoji.name);
			assert.strictEqual(detail.body.host, null);
			assert.strictEqual(detail.body.url, emoji.publicUrl);
			assert.strictEqual(detail.body.license, emoji.license);
			assert.strictEqual(detail.body.localOnly, true);
			assert.strictEqual(detail.body.isSensitive, true);

			const detailByGet = await relativeFetch(`api/emoji?name=${emoji.name}`);
			assert.strictEqual(detailByGet.status, 200);
			assert.strictEqual(detailByGet.headers.get('cache-control'), 'public, max-age=3600');
		});
	});

	describe('signin-flow', () => {
		test('間違ったパスワードでサインインできない', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				password: 'bar',
			});

			assert.strictEqual(res.status, 403);
		});

		test('クエリをインジェクションできない', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				// @ts-expect-error password must be string
				password: {
					$gt: '',
				},
			});

			assert.strictEqual(res.status, 400);
		});

		test('正しい情報でサインインできる', async () => {
			const res = await api('signin-flow', {
				username: 'test1',
				password: 'test1',
			});

			assert.strictEqual(res.status, 200);
		});
	});

	describe('signin-with-passkey', () => {
		test('パスキーサインインの challenge を開始できる', async () => {
			const res = await api('signin-with-passkey', {});

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body.context, 'string');
			assert.strictEqual(typeof res.body.option.challenge, 'string');
		});
	});

	describe('auth/session', () => {
		test('legacy auth session flow', async () => {
			const app = await api('app/create', {
				name: 'legacy auth test',
				description: 'legacy auth test',
				permission: ['read:account'],
				callbackUrl: null,
			});
			assert.strictEqual(app.status, 200);
			const appSecret = app.body.secret;
			if (typeof appSecret !== 'string') {
				assert.fail('app secret is missing');
			}

			const generated = await api('auth/session/generate', {
				appSecret,
			});
			assert.strictEqual(generated.status, 200);
			const sessionToken = generated.body.token;
			assert.strictEqual(typeof sessionToken, 'string');
			assert.ok(generated.body.url.endsWith(`/auth/${sessionToken}`));

			const shown = await api('auth/session/show', {
				token: sessionToken,
			});
			assert.strictEqual(shown.status, 200);
			assert.strictEqual(shown.body.token, sessionToken);
			assert.strictEqual(shown.body.app.id, app.body.id);

			const pending = await api('auth/session/userkey', {
				appSecret,
				token: sessionToken,
			});
			assert.strictEqual(pending.status, 400);
			assert.strictEqual(castAsError(pending.body as any).error.code, 'PENDING_SESSION');

			const accepted = await api('auth/accept', {
				token: sessionToken,
			}, alice);
			assert.strictEqual(accepted.status, 204);

			const userkey = await api('auth/session/userkey', {
				appSecret,
				token: sessionToken,
			});
			assert.strictEqual(userkey.status, 200);
			const accessToken = userkey.body.accessToken;
			if (typeof accessToken !== 'string') {
				assert.fail('access token is missing');
			}
			assert.strictEqual(userkey.body.user.id, alice.id);

			const credential = await api('i', {}, {
				token: accessToken,
			});
			assert.strictEqual(credential.status, 200);
			assert.strictEqual(credential.body.id, alice.id);

			const deleted = await api('auth/session/show', {
				token: sessionToken,
			});
			assert.strictEqual(deleted.status, 400);
			assert.strictEqual(castAsError(deleted.body as any).error.code, 'NO_SUCH_SESSION');
		});
	});

	describe('miauth', () => {
		test('session check returns issued token once', async () => {
			const session = 'miauth-session-test';
			const issued = await api('miauth/gen-token', {
				session,
				permission: ['read:account'],
			}, alice);
			assert.strictEqual(issued.status, 200);
			assert.strictEqual(typeof issued.body.token, 'string');

			const checked = await relativeFetch(`api/miauth/${session}/check`, {
				method: 'POST',
			});
			assert.strictEqual(checked.status, 200);
			const checkedBody = await checked.json() as { ok: boolean; token?: string; user?: { id?: string } };
			assert.strictEqual(checkedBody.ok, true);
			assert.strictEqual(checkedBody.token, issued.body.token);
			assert.strictEqual(checkedBody.user?.id, alice.id);

			const checkedAgain = await relativeFetch(`api/miauth/${session}/check`, {
				method: 'POST',
			});
			assert.strictEqual(checkedAgain.status, 200);
			assert.deepStrictEqual(await checkedAgain.json(), { ok: false });
		});
	});

	describe('app', () => {
		test('app/create したアプリを app/show と my/apps で取得できる', async () => {
			const created = await api('app/create', {
				name: 'test app',
				description: 'test app description',
				permission: ['read:account'],
				callbackUrl: null,
			}, alice);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.name, 'test app');

			const shown = await api('app/show', { appId: created.body.id });
			assert.strictEqual(shown.status, 200);
			assert.strictEqual(shown.body.id, created.body.id);
			assert.strictEqual(shown.body.name, 'test app');
			assert.strictEqual(shown.body.callbackUrl, null);
			assert.strictEqual(shown.body.secret, undefined);

			const notFound = await api('app/show', { appId: '0000000000000000' });
			assert.strictEqual(notFound.status, 400);
			assert.strictEqual(castAsError(notFound.body as any).error.code, 'NO_SUCH_APP');

			const mine = await api('my/apps', { limit: 100 }, alice);
			assert.strictEqual(mine.status, 200);
			assert.ok(mine.body.some(app => app.id === created.body.id));
		});
	});

	describe('invite', () => {
		test('invite/create したコードを invite/list で取得でき、invite/delete で削除できる', async () => {
			const inviterRole = await role(alice, {}, { canInvite: { priority: 0, useDefault: false, value: true } });
			await api('admin/roles/assign', { userId: bob.id, roleId: inviterRole.id }, alice);
			await api('admin/roles/assign', { userId: carol.id, roleId: inviterRole.id }, alice);

			const created = await api('invite/create', {}, bob);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.used, false);
			assert.strictEqual(created.body.usedAt, null);
			assert.strictEqual(created.body.createdBy?.id, bob.id);

			const limit = await api('invite/limit', {}, bob);
			assert.strictEqual(limit.status, 200);
			assert.strictEqual(limit.body.remaining, null);

			const list = await api('invite/list', {}, bob);
			assert.strictEqual(list.status, 200);
			assert.ok(list.body.some(ticket => ticket.id === created.body.id));

			const deletedByStranger = await api('invite/delete', { inviteId: created.body.id }, carol);
			assert.strictEqual(deletedByStranger.status, 400);
			assert.strictEqual(castAsError(deletedByStranger.body as any).error.code, 'ACCESS_DENIED');

			const deleted = await api('invite/delete', { inviteId: created.body.id }, bob);
			assert.strictEqual(deleted.status, 204);

			const listAfterDelete = await api('invite/list', {}, bob);
			assert.strictEqual(listAfterDelete.status, 200);
			assert.ok(!listAfterDelete.body.some(ticket => ticket.id === created.body.id));
		});

		test('admin/invite/create したコードを admin/invite/list で取得できる', async () => {
			const created = await api('admin/invite/create', { count: 2 }, alice);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.length, 2);

			const list = await api('admin/invite/list', { type: 'unused' }, alice);
			assert.strictEqual(list.status, 200);
			for (const ticket of created.body) {
				assert.ok(list.body.some(x => x.id === ticket.id));
			}
		});
	});

	describe('i/update', () => {
		test('アカウント設定を更新できる', async () => {
			const myName = '大室櫻子';
			const myLocation = '七森中';
			const myBirthday = '2000-09-07';

			const res = await api('i/update', {
				name: myName,
				location: myLocation,
				birthday: myBirthday,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, myName);
			assert.strictEqual(res.body.location, myLocation);
			assert.strictEqual(res.body.birthday, myBirthday);
		});

		test('名前を空白のみにした場合nullになる', async () => {
			const res = await api('i/update', {
				name: ' ',
			}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.name, null);
		});

		test('名前の前後に空白（ホワイトスペース）を入れてもトリムされる', async () => {
			const res = await api('i/update', {
				// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#white_space
				name: ' あ い う \u0009\u000b\u000c\u0020\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u202f\u205f\u3000\ufeff',
			}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.body.name, 'あ い う');
		});

		test('誕生日の設定を削除できる', async () => {
			await api('i/update', {
				birthday: '2000-09-07',
			}, alice);

			const res = await api('i/update', {
				birthday: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.birthday, null);
		});

		test('不正な誕生日の形式で怒られる', async () => {
			const res = await api('i/update', {
				birthday: '2000/09/07',
			}, alice);
			assert.strictEqual(res.status, 400);
		});
	});

	describe('users/show', () => {
		test('ユーザーが取得できる', async () => {
			const res = await api('users/show', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual((res.body as unknown as { id: string }).id, alice.id);
		});

		test('ユーザーが存在しなかったら怒る', async () => {
			const res = await api('users/show', {
				userId: '000000000000000000000000',
			});
			assert.strictEqual(res.status, 404);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('users/show', {
				userId: 'kyoppie',
			});
			assert.strictEqual(res.status, 404);
		});
	});

	describe('notes/show', () => {
		test('投稿が取得できる', async () => {
			const myPost = await post(alice, {
				text: 'test',
			});

			const res = await api('notes/show', {
				noteId: myPost.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.id, myPost.id);
			assert.strictEqual(res.body.text, myPost.text);
		});

		test('投稿が存在しなかったら怒る', async () => {
			const res = await api('notes/show', {
				noteId: '000000000000000000000000',
			});
			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('notes/show', {
				noteId: 'kyoppie',
			});
			assert.strictEqual(res.status, 400);
		});
	});

	describe('notes/reactions/create', () => {
		test('リアクションできる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);

			const resNote = await api('notes/show', {
				noteId: bobPost.id,
			}, alice);

			assert.strictEqual(resNote.status, 200);
			assert.strictEqual(resNote.body.reactions['🚀'], 1);
		});

		test('自分の投稿にもリアクションできる', async () => {
			const myPost = await post(alice, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: myPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('二重にリアクションすると上書きされる', async () => {
			const bobPost = await post(bob, { text: 'hi' });

			await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🥰',
			}, alice);

			const res = await api('notes/reactions/create', {
				noteId: bobPost.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);

			const resNote = await api('notes/show', {
				noteId: bobPost.id,
			}, alice);

			assert.strictEqual(resNote.status, 200);
			assert.deepStrictEqual(resNote.body.reactions, { '🚀': 1 });
		});

		test('存在しない投稿にはリアクションできない', async () => {
			const res = await api('notes/reactions/create', {
				noteId: '000000000000000000000000',
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('リノートにリアクションできない', async () => {
			const bobNote = await post(bob, { text: 'hi' });
			const bobRenote = await post(bob, { renoteId: bobNote.id });

			const res = await api('notes/reactions/create', {
				noteId: bobRenote.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.ok(res.body);
			assert.strictEqual(castAsError(res.body).error.code, 'CANNOT_REACT_TO_RENOTE');
		});

		test('引用にリアクションできる', async () => {
			const bobNote = await post(bob, { text: 'hi' });
			const bobRenote = await post(bob, { text: 'hi again', renoteId: bobNote.id });

			const res = await api('notes/reactions/create', {
				noteId: bobRenote.id,
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 204);
		});

		test('空文字列のリアクションは\u2764にフォールバックされる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobNote.id,
				reaction: '',
			}, alice);

			assert.strictEqual(res.status, 204);

			const reaction = await api('notes/reactions', {
				noteId: bobNote.id,
			});

			assert.strictEqual(reaction.body.length, 1);
			assert.strictEqual(reaction.body[0].type, '\u2764');
		});

		test('絵文字ではない文字列のリアクションは\u2764にフォールバックされる', async () => {
			const bobNote = await post(bob, { text: 'hi' });

			const res = await api('notes/reactions/create', {
				noteId: bobNote.id,
				reaction: 'Hello!',
			}, alice);

			assert.strictEqual(res.status, 204);

			const reaction = await api('notes/reactions', {
				noteId: bobNote.id,
			});

			assert.strictEqual(reaction.body.length, 1);
			assert.strictEqual(reaction.body[0].type, '\u2764');
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error param must not be empty
			const res = await api('notes/reactions/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('notes/reactions/create', {
				noteId: 'kyoppie',
				reaction: '🚀',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('following/create', () => {
		test('フォローできる', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 200);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			assert.strictEqual(newBob.followersCount, 0);
			assert.strictEqual(newBob.followingCount, 1);
			const newAlice = await fetchUserByIdOrFailFromDatabase(db, alice.id);
			assert.strictEqual(newAlice.followersCount, 1);
			assert.strictEqual(newAlice.followingCount, 0);
		});

		test('既にフォローしている場合は怒る', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないユーザーはフォローできない', async () => {
			const res = await api('following/create', {
				userId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('自分自身はフォローできない', async () => {
			const res = await api('following/create', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('following/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('following/create', {
				userId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('following/delete', () => {
		test('フォロー解除できる', async () => {
			await api('following/create', {
				userId: alice.id,
			}, bob);

			const res = await api('following/delete', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 200);

			const newBob = await fetchUserByIdOrFailFromDatabase(db, bob.id);
			assert.strictEqual(newBob.followersCount, 0);
			assert.strictEqual(newBob.followingCount, 0);
			const newAlice = await fetchUserByIdOrFailFromDatabase(db, alice.id);
			assert.strictEqual(newAlice.followersCount, 0);
			assert.strictEqual(newAlice.followingCount, 0);
		});

		test('フォローしていない場合は怒る', async () => {
			const res = await api('following/delete', {
				userId: alice.id,
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないユーザーはフォロー解除できない', async () => {
			const res = await api('following/delete', {
				userId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('自分自身はフォロー解除できない', async () => {
			const res = await api('following/delete', {
				userId: alice.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('空のパラメータで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('following/delete', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('following/delete', {
				userId: 'kyoppie',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('channels/search', () => {
		test('空白検索で一覧を取得できる', async () => {
			await api('channels/create', {
				name: 'aaa',
				description: 'bbb',
			}, bob);
			await api('channels/create', {
				name: 'ccc1',
				description: 'ddd1',
			}, bob);
			await api('channels/create', {
				name: 'ccc2',
				description: 'ddd2',
			}, bob);

			const res = await api('channels/search', {
				query: '',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 3);
		});
		test('名前のみの検索で名前を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'aaa',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'aaa');
		});
		test('名前のみの検索で名前を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
		test('名前のみの検索で説明は検索できない', async () => {
			const res = await api('channels/search', {
				query: 'bbb',
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 0);
		});
		test('名前と説明の検索で名前を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc1',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'ccc1');
		});
		test('名前と説明での検索で説明を検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ddd1',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].name, 'ccc1');
		});
		test('名前と説明の検索で名前を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ccc',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
		test('名前と説明での検索で説明を複数検索できる', async () => {
			const res = await api('channels/search', {
				query: 'ddd',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
	});

	describe('drive', () => {
		test('ドライブ情報を取得できる', async () => {
			const res = await api('drive', {}, alice);
			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			expect(res.body).toHaveProperty('usage', 0);
		});
	});

	describe('drive/files/create', () => {
		const assignRole = async (userId: string, policies: Record<string, unknown>) => {
			const createdRole = await role(alice, {}, policies);

			const assign = await api('admin/roles/assign', {
				userId,
				roleId: createdRole.id,
			}, alice);

			assert.strictEqual(assign.status, 204);

			return createdRole;
		};

		const cleanupRole = async (userId: string, roleId: string) => {
			await api('admin/roles/unassign', {
				userId,
				roleId,
			}, alice);

			await api('admin/roles/delete', {
				roleId,
			}, alice);
		};

		test('ファイルを作成できる', async () => {
			const res = await uploadFile(alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, '192.jpg');
		});

		test('ファイルに名前を付けられる', async () => {
			const res = await uploadFile(alice, { name: 'Belmond.jpg' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'Belmond.jpg');
		});

		test('ファイルに名前を付けられるが、拡張子は正しいものになる', async () => {
			const res = await uploadFile(alice, { name: 'Belmond.png' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'Belmond.png.jpg');
		});

		test('ファイル無しで怒られる', async () => {
			// @ts-expect-error params must not be empty
			const res = await api('drive/files/create', {}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('SVGファイルを作成できる', async () => {
			const res = await uploadFile(alice, { path: 'image.svg' });

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body!.name, 'image.svg');
			assert.strictEqual(res.body!.type, 'image/svg+xml');
		});

		for (const type of ['webp', 'avif']) {
			const mediaType = `image/${type}`;

			const getWebpublicType = async (user: misskey.entities.SignupResponse, fileId: string): Promise<string> => {
				// drive/files/create does not expose webpublicType directly, so get it by posting it
				const res = await post(user, {
					text: mediaType,
					fileIds: [fileId],
				});
				const apRes = await simpleGet(`notes/${res.id}`, 'application/activity+json');
				assert.strictEqual(apRes.status, 200);
				assert.ok(Array.isArray(apRes.body.attachment));
				return apRes.body.attachment[0].mediaType;
			};

			test(`透明な${type}ファイルを作成できる`, async () => {
				const path = `with-alpha.${type}`;
				const res = await uploadFile(alice, { path });

				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body!.name, path);
				assert.strictEqual(res.body!.type, mediaType);

				const webpublicType = await getWebpublicType(alice, res.body!.id);
				assert.strictEqual(webpublicType, 'image/webp');
			});

			test(`透明じゃない${type}ファイルを作成できる`, async () => {
				const path = `without-alpha.${type}`;
				const res = await uploadFile(alice, { path });
				assert.strictEqual(res.status, 200);
				assert.strictEqual(res.body!.name, path);
				assert.strictEqual(res.body!.type, mediaType);

				const webpublicType = await getWebpublicType(alice, res.body!.id);
				assert.strictEqual(webpublicType, 'image/webp');
			});
		}

		test('uploadableFileTypes が */* なら任意のファイルをアップロードできる', async () => {
			const createdRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(10)]),
				});

				assert.strictEqual(res.status, 200);
			} finally {
				await cleanupRole(bob.id, createdRole.id);
			}
		});

		test('uploadableFileTypes に含まれない MIME type は拒否される', async () => {
			const createdRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['image/png'],
				},
			});

			try {
				const res = await uploadFile(bob, { path: '192.jpg' });

				assert.strictEqual(res.status, 400);
				assert.ok(res.body);
				assert.strictEqual(castAsError(res.body).error.code, 'UNALLOWED_FILE_TYPE');
			} finally {
				await cleanupRole(bob.id, createdRole.id);
			}
		});

		test('maxFileSizeMb 制限付きロールでも制限内ならアップロードできる', async () => {
			const allowAllTypesRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});
			const tinyAttachmentRole = await assignRole(bob.id, {
				maxFileSizeMb: {
					useDefault: false,
					priority: 1,
					value: 10 / 1024 / 1024, // 10バイト
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(10)]),
				});

				assert.strictEqual(res.status, 200);
			} finally {
				await cleanupRole(bob.id, tinyAttachmentRole.id);
				await cleanupRole(bob.id, allowAllTypesRole.id);
			}
		});

		test('maxFileSizeMb 制限を超えると 413 になる', async () => {
			const allowAllTypesRole = await assignRole(bob.id, {
				uploadableFileTypes: {
					useDefault: false,
					priority: 1,
					value: ['*/*'],
				},
			});
			const tinyAttachmentRole = await assignRole(bob.id, {
				maxFileSizeMb: {
					useDefault: false,
					priority: 1,
					value: 10 / 1024 / 1024, // 10バイト
				},
			});

			try {
				const res = await uploadFile(bob, {
					blob: new Blob([new Uint8Array(11)]),
				});

				assert.strictEqual(res.status, 413);
				assert.ok(res.body);
				assert.strictEqual(castAsError(res.body).error.code, 'MAX_FILE_SIZE_EXCEEDED');
			} finally {
				await cleanupRole(bob.id, tinyAttachmentRole.id);
				await cleanupRole(bob.id, allowAllTypesRole.id);
			}
		});
	});

	describe('drive/files/update', () => {
		test('名前を更新できる', async () => {
			const file = (await uploadFile(alice)).body;
			const newName = 'いちごパスタ.png';

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: newName,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, newName);
		});

		test('他人のファイルは更新できない', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: 'いちごパスタ.png',
			}, bob);

			assert.strictEqual(res.status, 400);
		});

		test('親フォルダを更新できる', async () => {
			const file = (await uploadFile(alice)).body;
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.folderId, folder.id);
		});

		test('親フォルダを無しにできる', async () => {
			const file = (await uploadFile(alice)).body;

			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.folderId, null);
		});

		test('他人のフォルダには入れられない', async () => {
			const file = (await uploadFile(alice)).body;
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, bob)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: folder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないフォルダで怒られる', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なフォルダIDで怒られる', async () => {
			const file = (await uploadFile(alice)).body;

			const res = await api('drive/files/update', {
				fileId: file!.id,
				folderId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('ファイルが存在しなかったら怒る', async () => {
			const res = await api('drive/files/update', {
				fileId: '000000000000000000000000',
				name: 'いちごパスタ.png',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なファイル名で怒られる', async () => {
			const file = (await uploadFile(alice)).body;
			const newName = '';

			const res = await api('drive/files/update', {
				fileId: file!.id,
				name: newName,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('間違ったIDで怒られる', async () => {
			const res = await api('drive/files/update', {
				fileId: 'kyoppie',
				name: 'いちごパスタ.png',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('drive/folders/create', () => {
		test('フォルダを作成できる', async () => {
			const res = await api('drive/folders/create', {
				name: 'test',
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'test');
		});
	});

	describe('drive/folders/update', () => {
		test('名前を更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				name: 'new name',
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.name, 'new name');
		});

		test('他人のフォルダを更新できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, bob)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				name: 'new name',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('親フォルダを更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.parentId, parentFolder.id);
		});

		test('親フォルダを無しに更新できる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: null,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && !Array.isArray(res.body), true);
			assert.strictEqual(res.body.parentId, null);
		});

		test('他人のフォルダを親フォルダに設定できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, bob)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const parentFolder = (await api('drive/folders/create', {
				name: 'parent',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: parentFolder.id,
				parentId: folder.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: parentFolder.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない(再帰的)', async () => {
			const folderA = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const folderB = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			const folderC = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;
			await api('drive/folders/update', {
				folderId: folderB.id,
				parentId: folderA.id,
			}, alice);
			await api('drive/folders/update', {
				folderId: folderC.id,
				parentId: folderB.id,
			}, alice);

			const res = await api('drive/folders/update', {
				folderId: folderA.id,
				parentId: folderC.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('フォルダが循環するような構造にできない(自身)', async () => {
			const folderA = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folderA.id,
				parentId: folderA.id,
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しない親フォルダを設定できない', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正な親フォルダIDで怒られる', async () => {
			const folder = (await api('drive/folders/create', {
				name: 'test',
			}, alice)).body;

			const res = await api('drive/folders/update', {
				folderId: folder.id,
				parentId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('存在しないフォルダを更新できない', async () => {
			const res = await api('drive/folders/update', {
				folderId: '000000000000000000000000',
			}, alice);

			assert.strictEqual(res.status, 400);
		});

		test('不正なフォルダIDで怒られる', async () => {
			const res = await api('drive/folders/update', {
				folderId: 'foo',
			}, alice);

			assert.strictEqual(res.status, 400);
		});
	});

	describe('notes/replies', () => {
		test('自分に閲覧権限のない投稿は含まれない', async () => {
			const alicePost = await post(alice, {
				text: 'foo',
			});

			await post(bob, {
				replyId: alicePost.id,
				text: 'bar',
				visibility: 'specified',
				visibleUserIds: [alice.id],
			});

			const res = await api('notes/replies', {
				noteId: alicePost.id,
			}, carol);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 0);
		});
	});

	describe('notes/timeline', () => {
		test('フォロワー限定投稿が含まれる', async () => {
			await api('following/create', {
				userId: carol.id,
			}, dave);

			const carolPost = await post(carol, {
				text: 'foo',
				visibility: 'followers',
			});

			const res = await api('notes/timeline', {}, dave);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].id, carolPost.id);
		});
	});

	describe('URL preview', () => {
		test('Error from summaly becomes HTTP 422', async () => {
			const res = await simpleGet('/url?url=https://e:xample.com');
			assert.strictEqual(res.status, 422);
			assert.strictEqual(res.body.error.code, 'URL_PREVIEW_FAILED');
		});
	});

	describe('パーソナルメモ機能のテスト', () => {
		test('他者に関するメモを更新できる', async () => {
			const memo = '10月まで低浮上とのこと。';

			const res1 = await api('users/update-memo', {
				memo,
				userId: bob.id,
			}, alice);

			const res2 = await api('users/show', {
				userId: bob.id,
			}, alice);
			assert.strictEqual(res1.status, 204);
			assert.strictEqual((res2.body as unknown as { memo: string })?.memo, memo);
		});

		test('自分に関するメモを更新できる', async () => {
			const memo = 'チケットを月末までに買う。';

			const res1 = await api('users/update-memo', {
				memo,
				userId: alice.id,
			}, alice);

			const res2 = await api('users/show', {
				userId: alice.id,
			}, alice);
			assert.strictEqual(res1.status, 204);
			assert.strictEqual((res2.body as unknown as { memo: string })?.memo, memo);
		});

		test('メモを削除できる', async () => {
			const memo = '10月まで低浮上とのこと。';

			await api('users/update-memo', {
				memo,
				userId: bob.id,
			}, alice);

			await api('users/update-memo', {
				memo: '',
				userId: bob.id,
			}, alice);

			const res = await api('users/show', {
				userId: bob.id,
			}, alice);

			// memoには常に文字列かnullが入っている(5cac151)
			assert.strictEqual((res.body as unknown as { memo: string | null }).memo, null);
		});

		test('メモは個人ごとに独立して保存される', async () => {
			const memoAliceToBob = '10月まで低浮上とのこと。';
			const memoCarolToBob = '例の件について今度問いただす。';

			await Promise.all([
				api('users/update-memo', {
					memo: memoAliceToBob,
					userId: bob.id,
				}, alice),
				api('users/update-memo', {
					memo: memoCarolToBob,
					userId: bob.id,
				}, carol),
			]);

			const [resAlice, resCarol] = await Promise.all([
				api('users/show', {
					userId: bob.id,
				}, alice),
				api('users/show', {
					userId: bob.id,
				}, carol),
			]);

			assert.strictEqual((resAlice.body as unknown as { memo: string }).memo, memoAliceToBob);
			assert.strictEqual((resCarol.body as unknown as { memo: string }).memo, memoCarolToBob);
		});
	});
});
