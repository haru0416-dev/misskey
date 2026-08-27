/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, randomUUID } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as assert from 'assert';
import * as Bull from 'bullmq';
import { afterAll, beforeAll, describe, expect, test, vi } from 'vitest';
import type {
	DbJobData,
	DeliverJobData,
	InboxJobData,
	ObjectStorageJobData,
	PostScheduledNoteJobData,
	RelationshipJobData,
	SystemWebhookDeliverJobData,
} from '@/queue/types.js';
import {
	announcementReadExistsInDatabase,
	channelFavoriteExistsInDatabase,
	channelFollowingExistsInDatabase,
	channelMutingExistsInDatabase,
	clipFavoriteExistsInDatabase,
	countAntennasByUserIdFromDatabase,
	createAbuseUserReportInDatabase,
	createAnnouncementInDatabase,
	createAnnouncementReadInDatabase,
	createAvatarDecorationInDatabase,
	createBlockingInDatabase,
	createChannelFavoriteInDatabase,
	createChannelFollowingInDatabase,
	createChannelInDatabase,
	createChannelMutingInDatabase,
	createClipInDatabase,
	createDriveFileInDatabase,
	createDriveFolderInDatabase,
	createFlashInDatabase,
	createFollowingInDatabase,
	createFollowRequestInDatabase,
	createInstanceInDatabase,
	createLocalSignupAccount,
	createModerationLogInDatabase,
	createNoteDraftInDatabase,
	createNoteInDatabase,
	createNoteReactionInDatabase,
	createPageInDatabase,
	createPasswordResetRequestInDatabase,
	createPollInDatabase,
	createRegistrationTicketInDatabase,
	createRelayInDatabase,
	createRetentionAggregationInDatabase,
	createRoleAssignmentInDatabase,
	createRoleInDatabase,
	createSigninInDatabase,
	createSwSubscriptionInDatabase,
	createUserInDatabase,
	createUserListInDatabase,
	createUserListMembershipInDatabase,
	createUserPendingInDatabase,
	createUserSecurityKeyInDatabase,
	createUserWithProfileAndPublickeyInDatabase,
	createWebhookInDatabase,
	DEFAULT_POLICIES,
	deleteBlockingByIdFromDatabase,
	deleteQueueOutboxesByIds,
	deleteUserListByIdInDatabase,
	dispatchQueueOutbox,
	fetchAbuseUserReportByIdOrFailFromDatabase,
	fetchBlockingByBlockerIdAndBlockeeIdFromDatabase,
	fetchDriveFileByIdFromDatabase,
	fetchDriveFileByUrlFromDatabase,
	fetchDriveFolderByIdFromDatabase,
	fetchEmojiByIdFromDatabase,
	fetchEmojiByIdOrFailFromDatabase,
	fetchFlashByIdFromDatabase,
	fetchFollowingByFollowerIdAndFolloweeIdFromDatabase,
	fetchFollowRequestFromDatabase,
	fetchGalleryPostByIdFromDatabase,
	fetchInstanceByHostFromDatabase,
	fetchLocalUserByUsernameFromDatabase,
	fetchMetaFromDatabase,
	fetchMutingByMuterIdAndMuteeIdFromDatabase,
	fetchNoteByIdFromDatabase,
	fetchNoteDraftByIdFromDatabase,
	fetchPollByNoteIdOrFailFromDatabase,
	fetchQueueOutboxByIdFromDatabase,
	fetchRelayByInboxFromDatabase,
	fetchRenoteMutingFromDatabase,
	fetchRoleAssignmentByUserIdAndRoleIdFromDatabase,
	fetchSystemWebhookByIdFromDatabase,
	fetchUserByIdOrFailFromDatabase,
	fetchUserListByIdAndUserIdFromDatabase,
	fetchUserListByNameAndUserIdFromDatabase,
	fetchUserProfileByUserIdOrFailFromDatabase,
	fetchWebhookByIdAndUserIdFromDatabase,
	fixtureConfig,
	flashLikeExistsInDatabase,
	genId,
	insertEmojiInDatabase,
	insertHashtags,
	insertQueueOutboxes,
	insertUserIps,
	isPromoNoteExists,
	isPromoReadExists,
	listModerationLogsFromDatabase,
	listPollVotesByNoteAndUserFromDatabase,
	listUserNotePiningsByUserIdFromDatabase,
	openTestDatabase,
	pageLikeExistsInDatabase,
	RootUserAlreadyAssignedError,
	type TestDatabase,
	updateChannelInDatabase,
	updateDriveFileInDatabase,
	updateUserInDatabase,
	updateUserProfileInDatabase,
	userListFavoriteExistsInDatabase,
	userListMembershipExistsInDatabase,
} from '../fixtures.js';
import {
	api,
	castAsError,
	createAppToken,
	origin,
	POLL,
	post,
	relativeFetch,
	role,
	signup,
	simpleGet,
	uploadFile,
} from '../utils.js';
import type * as misskey from 'misskey-js';
import { createEndpointsContext, type EndpointsContext, getAt } from '../endpoints-context.js';

