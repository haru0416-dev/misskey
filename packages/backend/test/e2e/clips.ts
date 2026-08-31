/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as assert from 'assert';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from 'vitest';
import {
	DEFAULT_POLICIES,
	createNoteInDatabase,
	createUserWithProfileAndPublickeyInDatabase,
	genId,
	openTestDatabase,
	type TestDatabase,
} from '../fixtures.js';
import { api, ApiRequest, failedApiCall, hiddenNote, post, signup, successfulApiCall } from '../utils.js';
import type * as Misskey from 'misskey-js';

type Optional<T, K extends keyof T> = Pick<Partial<T>, K> & Omit<T, K>;

function getAt<T>(values: readonly T[], index: number): T {
	const value = values[index];
	assert.ok(value != null);
	return value;
}

describe('クリップ', () => {
	let alice: Misskey.entities.SignupResponse;
	let bob: Misskey.entities.SignupResponse;
	let aliceNote: Misskey.entities.Note;
	let aliceHomeNote: Misskey.entities.Note;
	let aliceFollowersNote: Misskey.entities.Note;
	let aliceSpecifiedNote: Misskey.entities.Note;
	let bobNote: Misskey.entities.Note;
	let bobHomeNote: Misskey.entities.Note;
	let bobFollowersNote: Misskey.entities.Note;
	let bobSpecifiedNote: Misskey.entities.Note;

	const compareBy =
		<T extends { id: string }>(selector: (s: T) => string = (s: T): string => s.id) =>
		(a: T, b: T): number => {
			return selector(a).localeCompare(selector(b));
		};

	const defaultCreate = (): Pick<Misskey.entities.ClipsCreateRequest, 'name'> => ({
		name: 'test',
	});
	const create = async (
		parameters: Partial<Misskey.entities.ClipsCreateRequest> = {},
		request: Partial<ApiRequest<'clips/create'>> = {},
	): Promise<Misskey.entities.Clip> => {
		const clip = await successfulApiCall({
			endpoint: 'clips/create',
			parameters: {
				...defaultCreate(),
				...parameters,
			},
			user: alice,
			...request,
		});

		expect(clip).toStrictEqual({
			...clip,
			...defaultCreate(),
			...parameters,
		});
		return clip;
	};

	const createMany = async (
		parameters: Partial<Misskey.entities.ClipsCreateRequest>,
		count = 10,
		user = alice,
	): Promise<Misskey.entities.Clip[]> => {
		return await Promise.all(
			[...Array(count)].map((_, i) =>
				create(
					{
						name: `test${i}`,
						...parameters,
					},
					{ user },
				),
			),
		);
	};

	const update = async (
		parameters: Optional<Misskey.entities.ClipsUpdateRequest, 'name'>,
		request: Partial<ApiRequest<'clips/update'>> = {},
	): Promise<Misskey.entities.Clip> => {
		const clip = await successfulApiCall({
			endpoint: 'clips/update',
			parameters: {
				name: 'updated',
				...parameters,
			},
			user: alice,
			...request,
		});

		delete (parameters as { clipId?: string }).clipId;
		expect(clip).toStrictEqual({
			...clip,
			...parameters,
		});
		return clip;
	};

	const deleteClip = async (
		parameters: Misskey.entities.ClipsDeleteRequest,
		request: Partial<ApiRequest<'clips/delete'>> = {},
	): Promise<void> => {
		await successfulApiCall(
			{
				endpoint: 'clips/delete',
				parameters,
				user: alice,
				...request,
			},
			{
				status: 204,
			},
		);
	};

	const show = async (
		parameters: Misskey.entities.ClipsShowRequest,
		request: Partial<ApiRequest<'clips/show'>> = {},
	): Promise<Misskey.entities.Clip> => {
		return await successfulApiCall({
			endpoint: 'clips/show',
			parameters,
			user: alice,
			...request,
		});
	};

	const list = async (request: Partial<ApiRequest<'clips/list'>>): Promise<Misskey.entities.Clip[]> => {
		return successfulApiCall({
			endpoint: 'clips/list',
			parameters: {},
			user: alice,
			...request,
		});
	};

	const usersClips = async (
		parameters: Misskey.entities.UsersClipsRequest,
		request: Partial<ApiRequest<'users/clips'>> = {},
	): Promise<Misskey.entities.Clip[]> => {
		return await successfulApiCall({
			endpoint: 'users/clips',
			parameters,
			user: alice,
			...request,
		});
	};

	let database: TestDatabase;

	beforeAll(
		async () => {
			database = openTestDatabase();
			alice = await signup({ username: 'alice' });
			bob = await signup({ username: 'bob' });

			aliceNote = await post(alice, { text: 'test' });
			aliceHomeNote = await post(alice, { text: 'home only', visibility: 'home' });
			aliceFollowersNote = await post(alice, { text: 'followers only', visibility: 'followers' });
			aliceSpecifiedNote = await post(alice, { text: 'specified only', visibility: 'specified' });
			bobNote = await post(bob, { text: 'test' });
			bobHomeNote = await post(bob, { text: 'home only', visibility: 'home' });
			bobFollowersNote = await post(bob, { text: 'followers only', visibility: 'followers' });
			bobSpecifiedNote = await post(bob, { text: 'specified only', visibility: 'specified' });
		},
		1000 * 60 * 2,
	);

	afterEach(async () => {
		// テスト間で影響し合わないように毎回全部消す。
		for (const user of [alice, bob]) {
			const list = await api('clips/list', { limit: 11 }, user);
			for (const clip of list.body) {
				await api('clips/delete', { clipId: clip.id }, user);
			}
		}
	});

	afterAll(async () => {
		await database.close();
	});

	test('の作成ができる', async () => {
		const res = await create();
		expect(res.createdAt).toBe(new Date(res.createdAt).toISOString());
		expect(res.lastClippedAt).toBe(null);
		expect(res.name).toBe('test');
		expect(res.description).toBe(null);
		expect(res.isPublic).toBe(false);
		expect(res.favoritedCount).toBe(0);
		expect(res.isFavorited).toBe(false);
	});

	test('の作成はポリシーで定められた数以上はできない。', async () => {
		const clipLimit = DEFAULT_POLICIES.clipLimit;
		for (let i = 0; i < clipLimit; i++) {
			await create();
		}

		await failedApiCall(
			{
				endpoint: 'clips/create',
				parameters: defaultCreate(),
				user: alice,
			},
			{
				status: 400,
				code: 'TOO_MANY_CLIPS',
				id: '920f7c2d-6208-4b76-8082-e632020f5883',
			},
		);
	});

	const createClipAllowedPattern = [
		{ label: 'nameが最大長', parameters: { name: 'x'.repeat(100) } },
		{ label: 'private', parameters: { isPublic: false } },
		{ label: 'public', parameters: { isPublic: true } },
		{ label: 'descriptionがnull', parameters: { description: null } },
		{ label: 'descriptionが最大長', parameters: { description: 'a'.repeat(2048) } },
	];
	test.each(createClipAllowedPattern)('の作成は$labelでもできる', async ({ parameters }) => {
		await create(parameters);
	});

	const createClipDenyPattern = [
		{ label: 'nameがnull', parameters: { name: null } },
		{ label: 'nameが最大長+1', parameters: { name: 'x'.repeat(101) } },
		{ label: 'isPublicがboolじゃない', parameters: { isPublic: 'true' } },
		{ label: 'descriptionが最大長+1', parameters: { description: 'a'.repeat(2049) } },
	];
	test.each(createClipDenyPattern)('の作成は$labelならできない', async ({ parameters }) =>
		failedApiCall(
			{
				endpoint: 'clips/create',
				// @ts-expect-error invalid params
				parameters: {
					...defaultCreate(),
					...parameters,
				},
				user: alice,
			},
			{
				status: 400,
				code: 'INVALID_PARAM',
				id: '3d81ceae-475f-4600-b2a8-2bc116157532',
			},
		),
	);

	test('の作成はdescriptionが空文字ならnullになる', async () => {
		const clip = await successfulApiCall({
			endpoint: 'clips/create',
			parameters: {
				...defaultCreate(),
				description: '',
			},
			user: alice,
		});

		expect(clip).toStrictEqual({
			...clip,
			...defaultCreate(),
			description: null,
		});
	});

	test('の更新ができる', async () => {
		const res = await update({
			clipId: (await create()).id,
			name: 'updated',
			description: 'new description',
			isPublic: true,
		});

		expect(res.createdAt).toBe(new Date(res.createdAt).toISOString());
		expect(res.lastClippedAt).toBe(null);
		expect(res.name).toBe('updated');
		expect(res.description).toBe('new description');
		expect(res.isPublic).toBe(true);
		expect(res.favoritedCount).toBe(0);
		expect(res.isFavorited).toBe(false);
	});

	test.each(createClipAllowedPattern)('の更新は$labelでもできる', async ({ parameters }) => {
		await update({
			clipId: (await create()).id,
			name: 'updated',
			...parameters,
		});
	});

	test.each([
		{ label: 'clipIdがnull', parameters: { clipId: null } },
		{
			label: '存在しないクリップ',
			parameters: { clipId: 'xxxxxx' },
			assertion: {
				code: 'NO_SUCH_CLIP',
				id: 'b4d92d70-b216-46fa-9a3f-a8c811699257',
			},
		},
		{
			label: '他人のクリップ',
			user: () => bob,
			assertion: {
				code: 'NO_SUCH_CLIP',
				id: 'b4d92d70-b216-46fa-9a3f-a8c811699257',
			},
		},
		...(createClipDenyPattern as any),
	])('の更新は$labelならできない', async ({ parameters, user, assertion }) =>
		failedApiCall(
			{
				endpoint: 'clips/update',
				parameters: {
					clipId: (await create({}, { user: (user ?? (() => alice))() })).id,
					name: 'updated',
					...parameters,
				},
				user: alice,
			},
			{
				status: 400,
				code: 'INVALID_PARAM',
				id: '3d81ceae-475f-4600-b2a8-2bc116157532',
				...assertion,
			},
		),
	);

	test('の更新はdescriptionが空文字ならnullになる', async () => {
		const clip = await successfulApiCall({
			endpoint: 'clips/update',
			parameters: {
				clipId: (await create()).id,
				name: 'updated',
				description: '',
			},
			user: alice,
		});

		expect(clip).toStrictEqual({
			...clip,
			name: 'updated',
			description: null,
		});
	});

	test('の削除ができる', async () => {
		await deleteClip({
			clipId: (await create()).id,
		});
		expect(await list({})).toStrictEqual([]);
	});

	test.each([
		{ label: 'clipIdがnull', parameters: { clipId: null } },
		{
			label: '存在しないクリップ',
			parameters: { clipId: 'xxxxxx' },
			assertion: {
				code: 'NO_SUCH_CLIP',
				id: '70ca08ba-6865-4630-b6fb-8494759aa754',
			},
		},
		{
			label: '他人のクリップ',
			user: () => bob,
			assertion: {
				code: 'NO_SUCH_CLIP',
				id: '70ca08ba-6865-4630-b6fb-8494759aa754',
			},
		},
	])('の削除は$labelならできない', async ({ parameters, user, assertion }) =>
		failedApiCall(
			{
				endpoint: 'clips/delete',
				parameters: {
					// @ts-expect-error clipId must not be null
					clipId: (await create({}, { user: (user ?? (() => alice))() })).id,
					...parameters,
				},
				user: alice,
			},
			{
				status: 400,
				code: 'INVALID_PARAM',
				id: '3d81ceae-475f-4600-b2a8-2bc116157532',
				...assertion,
			},
		),
	);

	test('のID指定取得ができる', async () => {
		const clip = await create();
		const res = await show({ clipId: clip.id });
		expect(res).toStrictEqual(clip);
	});

	test('のID指定取得は他人のPrivateなクリップは取得できない', async () => {
		const clip = await create({ isPublic: false }, { user: bob });
		await failedApiCall(
			{
				endpoint: 'clips/show',
				parameters: { clipId: clip.id },
				user: alice,
			},
			{
				status: 400,
				code: 'NO_SUCH_CLIP',
				id: 'c3c5fe33-d62c-44d2-9ea5-d997703f5c20',
			},
		);
	});

	test.each([
		{ label: 'clipId未指定', parameters: { clipId: undefined } },
		{
			label: '存在しないクリップ',
			parameters: { clipId: 'xxxxxx' },
			assetion: {
				code: 'NO_SUCH_CLIP',
				id: 'c3c5fe33-d62c-44d2-9ea5-d997703f5c20',
			},
		},
	])('のID指定取得は$labelならできない', async ({ parameters, assetion }) =>
		failedApiCall(
			{
				endpoint: 'clips/show',
				// @ts-expect-error clipId must not be undefined
				parameters: {
					...parameters,
				},
				user: alice,
			},
			{
				status: 400,
				code: 'INVALID_PARAM',
				id: '3d81ceae-475f-4600-b2a8-2bc116157532',
				...assetion,
			},
		),
	);

	test('の一覧(clips/list)が取得できる(空)', async () => {
		const res = await list({});
		expect(res).toStrictEqual([]);
	});

	test('の一覧(clips/list)が取得できる(上限いっぱい)', async () => {
		const clipLimit = DEFAULT_POLICIES.clipLimit;
		const clips = await createMany({}, clipLimit);
		const res = await list({
			parameters: { limit: clips.length },
		});

		// API が順序を保証しないため、ID 順に揃えて比較する。
		expect(res.toReversed()).toStrictEqual(clips.sort(compareBy((s) => s.id)));
	});

	test('の一覧が取得できる(空)', async () => {
		const res = await usersClips({
			userId: alice.id,
		});
		expect(res).toStrictEqual([]);
	});

	test.each([{ label: '' }, { label: '他人アカウントから', user: () => bob }])('の一覧が$label取得できる', async () => {
		const clips = await createMany({ isPublic: true });
		const res = await usersClips({
			userId: alice.id,
		});

		// API が順序を保証しないため、ID 順に揃えて比較する。
		expect(res.sort(compareBy<Misskey.entities.Clip>((s) => s.id))).toStrictEqual(clips.sort(compareBy((s) => s.id)));

		for (const clip of res) {
			expect(clip.isFavorited).toBe(false);
		}
	});

	test.each([
		{ label: '未認証', user: () => undefined },
		{ label: '存在しないユーザーのもの', parameters: { userId: 'xxxxxxx' } },
	])('の一覧は$labelでも取得できる', async ({ parameters, user }) => {
		const clips = await createMany({ isPublic: true });
		const res = await usersClips(
			{
				userId: alice.id,
				limit: clips.length,
				...parameters,
			},
			{
				user: (user ?? (() => alice))(),
			},
		);

		for (const clip of res) {
			expect('isFavorited' in clip).toBe(false);
		}
	});

	test('の一覧はPrivateなクリップを含まない(自分のものであっても。)', async () => {
		await create({ isPublic: false });
		const aliceClip = await create({ isPublic: true });
		const res = await usersClips({
			userId: alice.id,
			limit: 2,
		});
		expect(res).toStrictEqual([aliceClip]);
	});

	test('の一覧はID指定で範囲選択ができる', async () => {
		const clips = await createMany({ isPublic: true }, 7);
		clips.sort(compareBy((s) => s.id));
		const res = await usersClips({
			userId: alice.id,
			sinceId: getAt(clips, 1).id,
			untilId: getAt(clips, 5).id,
			limit: 4,
		});

		// Promise.all の結果順に依存しないよう、ID 順に揃えて比較する。
		expect(
			res.sort(compareBy<Misskey.entities.Clip>((s) => s.id)), // sinceIdとuntilId自体は結果に含まれない
			getAt(clips, 1).id +
				' ... ' +
				getAt(clips, 3).id +
				' with ' +
				clips.map((s) => s.id) +
				' vs. ' +
				res.map((s) => s.id),
		).toStrictEqual([getAt(clips, 2), getAt(clips, 3), getAt(clips, 4)]);
	});

	test.each([
		{ label: 'userId未指定', parameters: { userId: undefined } },
		{ label: 'limitゼロ', parameters: { limit: 0 } },
		{ label: 'limit最大+1', parameters: { limit: 101 } },
	])('の一覧は$labelだと取得できない', async ({ parameters }) =>
		failedApiCall(
			{
				endpoint: 'users/clips',
				parameters: {
					// @ts-expect-error userId must not be undefined
					userId: alice.id,
					...parameters,
				},
				user: alice,
			},
			{
				status: 400,
				code: 'INVALID_PARAM',
				id: '3d81ceae-475f-4600-b2a8-2bc116157532',
			},
		),
	);

	test.each([
		{ label: '作成', endpoint: 'clips/create' as const },
		{ label: '更新', endpoint: 'clips/update' as const },
		{ label: '削除', endpoint: 'clips/delete' as const },
		{ label: '取得', endpoint: 'clips/list' as const },
		{ label: 'お気に入り設定', endpoint: 'clips/favorite' as const },
		{ label: 'お気に入り解除', endpoint: 'clips/unfavorite' as const },
		{ label: 'お気に入り取得', endpoint: 'clips/my-favorites' as const },
		{ label: 'ノート追加', endpoint: 'clips/add-note' as const },
		{ label: 'ノート削除', endpoint: 'clips/remove-note' as const },
	])(
		'の$labelは未認証ではできない',
		async ({ endpoint }) =>
			await failedApiCall(
				{
					endpoint: endpoint,
					parameters: {},
					user: undefined,
				},
				{
					status: 401,
					code: 'CREDENTIAL_REQUIRED',
					id: '1384574d-a912-4b81-8601-c7b1c4085df1',
				},
			),
	);

	describe('のお気に入り', () => {
		let aliceClip: Misskey.entities.Clip;

		const favorite = async (
			parameters: Misskey.entities.ClipsFavoriteRequest,
			request: Partial<ApiRequest<'clips/favorite'>> = {},
		): Promise<void> => {
			await successfulApiCall(
				{
					endpoint: 'clips/favorite',
					parameters,
					user: alice,
					...request,
				},
				{
					status: 204,
				},
			);
		};

		const unfavorite = async (
			parameters: Misskey.entities.ClipsUnfavoriteRequest,
			request: Partial<ApiRequest<'clips/unfavorite'>> = {},
		): Promise<void> => {
			await successfulApiCall(
				{
					endpoint: 'clips/unfavorite',
					parameters,
					user: alice,
					...request,
				},
				{
					status: 204,
				},
			);
		};

		const myFavorites = async (
			request: Partial<ApiRequest<'clips/my-favorites'>> = {},
		): Promise<Misskey.entities.Clip[]> => {
			return successfulApiCall({
				endpoint: 'clips/my-favorites',
				parameters: {},
				user: alice,
				...request,
			});
		};

		beforeEach(async () => {
			aliceClip = await create();
		});

		test('を設定できる。', async () => {
			await favorite({ clipId: aliceClip.id });
			const clip = await show({ clipId: aliceClip.id });
			expect(clip.favoritedCount).toBe(1);
			expect(clip.isFavorited).toBe(true);
		});

		test('はPublicな他人のクリップに設定できる。', async () => {
			const publicClip = await create({ isPublic: true });
			await favorite({ clipId: publicClip.id }, { user: bob });
			const clip = await show({ clipId: publicClip.id }, { user: bob });
			expect(clip.favoritedCount).toBe(1);
			expect(clip.isFavorited).toBe(true);

			const clip2 = await show({ clipId: publicClip.id });
			expect(clip2.favoritedCount).toBe(1);
			expect(clip2.isFavorited).toBe(false);
		});

		test('は1つのクリップに対して複数人が設定できる。', async () => {
			const publicClip = await create({ isPublic: true });
			await favorite({ clipId: publicClip.id }, { user: bob });
			await favorite({ clipId: publicClip.id });
			const clip = await show({ clipId: publicClip.id }, { user: bob });
			expect(clip.favoritedCount).toBe(2);
			expect(clip.isFavorited).toBe(true);

			const clip2 = await show({ clipId: publicClip.id });
			expect(clip2.favoritedCount).toBe(2);
			expect(clip2.isFavorited).toBe(true);
		});

		test('は11を超えて設定できる。', async () => {
			// 所有数のポリシー上限を避け、超過分は他ユーザーの公開クリップで用意する。
			const clips = [
				aliceClip,
				...(await createMany({}, DEFAULT_POLICIES.clipLimit - 1, alice)),
				...(await createMany({ isPublic: true }, DEFAULT_POLICIES.clipLimit, bob)),
			];
			assert.ok(clips.length > 11);
			for (const clip of clips) {
				await favorite({ clipId: clip.id });
			}

			const favorited = await myFavorites();
			expect(favorited.length).toBe(clips.length);
			for (const clip of favorited) {
				expect(clip.favoritedCount).toBe(1);
				expect(clip.isFavorited).toBe(true);
			}
		});

		test('は同じクリップに対して二回設定できない。', async () => {
			await favorite({ clipId: aliceClip.id });
			await failedApiCall(
				{
					endpoint: 'clips/favorite',
					parameters: {
						clipId: aliceClip.id,
					},
					user: alice,
				},
				{
					status: 400,
					code: 'ALREADY_FAVORITED',
					id: '92658936-c625-4273-8326-2d790129256e',
				},
			);
		});

		test.each([
			{ label: 'clipIdがnull', parameters: { clipId: null } },
			{
				label: '存在しないクリップ',
				parameters: { clipId: 'xxxxxx' },
				assertion: {
					code: 'NO_SUCH_CLIP',
					id: '4c2aaeae-80d8-4250-9606-26cb1fdb77a5',
				},
			},
			{
				label: '他人のクリップ',
				user: () => bob,
				assertion: {
					code: 'NO_SUCH_CLIP',
					id: '4c2aaeae-80d8-4250-9606-26cb1fdb77a5',
				},
			},
		])('の設定は$labelならできない', async ({ parameters, user, assertion }) =>
			failedApiCall(
				{
					endpoint: 'clips/favorite',
					parameters: {
						// @ts-expect-error clipId must not be null
						clipId: (await create({}, { user: (user ?? (() => alice))() })).id,
						...parameters,
					},
					user: alice,
				},
				{
					status: 400,
					code: 'INVALID_PARAM',
					id: '3d81ceae-475f-4600-b2a8-2bc116157532',
					...assertion,
				},
			),
		);

		test('を設定解除できる。', async () => {
			await favorite({ clipId: aliceClip.id });
			await unfavorite({ clipId: aliceClip.id });
			const clip = await show({ clipId: aliceClip.id });
			expect(clip.favoritedCount).toBe(0);
			expect(clip.isFavorited).toBe(false);
			expect(await myFavorites()).toStrictEqual([]);
		});

		test.each([
			{ label: 'clipIdがnull', parameters: { clipId: null } },
			{
				label: '存在しないクリップ',
				parameters: { clipId: 'xxxxxx' },
				assertion: {
					code: 'NO_SUCH_CLIP',
					id: '2603966e-b865-426c-94a7-af4a01241dc1',
				},
			},
			{
				label: '他人のクリップ',
				user: () => bob,
				assertion: {
					code: 'NOT_FAVORITED',
					id: '90c3a9e8-b321-4dae-bf57-2bf79bbcc187',
				},
			},
			{
				label: 'お気に入りしていないクリップ',
				assertion: {
					code: 'NOT_FAVORITED',
					id: '90c3a9e8-b321-4dae-bf57-2bf79bbcc187',
				},
			},
		])('の設定解除は$labelならできない', async ({ parameters, user, assertion }) =>
			failedApiCall(
				{
					endpoint: 'clips/unfavorite',
					parameters: {
						// @ts-expect-error clipId must not be null
						clipId: (await create({}, { user: (user ?? (() => alice))() })).id,
						...parameters,
					},
					user: alice,
				},
				{
					status: 400,
					code: 'INVALID_PARAM',
					id: '3d81ceae-475f-4600-b2a8-2bc116157532',
					...assertion,
				},
			),
		);

		test('を取得できる。', async () => {
			await favorite({ clipId: aliceClip.id });
			const favorited = await myFavorites();
			expect(favorited).toStrictEqual([await show({ clipId: aliceClip.id })]);
		});

		test('を取得したとき他人のお気に入りは含まない。', async () => {
			await favorite({ clipId: aliceClip.id });
			const favorited = await myFavorites({ user: bob });
			expect(favorited).toStrictEqual([]);
		});
	});

	describe('に紐づくノート', () => {
		let aliceClip: Misskey.entities.Clip;

		const sampleNotes = (): Misskey.entities.Note[] => [
			aliceNote,
			aliceHomeNote,
			aliceFollowersNote,
			aliceSpecifiedNote,
			bobNote,
			bobHomeNote,
			bobFollowersNote,
			bobSpecifiedNote,
		];

		const addNote = async (
			parameters: Misskey.entities.ClipsAddNoteRequest,
			request: Partial<ApiRequest<'clips/add-note'>> = {},
		): Promise<void> => {
			return successfulApiCall(
				{
					endpoint: 'clips/add-note',
					parameters,
					user: alice,
					...request,
				},
				{
					status: 204,
				},
			) as any as void;
		};

		const removeNote = async (
			parameters: Misskey.entities.ClipsRemoveNoteRequest,
			request: Partial<ApiRequest<'clips/remove-note'>> = {},
		): Promise<void> => {
			return successfulApiCall(
				{
					endpoint: 'clips/remove-note',
					parameters,
					user: alice,
					...request,
				},
				{
					status: 204,
				},
			) as any as void;
		};

		const notes = async (
			parameters: Misskey.entities.ClipsNotesRequest,
			request: Partial<ApiRequest<'clips/notes'>> = {},
		): Promise<Misskey.entities.Note[]> => {
			return successfulApiCall({
				endpoint: 'clips/notes',
				parameters,
				user: alice,
				...request,
			});
		};

		beforeEach(async () => {
			aliceClip = await create();
		});

		test('を追加できる。', async () => {
			await addNote({ clipId: aliceClip.id, noteId: aliceNote.id });
			const res = await show({ clipId: aliceClip.id });
			expect(res.lastClippedAt).toBe(res.lastClippedAt ? new Date(res.lastClippedAt).toISOString() : null);
			expect((await notes({ clipId: aliceClip.id })).map((x) => x.id)).toStrictEqual([aliceNote.id]);

			await addNote({ clipId: aliceClip.id, noteId: bobHomeNote.id });
			await addNote({ clipId: aliceClip.id, noteId: bobFollowersNote.id });
			await addNote({ clipId: aliceClip.id, noteId: bobSpecifiedNote.id });
		});

		test('として同じノートを二回紐づけることはできない', async () => {
			await addNote({ clipId: aliceClip.id, noteId: aliceNote.id });
			await failedApiCall(
				{
					endpoint: 'clips/add-note',
					parameters: {
						clipId: aliceClip.id,
						noteId: aliceNote.id,
					},
					user: alice,
				},
				{
					status: 400,
					code: 'ALREADY_CLIPPED',
					id: '734806c4-542c-463a-9311-15c512803965',
				},
			);
		});

		// 200 件のノート作成を伴うため約 17 秒かかる。
		test('をポリシーで定められた上限いっぱい(200)を超えて追加はできない。', async () => {
			const noteLimit = DEFAULT_POLICIES.noteEachClipsLimit;
			const noteList = (await Promise.all(
				[...Array(noteLimit)].map(
					(_, i) =>
						post(alice, {
							text: `test ${i}`,
						}) as unknown,
				),
			)) as Misskey.entities.Note[];
			await Promise.all(noteList.map((s) => addNote({ clipId: aliceClip.id, noteId: s.id })));

			await failedApiCall(
				{
					endpoint: 'clips/add-note',
					parameters: {
						clipId: aliceClip.id,
						noteId: aliceNote.id,
					},
					user: alice,
				},
				{
					status: 400,
					code: 'TOO_MANY_CLIP_NOTES',
					id: 'f0dba960-ff73-4615-8df4-d6ac5d9dc118',
				},
			);
		});

		test('は他人のクリップへ追加できない。', async () =>
			await failedApiCall(
				{
					endpoint: 'clips/add-note',
					parameters: {
						clipId: aliceClip.id,
						noteId: aliceNote.id,
					},
					user: bob,
				},
				{
					status: 400,
					code: 'NO_SUCH_CLIP',
					id: 'd6e76cc0-a1b5-4c7c-a287-73fa9c716dcf',
				},
			));

		test.each([
			{ label: 'clipId未指定', parameters: { clipId: undefined } },
			{ label: 'noteId未指定', parameters: { noteId: undefined } },
			{
				label: '存在しないクリップ',
				parameters: { clipId: 'xxxxxx' },
				assetion: {
					code: 'NO_SUCH_CLIP',
					id: 'd6e76cc0-a1b5-4c7c-a287-73fa9c716dcf',
				},
			},
			{
				label: '存在しないノート',
				parameters: { noteId: 'xxxxxx' },
				assetion: {
					code: 'NO_SUCH_NOTE',
					id: 'fc8c0b49-c7a3-4664-a0a6-b418d386bb8b',
				},
			},
			{
				label: '他人のクリップ',
				user: () => bob,
				assetion: {
					code: 'NO_SUCH_CLIP',
					id: 'd6e76cc0-a1b5-4c7c-a287-73fa9c716dcf',
				},
			},
		])('の追加は$labelだとできない', async ({ parameters, user, assetion }) =>
			failedApiCall(
				{
					endpoint: 'clips/add-note',
					parameters: {
						// @ts-expect-error clipId must not be undefined
						clipId: aliceClip.id,
						// @ts-expect-error noteId must not be undefined
						noteId: aliceNote.id,
						...parameters,
					},
					user: (user ?? (() => alice))(),
				},
				{
					status: 400,
					code: 'INVALID_PARAM',
					id: '3d81ceae-475f-4600-b2a8-2bc116157532',
					...assetion,
				},
			),
		);

		test('を削除できる。', async () => {
			await addNote({ clipId: aliceClip.id, noteId: aliceNote.id });
			await removeNote({ clipId: aliceClip.id, noteId: aliceNote.id });
			expect(await notes({ clipId: aliceClip.id })).toStrictEqual([]);
		});

		test.each([
			{ label: 'clipId未指定', parameters: { clipId: undefined } },
			{ label: 'noteId未指定', parameters: { noteId: undefined } },
			{
				label: '存在しないクリップ',
				parameters: { clipId: 'xxxxxx' },
				assetion: {
					code: 'NO_SUCH_CLIP',
					id: 'b80525c6-97f7-49d7-a42d-ebccd49cfd52', // add-noteと異なる
				},
			},
			{
				label: '存在しないノート',
				parameters: { noteId: 'xxxxxx' },
				assetion: {
					code: 'NO_SUCH_NOTE',
					id: 'aff017de-190e-434b-893e-33a9ff5049d8', // add-noteと異なる
				},
			},
			{
				label: '他人のクリップ',
				user: () => bob,
				assetion: {
					code: 'NO_SUCH_CLIP',
					id: 'b80525c6-97f7-49d7-a42d-ebccd49cfd52', // add-noteと異なる
				},
			},
		])('の削除は$labelだとできない', async ({ parameters, user, assetion }) =>
			failedApiCall(
				{
					endpoint: 'clips/remove-note',
					parameters: {
						// @ts-expect-error clipId must not be undefined
						clipId: aliceClip.id,
						// @ts-expect-error noteId must not be undefined
						noteId: aliceNote.id,
						...parameters,
					},
					user: (user ?? (() => alice))(),
				},
				{
					status: 400,
					code: 'INVALID_PARAM',
					id: '3d81ceae-475f-4600-b2a8-2bc116157532',
					...assetion,
				},
			),
		);

		test('を取得できる。', async () => {
			const noteList = sampleNotes();
			for (const note of noteList) {
				await addNote({ clipId: aliceClip.id, noteId: note.id });
			}

			const res = await notes({ clipId: aliceClip.id });

			const expects = [aliceNote, aliceHomeNote, aliceFollowersNote, aliceSpecifiedNote, bobNote, bobHomeNote];
			expect(res.sort(compareBy((s) => s.id)).map((x) => x.id)).toStrictEqual(
				expects.sort(compareBy((s) => s.id)).map((x) => x.id),
			);
		});

		test('を始端IDとlimitで取得できる。', async () => {
			const noteList = sampleNotes();
			noteList.sort(compareBy((s) => s.id));
			for (const note of noteList) {
				await addNote({ clipId: aliceClip.id, noteId: note.id });
			}

			const res = await notes({
				clipId: aliceClip.id,
				sinceId: getAt(noteList, 2).id,
				limit: 3,
			});

			// Promise.all の結果順に依存しないよう、ID 順に揃えて比較する。
			const expects = [getAt(noteList, 3), getAt(noteList, 4), getAt(noteList, 5)];
			expect(res.sort(compareBy((s) => s.id)).map((x) => x.id)).toStrictEqual(
				expects.sort(compareBy((s) => s.id)).map((x) => x.id),
			);
		});

		test('をID範囲指定で取得できる。', async () => {
			const noteList = sampleNotes();
			noteList.sort(compareBy((s) => s.id));
			for (const note of noteList) {
				await addNote({ clipId: aliceClip.id, noteId: note.id });
			}

			const res = await notes({
				clipId: aliceClip.id,
				sinceId: getAt(noteList, 1).id,
				untilId: getAt(noteList, 4).id,
			});

			// Promise.all の結果順に依存しないよう、ID 順に揃えて比較する。
			const expects = [getAt(noteList, 2), getAt(noteList, 3)];
			expect(res.sort(compareBy((s) => s.id)).map((x) => x.id)).toStrictEqual(
				expects.sort(compareBy((s) => s.id)).map((x) => x.id),
			);
		});

		test('Remoteのノートもクリップできる。', async () => {
			// 連合先の可用性に依存しないよう、リモートユーザーとノートは DB に直接用意する。
			const suffix = Date.now().toString(36).slice(-8);
			const host = `clip-remote-${suffix}.example`;
			const remoteUserId = genId();
			await createUserWithProfileAndPublickeyInDatabase(database, {
				user: {
					id: remoteUserId,
					username: `clipremote${suffix}`,
					usernameLower: `clipremote${suffix}`,
					host,
					inbox: `https://${host}/inbox`,
					uri: `https://${host}/users/${remoteUserId}`,
				},
				profile: {
					userId: remoteUserId,
					userHost: host,
				},
			});
			const remoteNoteId = genId();
			await createNoteInDatabase(database, {
				id: remoteNoteId,
				userId: remoteUserId,
				userHost: host,
				uri: `https://${host}/notes/${remoteNoteId}`,
				text: 'remote note',
				visibility: 'public',
			});

			await addNote({ clipId: aliceClip.id, noteId: remoteNoteId });
			const res = await notes({ clipId: aliceClip.id });
			expect(res.map((x) => x.id)).toStrictEqual([remoteNoteId]);
		});

		test('は他人のPublicなクリップからも取得できる。', async () => {
			const bobClip = await create({ isPublic: true }, { user: bob });
			await addNote({ clipId: bobClip.id, noteId: aliceNote.id }, { user: bob });
			const res = await notes({ clipId: bobClip.id });
			expect(res.map((x) => x.id)).toStrictEqual([aliceNote.id]);
		});

		test('はPublicなクリップなら認証なしでも取得できる。(非公開ノートは含まれない)', async () => {
			const publicClip = await create({ isPublic: true });
			await addNote({ clipId: publicClip.id, noteId: aliceNote.id });
			await addNote({ clipId: publicClip.id, noteId: aliceHomeNote.id });
			await addNote({ clipId: publicClip.id, noteId: aliceFollowersNote.id });
			await addNote({ clipId: publicClip.id, noteId: aliceSpecifiedNote.id });

			const res = await notes({ clipId: publicClip.id }, { user: undefined });
			const expects = [aliceNote, aliceHomeNote];
			expect(res.sort(compareBy((s) => s.id)).map((x) => x.id)).toStrictEqual(
				expects.sort(compareBy((s) => s.id)).map((x) => x.id),
			);
		});

		test('ミュートしているユーザーのノートはクリップから取得されない。', async () => {
			const viewer = await signup();
			await addNote({ clipId: aliceClip.id, noteId: aliceNote.id });
			await addNote({ clipId: aliceClip.id, noteId: bobNote.id });
			await api('clips/update', { clipId: aliceClip.id, isPublic: true }, alice);

			await api('mute/create', { userId: bob.id }, viewer);
			const res = await notes({ clipId: aliceClip.id }, { user: viewer });
			expect(res.map((x) => x.id)).toStrictEqual([aliceNote.id]);
		});

		test('ブロックされているユーザーからはブロック元のノートがクリップから取得されない。', async () => {
			const viewer = await signup();
			await addNote({ clipId: aliceClip.id, noteId: aliceNote.id });
			await addNote({ clipId: aliceClip.id, noteId: bobNote.id });
			await api('clips/update', { clipId: aliceClip.id, isPublic: true }, alice);

			await api('blocking/create', { userId: viewer.id }, bob);
			const res = await notes({ clipId: aliceClip.id }, { user: viewer });
			expect(res.map((x) => x.id)).toStrictEqual([aliceNote.id]);
		});

		test.each([
			{ label: 'clipId未指定', parameters: { clipId: undefined } },
			{ label: 'limitゼロ', parameters: { limit: 0 } },
			{ label: 'limit最大+1', parameters: { limit: 101 } },
			{
				label: '存在しないクリップ',
				parameters: { clipId: 'xxxxxx' },
				assertion: {
					code: 'NO_SUCH_CLIP',
					id: '1d7645e6-2b6d-4635-b0fe-fe22b0e72e00',
				},
			},
			{
				label: '他人のPrivateなクリップから',
				user: () => bob,
				assertion: {
					code: 'NO_SUCH_CLIP',
					id: '1d7645e6-2b6d-4635-b0fe-fe22b0e72e00',
				},
			},
			{
				label: '未認証でPrivateなクリップから',
				user: () => undefined,
				assertion: {
					code: 'NO_SUCH_CLIP',
					id: '1d7645e6-2b6d-4635-b0fe-fe22b0e72e00',
				},
			},
		])('は$labelだと取得できない', async ({ parameters, user, assertion }) =>
			failedApiCall(
				{
					endpoint: 'clips/notes',
					parameters: {
						// @ts-expect-error clipId must not be undefined
						clipId: aliceClip.id,
						...parameters,
					},
					user: (user ?? (() => alice))(),
				},
				{
					status: 400,
					code: 'INVALID_PARAM',
					id: '3d81ceae-475f-4600-b2a8-2bc116157532',
					...assertion,
				},
			),
		);
	});
});
