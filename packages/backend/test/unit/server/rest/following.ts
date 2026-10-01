/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterAll, beforeAll, expect, test, vi } from 'vitest';
import { generateKeyPairSync } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { loadConfig } from '@/config.js';
import { createRuntimeDependencies } from '@/runtime-dependencies.js';
import type { RuntimeDependencies } from '@/runtime-dependencies.js';
import {
	createUserWithProfileAndPublickeyInDatabase,
	fetchUserByIdOrFailFromDatabase,
	updateUserInDatabase,
} from '@/core/user/UserStore.js';
import {
	createFollowRequestInDatabase,
	deleteFollowRequestByIdFromDatabase,
	fetchFollowRequestFromDatabase,
} from '@/core/user/FollowRequestStore.js';
import { fetchFollowingByFollowerIdAndFolloweeIdFromDatabase } from '@/core/user/FollowingStore.js';
import { queueOutbox } from '@/db/schema/queue-outbox.js';
import { userKeypair } from '@/db/schema/user-keypair.js';
import { endpointMetas } from '@/server/api/metas/i.js';
import {
	handleApiIUpdate,
	handleQueueAcceptAllFollowRequests,
	iUpdateParamDef,
} from '@/server/rest/account/account-update.js';
import type { ContractErrors } from '@/server/rest/endpoint-contract.js';
import { ApiError } from '@/server/rest/error.js';
import type { DbJobMap, DeliverJobData } from '@/queue/types.js';
import { parseApiParams } from '@/server/rest/validation.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type * as NotificationModule from '@/server/rest/notification/notification.js';

const { notificationSink } = vi.hoisted(() => ({ notificationSink: vi.fn() }));
vi.mock('@/server/rest/notification/notification.js', async (importOriginal) => ({
	...(await importOriginal<typeof NotificationModule>()),
	xaddApiNotification: notificationSink,
}));

import { acceptAllFollowRequestsForApi, acceptFollowRequestForApi } from '@/server/rest/user/following.js';

let runtime: RuntimeDependencies;
beforeAll(async () => {
	runtime = await createRuntimeDependencies(loadConfig());
});
afterAll(async () => {
	await runtime.dispose();
});

async function createUser(remote = false) {
	const id = genId();
	return await createUserWithProfileAndPublickeyInDatabase(runtime.db, {
		user: {
			id,
			username: `bulk${id}`,
			usernameLower: `bulk${id}`,
			...(remote
				? {
						host: 'bulk.example.test',
						uri: `https://bulk.example.test/users/${id}`,
						inbox: 'https://bulk.example.test/inbox',
					}
				: {}),
		},
		profile: { userId: id, notificationRecieveConfig: { follow: { type: 'never' } } },
	});
}

async function request(follower: MiUser, followee: MiUser) {
	return await createFollowRequestInDatabase(runtime.db, {
		id: genId(),
		followerId: follower.id,
		followeeId: followee.id,
		requestId: follower.uri == null ? null : `https://bulk.example.test/follows/${genId()}`,
	});
}

test('一括承認は通知の保存待ちを含めて並行数を制限し、取消済み要求を除いた最終集計を返す', async () => {
	const followee = (await createUser()) as MiLocalUser;
	const followers = await Promise.all(Array.from({ length: 20 }, () => createUser()));
	const requests = await Promise.all(followers.map((follower) => request(follower, followee)));
	await deleteFollowRequestByIdFromDatabase(runtime.db, requests[2]!.id);
	let active = 0;
	let maximum = 0;
	const { promise: barrier, resolve: release } = Promise.withResolvers<void>();
	notificationSink.mockImplementation(async () => {
		active++;
		maximum = Math.max(maximum, active);
		await barrier;
		active--;
		return '1-0';
	});
	const updates: unknown[] = [];
	let settled = false;
	const completion = acceptAllFollowRequestsForApi(
		{
			...runtime,
			publishMainStream: (id, type, body) => {
				if (id === followee.id && type === 'meUpdated') updates.push(body);
			},
		},
		followee,
	).then(() => {
		settled = true;
	});
	try {
		await vi.waitFor(() => expect(active).toBe(8));
		expect(settled).toBe(false);
		expect((await fetchUserByIdOrFailFromDatabase(runtime.db, followee.id)).followersCount).toBe(8);
		expect(updates).toEqual([]);
	} finally {
		release();
		await completion;
	}
	expect(maximum).toBeLessThanOrEqual(8);
	expect(active).toBe(0);
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, followee.id)).followersCount).toBe(19);
	expect(
		await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, followers[2]!.id, followee.id),
	).toBeNull();
	expect(updates).toMatchObject([{ id: followee.id, followersCount: 19 }]);
});

async function updatesFor(followeeId: string) {
	const jobs = await runtime.deliverQueue.getJobs(['waiting', 'prioritized', 'delayed']);
	return jobs
		.filter((deliver) => deliver.data.user.id === followeeId)
		.map((deliver) => JSON.parse(deliver.data.content))
		.filter((activity) => activity.type === 'Update');
}

async function takeAcceptAllJob(followeeId: string) {
	const jobs = await runtime.dbQueue.getJobs(['waiting', 'prioritized', 'delayed']);
	const matched = jobs.filter(
		(job) =>
			job.name === 'acceptAllFollowRequests' &&
			(job.data as DbJobMap['acceptAllFollowRequests']).user.id === followeeId,
	);
	await Promise.all(matched.map((job) => job.remove()));
	return matched;
}