/*
 * アサーションは vitest の expect に寄せているが、判別可能ユニオンの分岐を確定させる箇所だけ
 * node:assert を使う。expect の matcher は `asserts` 述語を持たないため、判別子を検査しても
 * 後続のプロパティアクセスが型エラーになる。
 */

describe('Endpoints', () => {
	let alice: misskey.entities.SignupResponse;
	let bob: misskey.entities.SignupResponse;
	let db: TestDatabase;
	let dbQueue: Bull.Queue<DbJobData<'importCustomEmojis' | 'deleteAccount'>> | undefined;
	let context: EndpointsContext;

	beforeAll(
		async () => {
			context = await createEndpointsContext();
			({ alice, bob, db, dbQueue } = context);
		},
		1000 * 60 * 2,
	);

	afterAll(async () => {
		await context.close();
	});

	describe('emoji endpoints', () => {
		test('emojis and emoji return packed local emoji data', async () => {
			const config = fixtureConfig;
			const emoji = await insertEmojiInDatabase(db, {
				id: genId(),
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
			expect(list.status).toBe(200);
			expect(list.headers.get('cache-control')).toBe('public, max-age=3600');

			const listBody = (await list.json()) as {
				emojis?: {
					name?: unknown;
					url?: unknown;
					category?: unknown;
					aliases?: unknown;
					localOnly?: unknown;
					isSensitive?: unknown;
				}[];
			};
			const listedEmoji = listBody.emojis?.find((item) => item.name === emoji.name);
			assert.ok(listedEmoji);
			expect(listedEmoji.url).toBe(emoji.publicUrl);
			expect(listedEmoji.category).toBe(emoji.category);
			expect(listedEmoji.aliases).toStrictEqual(emoji.aliases);
			expect(listedEmoji.localOnly).toBe(true);
			expect(listedEmoji.isSensitive).toBe(true);

			const detail = await api('emoji', {
				name: emoji.name,
			});
			expect(detail.status).toBe(200);
			expect(detail.body.id).toBe(emoji.id);
			expect(detail.body.name).toBe(emoji.name);
			expect(detail.body.host).toBe(null);
			expect(detail.body.url).toBe(emoji.publicUrl);
			expect(detail.body.license).toBe(emoji.license);
			expect(detail.body.localOnly).toBe(true);
			expect(detail.body.isSensitive).toBe(true);

			const detailByGet = await relativeFetch(`api/emoji?name=${emoji.name}`);
			expect(detailByGet.status).toBe(200);
			expect(detailByGet.headers.get('cache-control')).toBe('public, max-age=3600');

			const missing = await api('emoji', { name: `missing_${Date.now().toString(36)}` });
			expect(missing.status).toBe(404);
			expect(castAsError(missing.body as any).error.id).toBe('e2785b66-dca3-4087-9cac-b93c541cc425');
		});
	});

	describe('avatar decoration endpoints', () => {
		test('get-avatar-decorations filters unavailable role ids', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const createdRole = await createRoleInDatabase(db, {
				id: genId(now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `avatar decoration role ${now}`,
				description: 'avatar decoration endpoint test',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: 'ebef1684-672d-49b6-ad82-1b3ec3784f85',
					type: 'isRemote',
				},
				isPublic: false,
				isAdministrator: false,
				isModerator: false,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 1,
				policies: {},
			});
			const decoration = await createAvatarDecorationInDatabase(db, {
				id: genId(now + 1),
				name: `decoration ${now}`,
				description: 'avatar decoration',
				url: 'https://example.com/avatar-decoration.png',
				roleIdsThatCanBeUsedThisDecoration: [createdRole.id, 'missing-role-id'],
				category: 'hono',
			});

			const res = await api('get-avatar-decorations', {});
			expect(res.status).toBe(200);
			const listed = res.body.find((item) => item.id === decoration.id);
			assert.ok(listed);
			expect(listed.name).toBe(decoration.name);
			expect(listed.description).toBe(decoration.description);
			expect(listed.url).toBe(decoration.url);
			expect(listed.roleIdsThatCanBeUsedThisDecoration).toStrictEqual([createdRole.id]);
			expect(listed.category).toBe(decoration.category);
		});
	});

	describe('admin/emoji', () => {
		test('admin/emoji/list と list-remote は filter、pagination、packing、scope、role policyを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haem${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const localFirst = await insertEmojiInDatabase(db, {
				id: genId(now - 2000),
				name: `honoemoji_first_${suffix}`,
				host: null,
				aliases: [`alias_${suffix}`],
				category: `category_${suffix}`,
				originalUrl: `${origin}/emoji/${suffix}/first-original.webp`,
				publicUrl: '',
				license: `license ${suffix}`,
				isSensitive: true,
				localOnly: true,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const localSecond = await insertEmojiInDatabase(db, {
				id: genId(now - 1000),
				name: `honoemoji_second_${suffix}`,
				host: null,
				aliases: [],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/second-original.webp`,
				publicUrl: `${origin}/emoji/${suffix}/second-public.webp`,
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const remoteHost = `hono-emoji-${suffix}.example`;
			const remoteOlder = await insertEmojiInDatabase(db, {
				id: genId(now - 1500),
				name: `remote_old_${suffix}`,
				host: remoteHost,
				aliases: [],
				category: `remote_${suffix}`,
				originalUrl: `https://${remoteHost}/emoji/old.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const remoteNewer = await insertEmojiInDatabase(db, {
				id: genId(now - 500),
				name: `remote_new_${suffix}`,
				host: remoteHost,
				aliases: [],
				category: `remote_${suffix}`,
				originalUrl: `https://${remoteHost}/emoji/new-original.webp`,
				publicUrl: `https://${remoteHost}/emoji/new-public.webp`,
				license: `remote license ${suffix}`,
				isSensitive: true,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const listed = await api(
					'admin/emoji/list',
					{
						limit: 10,
						query: suffix,
						sinceDate: now - 3000,
					},
					manager,
				);
				expect(listed.status).toBe(200);
				const localEmojis = listed.body as any[];
				expect(localEmojis.map((emoji) => emoji.id)).toStrictEqual([localFirst.id, localSecond.id]);
				expect(localEmojis[0].name).toBe(localFirst.name);
				expect(localEmojis[0].aliases).toStrictEqual([`alias_${suffix}`]);
				expect(localEmojis[0].category).toBe(`category_${suffix}`);
				expect(localEmojis[0].url).toBe(localFirst.originalUrl);
				expect(localEmojis[0].license).toBe(`license ${suffix}`);
				expect(localEmojis[0].isSensitive).toBe(true);
				expect(localEmojis[0].localOnly).toBe(true);
				expect(localEmojis[0].roleIdsThatCanBeUsedThisEmojiAsReaction).toStrictEqual([]);
				expect(localEmojis[1].url).toBe(localSecond.publicUrl);

				const listedByColonQuery = await api(
					'admin/emoji/list',
					{
						limit: 10,
						query: `:${localFirst.name}:`,
						sinceDate: now - 3000,
					},
					manager,
				);
				expect(listedByColonQuery.status).toBe(200);
				expect((listedByColonQuery.body as any[]).map((emoji) => emoji.id)).toStrictEqual([localFirst.id]);

				const remoteListed = await api(
					'admin/emoji/list-remote',
					{
						limit: 10,
						query: 'remote_',
						host: remoteHost.toUpperCase(),
						sinceDate: now - 3000,
					},
					manager,
				);
				expect(remoteListed.status).toBe(200);
				const remoteEmojis = remoteListed.body as any[];
				expect(remoteEmojis.map((emoji) => emoji.id)).toStrictEqual([remoteNewer.id, remoteOlder.id]);
				expect(remoteEmojis[0].host).toBe(remoteHost);
				expect(remoteEmojis[0].url).toBe(remoteNewer.publicUrl);
				expect(remoteEmojis[0].license).toBe(`remote license ${suffix}`);
				expect(remoteEmojis[0].isSensitive).toBe(true);

				const readToken = await createAppToken(manager, ['read:admin:emoji']);
				const byToken = await api(
					'admin/emoji/list-remote',
					{
						limit: 1,
						query: 'remote_',
						host: remoteHost,
					},
					{ token: readToken },
				);
				expect(byToken.status).toBe(200);
				expect((byToken.body as any[]).map((emoji) => emoji.id)).toStrictEqual([remoteNewer.id]);

				const wrongScopeToken = await createAppToken(manager, ['read:admin:meta']);
				const scopeDenied = await api('admin/emoji/list', {}, { token: wrongScopeToken });
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const roleDenied = await api('admin/emoji/list', {}, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('v2/admin/emoji/list はquery、hostType、pagination、count/allCount/allPages、role policyを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `hav2${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono v2 emoji manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const localFirst = await insertEmojiInDatabase(db, {
				id: genId(now - 3000),
				name: `hv2emoji${suffix}a`,
				host: null,
				aliases: [],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/v2-a-original.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const localSecond = await insertEmojiInDatabase(db, {
				id: genId(now - 2000),
				name: `hv2emoji${suffix}b`,
				host: null,
				aliases: [],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/v2-b-original.webp`,
				publicUrl: `${origin}/emoji/${suffix}/v2-b-public.webp`,
				license: null,
				isSensitive: true,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const remoteHost = `hono-v2-emoji-${suffix}.example`;
			const remoteEmoji = await insertEmojiInDatabase(db, {
				id: genId(now - 1000),
				name: `hv2emoji${suffix}c`,
				host: remoteHost,
				aliases: [],
				category: null,
				originalUrl: `https://${remoteHost}/emoji/v2-c.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const listed = await api(
					'v2/admin/emoji/list',
					{
						query: { name: `hv2emoji${suffix}`, hostType: 'local' },
						limit: 10,
						sortKeys: ['+id'],
					},
					manager,
				);
				expect(listed.status).toBe(200);
				expect(listed.body.emojis.map((e: any) => e.id)).toStrictEqual([localFirst.id, localSecond.id]);
				expect(listed.body.count).toBe(2);
				expect(listed.body.allCount).toBe(2);
				expect(listed.body.allPages).toBe(1);
				expect(getAt(listed.body.emojis, 0).originalUrl).toBe(localFirst.originalUrl);
				expect(getAt(listed.body.emojis, 1).publicUrl).toBe(localSecond.publicUrl);
				expect(getAt(listed.body.emojis, 1).isSensitive).toBe(true);

				const remoteListed = await api(
					'v2/admin/emoji/list',
					{
						query: { name: `hv2emoji${suffix}`, hostType: 'remote' },
						limit: 10,
					},
					manager,
				);
				expect(remoteListed.status).toBe(200);
				expect(remoteListed.body.emojis.map((e: any) => e.id)).toStrictEqual([remoteEmoji.id]);
				expect(getAt(remoteListed.body.emojis, 0).host).toBe(remoteHost);

				const paged = await api(
					'v2/admin/emoji/list',
					{
						query: { name: `hv2emoji${suffix}` },
						limit: 1,
						page: 2,
						sortKeys: ['+id'],
					},
					manager,
				);
				expect(paged.status).toBe(200);
				expect(paged.body.emojis.map((e: any) => e.id)).toStrictEqual([localSecond.id]);
				expect(paged.body.count).toBe(1);
				expect(paged.body.allCount).toBe(3);
				expect(paged.body.allPages).toBe(3);

				const roleDenied = await api('v2/admin/emoji/list', {}, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const wrongScopeToken = await createAppToken(manager, ['read:admin:meta']);
				const scopeDenied = await api('v2/admin/emoji/list', {}, { token: wrongScopeToken });
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji/add と update はDB更新、moderation log、scope、role policyを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemw${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji write manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const addMd5 = createHash('md5').update(`hono-emoji-add-${suffix}`).digest('hex');
			const addFile = await createDriveFileInDatabase(db, {
				id: genId(now - 1000),
				userId: manager.id,
				userHost: null,
				md5: addMd5,
				name: `hono-emoji-add-${suffix}.png`,
				type: 'image/png',
				size: 101,
				storedInternal: true,
				url: `${origin}/files/${addMd5}`,
			});
			const updateMd5 = createHash('md5').update(`hono-emoji-update-${suffix}`).digest('hex');
			const updateFile = await createDriveFileInDatabase(db, {
				id: genId(now),
				userId: manager.id,
				userHost: null,
				md5: updateMd5,
				name: `hono-emoji-update-${suffix}.png`,
				type: 'image/png',
				size: 202,
				storedInternal: true,
				url: `${origin}/files/${updateMd5}`,
			});

			try {
				const wrongScopeToken = await createAppToken(manager, ['read:admin:emoji']);
				const scopeDenied = await api(
					'admin/emoji/add',
					{
						name: `honoemoji_scope_${suffix}`,
						fileId: addFile.id,
					},
					{ token: wrongScopeToken },
				);
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const added = await api(
					'admin/emoji/add',
					{
						name: `honoemoji_add_${suffix}`,
						fileId: addFile.id,
						category: `write_${suffix}`,
						aliases: [`alias_${suffix}`],
						license: `license ${suffix}`,
						isSensitive: true,
						localOnly: true,
						roleIdsThatCanBeUsedThisEmojiAsReaction: [],
					},
					manager,
				);
				expect(added.status).toBe(200);
				expect(added.body.name).toBe(`honoemoji_add_${suffix}`);
				expect(added.body.url).toBe(addFile.url);
				expect(added.body.category).toBe(`write_${suffix}`);
				expect(added.body.aliases).toStrictEqual([`alias_${suffix}`]);
				expect(added.body.license).toBe(`license ${suffix}`);
				expect(added.body.isSensitive).toBe(true);
				expect(added.body.localOnly).toBe(true);

				const duplicate = await api(
					'admin/emoji/add',
					{
						name: `honoemoji_add_${suffix}`,
						fileId: addFile.id,
					},
					manager,
				);
				expect(duplicate.status).toBe(400);
				expect(castAsError(duplicate.body as any).error.code).toBe('DUPLICATE_NAME');

				const roleDenied = await api(
					'admin/emoji/update',
					{
						id: added.body.id,
						category: `denied_${suffix}`,
					},
					bob,
				);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const updated = await api(
					'admin/emoji/update',
					{
						id: added.body.id,
						name: `honoemoji_updated_${suffix}`,
						fileId: updateFile.id,
						category: null,
						aliases: [`updated_${suffix}`],
						license: null,
						isSensitive: false,
						localOnly: false,
						roleIdsThatCanBeUsedThisEmojiAsReaction: [],
					},
					manager,
				);
				expect(updated.status).toBe(204);

				const after = await fetchEmojiByIdOrFailFromDatabase(db, added.body.id);
				expect(after.name).toBe(`honoemoji_updated_${suffix}`);
				expect(after.category).toBe(null);
				expect(after.aliases).toStrictEqual([`updated_${suffix}`]);
				expect(after.license).toBe(null);
				expect(after.isSensitive).toBe(false);
				expect(after.localOnly).toBe(false);
				expect(after.originalUrl).toBe(updateFile.url);
				expect(after.publicUrl).toBe(updateFile.url);
				expect(after.type).toBe(updateFile.type);
				assert.ok(after.updatedAt);

				const renamedDuplicate = await api(
					'admin/emoji/update',
					{
						id: after.id,
						name: after.name,
					},
					manager,
				);
				expect(renamedDuplicate.status).toBe(204);

				const logs = await listModerationLogsFromDatabase(db, {
					limit: 20,
					order: 'desc',
					userId: manager.id,
					search: suffix,
				});
				assert.ok(logs.some((log) => log.type === 'addCustomEmoji'));
				assert.ok(logs.some((log) => log.type === 'updateCustomEmoji'));
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji/copy は remote emoji を Drive に取り込み、local emoji、log、scope、role policyを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemc${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji copy manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const png = Buffer.from(
				'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
				'base64',
			);
			let imageServer: Server | undefined;
			await new Promise<void>((resolve) => {
				imageServer = createServer((_req, res) => {
					res.writeHead(200, {
						'Content-Type': 'image/png',
						'Content-Disposition': `inline; filename="honoemoji_copy_${suffix}.png"`,
					});
					res.end(png);
				});
				imageServer.listen(0, '127.0.0.1', () => resolve());
			});
			const address = imageServer!.address() as AddressInfo;
			const imageUrl = `http://127.0.0.1:${address.port}/honoemoji_copy_${suffix}.png`;

			const remote = await insertEmojiInDatabase(db, {
				id: genId(now),
				name: `honoemoji_copy_${suffix}`,
				host: `copy-${suffix}.remote`,
				aliases: [`copy_alias_${suffix}`],
				category: `copy_category_${suffix}`,
				originalUrl: imageUrl,
				publicUrl: '',
				license: `copy license ${suffix}`,
				isSensitive: true,
				localOnly: true,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const wrongScopeToken = await createAppToken(manager, ['read:admin:emoji']);
				const scopeDenied = await api('admin/emoji/copy', { emojiId: remote.id }, { token: wrongScopeToken });
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const roleDenied = await api('admin/emoji/copy', { emojiId: remote.id }, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');

				const copied = await api('admin/emoji/copy', { emojiId: remote.id }, manager);
				expect(copied.status).toBe(200);
				const copiedBody = copied.body as any;
				expect(copiedBody.name).toBe(remote.name);
				expect(copiedBody.host).toBe(null);
				expect(copiedBody.aliases).toStrictEqual([`copy_alias_${suffix}`]);
				expect(copiedBody.category).toBe(`copy_category_${suffix}`);
				expect(copiedBody.license).toBe(`copy license ${suffix}`);
				expect(copiedBody.isSensitive).toBe(true);
				expect(copiedBody.localOnly).toBe(true);

				const copiedEmoji = await fetchEmojiByIdOrFailFromDatabase(db, copiedBody.id);
				expect(copiedEmoji.host).toBe(null);
				expect(copiedEmoji.name).toBe(remote.name);
				expect(copiedEmoji.originalUrl).not.toBe(remote.originalUrl);
				expect(copiedEmoji.publicUrl).toBe(copiedEmoji.originalUrl);
				expect(copiedEmoji.type).toBe('image/png');

				const driveFile = await fetchDriveFileByUrlFromDatabase(db, copiedEmoji.originalUrl);
				assert.ok(driveFile);
				expect(driveFile.userId).toBe(null);
				expect(driveFile.userHost).toBe(null);
				expect(driveFile.src).toBe(imageUrl);
				expect(driveFile.type).toBe('image/png');

				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'addCustomEmoji',
					userId: manager.id,
					search: suffix,
				});
				assert.ok(logs.some((log) => (log.info as any).emojiId === copiedEmoji.id));

				const duplicate = await api('admin/emoji/copy', { emojiId: remote.id }, manager);
				expect(duplicate.status).toBe(400);
				expect(castAsError(duplicate.body as any).error.code).toBe('DUPLICATE_NAME');
			} finally {
				await new Promise<void>((resolve, reject) => {
					imageServer?.close((err) => (err ? reject(err) : resolve()));
				});
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji bulk metadata 更新は aliases、category、license、scope、role policyを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemb${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji bulk manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const first = await insertEmojiInDatabase(db, {
				id: genId(now - 1000),
				name: `honoemoji_bulk_first_${suffix}`,
				host: null,
				aliases: [`base_${suffix}`],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/bulk-first.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const second = await insertEmojiInDatabase(db, {
				id: genId(now),
				name: `honoemoji_bulk_second_${suffix}`,
				host: null,
				aliases: [],
				category: null,
				originalUrl: `${origin}/emoji/${suffix}/bulk-second.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const missing = await api(
					'admin/emoji/set-category-bulk',
					{
						ids: [first.id, 'zzzzzzzzzzzzzzzzzzzzzzzzzz'],
						category: `must_rollback_${suffix}`,
					},
					manager,
				);
				expect(missing.status).toBe(400);
				expect(castAsError(missing.body as any).error.id).toBe('756e37b2-8e81-421c-9d18-740a6932d57f');
				expect((await fetchEmojiByIdOrFailFromDatabase(db, first.id)).category).toBe(null);

				const addAliases = await api(
					'admin/emoji/add-aliases-bulk',
					{
						ids: [first.id, second.id],
						aliases: [`added_${suffix}`, `base_${suffix}`],
					},
					manager,
				);
				expect(addAliases.status).toBe(204);

				let afterFirst = await fetchEmojiByIdOrFailFromDatabase(db, first.id);
				let afterSecond = await fetchEmojiByIdOrFailFromDatabase(db, second.id);
				expect(afterFirst.aliases).toStrictEqual([`base_${suffix}`, `added_${suffix}`]);
				expect(afterSecond.aliases).toStrictEqual([`added_${suffix}`, `base_${suffix}`]);

				const removeAliases = await api(
					'admin/emoji/remove-aliases-bulk',
					{
						ids: [first.id],
						aliases: [`base_${suffix}`],
					},
					manager,
				);
				expect(removeAliases.status).toBe(204);
				afterFirst = await fetchEmojiByIdOrFailFromDatabase(db, first.id);
				expect(afterFirst.aliases).toStrictEqual([`added_${suffix}`]);

				const setAliases = await api(
					'admin/emoji/set-aliases-bulk',
					{
						ids: [second.id],
						aliases: [`final_${suffix}`],
					},
					manager,
				);
				expect(setAliases.status).toBe(204);

				const setCategory = await api(
					'admin/emoji/set-category-bulk',
					{
						ids: [first.id, second.id],
						category: `bulk_category_${suffix}`,
					},
					manager,
				);
				expect(setCategory.status).toBe(204);

				const setLicense = await api(
					'admin/emoji/set-license-bulk',
					{
						ids: [first.id, second.id],
						license: `bulk license ${suffix}`,
					},
					manager,
				);
				expect(setLicense.status).toBe(204);

				const resetLicense = await api(
					'admin/emoji/set-license-bulk',
					{
						ids: [second.id],
						license: null,
					},
					manager,
				);
				expect(resetLicense.status).toBe(204);

				afterFirst = await fetchEmojiByIdOrFailFromDatabase(db, first.id);
				afterSecond = await fetchEmojiByIdOrFailFromDatabase(db, second.id);
				expect(afterFirst.aliases).toStrictEqual([`added_${suffix}`]);
				expect(afterSecond.aliases).toStrictEqual([`final_${suffix}`]);
				expect(afterFirst.category).toBe(`bulk_category_${suffix}`);
				expect(afterSecond.category).toBe(`bulk_category_${suffix}`);
				expect(afterFirst.license).toBe(`bulk license ${suffix}`);
				expect(afterSecond.license).toBe(null);
				assert.ok(afterFirst.updatedAt);
				assert.ok(afterSecond.updatedAt);

				const token = await createAppToken(manager, ['write:admin:emoji']);
				const tokenUpdated = await api(
					'admin/emoji/set-category-bulk',
					{
						ids: [first.id],
						category: null,
					},
					{ token },
				);
				expect(tokenUpdated.status).toBe(204);
				afterFirst = await fetchEmojiByIdOrFailFromDatabase(db, first.id);
				expect(afterFirst.category).toBe(null);

				const wrongScopeToken = await createAppToken(manager, ['read:admin:emoji']);
				const scopeDenied = await api(
					'admin/emoji/set-aliases-bulk',
					{
						ids: [first.id],
						aliases: [],
					},
					{ token: wrongScopeToken },
				);
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const roleDenied = await api(
					'admin/emoji/set-category-bulk',
					{
						ids: [first.id],
						category: `denied_${suffix}`,
					},
					bob,
				);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji/delete と delete-bulk はDB削除、moderation log、scope、role policyを維持する', async () => {
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemd${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji delete manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const single = await insertEmojiInDatabase(db, {
				id: genId(now - 2000),
				name: `honoemoji_delete_single_${suffix}`,
				host: null,
				aliases: [],
				category: `delete_${suffix}`,
				originalUrl: `${origin}/emoji/${suffix}/delete-single.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const bulkFirst = await insertEmojiInDatabase(db, {
				id: genId(now - 1000),
				name: `honoemoji_delete_bulk_first_${suffix}`,
				host: null,
				aliases: [],
				category: `delete_${suffix}`,
				originalUrl: `${origin}/emoji/${suffix}/delete-bulk-first.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});
			const bulkSecond = await insertEmojiInDatabase(db, {
				id: genId(now),
				name: `honoemoji_delete_bulk_second_${suffix}`,
				host: null,
				aliases: [],
				category: `delete_${suffix}`,
				originalUrl: `${origin}/emoji/${suffix}/delete-bulk-second.webp`,
				publicUrl: '',
				license: null,
				isSensitive: false,
				localOnly: false,
				roleIdsThatCanBeUsedThisEmojiAsReaction: [],
			});

			try {
				const deleted = await api('admin/emoji/delete', { id: single.id }, manager);
				expect(deleted.status).toBe(204);
				expect(await fetchEmojiByIdFromDatabase(db, single.id)).toBe(null);
				const deletedAgain = await api('admin/emoji/delete', { id: single.id }, manager);
				expect(deletedAgain.status).toBe(400);
				expect(castAsError(deletedAgain.body as any).error.id).toBe('be83669b-773a-44b7-b1f8-e5e5170ac3c2');

				const deletedBulk = await api(
					'admin/emoji/delete-bulk',
					{
						ids: [bulkFirst.id, bulkSecond.id],
					},
					manager,
				);
				expect(deletedBulk.status).toBe(204);
				expect(await fetchEmojiByIdFromDatabase(db, bulkFirst.id)).toBe(null);
				expect(await fetchEmojiByIdFromDatabase(db, bulkSecond.id)).toBe(null);

				await vi.waitFor(async () => {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type: 'deleteCustomEmoji',
						search: suffix,
					});
					expect(logs.length).toBeGreaterThanOrEqual(3);
					expect(logs.some((log) => (log.info as any).emojiId === single.id)).toBe(true);
					expect(logs.some((log) => (log.info as any).emojiId === bulkFirst.id)).toBe(true);
					expect(logs.some((log) => (log.info as any).emojiId === bulkSecond.id)).toBe(true);
				}, POLL);

				const tokenTarget = await insertEmojiInDatabase(db, {
					id: genId(now + 1000),
					name: `honoemoji_delete_token_${suffix}`,
					host: null,
					aliases: [],
					category: null,
					originalUrl: `${origin}/emoji/${suffix}/delete-token.webp`,
					publicUrl: '',
					license: null,
					isSensitive: false,
					localOnly: false,
					roleIdsThatCanBeUsedThisEmojiAsReaction: [],
				});
				const token = await createAppToken(manager, ['write:admin:emoji']);
				const deletedByToken = await api('admin/emoji/delete', { id: tokenTarget.id }, { token });
				expect(deletedByToken.status).toBe(204);
				expect(await fetchEmojiByIdFromDatabase(db, tokenTarget.id)).toBe(null);

				const wrongScopeToken = await createAppToken(manager, ['read:admin:emoji']);
				const scopeDenied = await api(
					'admin/emoji/delete-bulk',
					{
						ids: [tokenTarget.id],
					},
					{ token: wrongScopeToken },
				);
				expect(scopeDenied.status).toBe(403);
				expect(castAsError(scopeDenied.body as any).error.code).toBe('PERMISSION_DENIED');

				const roleDenied = await api('admin/emoji/delete', { id: tokenTarget.id }, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});

		test('admin/emoji/import-zip は import job、secure credential、role policyを維持する', async () => {
			const config = fixtureConfig;
			const now = Date.now();
			const suffix = now.toString(36).slice(-8);
			const manager = await signup({ username: `haemi${suffix}` });
			const emojiRole = await role(
				alice,
				{
					name: `hono emoji import manager ${suffix}`,
				},
				{
					canManageCustomEmojis: { priority: 0, useDefault: false, value: true },
				},
			);
			const assign = await api(
				'admin/roles/assign',
				{
					roleId: emojiRole.id,
					userId: manager.id,
				},
				alice,
			);
			expect(assign.status).toBe(204);

			const fileId = genId(now);
			const removeImportJobs = async () => {
				const jobs = await dbQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
				await Promise.all(
					jobs
						.filter(
							(job) =>
								job.name === 'importCustomEmojis' && (job.data as DbJobData<'importCustomEmojis'>).fileId === fileId,
						)
						.map((job) => job.remove()),
				);
			};

			try {
				const imported = await api('admin/emoji/import-zip', { fileId }, manager);
				expect(imported.status).toBe(204);

				let job: Bull.Job<DbJobData<'importCustomEmojis' | 'deleteAccount'>> | undefined;
				await vi.waitFor(async () => {
					const jobs = await dbQueue!.getJobs(['waiting', 'delayed'], 0, 100, false);
					job = jobs.find(
						(job) =>
							job.name === 'importCustomEmojis' &&
							(job.data as DbJobData<'importCustomEmojis'>).fileId === fileId &&
							job.data.user.id === manager.id,
					);
					expect(job).toBeDefined();
				}, POLL);
				assert.ok(job);
				expect(job.data as DbJobData<'importCustomEmojis'>).toStrictEqual({
					user: { id: manager.id },
					fileId,
				});

				const token = await createAppToken(manager, ['write:admin:emoji']);
				const appDenied = await api('admin/emoji/import-zip', { fileId: genId(now + 1) }, { token });
				expect(appDenied.status).toBe(400);
				expect(castAsError(appDenied.body as any).error.code).toBe('ACCESS_DENIED');

				const roleDenied = await api('admin/emoji/import-zip', { fileId: genId(now + 2) }, bob);
				expect(roleDenied.status).toBe(403);
				expect(castAsError(roleDenied.body as any).error.code).toBe('ROLE_PERMISSION_DENIED');
			} finally {
				await removeImportJobs();
				await api(
					'admin/roles/unassign',
					{
						roleId: emojiRole.id,
						userId: manager.id,
					},
					alice,
				);
				await api(
					'admin/roles/delete',
					{
						roleId: emojiRole.id,
					},
					alice,
				);
			}
		});
	});
});
