/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import { createHash } from 'node:crypto';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import * as assert from 'assert';
import bcrypt from 'bcryptjs';
import { describe, beforeAll, afterAll, test, expect } from 'vitest';
// node-fetch only supports it's own Blob yet
// https://github.com/node-fetch/node-fetch/pull/1664
import { Blob } from 'node-fetch';
import { loadConfig } from '@/config.js';
import { createAvatarDecorationInDatabase } from '@/core/AvatarDecorationStore.js';
import { createAnnouncementReadInDatabase } from '@/core/AnnouncementReadStore.js';
import { createAnnouncementInDatabase } from '@/core/AnnouncementStore.js';
import { channelFavoriteExistsInDatabase, createChannelFavoriteInDatabase } from '@/core/ChannelFavoriteStore.js';
import { channelFollowingExistsInDatabase, createChannelFollowingInDatabase } from '@/core/ChannelFollowingStore.js';
import { channelMutingExistsInDatabase, createChannelMutingInDatabase } from '@/core/ChannelMutingStore.js';
import { createChannelInDatabase } from '@/core/ChannelStore.js';
import { clipFavoriteExistsInDatabase } from '@/core/ClipFavoriteStore.js';
import { createClipInDatabase } from '@/core/ClipStore.js';
import { createDriveFileInDatabase } from '@/core/DriveFileStore.js';
import { createDriveFolderInDatabase, fetchDriveFolderByIdFromDatabase } from '@/core/DriveFolderStore.js';
import { insertEmojiInDatabase } from '@/core/EmojiStore.js';
import { flashLikeExistsInDatabase } from '@/core/FlashLikeStore.js';
import { createFlashInDatabase, fetchFlashByIdFromDatabase } from '@/core/FlashStore.js';
import { createFollowingInDatabase, fetchFollowingByFollowerIdAndFolloweeIdFromDatabase } from '@/core/FollowingStore.js';
import { createInstanceInDatabase } from '@/core/InstanceStore.js';
import { createModerationLogInDatabase, listModerationLogsFromDatabase } from '@/core/ModerationLogStore.js';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import { createNoteDraftInDatabase } from '@/core/NoteDraftStore.js';
import { createNoteInDatabase } from '@/core/NoteStore.js';
import { pageLikeExistsInDatabase } from '@/core/PageLikeStore.js';
import { createPageInDatabase } from '@/core/PageStore.js';
import { createRetentionAggregationInDatabase } from '@/core/RetentionAggregationStore.js';
import { createRegistrationTicketInDatabase } from '@/core/RegistrationTicketStore.js';
import { createRoleAssignmentInDatabase, fetchRoleAssignmentByUserIdAndRoleIdFromDatabase } from '@/core/RoleAssignmentStore.js';
import { createRoleInDatabase } from '@/core/RoleStore.js';
import { createPasswordResetRequestInDatabase } from '@/core/PasswordResetRequestStore.js';
import { isPromoReadExists } from '@/core/PromoReadStore.js';
import { createSigninInDatabase } from '@/core/SigninStore.js';
import { createSwSubscriptionInDatabase } from '@/core/SwSubscriptionStore.js';
import { hashtag as hashtagTable } from '@/db/schema/hashtag.js';
import { fetchUserByIdOrFailFromDatabase, updateUserInDatabase } from '@/core/UserStore.js';
import { userListFavoriteExistsInDatabase } from '@/core/UserListFavoriteStore.js';
import { createUserListInDatabase, fetchUserListByIdAndUserIdFromDatabase } from '@/core/UserListStore.js';
import { fetchUserProfileByUserIdOrFailFromDatabase, updateUserProfileInDatabase } from '@/core/UserProfileStore.js';
import { createUserPendingInDatabase } from '@/core/UserPendingStore.js';
import { createWebhookInDatabase, fetchWebhookByIdAndUserIdFromDatabase } from '@/core/WebhookStore.js';
import { createDrizzleDatabase, createDrizzlePool, type MiDrizzleDatabase, type MiDrizzlePool } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { closeRedisConnection, createRedisClient } from '@/runtime-dependencies.js';
import { api, castAsError, createAppToken, origin, post, relativeFetch, role, signup, simpleGet, uploadFile } from '../utils.js';
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
		test('meta returns lite and detailed metadata', async () => {
			const lite = await api('meta', {
				detail: false,
			});

			assert.strictEqual(lite.status, 200);
			assert.strictEqual(lite.body.uri, origin);
			assert.strictEqual(typeof lite.body.version, 'string');
			assert.strictEqual((lite.body as Record<string, unknown>).features, undefined);

			const detailed = await api('meta', {});
			const detailedBody = detailed.body as {
				uri: string;
				features?: { miauth?: boolean };
				proxyAccountName?: unknown;
			};

			assert.strictEqual(detailed.status, 200);
			assert.strictEqual(detailedBody.uri, origin);
			if (detailedBody.features == null) assert.fail('detailed meta features are missing');
			assert.strictEqual(detailedBody.features.miauth, true);
			assert.strictEqual(typeof detailedBody.proxyAccountName, 'string');
		});

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

	describe('retention endpoint', () => {
		test('retention supports GET and returns latest aggregation data', async () => {
			const config = loadConfig();
			const now = Date.now();
			await createRetentionAggregationInDatabase(db, {
				id: genId(config, now),
				createdAt: new Date(now),
				updatedAt: new Date(now),
				dateKey: `hono-retention-${now}`,
				userIds: [alice.id],
				usersCount: 1,
				data: { '1': 1 },
			});
			const latest = {
				id: genId(config, now + 1),
				createdAt: new Date(now + 1),
				updatedAt: new Date(now + 1),
				dateKey: `hono-retention-${now + 1}`,
				userIds: [alice.id, bob.id],
				usersCount: 2,
				data: { '1': 2, '2': 1 },
			};
			await createRetentionAggregationInDatabase(db, latest);

			const res = await relativeFetch('api/retention');
			assert.strictEqual(res.status, 200);
			assert.strictEqual(res.headers.get('cache-control'), 'public, max-age=3600');

			const body = await res.json() as { createdAt?: unknown; users?: unknown; data?: Record<string, unknown> }[];
			const record = body.find(item => item.createdAt === latest.createdAt.toISOString());
			assert.ok(record);
			assert.strictEqual(record.users, latest.usersCount);
			assert.deepStrictEqual(record.data, latest.data);
		});
	});

	describe('hashtag endpoints', () => {
		test('list, search, and show return packed hashtag data', async () => {
			const config = loadConfig();
			const now = Date.now();
			const primary = `hono_hashtag_primary_${now}`;
			const secondary = `hono_hashtag_secondary_${now}`;
			await db.insert(hashtagTable).values([{
				id: genId(config, now),
				name: primary,
				mentionedUserIds: [alice.id, bob.id],
				mentionedUsersCount: 1000002,
				mentionedLocalUserIds: [alice.id, bob.id],
				mentionedLocalUsersCount: 1000002,
				mentionedRemoteUserIds: [],
				mentionedRemoteUsersCount: 0,
				attachedUserIds: [alice.id],
				attachedUsersCount: 1000001,
				attachedLocalUserIds: [alice.id],
				attachedLocalUsersCount: 1000001,
				attachedRemoteUserIds: [],
				attachedRemoteUsersCount: 0,
			}, {
				id: genId(config, now + 1),
				name: secondary,
				mentionedUserIds: [alice.id],
				mentionedUsersCount: 1000001,
				mentionedLocalUserIds: [alice.id],
				mentionedLocalUsersCount: 1000001,
				mentionedRemoteUserIds: [],
				mentionedRemoteUsersCount: 0,
				attachedUserIds: [],
				attachedUsersCount: 0,
				attachedLocalUserIds: [],
				attachedLocalUsersCount: 0,
				attachedRemoteUserIds: [],
				attachedRemoteUsersCount: 0,
			}]);

			const list = await api('hashtags/list', {
				limit: 5,
				sort: '+mentionedUsers',
			});
			assert.strictEqual(list.status, 200);
			assert.strictEqual(list.body[0].tag, primary);
			assert.strictEqual(list.body[0].mentionedUsersCount, 1000002);
			assert.strictEqual(list.body[0].attachedLocalUsersCount, 1000001);

			const search = await api('hashtags/search', {
				query: `hono_hashtag_`,
				limit: 10,
			});
			assert.strictEqual(search.status, 200);
			assert.ok(search.body.includes(primary));
			assert.ok(search.body.includes(secondary));

			const shown = await api('hashtags/show', {
				tag: primary.toUpperCase(),
			});
			assert.strictEqual(shown.status, 200);
			assert.strictEqual(shown.body.tag, primary);
			assert.strictEqual(shown.body.mentionedLocalUsersCount, 1000002);

			const missing = await api('hashtags/show', {
				tag: `missing_${primary}`,
			});
			assert.strictEqual(missing.status, 400);
			assert.strictEqual(castAsError(missing.body as any).error.code, 'NO_SUCH_HASHTAG');
		});

		test('trend returns Redis-backed hashtag ranking charts', async () => {
			const config = loadConfig();
			const redis = createRedisClient(config);
			const tag = `hono_trend_${Date.now()}`;
			const featuredEpoc = new Date('2023-01-01T00:00:00Z').getTime();
			const rankingWindow = Math.floor((Date.now() - featuredEpoc) / (1000 * 60 * 60));
			const chartWindowDate = new Date();
			chartWindowDate.setMinutes(Math.floor(chartWindowDate.getMinutes() / 10) * 10, 0, 0);
			const chartWindow = `${chartWindowDate.getUTCFullYear()}${(chartWindowDate.getUTCMonth() + 1).toString().padStart(2, '0')}${chartWindowDate.getUTCDate().toString().padStart(2, '0')}${chartWindowDate.getUTCHours().toString().padStart(2, '0')}${chartWindowDate.getUTCMinutes().toString().padStart(2, '0')}`;

			try {
				await redis.zadd(`featuredHashtagsRanking:${rankingWindow}`, 5, tag);
				await redis.pfadd(`hashtagUsers:${tag}:${chartWindow}`, alice.id, bob.id);

				const trend = await api('hashtags/trend', {});
				assert.strictEqual(trend.status, 200);
				const ranked = trend.body.find(item => item.tag === tag);
				assert.ok(ranked);
				assert.strictEqual(ranked.chart.length, 20);
				assert.ok(ranked.usersCount >= 1);
			} finally {
				await redis.zrem(`featuredHashtagsRanking:${rankingWindow}`, tag);
				await redis.del(`hashtagUsers:${tag}:${chartWindow}`);
				await closeRedisConnection(redis);
			}
		});
	});

	describe('avatar decoration endpoints', () => {
		test('get-avatar-decorations filters unavailable role ids', async () => {
			const config = loadConfig();
			const now = Date.now();
			const createdRole = await createRoleInDatabase(db, {
				id: genId(config, now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono avatar decoration role ${now}`,
				description: 'Hono avatar decoration endpoint test',
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
				id: genId(config, now + 1),
				name: `Hono decoration ${now}`,
				description: 'Hono avatar decoration',
				url: 'https://example.com/avatar-decoration.png',
				roleIdsThatCanBeUsedThisDecoration: [createdRole.id, 'missing-role-id'],
				category: 'hono',
			});

			const res = await api('get-avatar-decorations', {});
			assert.strictEqual(res.status, 200);
			const listed = res.body.find(item => item.id === decoration.id);
			assert.ok(listed);
			assert.strictEqual(listed.name, decoration.name);
			assert.strictEqual(listed.description, decoration.description);
			assert.strictEqual(listed.url, decoration.url);
			assert.deepStrictEqual(listed.roleIdsThatCanBeUsedThisDecoration, [createdRole.id]);
			assert.strictEqual(listed.category, decoration.category);
		});
	});

	describe('federation endpoints', () => {
		test('instances, show-instance, and stats return packed federation instances', async () => {
			const config = loadConfig();
			const now = Date.now();
			const alpha = await createInstanceInDatabase(db, {
				id: genId(config, now),
				host: `hono-fed-alpha-${now}.example`,
				firstRetrievedAt: new Date(now),
				usersCount: 1000001,
				notesCount: 2000001,
				followingCount: 3000001,
				followersCount: 4000001,
				latestRequestReceivedAt: new Date(now + 1000),
				isNotResponding: false,
				suspensionState: 'none',
				softwareName: 'misskey',
				softwareVersion: '2024.5.0',
				openRegistrations: true,
				name: 'Hono Federation Alpha',
				description: 'Hono federation endpoint test instance',
				maintainerName: 'hono maintainer',
				maintainerEmail: 'hono@example.com',
				iconUrl: 'https://example.com/icon.png',
				faviconUrl: null,
				themeColor: '#86b300',
				infoUpdatedAt: new Date(now + 2000),
				moderationNote: 'hidden moderation note',
			});
			const beta = await createInstanceInDatabase(db, {
				id: genId(config, now + 1),
				host: `hono-fed-beta-${now}.example`,
				firstRetrievedAt: new Date(now + 1),
				usersCount: 1000002,
				notesCount: 2000002,
				followingCount: 5000001,
				followersCount: 3000001,
				latestRequestReceivedAt: null,
				isNotResponding: true,
				suspensionState: 'none',
				softwareName: 'mastodon',
				softwareVersion: '4.3.0',
				openRegistrations: false,
				name: 'Hono Federation Beta',
				description: null,
				maintainerName: null,
				maintainerEmail: null,
				iconUrl: null,
				faviconUrl: 'https://example.com/favicon.ico',
				themeColor: null,
				infoUpdatedAt: null,
				moderationNote: '',
			});

			const instancesQuery = new URLSearchParams({
				limit: '10',
				host: `hono-fed-alpha-${now}`,
				sort: '+followers',
			});
			const instances = await relativeFetch(`api/federation/instances?${instancesQuery.toString()}`);
			assert.strictEqual(instances.status, 200);
			assert.strictEqual(instances.headers.get('cache-control'), 'public, max-age=3600');

			const instancesBody = await instances.json() as {
				id?: unknown;
				host?: unknown;
				name?: unknown;
				followersCount?: unknown;
				isSuspended?: unknown;
				suspensionState?: unknown;
				softwareName?: unknown;
				infoUpdatedAt?: unknown;
				latestRequestReceivedAt?: unknown;
				moderationNote?: unknown;
			}[];
			const listedAlpha = instancesBody.find(instance => instance.id === alpha.id);
			assert.ok(listedAlpha);
			assert.strictEqual(listedAlpha.host, alpha.host);
			assert.strictEqual(listedAlpha.name, alpha.name);
			assert.strictEqual(listedAlpha.followersCount, alpha.followersCount);
			assert.strictEqual(listedAlpha.isSuspended, false);
			assert.strictEqual(listedAlpha.suspensionState, 'none');
			assert.strictEqual(listedAlpha.softwareName, alpha.softwareName);
			assert.strictEqual(listedAlpha.infoUpdatedAt, alpha.infoUpdatedAt?.toISOString());
			assert.strictEqual(listedAlpha.latestRequestReceivedAt, alpha.latestRequestReceivedAt?.toISOString());
			assert.strictEqual(listedAlpha.moderationNote, null);

			const shown = await api('federation/show-instance', { host: alpha.host.toUpperCase() });
			assert.strictEqual(shown.status, 200);
			assert.strictEqual(shown.body?.id, alpha.id);
			assert.strictEqual(shown.body?.host, alpha.host);

			const stats = await relativeFetch('api/federation/stats?limit=1');
			assert.strictEqual(stats.status, 200);
			assert.strictEqual(stats.headers.get('cache-control'), 'public, max-age=3600');

			const statsBody = await stats.json() as {
				topSubInstances?: { id?: unknown }[];
				topPubInstances?: { id?: unknown }[];
				otherFollowersCount?: unknown;
				otherFollowingCount?: unknown;
			};
			assert.strictEqual(statsBody.topSubInstances?.[0]?.id, alpha.id);
			assert.strictEqual(statsBody.topPubInstances?.[0]?.id, beta.id);
			assert.strictEqual(typeof statsBody.otherFollowersCount, 'number');
			assert.strictEqual(typeof statsBody.otherFollowingCount, 'number');
		});
	});

	describe('announcement endpoints', () => {
		test('announcements list and show respect user-specific visibility', async () => {
			const config = loadConfig();
			const now = Date.now();
			const globalAnnouncement = await createAnnouncementInDatabase(db, {
				id: genId(config, now),
				updatedAt: null,
				title: 'Global announcement',
				text: 'Visible to everyone',
				imageUrl: null,
				icon: 'info',
				display: 'normal',
				needConfirmationToRead: false,
				isActive: true,
				forExistingUsers: false,
				silence: false,
				userId: null,
			});
			const userAnnouncement = await createAnnouncementInDatabase(db, {
				id: genId(config, now + 1),
				updatedAt: null,
				title: 'User announcement',
				text: 'Visible to Alice only',
				imageUrl: null,
				icon: 'success',
				display: 'banner',
				needConfirmationToRead: true,
				isActive: true,
				forExistingUsers: false,
				silence: false,
				userId: alice.id,
			});
			await createAnnouncementReadInDatabase(db, {
				id: genId(config, now + 2),
				announcementId: globalAnnouncement.id,
				userId: alice.id,
			});

			const anonymousList = await api('announcements', { limit: 10 });
			assert.strictEqual(anonymousList.status, 200);
			assert.ok(anonymousList.body.some(announcement => announcement.id === globalAnnouncement.id));
			assert.ok(!anonymousList.body.some(announcement => announcement.id === userAnnouncement.id));

			const aliceList = await api('announcements', { limit: 10 }, alice);
			assert.strictEqual(aliceList.status, 200);
			const listedGlobal = aliceList.body.find(announcement => announcement.id === globalAnnouncement.id);
			const listedUser = aliceList.body.find(announcement => announcement.id === userAnnouncement.id);
			assert.strictEqual(listedGlobal?.isRead, true);
			assert.strictEqual(listedUser?.forYou, true);
			assert.strictEqual(listedUser?.isRead, false);

			const shownGlobal = await api('announcements/show', {
				announcementId: globalAnnouncement.id,
			});
			assert.strictEqual(shownGlobal.status, 200);
			assert.strictEqual(shownGlobal.body.title, globalAnnouncement.title);

			const hiddenUser = await api('announcements/show', {
				announcementId: userAnnouncement.id,
			});
			assert.strictEqual(hiddenUser.status, 404);
			assert.strictEqual(castAsError(hiddenUser.body as any).error.code, 'NO_SUCH_ANNOUNCEMENT');

			const shownUser = await api('announcements/show', {
				announcementId: userAnnouncement.id,
			}, alice);
			assert.strictEqual(shownUser.status, 200);
			assert.strictEqual(shownUser.body.forYou, true);
			assert.strictEqual(shownUser.body.needConfirmationToRead, true);
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

	describe('signin history endpoints', () => {
		test('i/signin-history returns own signin records', async () => {
			const config = loadConfig();
			const now = Date.now();
			const older = await createSigninInDatabase(db, {
				id: genId(config, now - 2000),
				userId: alice.id,
				ip: '192.0.2.10',
				headers: { 'user-agent': 'hono-signin-history-older' },
				success: true,
			});
			const newer = await createSigninInDatabase(db, {
				id: genId(config, now - 1000),
				userId: alice.id,
				ip: '192.0.2.11',
				headers: { 'user-agent': 'hono-signin-history-newer' },
				success: false,
			});
			const otherUser = await createSigninInDatabase(db, {
				id: genId(config, now),
				userId: bob.id,
				ip: '192.0.2.12',
				headers: { 'user-agent': 'hono-signin-history-other' },
				success: true,
			});

			const history = await api('i/signin-history', { limit: 20 }, alice);
			assert.strictEqual(history.status, 200);
			const newerIndex = history.body.findIndex(item => item.id === newer.id);
			const olderIndex = history.body.findIndex(item => item.id === older.id);
			assert.ok(newerIndex >= 0);
			assert.ok(olderIndex >= 0);
			assert.ok(newerIndex < olderIndex);
			assert.strictEqual(history.body[newerIndex].createdAt, new Date(now - 1000).toISOString());
			assert.strictEqual(history.body[newerIndex].ip, newer.ip);
			assert.deepStrictEqual(history.body[newerIndex].headers, newer.headers);
			assert.strictEqual(history.body[newerIndex].success, false);
			assert.strictEqual(history.body.some(item => item.id === otherUser.id), false);

			const afterOlder = await api('i/signin-history', { sinceId: older.id, limit: 20 }, alice);
			assert.strictEqual(afterOlder.status, 200);
			assert.strictEqual(afterOlder.body.some(item => item.id === newer.id), true);
			assert.strictEqual(afterOlder.body.some(item => item.id === older.id), false);
		});
	});

	describe('registry endpoints', () => {
		test('i/registry endpoints store native and app-token scoped values', async () => {
			const now = Date.now();
			const nativeScope = ['hono', 'registry'];
			const nativeKey = `native_${now}`;
			const nativeValue = {
				enabled: true,
				count: 2,
				items: ['alpha', 'beta'],
			};

			const setNative = await api('i/registry/set', {
				scope: nativeScope,
				key: nativeKey,
				value: nativeValue,
			}, alice);
			assert.strictEqual(setNative.status, 204);

			const gotNative = await api('i/registry/get', {
				scope: nativeScope,
				key: nativeKey,
			}, alice);
			assert.strictEqual(gotNative.status, 200);
			assert.deepStrictEqual(gotNative.body, nativeValue);

			const detail = await api('i/registry/get-detail', {
				scope: nativeScope,
				key: nativeKey,
			}, alice);
			assert.strictEqual(detail.status, 200);
			assert.strictEqual(typeof detail.body.updatedAt, 'string');
			assert.deepStrictEqual(detail.body.value, nativeValue);

			const all = await api('i/registry/get-all', {
				scope: nativeScope,
			}, alice);
			assert.strictEqual(all.status, 200);
			assert.deepStrictEqual(all.body[nativeKey], nativeValue);

			const keys = await api('i/registry/keys', {
				scope: nativeScope,
			}, alice);
			assert.strictEqual(keys.status, 200);
			assert.ok(keys.body.includes(nativeKey));

			const keysWithType = await api('i/registry/keys-with-type', {
				scope: nativeScope,
			}, alice);
			assert.strictEqual(keysWithType.status, 200);
			assert.strictEqual(keysWithType.body[nativeKey], 'object');

			const appToken = await createAppToken(alice, ['read:account', 'write:account']);
			const appScope = ['hono', 'registry_app'];
			const appKey = `app_${now}`;
			const appValue = ['from', 'app'];
			const setApp = await api('i/registry/set', {
				scope: appScope,
				key: appKey,
				value: appValue,
			}, { token: appToken });
			assert.strictEqual(setApp.status, 204);

			const gotApp = await api('i/registry/get', {
				scope: appScope,
				key: appKey,
			}, { token: appToken });
			assert.strictEqual(gotApp.status, 200);
			assert.deepStrictEqual(gotApp.body, appValue);

			const nativeCannotReadAppDomain = await api('i/registry/get', {
				scope: appScope,
				key: appKey,
			}, alice);
			assert.strictEqual(nativeCannotReadAppDomain.status, 400);
			assert.strictEqual(castAsError(nativeCannotReadAppDomain.body as any).error.code, 'NO_SUCH_KEY');

			const scopesWithDomain = await api('i/registry/scopes-with-domain', {}, alice);
			assert.strictEqual(scopesWithDomain.status, 200);
			assert.ok(scopesWithDomain.body.some(item => item.domain === null && item.scopes.some(scope => scope.join('.') === nativeScope.join('.'))));
			assert.ok(scopesWithDomain.body.some(item => item.domain != null && item.scopes.some(scope => scope.join('.') === appScope.join('.'))));

			const appDenied = await api('i/registry/scopes-with-domain', {}, { token: appToken });
			assert.strictEqual(appDenied.status, 400);
			assert.strictEqual(castAsError(appDenied.body as any).error.code, 'ACCESS_DENIED');

			const removed = await api('i/registry/remove', {
				scope: nativeScope,
				key: nativeKey,
			}, alice);
			assert.strictEqual(removed.status, 204);
			const afterRemove = await api('i/registry/get', {
				scope: nativeScope,
				key: nativeKey,
			}, alice);
			assert.strictEqual(afterRemove.status, 400);
			assert.strictEqual(castAsError(afterRemove.body as any).error.code, 'NO_SUCH_KEY');
		});
	});

	describe('fetch-rss endpoint', () => {
		let rssServer: Server | undefined;

		afterAll(async () => {
			await new Promise<void>((resolve, reject) => {
				if (rssServer == null || !rssServer.listening) {
					resolve();
					return;
				}

				rssServer.close(error => error ? reject(error) : resolve());
			});
		});

		test('fetch-rss parses RSS over POST and GET', async () => {
			const rssXml = [
				'<?xml version="1.0" encoding="UTF-8" ?>',
				'<rss version="2.0">',
				'<channel>',
				'<title>Hono RSS Feed</title>',
				'<link>https://example.com/</link>',
				'<description>RSS fixture</description>',
				'<item>',
				'<title>First entry</title>',
				'<link>https://example.com/entry</link>',
				'<guid>entry-1</guid>',
				'<pubDate>Tue, 01 Jul 2025 00:00:00 GMT</pubDate>',
				'</item>',
				'</channel>',
				'</rss>',
			].join('');

			rssServer = createServer((req, res) => {
				res.writeHead(200, {
					'Content-Type': 'application/rss+xml; charset=utf-8',
				});
				res.end(rssXml);
			});
			await new Promise<void>((resolve, reject) => {
				rssServer!.once('error', reject);
				rssServer!.listen(0, '127.0.0.1', () => {
					rssServer!.off('error', reject);
					resolve();
				});
			});
			const address = rssServer.address() as AddressInfo;
			const url = `http://127.0.0.1:${address.port}/feed.xml`;

			const post = await api('fetch-rss', { url });
			assert.strictEqual(post.status, 200);
			assert.strictEqual(post.body.title, 'Hono RSS Feed');
			assert.strictEqual(post.body.items[0].title, 'First entry');
			assert.strictEqual(post.body.items[0].guid, 'entry-1');

			const get = await relativeFetch(`api/fetch-rss?url=${encodeURIComponent(url)}`);
			assert.strictEqual(get.status, 200);
			assert.strictEqual(get.headers.get('cache-control'), 'public, max-age=180');
			const getBody = await get.json() as { title?: string; items?: { title?: string }[] };
			assert.strictEqual(getBody.title, 'Hono RSS Feed');
			assert.strictEqual(getBody.items?.[0].title, 'First entry');
		});
	});

	describe('fetch-external-resources endpoint', () => {
		let resourceServer: Server | undefined;
		let resourceUrl: string;
		const data = 'line 1\r\nline 2';

		beforeAll(async () => {
			resourceServer = createServer((req, res) => {
				const responseBody = req.url === '/invalid'
					? JSON.stringify({ type: 'text/plain' })
					: JSON.stringify({ type: 'text/plain', data });

				res.writeHead(200, {
					'Content-Type': 'application/json; charset=utf-8',
				});
				res.end(responseBody);
			});
			await new Promise<void>((resolve, reject) => {
				resourceServer!.once('error', reject);
				resourceServer!.listen(0, '127.0.0.1', () => {
					resourceServer!.off('error', reject);
					resolve();
				});
			});
			const address = resourceServer.address() as AddressInfo;
			resourceUrl = `http://127.0.0.1:${address.port}`;
		});

		afterAll(async () => {
			await new Promise<void>((resolve, reject) => {
				if (resourceServer == null || !resourceServer.listening) {
					resolve();
					return;
				}

				resourceServer.close(error => error ? reject(error) : resolve());
			});
		});

		test('fetches, validates, and returns hashed external resources', async () => {
			const hash = createHash('sha512').update(data.replace(/\r\n/g, '\n')).digest('hex');

			const res = await api('fetch-external-resources', {
				url: `${resourceUrl}/valid`,
				hash,
			}, alice);

			assert.strictEqual(res.status, 200);
			assert.deepStrictEqual(res.body, {
				type: 'text/plain',
				data,
			});
		});

		test('rejects third-party app tokens and mismatched resources', async () => {
			const appToken = await createAppToken(alice, ['read:account']);
			const appDenied = await api('fetch-external-resources', {
				url: `${resourceUrl}/valid`,
				hash: 'bad',
			}, { token: appToken });
			assert.strictEqual(appDenied.status, 400);
			assert.strictEqual(castAsError(appDenied.body as any).error.code, 'ACCESS_DENIED');

			const mismatched = await api('fetch-external-resources', {
				url: `${resourceUrl}/valid`,
				hash: 'bad',
			}, alice);
			assert.strictEqual(mismatched.status, 400);
			assert.strictEqual(castAsError(mismatched.body as any).error.code, 'EXT_RESOURCE_HASH_DIDNT_MATCH');

			const invalid = await api('fetch-external-resources', {
				url: `${resourceUrl}/invalid`,
				hash: 'bad',
			}, alice);
			assert.strictEqual(invalid.status, 400);
			assert.strictEqual(castAsError(invalid.body as any).error.code, 'EXT_RESOURCE_RETURNED_INVALID_SCHEMA');
		});
	});

	describe('sw endpoints', () => {
		test('sw/show-registration returns own subscription or null', async () => {
			const endpoint = `https://push.example.test/${genId(loadConfig())}`;
			await createSwSubscriptionInDatabase(db, {
				id: genId(loadConfig()),
				userId: alice.id,
				endpoint,
				auth: 'auth-secret',
				publickey: 'public-key',
				sendReadMessage: true,
			});

			const shown = await api('sw/show-registration', { endpoint }, alice);
			assert.strictEqual(shown.status, 200);
			assert.deepStrictEqual(shown.body, {
				userId: alice.id,
				endpoint,
				sendReadMessage: true,
			});

			const missing = await api('sw/show-registration', { endpoint }, bob);
			assert.strictEqual(missing.status, 200);
			assert.strictEqual(missing.body, null);

			const appToken = await createAppToken(alice, ['read:account']);
			const appDenied = await api('sw/show-registration', { endpoint }, { token: appToken });
			assert.strictEqual(appDenied.status, 400);
			assert.strictEqual(castAsError(appDenied.body as any).error.code, 'ACCESS_DENIED');
		});

		test('sw registration lifecycle creates, updates, and unregisters subscriptions', async () => {
			const endpoint = `https://push.example.test/lifecycle-${genId(loadConfig())}`;

			const registered = await api('sw/register', {
				endpoint,
				auth: 'auth-1',
				publickey: 'public-key-1',
				sendReadMessage: true,
			}, alice);
			assert.strictEqual(registered.status, 200);
			assert.strictEqual(registered.body.state, 'subscribed');
			assert.strictEqual(registered.body.userId, alice.id);
			assert.strictEqual(registered.body.endpoint, endpoint);
			assert.strictEqual(registered.body.sendReadMessage, true);

			const same = await api('sw/register', {
				endpoint,
				auth: 'auth-1',
				publickey: 'public-key-1',
				sendReadMessage: true,
			}, alice);
			assert.strictEqual(same.status, 200);
			assert.strictEqual(same.body.state, 'already-subscribed');

			const updated = await api('sw/update-registration', {
				endpoint,
				sendReadMessage: false,
			}, alice);
			assert.strictEqual(updated.status, 200);
			assert.deepStrictEqual(updated.body, {
				userId: alice.id,
				endpoint,
				sendReadMessage: false,
			});

			const missingUpdate = await api('sw/update-registration', {
				endpoint,
			}, bob);
			assert.strictEqual(missingUpdate.status, 400);
			assert.strictEqual(castAsError(missingUpdate.body as any).error.code, 'NO_SUCH_REGISTRATION');

			const unregistered = await api('sw/unregister', { endpoint }, alice);
			assert.strictEqual(unregistered.status, 204);
			assert.strictEqual(unregistered.body, null);

			const afterUnregister = await api('sw/show-registration', { endpoint }, alice);
			assert.strictEqual(afterUnregister.status, 200);
			assert.strictEqual(afterUnregister.body, null);
		});

		test('sw secure endpoints reject app tokens and unregister accepts anonymous requests', async () => {
			const endpoint = `https://push.example.test/anonymous-${genId(loadConfig())}`;
			await api('sw/register', {
				endpoint,
				auth: 'auth',
				publickey: 'public-key',
			}, alice);

			const appToken = await createAppToken(alice, ['read:account']);
			const appRegisterDenied = await api('sw/register', {
				endpoint: `${endpoint}-app`,
				auth: 'auth',
				publickey: 'public-key',
			}, { token: appToken });
			assert.strictEqual(appRegisterDenied.status, 400);
			assert.strictEqual(castAsError(appRegisterDenied.body as any).error.code, 'ACCESS_DENIED');

			const appUpdateDenied = await api('sw/update-registration', { endpoint }, { token: appToken });
			assert.strictEqual(appUpdateDenied.status, 400);
			assert.strictEqual(castAsError(appUpdateDenied.body as any).error.code, 'ACCESS_DENIED');

			const anonymousUnregister = await api('sw/unregister', { endpoint });
			assert.strictEqual(anonymousUnregister.status, 204);

			const afterAnonymousUnregister = await api('sw/show-registration', { endpoint }, alice);
			assert.strictEqual(afterAnonymousUnregister.status, 200);
			assert.strictEqual(afterAnonymousUnregister.body, null);
		});
	});

	describe('request-reset-password endpoint', () => {
		test('request-reset-password silently accepts unknown users and validates params', async () => {
			const accepted = await api('request-reset-password', {
				username: 'missing_reset_user',
				email: 'missing-reset-user@example.test',
			});
			assert.strictEqual(accepted.status, 204);
			assert.strictEqual(accepted.body, null);

			const invalid = await api('request-reset-password', {
				username: 'missing_reset_user',
			} as any);
			assert.strictEqual(invalid.status, 400);
			assert.strictEqual(castAsError(invalid.body as any).error.code, 'INVALID_PARAM');
		});
	});

	describe('reset-password endpoint', () => {
		test('reset-password updates password and consumes reset token', async () => {
			const config = loadConfig();
			const token = `reset-token-${genId(config)}`;
			await createPasswordResetRequestInDatabase(db, {
				id: genId(config),
				userId: carol.id,
				token,
			});

			const reset = await api('reset-password', {
				token,
				password: 'new-reset-password',
			});
			assert.strictEqual(reset.status, 204);
			assert.strictEqual(reset.body, null);

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, carol.id);
			assert.strictEqual(await bcrypt.compare('new-reset-password', profile.password!), true);
		});
	});

	describe('verify-email endpoint', () => {
		test('verify-email verifies matching code and rejects missing code', async () => {
			const code = `verify-${genId(loadConfig())}`;
			await updateUserProfileInDatabase(db, dave.id, {
				email: 'verify-email@example.test',
				emailVerified: false,
				emailVerifyCode: code,
			});

			const verified = await api('verify-email', { code });
			assert.strictEqual(verified.status, 204);
			assert.strictEqual(verified.body, null);

			const profile = await fetchUserProfileByUserIdOrFailFromDatabase(db, dave.id);
			assert.strictEqual(profile.emailVerified, true);
			assert.strictEqual(profile.emailVerifyCode, null);

			const missing = await api('verify-email', { code: 'missing-code' });
			assert.strictEqual(missing.status, 400);
			assert.strictEqual(castAsError(missing.body as any).error.code, 'NO_SUCH_CODE');
		});
	});

	describe('promo/read endpoint', () => {
		test('promo/read records a promoted note as read idempotently', async () => {
			const config = loadConfig();
			const noteId = genId(config);
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'promo read target',
				userId: alice.id,
				userHost: null,
				visibility: 'public',
			});

			const read = await api('promo/read', { noteId }, bob);
			assert.strictEqual(read.status, 204);
			assert.strictEqual(read.body, null);
			assert.strictEqual(await isPromoReadExists(db, bob.id, noteId), true);

			const duplicate = await api('promo/read', { noteId }, bob);
			assert.strictEqual(duplicate.status, 204);

			const missing = await api('promo/read', { noteId: genId(config) }, bob);
			assert.strictEqual(missing.status, 400);
			assert.strictEqual(castAsError(missing.body as any).error.code, 'NO_SUCH_NOTE');
		});

		test('promo/read requires write account permission for app tokens', async () => {
			const config = loadConfig();
			const noteId = genId(config);
			await createNoteInDatabase(db, {
				id: noteId,
				text: 'promo read app token target',
				userId: alice.id,
				userHost: null,
				visibility: 'public',
			});
			const appToken = await createAppToken(bob, ['read:account']);

			const denied = await api('promo/read', { noteId }, { token: appToken });
			assert.strictEqual(denied.status, 403);
			assert.strictEqual(castAsError(denied.body as any).error.code, 'PERMISSION_DENIED');
		});
	});

	describe('favorite and like endpoints', () => {
		async function createFavoriteFixtures(prefix: string) {
			const config = loadConfig();
			const userList = await createUserListInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `${prefix}-list`,
				isPublic: true,
			});
			const clip = await createClipInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `${prefix}-clip`,
				isPublic: true,
			});
			const channel = await createChannelInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `${prefix}-channel`,
			});
			const page = await createPageInDatabase(db, {
				id: genId(config),
				updatedAt: new Date(),
				title: `${prefix} page`,
				name: `${prefix}-page`,
				summary: null,
				alignCenter: false,
				hideTitleWhenPinned: false,
				font: 'sans-serif',
				userId: alice.id,
				eyeCatchingImageId: null,
				content: [],
				variables: [],
				script: '',
				visibility: 'public',
			});
			const flash = await createFlashInDatabase(db, {
				id: genId(config),
				updatedAt: new Date(),
				title: `${prefix} flash`,
				summary: '',
				userId: alice.id,
				script: '',
				permissions: [],
				visibility: 'public',
			});

			return { userList, clip, channel, page, flash };
		}

		test('users/lists favorite endpoints create, reject duplicates, and delete favorites', async () => {
			const { userList } = await createFavoriteFixtures(`hono-favorite-list-${Date.now()}`);

			const favorite = await api('users/lists/favorite', { listId: userList.id }, bob);
			assert.strictEqual(favorite.status, 204);
			assert.strictEqual(await userListFavoriteExistsInDatabase(db, bob.id, userList.id), true);

			const duplicate = await api('users/lists/favorite', { listId: userList.id }, bob);
			assert.strictEqual(duplicate.status, 400);
			assert.strictEqual(castAsError(duplicate.body as any).error.code, 'ALREADY_FAVORITED');
			assert.strictEqual(castAsError(duplicate.body as any).error.id, '6425bba0-985b-461e-af1b-518070e72081');

			const unfavorite = await api('users/lists/unfavorite', { listId: userList.id }, bob);
			assert.strictEqual(unfavorite.status, 204);
			assert.strictEqual(await userListFavoriteExistsInDatabase(db, bob.id, userList.id), false);

			const missingFavorite = await api('users/lists/unfavorite', { listId: userList.id }, bob);
			assert.strictEqual(missingFavorite.status, 400);
			assert.strictEqual(castAsError(missingFavorite.body as any).error.id, '835c4b27-463d-4cfa-969b-a9058678d465');
		});

		test('clip, channel, page, and flash endpoints keep lifecycle semantics', async () => {
			const { clip, channel, page, flash } = await createFavoriteFixtures(`hono-favorite-${Date.now()}`);

			const clipFavorite = await api('clips/favorite', { clipId: clip.id }, bob);
			assert.strictEqual(clipFavorite.status, 204);
			assert.strictEqual(await clipFavoriteExistsInDatabase(db, bob.id, clip.id), true);

			const duplicateClipFavorite = await api('clips/favorite', { clipId: clip.id }, bob);
			assert.strictEqual(duplicateClipFavorite.status, 400);
			assert.strictEqual(castAsError(duplicateClipFavorite.body as any).error.id, '92658936-c625-4273-8326-2d790129256e');

			const clipUnfavorite = await api('clips/unfavorite', { clipId: clip.id }, bob);
			assert.strictEqual(clipUnfavorite.status, 204);
			assert.strictEqual(await clipFavoriteExistsInDatabase(db, bob.id, clip.id), false);

			const channelFavorite = await api('channels/favorite', { channelId: channel.id }, bob);
			assert.strictEqual(channelFavorite.status, 204);
			assert.strictEqual(await channelFavoriteExistsInDatabase(db, bob.id, channel.id), true);

			const channelUnfavorite = await api('channels/unfavorite', { channelId: channel.id }, bob);
			assert.strictEqual(channelUnfavorite.status, 204);
			assert.strictEqual(await channelFavoriteExistsInDatabase(db, bob.id, channel.id), false);

			const pageLike = await api('pages/like', { pageId: page.id }, bob);
			assert.strictEqual(pageLike.status, 204);
			assert.strictEqual(await pageLikeExistsInDatabase(db, bob.id, page.id), true);

			const ownPageLike = await api('pages/like', { pageId: page.id }, alice);
			assert.strictEqual(ownPageLike.status, 400);
			assert.strictEqual(castAsError(ownPageLike.body as any).error.id, '28800466-e6db-40f2-8fae-bf9e82aa92b8');

			const pageUnlike = await api('pages/unlike', { pageId: page.id }, bob);
			assert.strictEqual(pageUnlike.status, 204);
			assert.strictEqual(await pageLikeExistsInDatabase(db, bob.id, page.id), false);

			const flashLike = await api('flash/like', { flashId: flash.id }, bob);
			assert.strictEqual(flashLike.status, 204);
			assert.strictEqual(await flashLikeExistsInDatabase(db, bob.id, flash.id), true);

			const ownFlashLike = await api('flash/like', { flashId: flash.id }, alice);
			assert.strictEqual(ownFlashLike.status, 400);
			assert.strictEqual(castAsError(ownFlashLike.body as any).error.id, '3fd8a0e7-5955-4ba9-85bb-bf3e0c30e13b');

			const flashUnlike = await api('flash/unlike', { flashId: flash.id }, bob);
			assert.strictEqual(flashUnlike.status, 204);
			assert.strictEqual(await flashLikeExistsInDatabase(db, bob.id, flash.id), false);
		});

		test('favorite and like endpoints require matching app token permissions', async () => {
			const { userList, clip, channel, page, flash } = await createFavoriteFixtures(`hono-favorite-permission-${Date.now()}`);
			const appToken = await createAppToken(bob, ['read:account']);

			for (const [endpoint, params] of [
				['users/lists/favorite', { listId: userList.id }],
				['clips/favorite', { clipId: clip.id }],
				['channels/favorite', { channelId: channel.id }],
				['pages/like', { pageId: page.id }],
				['flash/like', { flashId: flash.id }],
			] as const) {
				const denied = await api(endpoint, params as any, { token: appToken });
				assert.strictEqual(denied.status, 403, endpoint);
				assert.strictEqual(castAsError(denied.body as any).error.code, 'PERMISSION_DENIED', endpoint);
			}
		});

		test('prohibitMoved endpoints reject moved users before side effects', async () => {
			const { page } = await createFavoriteFixtures(`hono-favorite-moved-${Date.now()}`);
			const movedUser = await signup({ username: `mvfav${Date.now().toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});

			const denied = await api('pages/like', { pageId: page.id }, movedUser);
			assert.strictEqual(denied.status, 403);
			assert.strictEqual(castAsError(denied.body as any).error.code, 'YOUR_ACCOUNT_MOVED');
			assert.strictEqual(castAsError(denied.body as any).error.id, '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');
			assert.strictEqual(await pageLikeExistsInDatabase(db, movedUser.id, page.id), false);
		});
	});

	describe('Hono account data endpoints', () => {
		test('drive/files/check-existence returns ownership-scoped md5 existence', async () => {
			const config = loadConfig();
			const md5 = createHash('md5').update(`hono-drive-${Date.now()}`).digest('hex');
			await createDriveFileInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				userHost: null,
				md5,
				name: 'hono-drive-check.txt',
				type: 'text/plain',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
			});

			const exists = await api('drive/files/check-existence', { md5 }, alice);
			assert.strictEqual(exists.status, 200);
			assert.strictEqual(exists.body, true);

			const otherUser = await api('drive/files/check-existence', { md5 }, bob);
			assert.strictEqual(otherUser.status, 200);
			assert.strictEqual(otherUser.body, false);

			const missing = await api('drive/files/check-existence', { md5: '0'.repeat(32) }, alice);
			assert.strictEqual(missing.status, 200);
			assert.strictEqual(missing.body, false);
		});

		test('drive/folders list, find, and show preserve ownership and detail fields', async () => {
			const config = loadConfig();
			const stamp = Date.now().toString(36);
			const parent = await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `hono-parent-${stamp}`,
				parentId: null,
			});
			const child = await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `hono-child-${stamp}`,
				parentId: parent.id,
			});
			const rootChildName = await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `hono-child-${stamp}`,
				parentId: null,
			});
			const otherUserFolder = await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `hono-child-${stamp}`,
				parentId: null,
			});
			await createDriveFileInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				userHost: null,
				md5: createHash('md5').update(`hono-drive-folder-${stamp}`).digest('hex'),
				name: 'hono-drive-folder.txt',
				type: 'text/plain',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/hono-drive-folder-${stamp}`,
				folderId: parent.id,
			});

			const rootList = await api('drive/folders', { folderId: null }, alice);
			assert.strictEqual(rootList.status, 200);
			assert.strictEqual((rootList.body as any[]).some(item => item.id === parent.id), true);
			assert.strictEqual((rootList.body as any[]).some(item => item.id === rootChildName.id), true);
			assert.strictEqual((rootList.body as any[]).some(item => item.id === otherUserFolder.id), false);

			const childList = await api('drive/folders', { folderId: parent.id }, alice);
			assert.strictEqual(childList.status, 200);
			assert.deepStrictEqual((childList.body as any[]).map(item => item.id), [child.id]);

			const childFind = await api('drive/folders/find', {
				name: child.name,
				parentId: parent.id,
			}, alice);
			assert.strictEqual(childFind.status, 200);
			assert.deepStrictEqual((childFind.body as any[]).map(item => item.id), [child.id]);

			const rootFind = await api('drive/folders/find', {
				name: child.name,
				parentId: null,
			}, alice);
			assert.strictEqual(rootFind.status, 200);
			assert.strictEqual((rootFind.body as any[]).some(item => item.id === rootChildName.id), true);
			assert.strictEqual((rootFind.body as any[]).some(item => item.id === child.id), false);
			assert.strictEqual((rootFind.body as any[]).some(item => item.id === otherUserFolder.id), false);

			const showParent = await api('drive/folders/show', { folderId: parent.id }, alice);
			assert.strictEqual(showParent.status, 200);
			const shownParent = showParent.body as any;
			assert.strictEqual(shownParent.id, parent.id);
			assert.strictEqual(shownParent.parentId, null);
			assert.strictEqual(shownParent.foldersCount, 1);
			assert.strictEqual(shownParent.filesCount, 1);
			assert.strictEqual(typeof shownParent.createdAt, 'string');

			const showChild = await api('drive/folders/show', { folderId: child.id }, alice);
			assert.strictEqual(showChild.status, 200);
			const shownChild = showChild.body as any;
			assert.strictEqual(shownChild.id, child.id);
			assert.ok(shownChild.parent);
			assert.strictEqual(shownChild.parent.id, parent.id);

			const otherUserShow = await api('drive/folders/show', { folderId: parent.id }, bob);
			assert.strictEqual(otherUserShow.status, 400);
			assert.strictEqual(castAsError(otherUserShow.body as any).error.id, 'd74ab9eb-bb09-4bba-bf24-fb58f761e1e9');
		});

		test('notes/drafts/count returns the caller draft count and rejects moved users', async () => {
			const config = loadConfig();
			const before = await api('notes/drafts/count', {}, alice);
			assert.strictEqual(before.status, 200);

			await createNoteDraftInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				text: 'hono draft 1',
				visibility: 'public',
				pollMultiple: false,
			});
			await createNoteDraftInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				text: 'hono draft 2',
				visibility: 'home',
				pollMultiple: false,
			});
			await createNoteDraftInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				text: 'other user draft',
				visibility: 'public',
				pollMultiple: false,
			});

			const after = await api('notes/drafts/count', {}, alice);
			assert.strictEqual(after.status, 200);
			assert.strictEqual(after.body, (before.body as number) + 2);

			const movedUser = await signup({ username: `mvdraft${Date.now().toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});

			const denied = await api('notes/drafts/count', {}, movedUser);
			assert.strictEqual(denied.status, 403);
			assert.strictEqual(castAsError(denied.body as any).error.code, 'YOUR_ACCOUNT_MOVED');
			assert.strictEqual(castAsError(denied.body as any).error.id, '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');
		});

		test('users/achievements returns profile achievements without credentials', async () => {
			const achievements = [{
				name: 'notes1' as const,
				unlockedAt: Date.now(),
			}];
			await updateUserProfileInDatabase(db, alice.id, { achievements });

			const res = await api('users/achievements', { userId: alice.id });
			assert.strictEqual(res.status, 200);
			assert.deepStrictEqual(res.body, achievements);
		});

		test('i/webhooks list, show, update, and delete are scoped to the caller', async () => {
			const config = loadConfig();
			const latestSentAt = new Date('2024-01-02T03:04:05.000Z');
			const webhook = await createWebhookInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: 'hono webhook',
				on: ['mention', 'reply'],
				url: 'https://example.com/hono-webhook',
				secret: 'hono-secret',
				active: true,
				latestSentAt,
				latestStatus: 204,
			});
			const otherWebhook = await createWebhookInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: 'other webhook',
				on: ['follow'],
				url: 'https://example.com/other-webhook',
				secret: 'other-secret',
				active: false,
			});
			const expected = {
				id: webhook.id,
				userId: alice.id,
				name: webhook.name,
				on: webhook.on,
				url: webhook.url,
				secret: webhook.secret,
				active: webhook.active,
				latestSentAt: latestSentAt.toISOString(),
				latestStatus: webhook.latestStatus,
			};

			const list = await api('i/webhooks/list', {}, alice);
			assert.strictEqual(list.status, 200);
			const listed = (list.body as any[]).find(item => item.id === webhook.id);
			assert.deepStrictEqual(listed, expected);
			assert.strictEqual((list.body as any[]).some(item => item.id === otherWebhook.id), false);

			const show = await api('i/webhooks/show', { webhookId: webhook.id }, alice);
			assert.strictEqual(show.status, 200);
			assert.deepStrictEqual(show.body, expected);

			const noSuch = await api('i/webhooks/show', { webhookId: otherWebhook.id }, alice);
			assert.strictEqual(noSuch.status, 400);
			assert.strictEqual(castAsError(noSuch.body as any).error.id, '50f614d9-3047-4f7e-90d8-ad6b2d5fb098');

			const updateOther = await api('i/webhooks/update', { webhookId: otherWebhook.id, name: 'bad update' }, alice);
			assert.strictEqual(updateOther.status, 400);
			assert.strictEqual(castAsError(updateOther.body as any).error.id, 'fb0fea69-da18-45b1-828d-bd4fd1612518');

			const update = await api('i/webhooks/update', {
				webhookId: webhook.id,
				name: 'hono webhook updated',
				on: ['followed'],
				url: 'https://example.com/hono-webhook-updated',
				secret: null,
				active: false,
			}, alice);
			assert.strictEqual(update.status, 204);

			const updated = await fetchWebhookByIdAndUserIdFromDatabase(db, webhook.id, alice.id);
			assert.strictEqual(updated?.name, 'hono webhook updated');
			assert.deepStrictEqual(updated?.on, ['followed']);
			assert.strictEqual(updated?.url, 'https://example.com/hono-webhook-updated');
			assert.strictEqual(updated?.secret, '');
			assert.strictEqual(updated?.active, false);

			const deleteOther = await api('i/webhooks/delete', { webhookId: otherWebhook.id }, alice);
			assert.strictEqual(deleteOther.status, 400);
			assert.strictEqual(castAsError(deleteOther.body as any).error.id, 'bae73e5a-5522-4965-ae19-3a8688e71d82');

			const deleted = await api('i/webhooks/delete', { webhookId: webhook.id }, alice);
			assert.strictEqual(deleted.status, 204);
			assert.strictEqual(await fetchWebhookByIdAndUserIdFromDatabase(db, webhook.id, alice.id), null);
		});

		test('users/lists/delete removes only the caller list and preserves error id', async () => {
			const config = loadConfig();
			const userList = await createUserListInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `hono-delete-list-${Date.now()}`,
				isPublic: false,
			});

			const otherUser = await api('users/lists/delete', { listId: userList.id }, bob);
			assert.strictEqual(otherUser.status, 400);
			assert.strictEqual(castAsError(otherUser.body as any).error.id, '78436795-db79-42f5-b1e2-55ea2cf19166');
			assert.notStrictEqual(await fetchUserListByIdAndUserIdFromDatabase(db, userList.id, alice.id), null);

			const deleted = await api('users/lists/delete', { listId: userList.id }, alice);
			assert.strictEqual(deleted.status, 204);
			assert.strictEqual(await fetchUserListByIdAndUserIdFromDatabase(db, userList.id, alice.id), null);

			const missing = await api('users/lists/delete', { listId: userList.id }, alice);
			assert.strictEqual(missing.status, 400);
			assert.strictEqual(castAsError(missing.body as any).error.id, '78436795-db79-42f5-b1e2-55ea2cf19166');
		});

		test('users/lists list, show, and update preserve visibility and ownership semantics', async () => {
			const config = loadConfig();
			const privateList = await createUserListInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `hono-private-list-${Date.now()}`,
				isPublic: false,
			});
			const publicList = await createUserListInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `hono-public-list-${Date.now()}`,
				isPublic: true,
			});
			await createUserListInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `hono-bob-list-${Date.now()}`,
				isPublic: true,
			});

			const ownList = await api('users/lists/list', {}, alice);
			assert.strictEqual(ownList.status, 200);
			assert.strictEqual((ownList.body as any[]).some(item => item.id === privateList.id), true);
			assert.strictEqual((ownList.body as any[]).some(item => item.id === publicList.id), true);

			const publicOnly = await api('users/lists/list', { userId: alice.id });
			assert.strictEqual(publicOnly.status, 200);
			assert.strictEqual((publicOnly.body as any[]).some(item => item.id === publicList.id), true);
			assert.strictEqual((publicOnly.body as any[]).some(item => item.id === privateList.id), false);

			const invalidAnonymousList = await api('users/lists/list', {});
			assert.strictEqual(invalidAnonymousList.status, 400);
			assert.strictEqual(castAsError(invalidAnonymousList.body as any).error.id, 'ab36de0e-29e9-48cb-9732-d82f1281620d');

			const privateShowByOwner = await api('users/lists/show', { listId: privateList.id }, alice);
			assert.strictEqual(privateShowByOwner.status, 200);
			assert.strictEqual(privateShowByOwner.body.id, privateList.id);

			const privateShowAnonymous = await api('users/lists/show', { listId: privateList.id });
			assert.strictEqual(privateShowAnonymous.status, 400);
			assert.strictEqual(castAsError(privateShowAnonymous.body as any).error.id, '7bc05c21-1d7a-41ae-88f1-66820f4dc686');

			const favorite = await api('users/lists/favorite', { listId: publicList.id }, bob);
			assert.strictEqual(favorite.status, 204);
			const publicShow = await api('users/lists/show', { listId: publicList.id, forPublic: true }, bob);
			assert.strictEqual(publicShow.status, 200);
			assert.strictEqual(publicShow.body.id, publicList.id);
			assert.strictEqual(publicShow.body.likedCount, 1);
			assert.strictEqual(publicShow.body.isLiked, true);

			const otherUserUpdate = await api('users/lists/update', { listId: privateList.id, name: 'bad update' }, bob);
			assert.strictEqual(otherUserUpdate.status, 400);
			assert.strictEqual(castAsError(otherUserUpdate.body as any).error.id, '796666fe-3dff-4d39-becb-8a5932c1d5b7');

			const update = await api('users/lists/update', {
				listId: privateList.id,
				name: 'hono updated list',
				isPublic: true,
			}, alice);
			assert.strictEqual(update.status, 200);
			assert.strictEqual(update.body.id, privateList.id);
			assert.strictEqual(update.body.name, 'hono updated list');
			assert.strictEqual(update.body.isPublic, true);

			const fetched = await fetchUserListByIdAndUserIdFromDatabase(db, privateList.id, alice.id);
			assert.strictEqual(fetched?.name, 'hono updated list');
			assert.strictEqual(fetched?.isPublic, true);
		});

		test('Hono account data endpoints require matching app token permissions', async () => {
			const readAccountToken = await createAppToken(alice, ['read:account']);
			const readDriveToken = await createAppToken(alice, ['read:drive']);
			const config = loadConfig();

			for (const [endpoint, params, token] of [
				['drive/files/check-existence', { md5: '0'.repeat(32) }, readAccountToken],
				['drive/folders', {}, readAccountToken],
				['drive/folders/create', { name: 'hono-denied-folder' }, readDriveToken],
				['drive/folders/delete', { folderId: genId(config) }, readDriveToken],
				['drive/folders/find', { name: 'hono-denied-folder' }, readAccountToken],
				['drive/folders/show', { folderId: genId(config) }, readAccountToken],
				['drive/folders/update', { folderId: genId(config), name: 'hono-denied-folder' }, readDriveToken],
				['notes/drafts/count', {}, readDriveToken],
				['i/webhooks/list', {}, readDriveToken],
				['i/webhooks/show', { webhookId: genId(config) }, readDriveToken],
				['i/webhooks/delete', { webhookId: genId(config) }, readAccountToken],
				['i/webhooks/update', { webhookId: genId(config) }, readAccountToken],
				['users/lists/list', {}, readDriveToken],
				['users/lists/show', { listId: genId(config) }, readDriveToken],
				['users/lists/delete', { listId: genId(config) }, readAccountToken],
				['users/lists/update', { listId: genId(config) }, readAccountToken],
			] as const) {
				const denied = await api(endpoint, params as any, { token });
				assert.strictEqual(denied.status, 403, endpoint);
				assert.strictEqual(castAsError(denied.body as any).error.code, 'PERMISSION_DENIED', endpoint);
			}
		});
	});

	describe('Hono rate limited write endpoints', () => {
		test('following/update-all updates only the caller followings', async () => {
			const config = loadConfig();
			await createFollowingInDatabase(db, {
				id: genId(config),
				followerId: alice.id,
				followeeId: bob.id,
				notify: 'normal',
				withReplies: false,
			});
			await createFollowingInDatabase(db, {
				id: genId(config),
				followerId: alice.id,
				followeeId: carol.id,
				notify: 'normal',
				withReplies: false,
			});
			await createFollowingInDatabase(db, {
				id: genId(config),
				followerId: bob.id,
				followeeId: alice.id,
				notify: 'normal',
				withReplies: false,
			});

			const res = await api('following/update-all', {
				notify: 'none',
				withReplies: true,
			}, alice);
			assert.strictEqual(res.status, 204);

			const aliceToBob = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, alice.id, bob.id);
			const aliceToCarol = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, alice.id, carol.id);
			const bobToAlice = await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(db, bob.id, alice.id);
			assert.strictEqual(aliceToBob?.notify, null);
			assert.strictEqual(aliceToBob?.withReplies, true);
			assert.strictEqual(aliceToCarol?.notify, null);
			assert.strictEqual(aliceToCarol?.withReplies, true);
			assert.strictEqual(bobToAlice?.notify, 'normal');
			assert.strictEqual(bobToAlice?.withReplies, false);
		});

		test('flash/update updates own flash and preserves ownership errors', async () => {
			const config = loadConfig();
			const flash = await createFlashInDatabase(db, {
				id: genId(config),
				updatedAt: new Date(),
				title: 'old title',
				summary: 'old summary',
				userId: alice.id,
				script: 'old script',
				permissions: [],
				visibility: 'public',
			});
			const otherFlash = await createFlashInDatabase(db, {
				id: genId(config),
				updatedAt: new Date(),
				title: 'other title',
				summary: 'other summary',
				userId: bob.id,
				script: 'other script',
				permissions: [],
				visibility: 'public',
			});

			const updated = await api('flash/update', {
				flashId: flash.id,
				title: 'new title',
				summary: 'new summary',
				script: 'new script',
				permissions: ['read:account'],
				visibility: 'private',
			}, alice);
			assert.strictEqual(updated.status, 204);

			const fetched = await fetchFlashByIdFromDatabase(db, flash.id);
			assert.strictEqual(fetched?.title, 'new title');
			assert.strictEqual(fetched?.summary, 'new summary');
			assert.strictEqual(fetched?.script, 'new script');
			assert.deepStrictEqual(fetched?.permissions, ['read:account']);
			assert.strictEqual(fetched?.visibility, 'private');

			const denied = await api('flash/update', { flashId: otherFlash.id, title: 'bad update' }, alice);
			assert.strictEqual(denied.status, 400);
			assert.strictEqual(castAsError(denied.body as any).error.id, '08e60c88-5948-478e-a132-02ec701d67b2');

			const missing = await api('flash/update', { flashId: genId(config) }, alice);
			assert.strictEqual(missing.status, 400);
			assert.strictEqual(castAsError(missing.body as any).error.id, '611e13d2-309e-419a-a5e4-e0422da39b02');
		});

		test('flash/update rejects moved users before side effects', async () => {
			const config = loadConfig();
			const movedUser = await signup({ username: `mvflash${Date.now().toString(36)}` });
			const flash = await createFlashInDatabase(db, {
				id: genId(config),
				updatedAt: new Date(),
				title: 'moved title',
				summary: 'moved summary',
				userId: movedUser.id,
				script: 'moved script',
				permissions: [],
				visibility: 'public',
			});
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});

			const denied = await api('flash/update', { flashId: flash.id, title: 'updated by moved user' }, movedUser);
			assert.strictEqual(denied.status, 403);
			assert.strictEqual(castAsError(denied.body as any).error.id, '56f20ec9-fd06-4fa5-841b-edd6d7d4fa31');

			const unchanged = await fetchFlashByIdFromDatabase(db, flash.id);
			assert.strictEqual(unchanged?.title, 'moved title');
		});

		test('Hono rate limited write endpoints require matching app token permissions', async () => {
			const config = loadConfig();
			const readAccountToken = await createAppToken(alice, ['read:account']);
			const flash = await createFlashInDatabase(db, {
				id: genId(config),
				updatedAt: new Date(),
				title: 'permission title',
				summary: 'permission summary',
				userId: alice.id,
				script: 'permission script',
				permissions: [],
				visibility: 'public',
			});

			for (const [endpoint, params] of [
				['following/update-all', { notify: 'normal' }],
				['flash/update', { flashId: flash.id, title: 'denied update' }],
			] as const) {
				const denied = await api(endpoint, params as any, { token: readAccountToken });
				assert.strictEqual(denied.status, 403, endpoint);
				assert.strictEqual(castAsError(denied.body as any).error.code, 'PERMISSION_DENIED', endpoint);
			}
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
		async function createLegacyAppToken(name: string): Promise<{
			app: { id: string; name: string; description?: string | null };
			accessToken: string;
		}> {
			const created = await api('app/create', {
				name,
				description: `${name} description`,
				permission: ['read:account'],
				callbackUrl: null,
			}, alice);
			assert.strictEqual(created.status, 200);
			const appSecret = created.body.secret;
			if (typeof appSecret !== 'string') {
				assert.fail('app secret is missing');
			}

			const generated = await api('auth/session/generate', {
				appSecret,
			});
			assert.strictEqual(generated.status, 200);
			const sessionToken = generated.body.token;
			assert.strictEqual(typeof sessionToken, 'string');

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

			return {
				app: created.body,
				accessToken,
			};
		}

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

		test('i/apps と i/authorized-apps で連携アプリトークンを取得して revoke できる', async () => {
			const byToken = await createLegacyAppToken(`i apps revoke by token ${Date.now()}`);
			const byTokenId = await createLegacyAppToken(`i apps revoke by tokenId ${Date.now()}`);

			const list = await api('i/apps', { sort: '-createdAt' }, alice);
			assert.strictEqual(list.status, 200);
			const tokenItem = list.body.find(item => item.name === byToken.app.name);
			const tokenIdItem = list.body.find(item => item.name === byTokenId.app.name);
			assert.ok(tokenItem);
			assert.ok(tokenIdItem);
			assert.strictEqual(tokenItem.permission.includes('read:account'), true);
			assert.strictEqual(tokenItem.description, `${byToken.app.name} description`);
			assert.strictEqual(typeof tokenItem.createdAt, 'string');

			const authorized = await api('i/authorized-apps', { limit: 100, sort: 'desc' }, alice);
			assert.strictEqual(authorized.status, 200);
			const authorizedApp = authorized.body.find(app => app.id === byToken.app.id);
			assert.ok(authorizedApp);
			assert.strictEqual(authorizedApp.name, byToken.app.name);
			assert.strictEqual(authorizedApp.isAuthorized, true);

			const denied = await api('i/apps', {}, { token: byToken.accessToken });
			assert.strictEqual(denied.status, 400);
			assert.strictEqual(castAsError(denied.body as any).error.code, 'ACCESS_DENIED');

			const revokedByToken = await api('i/revoke-token', { token: byToken.accessToken }, alice);
			assert.strictEqual(revokedByToken.status, 204);
			const revokedCredential = await api('i', {}, { token: byToken.accessToken });
			assert.strictEqual(revokedCredential.status, 401);
			assert.strictEqual(castAsError(revokedCredential.body as any).error.code, 'AUTHENTICATION_FAILED');

			const revokedByTokenId = await api('i/revoke-token', { tokenId: tokenIdItem.id }, alice);
			assert.strictEqual(revokedByTokenId.status, 204);
			const afterRevoke = await api('i/authorized-apps', { limit: 100 }, alice);
			assert.strictEqual(afterRevoke.status, 200);
			assert.strictEqual(afterRevoke.body.some(app => app.id === byToken.app.id), false);
			assert.strictEqual(afterRevoke.body.some(app => app.id === byTokenId.app.id), false);
		});
	});

	describe('role endpoints', () => {
		test('roles/list and roles/show return packed public role data', async () => {
			const config = loadConfig();
			const now = Date.now();
			const createdRole = await createRoleInDatabase(db, {
				id: genId(config, now - 1000),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono public role ${now}`,
				description: 'Hono role endpoint test',
				color: '#2255aa',
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: 'ebef1684-672d-49b6-ad82-1b3ec3784f85',
					type: 'isRemote',
				},
				isPublic: true,
				isAdministrator: false,
				isModerator: false,
				isExplorable: true,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 4242,
				policies: {},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now - 999),
				userId: bob.id,
				roleId: createdRole.id,
				expiresAt: null,
			});

			const unauthorizedList = await api('roles/list', {});
			assert.strictEqual(unauthorizedList.status, 401);
			assert.strictEqual(castAsError(unauthorizedList.body as any).error.code, 'CREDENTIAL_REQUIRED');

			const list = await api('roles/list', {}, alice);
			assert.strictEqual(list.status, 200);
			const listedRole = list.body.find(item => item.id === createdRole.id);
			assert.ok(listedRole);
			assert.strictEqual(listedRole.name, createdRole.name);
			assert.strictEqual(listedRole.description, createdRole.description);
			assert.strictEqual(listedRole.color, createdRole.color);
			assert.strictEqual(listedRole.isPublic, true);
			assert.strictEqual(listedRole.isExplorable, true);
			assert.strictEqual(listedRole.displayOrder, 4242);
			assert.strictEqual(listedRole.usersCount, 1);
			assert.strictEqual(listedRole.policies.canInvite.useDefault, true);

			const shown = await api('roles/show', { roleId: createdRole.id });
			assert.strictEqual(shown.status, 200);
			assert.strictEqual(shown.body.id, createdRole.id);
			assert.strictEqual(shown.body.name, createdRole.name);
			assert.strictEqual(shown.body.usersCount, 1);

			const missing = await api('roles/show', { roleId: '000000000000000000000000' });
			assert.strictEqual(missing.status, 400);
			assert.strictEqual(castAsError(missing.body as any).error.code, 'NO_SUCH_ROLE');
		});
	});

	describe('admin/roles', () => {
		test('admin/roles は作成、一覧、表示、scope、権限、ログを維持する', async () => {
			const now = Date.now();
			const config = loadConfig();
			const createPayload = {
				name: `Hono admin role ${now}`,
				description: 'Hono admin role endpoint test',
				color: '#3366cc',
				iconUrl: null,
				target: 'manual' as const,
				condFormula: {
					id: '018d87a0-7f78-48b4-9ee8-1e22e6f73089',
					type: 'isRemote',
				} as any,
				isPublic: true,
				isModerator: false,
				isAdministrator: false,
				isExplorable: true,
				asBadge: false,
				preserveAssignmentOnMoveAccount: true,
				canEditMembersByModerator: false,
				displayOrder: 313,
				policies: {
					canInvite: { useDefault: false, priority: 0, value: true },
				},
			};

			const created = await api('admin/roles/create', createPayload, alice);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.name, createPayload.name);
			assert.strictEqual(created.body.description, createPayload.description);
			assert.strictEqual(created.body.color, createPayload.color);
			assert.strictEqual(created.body.isPublic, true);
			assert.strictEqual(created.body.isExplorable, true);
			assert.strictEqual(created.body.preserveAssignmentOnMoveAccount, true);
			assert.strictEqual(created.body.displayOrder, createPayload.displayOrder);
			assert.strictEqual(created.body.usersCount, 0);
			assert.strictEqual(created.body.policies.canInvite.useDefault, false);
			assert.strictEqual(created.body.policies.canInvite.value, true);

			const list = await api('admin/roles/list', {}, alice);
			assert.strictEqual(list.status, 200);
			const listedRole = list.body.find(item => item.id === created.body.id);
			assert.ok(listedRole);
			assert.strictEqual(listedRole.name, createPayload.name);
			assert.strictEqual(listedRole.usersCount, 0);

			const shown = await api('admin/roles/show', { roleId: created.body.id }, alice);
			assert.strictEqual(shown.status, 200);
			assert.strictEqual(shown.body.id, created.body.id);
			assert.strictEqual(shown.body.name, createPayload.name);
			assert.strictEqual(shown.body.policies.canInvite.value, true);

			const updated = await api('admin/roles/update', {
				roleId: created.body.id,
				name: `Hono admin role updated ${now}`,
				description: 'updated role description',
				color: null,
				isPublic: false,
				preserveAssignmentOnMoveAccount: false,
				displayOrder: 314,
				policies: {
					canInvite: { useDefault: false, priority: 0, value: false },
				} as any,
			}, alice);
			assert.strictEqual(updated.status, 204);

			const afterUpdate = await api('admin/roles/show', { roleId: created.body.id }, alice);
			assert.strictEqual(afterUpdate.status, 200);
			assert.strictEqual(afterUpdate.body.name, `Hono admin role updated ${now}`);
			assert.strictEqual(afterUpdate.body.description, 'updated role description');
			assert.strictEqual(afterUpdate.body.color, null);
			assert.strictEqual(afterUpdate.body.isPublic, false);
			assert.strictEqual(afterUpdate.body.displayOrder, 314);
			assert.strictEqual(afterUpdate.body.policies.canInvite.value, false);

			const missingUpdate = await api('admin/roles/update', { roleId: '000000000000000000000000' }, alice);
			assert.strictEqual(missingUpdate.status, 400);
			assert.strictEqual(castAsError(missingUpdate.body as any).error.code, 'NO_SUCH_ROLE');

			const missing = await api('admin/roles/show', { roleId: '000000000000000000000000' }, alice);
			assert.strictEqual(missing.status, 400);
			assert.strictEqual(castAsError(missing.body as any).error.code, 'NO_SUCH_ROLE');

			const readToken = await createAppToken(alice, ['read:admin:roles']);
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 1000),
				userId: bob.id,
				roleId: created.body.id,
				expiresAt: null,
			});
			const carolRoleAssignment = await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 1001),
				userId: carol.id,
				roleId: created.body.id,
				expiresAt: new Date(now + 60 * 1000),
			});
			const users = await api('admin/roles/users', {
				roleId: created.body.id,
				limit: 1,
			}, { token: readToken });
			assert.strictEqual(users.status, 200);
			assert.strictEqual(users.body.length, 1);
			assert.strictEqual(users.body[0].id, carolRoleAssignment.id);
			assert.strictEqual(users.body[0].user.id, carol.id);
			assert.strictEqual(users.body[0].user.username, carol.username);
			assert.strictEqual(users.body[0].expiresAt, new Date(now + 60 * 1000).toISOString());

			const missingUsersRole = await api('admin/roles/users', { roleId: '000000000000000000000000' }, alice);
			assert.strictEqual(missingUsersRole.status, 400);
			assert.strictEqual(castAsError(missingUsersRole.body as any).error.code, 'NO_SUCH_ROLE');

			const assignTarget = await signup({ username: `hrolasg${now.toString(36)}` });
			const assignableRole = await api('admin/roles/create', {
				...createPayload,
				name: `Hono admin assign role ${now}`,
				isPublic: true,
				canEditMembersByModerator: true,
			}, alice);
			assert.strictEqual(assignableRole.status, 200);

			const scopeDenied = await api('admin/roles/create', {
				...createPayload,
				name: `Hono admin role denied ${now}`,
			}, { token: readToken });
			assert.strictEqual(scopeDenied.status, 403);
			assert.strictEqual(castAsError(scopeDenied.body as any).error.code, 'PERMISSION_DENIED');
			const assignScopeDenied = await api('admin/roles/assign', {
				roleId: assignableRole.body.id,
				userId: assignTarget.id,
			}, { token: readToken });
			assert.strictEqual(assignScopeDenied.status, 403);
			assert.strictEqual(castAsError(assignScopeDenied.body as any).error.code, 'PERMISSION_DENIED');

			const assignExpiresAt = now + 60 * 60 * 1000;
			const assigned = await api('admin/roles/assign', {
				roleId: assignableRole.body.id,
				userId: assignTarget.id,
				expiresAt: assignExpiresAt,
			}, alice);
			assert.strictEqual(assigned.status, 204, JSON.stringify(assigned.body));
			const assignment = await fetchRoleAssignmentByUserIdAndRoleIdFromDatabase(db, assignTarget.id, assignableRole.body.id);
			assert.ok(assignment);
			assert.strictEqual(assignment.expiresAt?.toISOString(), new Date(assignExpiresAt).toISOString());

			const redis = createRedisClient(config);
			try {
				await new Promise(resolve => setTimeout(resolve, 100));
				const entries = await redis.xrevrange(`notificationTimeline:${assignTarget.id}`, '+', '-', 'COUNT', 10);
				const notifications = entries.map(([, values]) => {
					const dataIndex = values.findIndex(value => value === 'data');
					return JSON.parse(values[dataIndex + 1]!) as { type?: string; roleId?: string };
				});
				const roleAssignedNotification = notifications.find(notification =>
					notification.type === 'roleAssigned' && notification.roleId === assignableRole.body.id);
				assert.ok(roleAssignedNotification);
			} finally {
				await closeRedisConnection(redis);
			}

			const normalUser = await signup({ username: `honorole${now.toString(36)}` });
			const roleDenied = await api('admin/roles/list', {}, normalUser);
			assert.strictEqual(roleDenied.status, 403);
			assert.strictEqual(castAsError(roleDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');
			const usersRoleDenied = await api('admin/roles/users', { roleId: created.body.id }, normalUser);
			assert.strictEqual(usersRoleDenied.status, 403);
			assert.strictEqual(castAsError(usersRoleDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');
			const assignRoleDenied = await api('admin/roles/assign', { roleId: assignableRole.body.id, userId: assignTarget.id }, normalUser);
			assert.strictEqual(assignRoleDenied.status, 403);
			assert.strictEqual(castAsError(assignRoleDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');

			const moderatorRole = await createRoleInDatabase(db, {
				id: genId(config, now + 2000),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono moderator role ${now}`,
				description: 'Hono moderator role',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: 'a6a0035c-2910-4dac-9b35-f226c07d63ab',
					type: 'isRemote',
				},
				isPublic: false,
				isAdministrator: false,
				isModerator: true,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: true,
				displayOrder: 1,
				policies: {},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 2001),
				userId: normalUser.id,
				roleId: moderatorRole.id,
				expiresAt: null,
			});
			const accessDenied = await api('admin/roles/assign', {
				roleId: created.body.id,
				userId: assignTarget.id,
			}, normalUser);
			assert.strictEqual(accessDenied.status, 400);
			assert.strictEqual(castAsError(accessDenied.body as any).error.code, 'ACCESS_DENIED');

			const unassigned = await api('admin/roles/unassign', {
				roleId: assignableRole.body.id,
				userId: assignTarget.id,
			}, alice);
			assert.strictEqual(unassigned.status, 204);
			assert.strictEqual(await fetchRoleAssignmentByUserIdAndRoleIdFromDatabase(db, assignTarget.id, assignableRole.body.id), null);

			const unassignedAgain = await api('admin/roles/unassign', {
				roleId: assignableRole.body.id,
				userId: assignTarget.id,
			}, alice);
			assert.strictEqual(unassignedAgain.status, 400);
			assert.strictEqual(castAsError(unassignedAgain.body as any).error.code, 'NOT_ASSIGNED');

			const missingAssignUser = await api('admin/roles/assign', {
				roleId: assignableRole.body.id,
				userId: '000000000000000000000000',
			}, alice);
			assert.strictEqual(missingAssignUser.status, 400);
			assert.strictEqual(castAsError(missingAssignUser.body as any).error.code, 'NO_SUCH_USER');
			const missingUnassignRole = await api('admin/roles/unassign', {
				roleId: '000000000000000000000000',
				userId: assignTarget.id,
			}, alice);
			assert.strictEqual(missingUnassignRole.status, 400);
			assert.strictEqual(castAsError(missingUnassignRole.body as any).error.code, 'NO_SUCH_ROLE');

			const defaultPolicyUser = await signup({ username: `honorolepol${now.toString(36)}` });
			const beforeMeta = await fetchMetaFromDatabase(db);
			try {
				const updatedDefaultPolicies = await api('admin/roles/update-default-policies', {
					policies: {
						...beforeMeta.policies,
						canInvite: true,
						inviteLimit: 2,
						inviteLimitCycle: 60,
						inviteExpirationTime: 0,
					} as any,
				}, alice);
				assert.strictEqual(updatedDefaultPolicies.status, 204);

				const afterMeta = await fetchMetaFromDatabase(db);
				assert.strictEqual(afterMeta.policies.canInvite, true);
				assert.strictEqual(afterMeta.policies.inviteLimit, 2);

				const inviteLimit = await api('invite/limit', {}, defaultPolicyUser);
				assert.strictEqual(inviteLimit.status, 200);
				assert.strictEqual(inviteLimit.body.remaining, 2);

				const updateDefaultScopeDenied = await api('admin/roles/update-default-policies', {
					policies: afterMeta.policies as any,
				}, { token: readToken });
				assert.strictEqual(updateDefaultScopeDenied.status, 403);
				assert.strictEqual(castAsError(updateDefaultScopeDenied.body as any).error.code, 'PERMISSION_DENIED');

				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'updateServerSettings',
					search: 'canInvite',
				});
				assert.ok(logs.length > 0);
			} finally {
				await api('admin/roles/update-default-policies', { policies: beforeMeta.policies as any }, alice);
			}

			const assignmentLogTypes = ['assignRole', 'unassignRole'] as const;
			const assignmentLogged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of assignmentLogTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: assignableRole.body.id,
					});
					if (logs.length > 0) assignmentLogged.add(type);
				}
				if (assignmentLogged.size === assignmentLogTypes.length) break;
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			assert.deepStrictEqual([...assignmentLogged].sort(), [...assignmentLogTypes].sort());

			const deletedAssignableRole = await api('admin/roles/delete', { roleId: assignableRole.body.id }, alice);
			assert.strictEqual(deletedAssignableRole.status, 204);

			const deleted = await api('admin/roles/delete', { roleId: created.body.id }, alice);
			assert.strictEqual(deleted.status, 204);

			const afterDelete = await api('admin/roles/show', { roleId: created.body.id }, alice);
			assert.strictEqual(afterDelete.status, 400);
			assert.strictEqual(castAsError(afterDelete.body as any).error.code, 'NO_SUCH_ROLE');

			const missingDelete = await api('admin/roles/delete', { roleId: '000000000000000000000000' }, alice);
			assert.strictEqual(missingDelete.status, 400);
			assert.strictEqual(castAsError(missingDelete.body as any).error.code, 'NO_SUCH_ROLE');

			const logTypes = ['createRole', 'updateRole', 'deleteRole'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			assert.deepStrictEqual([...logged].sort(), [...logTypes].sort());
		});
	});

	describe('invite', () => {
		test('invite/limit keeps role policy, token scope, and remaining count semantics', async () => {
			const config = loadConfig();
			const now = Date.now();
			const inviter = await signup({ username: `honoinv${now.toString(36)}` });
			const deniedUser = await signup({ username: `honoinvdeny${now.toString(36)}` });
			const inviterRole = await createRoleInDatabase(db, {
				id: genId(config, now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono invite role ${now}`,
				description: 'Hono invite role',
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
				policies: {
					canInvite: {
						useDefault: false,
						priority: 1,
						value: true,
					},
					inviteLimit: {
						useDefault: false,
						priority: 1,
						value: 2,
					},
					inviteLimitCycle: {
						useDefault: false,
						priority: 1,
						value: 60,
					},
				},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 1),
				userId: inviter.id,
				roleId: inviterRole.id,
				expiresAt: null,
			});
			await createRegistrationTicketInDatabase(db, {
				id: genId(config, now - 1000),
				code: `hono-invite-recent-${now}`,
				createdById: inviter.id,
			});
			await createRegistrationTicketInDatabase(db, {
				id: genId(config, now - (1000 * 60 * 120)),
				code: `hono-invite-old-${now}`,
				createdById: inviter.id,
			});

			const allowed = await api('invite/limit', {}, inviter);
			assert.strictEqual(allowed.status, 200);
			assert.strictEqual(allowed.body.remaining, 1);

			const roleDenied = await api('invite/limit', {}, deniedUser);
			assert.strictEqual(roleDenied.status, 403);
			assert.strictEqual(castAsError(roleDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');
			assert.strictEqual(castAsError(roleDenied.body as any).error.id, 'c3d38592-54c0-429d-be96-5636b0431a61');

			const readAccountToken = await createAppToken(inviter, ['read:account']);
			const scopeDenied = await api('invite/limit', {}, { token: readAccountToken });
			assert.strictEqual(scopeDenied.status, 403);
			assert.strictEqual(castAsError(scopeDenied.body as any).error.code, 'PERMISSION_DENIED');
		});

		test('invite/create したコードを invite/list で取得でき、invite/delete で削除できる', async () => {
			const config = loadConfig();
			const now = Date.now();
			const inviterRole = await createRoleInDatabase(db, {
				id: genId(config, now + 10),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Invite role ${now}`,
				description: 'Invite role',
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
				policies: {
					canInvite: {
						priority: 0,
						useDefault: false,
						value: true,
					},
				},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 11),
				userId: bob.id,
				roleId: inviterRole.id,
				expiresAt: null,
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 12),
				userId: carol.id,
				roleId: inviterRole.id,
				expiresAt: null,
			});

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
			const expiresAt = new Date(Date.now() + 1000 * 60 * 60).toISOString();
			const created = await api('admin/invite/create', { count: 2, expiresAt }, alice);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.length, 2);
			assert.strictEqual(created.body[0].createdBy?.id, alice.id);
			assert.strictEqual(created.body[0].used, false);
			assert.strictEqual(created.body[0].usedAt, null);
			assert.strictEqual(created.body[0].expiresAt, expiresAt);

			const list = await api('admin/invite/list', { type: 'unused' }, alice);
			assert.strictEqual(list.status, 200);
			for (const ticket of created.body) {
				assert.ok(list.body.some(x => x.id === ticket.id));
			}

			const invalidDate = await api('admin/invite/create', { expiresAt: 'invalid-date' }, alice);
			assert.strictEqual(invalidDate.status, 400);
			assert.strictEqual(castAsError(invalidDate.body as any).error.code, 'INVALID_DATE_TIME');
			assert.strictEqual(castAsError(invalidDate.body as any).error.id, 'f1380b15-3760-4c6c-a1db-5c3aaf1cbd49');

			const readAdminInviteToken = await createAppToken(alice, ['read:admin:invite-codes']);
			const scopeDenied = await api('admin/invite/create', {}, { token: readAdminInviteToken });
			assert.strictEqual(scopeDenied.status, 403);
			assert.strictEqual(castAsError(scopeDenied.body as any).error.code, 'PERMISSION_DENIED');

			const normalUser = await signup({ username: `honoadmininv${Date.now().toString(36)}` });
			const moderatorDenied = await api('admin/invite/list', {}, normalUser);
			assert.strictEqual(moderatorDenied.status, 403);
			assert.strictEqual(castAsError(moderatorDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');

			let logged = false;
			for (let i = 0; i < 10; i++) {
				const logs = await listModerationLogsFromDatabase(db, {
					limit: 10,
					order: 'desc',
					type: 'createInvitation',
					userId: alice.id,
				});
				logged = logs.some(log => {
					const info = log.info as { invitations?: { id?: string }[] };
					return info.invitations?.some(ticket => ticket.id === created.body[0].id) === true;
				});
				if (logged) break;
				await new Promise(resolve => setTimeout(resolve, 10));
			}
			assert.ok(logged);
		});
	});

	describe('admin/show-moderation-logs', () => {
		test('admin/show-moderation-logs は検索、ユーザー pack、権限を維持する', async () => {
			const config = loadConfig();
			const now = Date.now();
			const marker = `hono moderation log ${now}`;
			const id = genId(config, now);
			await createModerationLogInDatabase(db, {
				id,
				userId: alice.id,
				type: 'updateUserNote',
				info: {
					userId: bob.id,
					before: '',
					after: marker,
				},
			});

			const list = await api('admin/show-moderation-logs', {
				type: 'updateUserNote',
				userId: alice.id,
				search: marker,
			}, alice);
			assert.strictEqual(list.status, 200);
			assert.strictEqual(list.body.length, 1);
			assert.strictEqual(list.body[0].id, id);
			assert.strictEqual(list.body[0].createdAt, new Date(now).toISOString());
			assert.strictEqual(list.body[0].type, 'updateUserNote');
			assert.strictEqual(list.body[0].info.after, marker);
			assert.strictEqual(list.body[0].userId, alice.id);
			assert.strictEqual(list.body[0].user.id, alice.id);
			assert.strictEqual(list.body[0].user.username, alice.username);

			const scopeDeniedToken = await createAppToken(alice, ['read:admin:server-info']);
			const scopeDenied = await api('admin/show-moderation-logs', {}, { token: scopeDeniedToken });
			assert.strictEqual(scopeDenied.status, 403);
			assert.strictEqual(castAsError(scopeDenied.body as any).error.code, 'PERMISSION_DENIED');

			const normalUser = await signup({ username: `honomodlog${now.toString(36)}` });
			const adminDenied = await api('admin/show-moderation-logs', {}, normalUser);
			assert.strictEqual(adminDenied.status, 403);
			assert.strictEqual(castAsError(adminDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');
		});
	});

	describe('admin/captcha', () => {
		test('admin/captcha/current と admin/captcha/save は設定取得、保存、scope、権限を維持する', async () => {
			const initial = await api('admin/captcha/current', {}, alice);
			assert.strictEqual(initial.status, 200);
			assert.strictEqual(typeof initial.body.provider, 'string');
			assert.ok(initial.body.hcaptcha);
			assert.ok(initial.body.mcaptcha);
			assert.ok(initial.body.recaptcha);
			assert.ok(initial.body.turnstile);

			try {
				const invalid = await api('admin/captcha/save', {
					provider: 'testcaptcha',
				}, alice);
				assert.strictEqual(invalid.status, 400);
				assert.strictEqual(castAsError(invalid.body as any).error.code, 'INVALID_PARAMETERS');

				const saved = await api('admin/captcha/save', {
					provider: 'testcaptcha',
					captchaResult: 'testcaptcha-passed',
				}, alice);
				assert.strictEqual(saved.status, 204);

				const current = await api('admin/captcha/current', {}, alice);
				assert.strictEqual(current.status, 200);
				assert.strictEqual(current.body.provider, 'testcaptcha');
			} finally {
				await api('admin/captcha/save', { provider: 'none' }, alice);
			}

			const readToken = await createAppToken(alice, ['read:admin:meta']);
			const scopeDenied = await api('admin/captcha/save', { provider: 'none' }, { token: readToken });
			assert.strictEqual(scopeDenied.status, 403);
			assert.strictEqual(castAsError(scopeDenied.body as any).error.code, 'PERMISSION_DENIED');

			const normalUser = await signup({ username: `honocaptcha${Date.now().toString(36)}` });
			const roleDenied = await api('admin/captcha/current', {}, normalUser);
			assert.strictEqual(roleDenied.status, 403);
			assert.strictEqual(castAsError(roleDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');
		});
	});

	describe('admin/announcements', () => {
		test('admin/announcements は作成、一覧、更新、削除、scope、権限、ログを維持する', async () => {
			const now = Date.now();
			const title = `hono-announcement-${now}`;
			const created = await api('admin/announcements/create', {
				title,
				text: 'announcement body',
				imageUrl: null,
				icon: 'info',
				display: 'normal',
				forExistingUsers: false,
				silence: false,
				needConfirmationToRead: true,
			}, alice);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.title, title);
			assert.strictEqual(created.body.imageUrl, null);
			assert.strictEqual((created.body as any).needConfirmationToRead, true);

			const list = await api('admin/announcements/list', { limit: 20, status: 'active' }, alice);
			assert.strictEqual(list.status, 200);
			const listed = list.body.find(announcement => announcement.id === created.body.id);
			assert.ok(listed);
			assert.strictEqual(listed.title, title);
			assert.strictEqual(listed.reads, 0);
			assert.strictEqual(listed.isActive, true);

			const updated = await api('admin/announcements/update', {
				id: created.body.id,
				title: `${title}-updated`,
				text: 'updated body',
				imageUrl: '',
				isActive: false,
			}, alice);
			assert.strictEqual(updated.status, 204);

			const updatedList = await api('admin/announcements/list', { limit: 20, status: 'all' }, alice);
			assert.strictEqual(updatedList.status, 200);
			const updatedAnnouncement = updatedList.body.find(announcement => announcement.id === created.body.id);
			assert.ok(updatedAnnouncement);
			assert.strictEqual(updatedAnnouncement.title, `${title}-updated`);
			assert.strictEqual(updatedAnnouncement.text, 'updated body');
			assert.strictEqual(updatedAnnouncement.imageUrl, null);
			assert.strictEqual(updatedAnnouncement.isActive, false);

			const noSuch = await api('admin/announcements/update', {
				id: '0000000000000000',
				title: 'missing',
			}, alice);
			assert.strictEqual(noSuch.status, 400);
			assert.strictEqual(castAsError(noSuch.body as any).error.code, 'NO_SUCH_ANNOUNCEMENT');

			const readToken = await createAppToken(alice, ['read:admin:announcements']);
			const scopeDenied = await api('admin/announcements/create', {
				title,
				text: 'announcement body',
				imageUrl: null,
			}, { token: readToken });
			assert.strictEqual(scopeDenied.status, 403);
			assert.strictEqual(castAsError(scopeDenied.body as any).error.code, 'PERMISSION_DENIED');

			const normalUser = await signup({ username: `honoannounce${now.toString(36)}` });
			const roleDenied = await api('admin/announcements/list', {}, normalUser);
			assert.strictEqual(roleDenied.status, 403);
			assert.strictEqual(castAsError(roleDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');

			const deleted = await api('admin/announcements/delete', { id: created.body.id }, alice);
			assert.strictEqual(deleted.status, 204);

			const afterDelete = await api('admin/announcements/list', { limit: 20, status: 'all' }, alice);
			assert.strictEqual(afterDelete.status, 200);
			assert.ok(!afterDelete.body.some(announcement => announcement.id === created.body.id));

			const logTypes = ['createGlobalAnnouncement', 'updateGlobalAnnouncement', 'deleteGlobalAnnouncement'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			assert.deepStrictEqual([...logged].sort(), [...logTypes].sort());
		});
	});

	describe('admin/avatar-decorations', () => {
		test('admin/avatar-decorations は作成、一覧、更新、削除、scope、ポリシー、ログを維持する', async () => {
			const now = Date.now();
			const manager = await signup({ username: `honoavmgr${now.toString(36)}` });
			const config = loadConfig();
			const managerRole = await createRoleInDatabase(db, {
				id: genId(config, now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `avatar manager ${now}`,
				description: 'Hono avatar decoration admin role',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: '7b29574c-ae8b-42b5-8127-3496ac6ea20c',
					type: 'isRemote',
				},
				isPublic: false,
				isAdministrator: false,
				isModerator: false,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 0,
				policies: {
					canManageAvatarDecorations: { useDefault: false, priority: 0, value: true },
				},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 1),
				userId: manager.id,
				roleId: managerRole.id,
				expiresAt: null,
			});

			const created = await api('admin/avatar-decorations/create', {
				name: `hono-avatar-${now}`,
				description: 'avatar decoration body',
				url: 'https://example.test/avatar-decoration.png',
				roleIdsThatCanBeUsedThisDecoration: [managerRole.id],
				category: 'hono',
			}, manager);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.name, `hono-avatar-${now}`);
			assert.strictEqual(created.body.category, 'hono');
			assert.deepStrictEqual(created.body.roleIdsThatCanBeUsedThisDecoration, [managerRole.id]);

			const list = await api('admin/avatar-decorations/list', {}, manager);
			assert.strictEqual(list.status, 200);
			assert.ok(list.body.some(decoration => decoration.id === created.body.id));

			const updated = await api('admin/avatar-decorations/update', {
				id: created.body.id,
				name: `hono-avatar-${now}-updated`,
				description: 'updated body',
				category: null,
			}, manager);
			assert.strictEqual(updated.status, 204);

			const updatedList = await api('admin/avatar-decorations/list', {}, manager);
			assert.strictEqual(updatedList.status, 200);
			const updatedDecoration = updatedList.body.find(decoration => decoration.id === created.body.id);
			assert.ok(updatedDecoration);
			assert.strictEqual(updatedDecoration.name, `hono-avatar-${now}-updated`);
			assert.strictEqual(updatedDecoration.description, 'updated body');
			assert.strictEqual(updatedDecoration.category, null);

			const readToken = await createAppToken(manager, ['read:admin:avatar-decorations']);
			const scopeDenied = await api('admin/avatar-decorations/create', {
				name: `hono-avatar-${now}-denied`,
				description: 'avatar decoration body',
				url: 'https://example.test/avatar-decoration.png',
			}, { token: readToken });
			assert.strictEqual(scopeDenied.status, 403);
			assert.strictEqual(castAsError(scopeDenied.body as any).error.code, 'PERMISSION_DENIED');

			const policyDeniedUser = await signup({ username: `honoavden${now.toString(36)}` });
			const policyDenied = await api('admin/avatar-decorations/list', {}, policyDeniedUser);
			assert.strictEqual(policyDenied.status, 403);
			assert.strictEqual(castAsError(policyDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');

			const deleted = await api('admin/avatar-decorations/delete', { id: created.body.id }, manager);
			assert.strictEqual(deleted.status, 204);

			const afterDelete = await api('admin/avatar-decorations/list', {}, manager);
			assert.strictEqual(afterDelete.status, 200);
			assert.ok(!afterDelete.body.some(decoration => decoration.id === created.body.id));

			const logTypes = ['createAvatarDecoration', 'updateAvatarDecoration', 'deleteAvatarDecoration'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			assert.deepStrictEqual([...logged].sort(), [...logTypes].sort());
		});
	});

	describe('admin/ad', () => {
		test('admin/ad は作成、一覧、更新、削除、scope、権限、ログを維持する', async () => {
			const now = Date.now();
			const createPayload = {
				url: 'https://example.test/ad',
				memo: `hono-ad-${now}`,
				place: 'square',
				priority: 'middle',
				ratio: 1,
				expiresAt: now + 1000 * 60 * 60,
				startsAt: now - 1000 * 60,
				imageUrl: 'https://example.test/ad.png',
				dayOfWeek: 0,
				isSensitive: true,
			};

			const created = await api('admin/ad/create', createPayload, alice);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.memo, createPayload.memo);
			assert.strictEqual(created.body.isSensitive, true);

			const list = await api('admin/ad/list', { limit: 20 }, alice);
			assert.strictEqual(list.status, 200);
			assert.ok(list.body.some(ad => ad.id === created.body.id));

			const updated = await api('admin/ad/update', {
				id: created.body.id,
				memo: `${createPayload.memo}-updated`,
				ratio: 3,
				isSensitive: false,
			}, alice);
			assert.strictEqual(updated.status, 204);

			const updatedList = await api('admin/ad/list', { limit: 20 }, alice);
			assert.strictEqual(updatedList.status, 200);
			const updatedAd = updatedList.body.find(ad => ad.id === created.body.id);
			assert.ok(updatedAd);
			assert.strictEqual(updatedAd.memo, `${createPayload.memo}-updated`);
			assert.strictEqual(updatedAd.ratio, 3);
			assert.strictEqual(updatedAd.isSensitive, false);

			const noSuch = await api('admin/ad/update', {
				id: '0000000000000000',
				memo: 'missing',
			}, alice);
			assert.strictEqual(noSuch.status, 400);
			assert.strictEqual(castAsError(noSuch.body as any).error.code, 'NO_SUCH_AD');

			const readToken = await createAppToken(alice, ['read:admin:ad']);
			const scopeDenied = await api('admin/ad/create', createPayload, { token: readToken });
			assert.strictEqual(scopeDenied.status, 403);
			assert.strictEqual(castAsError(scopeDenied.body as any).error.code, 'PERMISSION_DENIED');

			const normalUser = await signup({ username: `honoad${now.toString(36)}` });
			const roleDenied = await api('admin/ad/list', {}, normalUser);
			assert.strictEqual(roleDenied.status, 403);
			assert.strictEqual(castAsError(roleDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');

			const deleted = await api('admin/ad/delete', { id: created.body.id }, alice);
			assert.strictEqual(deleted.status, 204);

			const afterDelete = await api('admin/ad/list', { limit: 20 }, alice);
			assert.strictEqual(afterDelete.status, 200);
			assert.ok(!afterDelete.body.some(ad => ad.id === created.body.id));

			const logTypes = ['createAd', 'updateAd', 'deleteAd'] as const;
			const logged = new Set<string>();
			for (let i = 0; i < 10; i++) {
				for (const type of logTypes) {
					const logs = await listModerationLogsFromDatabase(db, {
						limit: 10,
						order: 'desc',
						type,
						search: created.body.id,
					});
					if (logs.length > 0) logged.add(type);
				}
				if (logged.size === logTypes.length) break;
				await new Promise(resolve => setTimeout(resolve, 100));
			}

			assert.deepStrictEqual([...logged].sort(), [...logTypes].sort());
		});
	});

	describe('admin database stats', () => {
		test('admin/get-index-stats と admin/get-table-stats はDB統計を返し、scopeを維持する', async () => {
			const indexes = await api('admin/get-index-stats', {}, alice);
			assert.strictEqual(indexes.status, 200);
			assert.ok(Array.isArray(indexes.body));
			assert.ok(indexes.body.some(row => typeof row.tablename === 'string' && typeof row.indexname === 'string'));

			const tables = await api('admin/get-table-stats', {}, alice);
			assert.strictEqual(tables.status, 200);
			assert.ok(Object.keys(tables.body).length > 0);
			assert.ok(Object.values(tables.body).some(row => typeof row.count === 'number' && typeof row.size === 'number'));

			const indexToken = await createAppToken(alice, ['read:admin:index-stats']);
			const tableScopeDenied = await api('admin/get-table-stats', {}, { token: indexToken });
			assert.strictEqual(tableScopeDenied.status, 403);
			assert.strictEqual(castAsError(tableScopeDenied.body as any).error.code, 'PERMISSION_DENIED');

			const normalUser = await signup({ username: `honostats${Date.now().toString(36)}` });
			const roleDenied = await api('admin/get-table-stats', {}, normalUser);
			assert.strictEqual(roleDenied.status, 403);
			assert.strictEqual(castAsError(roleDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');
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

	describe('Hono channel read endpoints', () => {
		test('featured, owned, followed, and my-favorites preserve caller-scoped flags', async () => {
			const config = loadConfig();
			const stamp = Date.now().toString(36);
			const owned = await createChannelInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `hono-owned-${stamp}`,
				description: 'hono owned channel',
				lastNotedAt: new Date('2024-01-01T00:00:00.000Z'),
			});
			const followed = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `hono-followed-${stamp}`,
				description: 'hono followed channel',
				lastNotedAt: new Date('2024-01-02T00:00:00.000Z'),
			});
			const archived = await createChannelInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `hono-archived-${stamp}`,
				description: 'hono archived channel',
				lastNotedAt: new Date('2024-01-03T00:00:00.000Z'),
				isArchived: true,
			});
			await createChannelFollowingInDatabase(db, {
				id: genId(config),
				followerId: alice.id,
				followeeId: followed.id,
			});
			await createChannelFavoriteInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				channelId: followed.id,
			});
			await createChannelMutingInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				channelId: followed.id,
			});

			const featuredAnonymous = await api('channels/featured', {});
			assert.strictEqual(featuredAnonymous.status, 200);
			const anonymousFeatured = (featuredAnonymous.body as any[]).find(channel => channel.id === followed.id);
			assert.ok(anonymousFeatured);
			assert.strictEqual(Object.hasOwn(anonymousFeatured, 'isFollowing'), false);
			assert.strictEqual((featuredAnonymous.body as any[]).some(channel => channel.id === archived.id), false);

			const featured = await api('channels/featured', {}, alice);
			assert.strictEqual(featured.status, 200);
			const featuredFollowed = (featured.body as any[]).find(channel => channel.id === followed.id);
			assert.ok(featuredFollowed);
			assert.strictEqual(featuredFollowed.isFollowing, true);
			assert.strictEqual(featuredFollowed.isFavorited, true);
			assert.strictEqual(featuredFollowed.isMuting, true);

			const ownedList = await api('channels/owned', { limit: 20 }, alice);
			assert.strictEqual(ownedList.status, 200);
			assert.strictEqual((ownedList.body as any[]).some(channel => channel.id === owned.id), true);
			assert.strictEqual((ownedList.body as any[]).some(channel => channel.id === archived.id), false);

			const followedList = await api('channels/followed', { limit: 20 }, alice);
			assert.strictEqual(followedList.status, 200);
			assert.deepStrictEqual((followedList.body as any[]).filter(channel => channel.id === followed.id).map(channel => channel.isFollowing), [true]);

			const favorites = await api('channels/my-favorites', {}, alice);
			assert.strictEqual(favorites.status, 200);
			const favorite = (favorites.body as any[]).find(channel => channel.id === followed.id);
			assert.ok(favorite);
			assert.strictEqual(favorite.isFavorited, true);
		});

		test('channel account read endpoints require read:channels app token permission', async () => {
			const readAccountToken = await createAppToken(alice, ['read:account']);

			for (const [endpoint, params] of [
				['channels/owned', {}],
				['channels/followed', {}],
				['channels/my-favorites', {}],
			] as const) {
				const denied = await api(endpoint, params, { token: readAccountToken });
				assert.strictEqual(denied.status, 403, endpoint);
				assert.strictEqual(castAsError(denied.body as any).error.code, 'PERMISSION_DENIED', endpoint);
			}
		});
	});

	describe('Hono channel write endpoints', () => {
		const createOwnedDriveFile = async (userId: string, seed: string) => {
			const config = loadConfig();
			const md5 = createHash('md5').update(seed).digest('hex');
			return await createDriveFileInDatabase(db, {
				id: genId(config),
				userId,
				userHost: null,
				md5,
				name: `${seed}.png`,
				type: 'image/png',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/${md5}`,
			});
		};

		test('create and update return packed channels with caller-scoped flags', async () => {
			const owner = await signup({ username: `honochnowner${Date.now().toString(36)}` });
			const createdBanner = await createOwnedDriveFile(owner.id, `hono-channel-create-${Date.now()}`);
			const created = await api('channels/create', {
				name: `hono-channel-create-${Date.now().toString(36)}`,
				description: 'hono channel create target',
				bannerId: createdBanner.id,
				color: '#123456',
				isSensitive: true,
				allowRenoteToExternal: false,
			}, owner);
			assert.strictEqual(created.status, 200);
			assert.strictEqual(created.body.userId, owner.id);
			assert.strictEqual(created.body.description, 'hono channel create target');
			assert.strictEqual(created.body.bannerId, createdBanner.id);
			assert.strictEqual(created.body.color, '#123456');
			assert.strictEqual(created.body.isSensitive, true);
			assert.strictEqual(created.body.allowRenoteToExternal, false);
			assert.strictEqual(created.body.isFollowing, false);
			assert.strictEqual(created.body.isFavorited, false);
			assert.strictEqual(created.body.isMuting, false);

			const updatedBanner = await createOwnedDriveFile(owner.id, `hono-channel-update-${Date.now()}`);
			const pinnedNoteId = '000000000000000000000001';
			const updated = await api('channels/update', {
				channelId: created.body.id,
				name: 'hono channel updated',
				description: null,
				bannerId: updatedBanner.id,
				isArchived: true,
				pinnedNoteIds: [pinnedNoteId],
				color: '#654321',
				isSensitive: false,
				allowRenoteToExternal: true,
			}, owner);
			assert.strictEqual(updated.status, 200);
			assert.strictEqual(updated.body.id, created.body.id);
			assert.strictEqual(updated.body.name, 'hono channel updated');
			assert.strictEqual(updated.body.description, null);
			assert.strictEqual(updated.body.bannerId, updatedBanner.id);
			assert.strictEqual(updated.body.isArchived, true);
			assert.deepStrictEqual(updated.body.pinnedNoteIds, [pinnedNoteId]);
			assert.strictEqual(updated.body.color, '#654321');
			assert.strictEqual(updated.body.isSensitive, false);
			assert.strictEqual(updated.body.allowRenoteToExternal, true);
		});

		test('keeps legacy channel create validation, policy, and moved-account errors', async () => {
			const config = loadConfig();
			const now = Date.now();
			const deniedUser = await signup({ username: `honochdeny${now.toString(36)}` });
			const requester = await signup({ username: `honochreq${now.toString(36)}` });
			const fileOwner = await signup({ username: `honochfile${now.toString(36)}` });
			const denyRole = await createRoleInDatabase(db, {
				id: genId(config, now),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono channel create deny role ${now}`,
				description: 'Hono channel create deny role',
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
				policies: {
					canCreateChannel: {
						useDefault: false,
						priority: 2,
						value: false,
					},
				},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 1),
				userId: deniedUser.id,
				roleId: denyRole.id,
				expiresAt: null,
			});

			const policyDenied = await api('channels/create', {
				name: 'hono policy denied channel',
			}, deniedUser);
			assert.strictEqual(policyDenied.status, 403);
			assert.strictEqual(castAsError(policyDenied.body as any).error.code, 'ROLE_PERMISSION_DENIED');
			assert.strictEqual(castAsError(policyDenied.body as any).error.id, 'c3d38592-54c0-429d-be96-5636b0431a61');

			const otherFile = await createOwnedDriveFile(fileOwner.id, `hono-channel-other-file-${now}`);
			const missingFile = await api('channels/create', {
				name: 'hono channel missing file',
				bannerId: otherFile.id,
			}, requester);
			assert.strictEqual(missingFile.status, 400);
			assert.strictEqual(castAsError(missingFile.body as any).error.id, 'cd1e9f3e-5a12-4ab4-96f6-5d0a2cc32050');

			const readToken = await createAppToken(requester, ['read:channels']);
			const permissionDenied = await api('channels/create', {
				name: 'hono channel app denied',
			}, { token: readToken });
			assert.strictEqual(permissionDenied.status, 403);
			assert.strictEqual(castAsError(permissionDenied.body as any).error.code, 'PERMISSION_DENIED');

			const movedUser = await signup({ username: `honochmoved${now.toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});
			const movedDenied = await api('channels/create', {
				name: 'hono moved denied channel',
			}, movedUser);
			assert.strictEqual(movedDenied.status, 403);
			assert.strictEqual(castAsError(movedDenied.body as any).error.code, 'YOUR_ACCOUNT_MOVED');
		});

		test('keeps legacy channel update authorization and file errors', async () => {
			const config = loadConfig();
			const now = Date.now();
			const owner = await signup({ username: `hcupown${now.toString(36)}` });
			const intruder = await signup({ username: `honochupintr${now.toString(36)}` });
			const target = await createChannelInDatabase(db, {
				id: genId(config),
				userId: owner.id,
				name: `hono-update-target-${now.toString(36)}`,
				description: 'hono update target',
			});

			const missing = await api('channels/update', {
				channelId: '000000000000000000000000',
				name: 'missing',
			}, intruder);
			assert.strictEqual(missing.status, 400);
			assert.strictEqual(castAsError(missing.body as any).error.id, 'f9c5467f-d492-4c3c-9a8d-a70dacc86512');

			const denied = await api('channels/update', {
				channelId: target.id,
				name: 'denied',
			}, intruder);
			assert.strictEqual(denied.status, 400);
			assert.strictEqual(castAsError(denied.body as any).error.id, '1fb7cb09-d46a-4fdf-b8df-057788cce513');

			const intruderFile = await createOwnedDriveFile(intruder.id, `hono-channel-intruder-file-${now}`);
			const missingFile = await api('channels/update', {
				channelId: target.id,
				bannerId: intruderFile.id,
			}, owner);
			assert.strictEqual(missingFile.status, 400);
			assert.strictEqual(castAsError(missingFile.body as any).error.id, 'e86c14a4-0da2-4032-8df3-e737a04c7f3b');

			const readToken = await createAppToken(owner, ['read:channels']);
			const permissionDenied = await api('channels/update', {
				channelId: target.id,
				name: 'denied by app scope',
			}, { token: readToken });
			assert.strictEqual(permissionDenied.status, 403);
			assert.strictEqual(castAsError(permissionDenied.body as any).error.code, 'PERMISSION_DENIED');

			const moderator = await signup({ username: `honomod${now.toString(36)}` });
			const moderatorRole = await createRoleInDatabase(db, {
				id: genId(config, now + 2),
				updatedAt: new Date(now),
				lastUsedAt: new Date(now),
				name: `Hono channel moderator role ${now}`,
				description: 'Hono channel moderator role',
				color: null,
				iconUrl: null,
				target: 'manual',
				condFormula: {
					id: 'ebef1684-672d-49b6-ad82-1b3ec3784f85',
					type: 'isRemote',
				},
				isPublic: false,
				isAdministrator: false,
				isModerator: true,
				isExplorable: false,
				asBadge: false,
				preserveAssignmentOnMoveAccount: false,
				canEditMembersByModerator: false,
				displayOrder: 1,
				policies: {},
			});
			await createRoleAssignmentInDatabase(db, {
				id: genId(config, now + 3),
				userId: moderator.id,
				roleId: moderatorRole.id,
				expiresAt: null,
			});

			const moderatorUpdate = await api('channels/update', {
				channelId: target.id,
				name: 'moderator updated channel',
			}, moderator);
			assert.strictEqual(moderatorUpdate.status, 200);
			assert.strictEqual(moderatorUpdate.body.id, target.id);
			assert.strictEqual(moderatorUpdate.body.name, 'moderator updated channel');
		});
	});

	describe('Hono channel follow endpoints', () => {
		test('follow and unfollow update the channel following row', async () => {
			const config = loadConfig();
			const target = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `hono-follow-${Date.now().toString(36)}`,
				description: 'hono follow target',
			});

			const followed = await api('channels/follow', {
				channelId: target.id,
			}, alice);
			assert.strictEqual(followed.status, 204);
			assert.strictEqual(await channelFollowingExistsInDatabase(db, alice.id, target.id), true);

			const unfollowed = await api('channels/unfollow', {
				channelId: target.id,
			}, alice);
			assert.strictEqual(unfollowed.status, 204);
			assert.strictEqual(await channelFollowingExistsInDatabase(db, alice.id, target.id), false);

			const unfollowedAgain = await api('channels/unfollow', {
				channelId: target.id,
			}, alice);
			assert.strictEqual(unfollowedAgain.status, 204);
		});

		test('keeps legacy validation, permission, and moved-account errors', async () => {
			const config = loadConfig();
			const target = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `hono-follow-validation-${Date.now().toString(36)}`,
				description: 'hono follow validation target',
			});

			const missingFollow = await api('channels/follow', {
				channelId: '000000000000000000000000',
			}, alice);
			assert.strictEqual(missingFollow.status, 400);
			assert.strictEqual(castAsError(missingFollow.body as any).error.id, 'c0031718-d573-4e85-928e-10039f1fbb68');

			const missingUnfollow = await api('channels/unfollow', {
				channelId: '000000000000000000000000',
			}, alice);
			assert.strictEqual(missingUnfollow.status, 400);
			assert.strictEqual(castAsError(missingUnfollow.body as any).error.id, '19959ee9-0153-4c51-bbd9-a98c49dc59d6');

			const readToken = await createAppToken(alice, ['read:channels']);
			for (const endpoint of ['channels/follow', 'channels/unfollow'] as const) {
				const denied = await api(endpoint, { channelId: target.id }, { token: readToken });
				assert.strictEqual(denied.status, 403, endpoint);
				assert.strictEqual(castAsError(denied.body as any).error.code, 'PERMISSION_DENIED', endpoint);
			}

			const movedUser = await signup({ username: `honofollow${Date.now().toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});
			const movedDenied = await api('channels/follow', {
				channelId: target.id,
			}, movedUser);
			assert.strictEqual(movedDenied.status, 403);
			assert.strictEqual(castAsError(movedDenied.body as any).error.code, 'YOUR_ACCOUNT_MOVED');
			assert.strictEqual(await channelFollowingExistsInDatabase(db, movedUser.id, target.id), false);
		});
	});

	describe('Hono channel mute endpoints', () => {
		test('create, list, and delete preserve channel mute behavior', async () => {
			const config = loadConfig();
			const stamp = Date.now().toString(36);
			const target = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `hono-mute-${stamp}`,
				description: 'hono mute target',
				lastNotedAt: new Date('2024-01-04T00:00:00.000Z'),
			});
			const expiredTarget = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `hono-expired-mute-${stamp}`,
				description: 'hono expired mute target',
				lastNotedAt: new Date('2024-01-05T00:00:00.000Z'),
			});
			await createChannelMutingInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				channelId: expiredTarget.id,
				expiresAt: new Date(Date.now() - 60_000),
			});

			const created = await api('channels/mute/create', {
				channelId: target.id,
				expiresAt: Date.now() + 60_000,
			}, alice);
			assert.strictEqual(created.status, 204);
			assert.strictEqual(await channelMutingExistsInDatabase(db, alice.id, target.id), true);

			const duplicate = await api('channels/mute/create', {
				channelId: target.id,
			}, alice);
			assert.strictEqual(duplicate.status, 400);
			assert.strictEqual(castAsError(duplicate.body as any).error.id, '5a251978-769a-da44-3e89-3931e43bb592');

			const expiredDuplicate = await api('channels/mute/create', {
				channelId: expiredTarget.id,
			}, alice);
			assert.strictEqual(expiredDuplicate.status, 400);
			assert.strictEqual(castAsError(expiredDuplicate.body as any).error.id, '5a251978-769a-da44-3e89-3931e43bb592');

			const list = await api('channels/mute/list', {}, alice);
			assert.strictEqual(list.status, 200);
			const mutedChannels = list.body as any[];
			const muted = mutedChannels.find(channel => channel.id === target.id);
			assert.ok(muted);
			assert.strictEqual(muted.isMuting, true);
			assert.strictEqual(mutedChannels.some(channel => channel.id === expiredTarget.id), false);

			const deleted = await api('channels/mute/delete', {
				channelId: target.id,
			}, alice);
			assert.strictEqual(deleted.status, 204);
			assert.strictEqual(await channelMutingExistsInDatabase(db, alice.id, target.id), false);

			const missingDelete = await api('channels/mute/delete', {
				channelId: target.id,
			}, alice);
			assert.strictEqual(missingDelete.status, 400);
			assert.strictEqual(castAsError(missingDelete.body as any).error.id, '14d55962-6ea8-d990-1333-d6bef78dc2ab');
		});

		test('keeps legacy validation, permission, and moved-account errors', async () => {
			const config = loadConfig();
			const target = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `hono-mute-validation-${Date.now().toString(36)}`,
				description: 'hono mute validation target',
			});

			const missingCreate = await api('channels/mute/create', {
				channelId: '000000000000000000000000',
			}, alice);
			assert.strictEqual(missingCreate.status, 400);
			assert.strictEqual(castAsError(missingCreate.body as any).error.id, '7174361e-d58f-31d6-2e7c-6fb830786a3f');

			const missingDelete = await api('channels/mute/delete', {
				channelId: '000000000000000000000000',
			}, alice);
			assert.strictEqual(missingDelete.status, 400);
			assert.strictEqual(castAsError(missingDelete.body as any).error.id, 'e7998769-6e94-d9c2-6b8f-94a527314aba');

			const pastExpiration = await api('channels/mute/create', {
				channelId: target.id,
				expiresAt: Date.now() - 60_000,
			}, alice);
			assert.strictEqual(pastExpiration.status, 400);
			assert.strictEqual(castAsError(pastExpiration.body as any).error.id, '42b32236-df2c-a45f-fdbf-def67268f749');

			const readToken = await createAppToken(alice, ['read:channels']);
			const writeToken = await createAppToken(alice, ['write:channels']);
			for (const endpoint of ['channels/mute/create', 'channels/mute/delete'] as const) {
				const denied = await api(endpoint, { channelId: target.id }, { token: readToken });
				assert.strictEqual(denied.status, 403, endpoint);
				assert.strictEqual(castAsError(denied.body as any).error.code, 'PERMISSION_DENIED', endpoint);
			}

			const listDenied = await api('channels/mute/list', {}, { token: writeToken });
			assert.strictEqual(listDenied.status, 403);
			assert.strictEqual(castAsError(listDenied.body as any).error.code, 'PERMISSION_DENIED');

			const movedUser = await signup({ username: `honomute${Date.now().toString(36)}` });
			await updateUserInDatabase(db, movedUser.id, {
				movedToUri: `${origin}/users/${alice.id}`,
			});
			const movedDenied = await api('channels/mute/create', {
				channelId: target.id,
			}, movedUser);
			assert.strictEqual(movedDenied.status, 403);
			assert.strictEqual(castAsError(movedDenied.body as any).error.code, 'YOUR_ACCOUNT_MOVED');
			assert.strictEqual(await channelMutingExistsInDatabase(db, movedUser.id, target.id), false);
		});
	});

	describe('channels/search', () => {
		let channelSearchFixture: {
			prefix: string;
			aaa: { id: string; name: string; description: string };
			ccc1: { id: string; name: string; description: string };
			ccc2: { id: string; name: string; description: string };
		} | null = null;

		async function ensureChannelSearchFixture() {
			if (channelSearchFixture != null) return channelSearchFixture;

			const config = loadConfig();
			const prefix = `hono-search-${Date.now().toString(36)}`;
			const aaa = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `${prefix}-aaa`,
				description: `${prefix}-bbb`,
			});
			const ccc1 = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `${prefix}-ccc1`,
				description: `${prefix}-ddd1`,
			});
			const ccc2 = await createChannelInDatabase(db, {
				id: genId(config),
				userId: bob.id,
				name: `${prefix}-ccc2`,
				description: `${prefix}-ddd2`,
			});

			const fixture = {
				prefix,
				aaa: { id: aaa.id, name: aaa.name, description: aaa.description! },
				ccc1: { id: ccc1.id, name: ccc1.name, description: ccc1.description! },
				ccc2: { id: ccc2.id, name: ccc2.name, description: ccc2.description! },
			};
			channelSearchFixture = fixture;
			return fixture;
		}

		test('空白検索で一覧を取得できる', async () => {
			const fixture = await ensureChannelSearchFixture();

			const res = await api('channels/search', {
				query: '',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			const ids = (res.body as any[]).map(channel => channel.id);
			assert.strictEqual(ids.includes(fixture.aaa.id), true);
			assert.strictEqual(ids.includes(fixture.ccc1.id), true);
			assert.strictEqual(ids.includes(fixture.ccc2.id), true);
		});
		test('名前のみの検索で名前を検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api('channels/search', {
				query: fixture.aaa.name,
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].id, fixture.aaa.id);
		});
		test('名前のみの検索で名前を複数検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api('channels/search', {
				query: `${fixture.prefix}-ccc`,
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
		test('名前のみの検索で説明は検索できない', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api('channels/search', {
				query: fixture.aaa.description,
				type: 'nameOnly',
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 0);
		});
		test('名前と説明の検索で名前を検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api('channels/search', {
				query: fixture.ccc1.name,
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].id, fixture.ccc1.id);
		});
		test('名前と説明での検索で説明を検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api('channels/search', {
				query: fixture.ccc1.description,
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 1);
			assert.strictEqual(res.body[0].id, fixture.ccc1.id);
		});
		test('名前と説明の検索で名前を複数検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api('channels/search', {
				query: `${fixture.prefix}-ccc`,
			}, bob);

			assert.strictEqual(res.status, 200);
			assert.strictEqual(typeof res.body === 'object' && Array.isArray(res.body), true);
			assert.strictEqual(res.body.length, 2);
		});
		test('名前と説明での検索で説明を複数検索できる', async () => {
			const fixture = await ensureChannelSearchFixture();
			const res = await api('channels/search', {
				query: `${fixture.prefix}-ddd`,
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

	describe('drive/folders/delete', () => {
		test('空フォルダを削除できる', async () => {
			const config = loadConfig();
			const folder = await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `delete-folder-${Date.now()}`,
				parentId: null,
			});

			const res = await api('drive/folders/delete', {
				folderId: folder.id,
			}, alice);

			assert.strictEqual(res.status, 204);
			assert.strictEqual(await fetchDriveFolderByIdFromDatabase(db, folder.id), null);
		});

		test('他人のフォルダを削除できない', async () => {
			const config = loadConfig();
			const folder = await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `delete-other-user-folder-${Date.now()}`,
				parentId: null,
			});

			const res = await api('drive/folders/delete', {
				folderId: folder.id,
			}, bob);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.id, '1069098f-c281-440f-b085-f9932edbe091');
			assert.notStrictEqual(await fetchDriveFolderByIdFromDatabase(db, folder.id), null);
		});

		test('子フォルダがあるフォルダを削除できない', async () => {
			const config = loadConfig();
			const parent = await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `delete-parent-folder-${Date.now()}`,
				parentId: null,
			});
			await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `delete-child-folder-${Date.now()}`,
				parentId: parent.id,
			});

			const res = await api('drive/folders/delete', {
				folderId: parent.id,
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.id, 'b0fc8a17-963c-405d-bfbc-859a487295e1');
			assert.notStrictEqual(await fetchDriveFolderByIdFromDatabase(db, parent.id), null);
		});

		test('子ファイルがあるフォルダを削除できない', async () => {
			const config = loadConfig();
			const parent = await createDriveFolderInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				name: `delete-file-parent-folder-${Date.now()}`,
				parentId: null,
			});
			await createDriveFileInDatabase(db, {
				id: genId(config),
				userId: alice.id,
				userHost: null,
				md5: createHash('md5').update(`delete-folder-file-${Date.now()}`).digest('hex'),
				name: 'delete-folder-file.txt',
				type: 'text/plain',
				size: 11,
				storedInternal: true,
				url: `${origin}/files/delete-folder-file-${parent.id}`,
				folderId: parent.id,
			});

			const res = await api('drive/folders/delete', {
				folderId: parent.id,
			}, alice);

			assert.strictEqual(res.status, 400);
			assert.strictEqual(castAsError(res.body as any).error.id, 'b0fc8a17-963c-405d-bfbc-859a487295e1');
			assert.notStrictEqual(await fetchDriveFolderByIdFromDatabase(db, parent.id), null);
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