test('鍵の解除は保存して即応答し、一括承認ジョブの失敗分は再試行で残りだけを承認する', async () => {
	const followee = (await createUser()) as MiLocalUser;
	const [failedFollower, successfulFollower] = await Promise.all([createUser(true), createUser(true)]);
	const failedRequest = await request(failedFollower!, followee);
	await request(successfulFollower!, followee);
	await updateUserInDatabase(runtime.db, followee.id, { isLocked: true });
	const keypair = generateKeyPairSync('rsa', {
		modulusLength: 2048,
		publicKeyEncoding: { type: 'spki', format: 'pem' },
		privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
	});
	await runtime.db.insert(userKeypair).values({ userId: followee.id, ...keypair });
	const errors = Object.fromEntries(
		Object.entries(endpointMetas['i/update'].meta.errors).map(([key, value]) => [
			key,
			() => new ApiError({ status: 400, ...value }),
		]),
	) as ContractErrors<(typeof endpointMetas)['i/update']>;
	const constraint = `reject_bulk_${genId()}`;
	await runtime.db.execute(
		sql.raw(
			`ALTER TABLE queue_outbox ADD CONSTRAINT "${constraint}" CHECK (COALESCE(data->'data'->>'content','') NOT LIKE '%${failedRequest.requestId!}%')`,
		),
	);
	try {
		await expect(
			handleApiIUpdate(
				runtime,
				followee,
				null,
				parseApiParams(iUpdateParamDef, { isLocked: false, name: 'Saved before approval' }),
				errors,
			),
		).resolves.toMatchObject({ isLocked: false, name: 'Saved before approval' });
		// 応答の時点では承認していない。申請の件数に応答時間が比例しない。
		expect((await fetchUserByIdOrFailFromDatabase(runtime.db, followee.id)).followersCount).toBe(0);
		const [job, ...extra] = await takeAcceptAllJob(followee.id);
		expect(extra).toEqual([]);
		expect(job!.opts).toMatchObject({ attempts: 4, backoff: { type: 'exponential' } });
		// 1件でも失敗したらジョブを失敗させ、BullMQ の再試行に回す。
		await expect(
			handleQueueAcceptAllFollowRequests(runtime, job!.data as DbJobMap['acceptAllFollowRequests']),
		).rejects.toBeInstanceOf(AggregateError);
		expect(
			await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, failedFollower!.id, followee.id),
		).toBeNull();
		expect(await fetchFollowRequestFromDatabase(runtime.db, failedFollower!.id, followee.id)).toMatchObject({
			id: failedRequest.id,
		});
		expect(
			await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, successfulFollower!.id, followee.id),
		).not.toBeNull();
		expect((await fetchUserByIdOrFailFromDatabase(runtime.db, followee.id)).followersCount).toBe(1);

		await vi.waitFor(async () => expect(await updatesFor(followee.id)).toHaveLength(1));
		expect((await updatesFor(followee.id))[0]).toMatchObject({
			object: { name: 'Saved before approval', manuallyApprovesFollowers: false },
		});

		await runtime.db.execute(sql.raw(`ALTER TABLE queue_outbox DROP CONSTRAINT "${constraint}"`));
		await expect(
			handleQueueAcceptAllFollowRequests(runtime, job!.data as DbJobMap['acceptAllFollowRequests']),
		).resolves.toBe('ok');
		// 承認したリモートのフォロワーへ、鍵を外した actor の Update を送る (一部失敗した 1 回目と成功した 2 回目の両方)。
		await vi.waitFor(async () => expect(await updatesFor(followee.id)).toHaveLength(2));
	} finally {
		await runtime.db.execute(sql.raw(`ALTER TABLE queue_outbox DROP CONSTRAINT IF EXISTS "${constraint}"`));
		await takeAcceptAllJob(followee.id);
		const jobs = await runtime.deliverQueue.getJobs(['waiting', 'prioritized', 'delayed']);
		await Promise.all(
			jobs.filter((deliver) => deliver.data.user.id === followee.id).map((deliver) => deliver.remove()),
		);
	}
	expect(await fetchFollowRequestFromDatabase(runtime.db, failedFollower!.id, followee.id)).toBeNull();
	expect((await fetchUserByIdOrFailFromDatabase(runtime.db, followee.id)).followersCount).toBe(2);
	const deliveries = await runtime.db.select().from(queueOutbox).where(eq(queueOutbox.queue, 'deliver'));
	const accepts = deliveries.filter((row) => {
		const activity = JSON.parse((row.data as { data: DeliverJobData }).data.content);
		return activity.type === 'Accept' && activity.actor === `${runtime.config.instance.url}/users/${followee.id}`;
	});
	expect(accepts).toHaveLength(2);
});

test('一括承認ジョブは削除処理中のユーザーの申請を承認しない', async () => {
	const followee = (await createUser()) as MiLocalUser;
	const follower = await createUser(true);
	await request(follower!, followee);
	await updateUserInDatabase(runtime.db, followee.id, { isDeleted: true });

	await expect(handleQueueAcceptAllFollowRequests(runtime, { user: { id: followee.id } })).resolves.toBe(
		'skip: followee is suspended or deleted',
	);
	expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, follower!.id, followee.id)).toBeNull();
});

test('一括承認ジョブは処理前に鍵を掛け直したユーザーの申請を承認しない', async () => {
	const followee = (await createUser()) as MiLocalUser;
	const follower = await createUser(true);
	await request(follower!, followee);
	await updateUserInDatabase(runtime.db, followee.id, { isLocked: true });

	await expect(handleQueueAcceptAllFollowRequests(runtime, { user: { id: followee.id } })).resolves.toBe(
		'skip: followee is locked again',
	);
	expect(await fetchFollowRequestFromDatabase(runtime.db, follower!.id, followee.id)).not.toBeNull();
	expect(await fetchFollowingByFollowerIdAndFolloweeIdFromDatabase(runtime.db, follower!.id, followee.id)).toBeNull();
});
