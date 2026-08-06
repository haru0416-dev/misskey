/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';
import type { MiLocalUser, MiUser } from '@/models/User.js';
import type { HonoApiFollowingDependencies } from '@/server/rest/following.js';

const {
	createFollowingMock,
	fetchRequestMock,
	listRequestsMock,
	listUsersMock,
	fetchUserMock,
	fetchProfileMock,
	packMeMock,
	xaddNotificationMock,
	enqueueDeliverMock,
} = vi.hoisted(() => ({
	createFollowingMock: vi.fn(),
	fetchRequestMock: vi.fn(),
	listRequestsMock: vi.fn(),
	listUsersMock: vi.fn(),
	fetchUserMock: vi.fn(),
	fetchProfileMock: vi.fn(),
	packMeMock: vi.fn(),
	xaddNotificationMock: vi.fn(),
	enqueueDeliverMock: vi.fn(),
}));

vi.mock('@/core/DeliverQueue.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/core/DeliverQueue.js')>()),
	enqueueDeliverJob: enqueueDeliverMock,
}));

vi.mock('@/core/FollowRequestStore.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/core/FollowRequestStore.js')>()),
	fetchFollowRequestFromDatabase: fetchRequestMock,
	followRequestExistsInDatabase: vi.fn().mockResolvedValue(false),
	listAllFollowRequestsByFolloweeIdFromDatabase: listRequestsMock,
}));

vi.mock('@/core/FollowingStore.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/core/FollowingStore.js')>()),
	createFollowingInDatabase: createFollowingMock,
	listFolloweeIdsWithRepliesByFollowerIdFromDatabase: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/core/UserStore.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/core/UserStore.js')>()),
	adjustUserFollowersCountInDatabase: vi.fn().mockResolvedValue(undefined),
	adjustUserFollowingCountInDatabase: vi.fn().mockResolvedValue(undefined),
	fetchUserByIdOrFailFromDatabase: fetchUserMock,
	listUsersByIdsFromDatabase: listUsersMock,
}));

vi.mock('@/core/UserProfileStore.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/core/UserProfileStore.js')>()),
	fetchUserProfileByUserIdOrFailFromDatabase: fetchProfileMock,
}));

vi.mock('@/core/MutingStore.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/core/MutingStore.js')>()),
	mutingExistsInDatabase: vi.fn().mockResolvedValue(false),
}));

vi.mock('@/core/WebhookStore.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/core/WebhookStore.js')>()),
	listWebhooksFromDatabase: vi.fn().mockResolvedValue([]),
}));

vi.mock('@/server/rest/user.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/server/rest/user.js')>()),
	packMeDetailedForHonoApi: packMeMock,
	packUserDetailedNotMeForHonoApi: vi.fn(async (_deps, user: MiUser) => ({ id: user.id })),
	packUserLiteForHonoApi: vi.fn(async (_deps, user: MiUser) => ({ id: user.id })),
}));

vi.mock('@/server/rest/notification.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/server/rest/notification.js')>()),
	xaddHonoApiNotification: xaddNotificationMock,
}));

import { acceptAllFollowRequestsForHonoApi } from '@/server/rest/following.js';

describe('acceptAllFollowRequestsForHonoApi', () => {
	const followee = { id: 'followee', host: null, isLocked: false } as MiLocalUser;
	const freshFollowee = { ...followee, followersCount: 18 } as MiLocalUser;
	const followers = Array.from({ length: 20 }, (_, index) => ({
		id: `follower-${index}`,
		host: null,
		movedToUri: null,
	})) as MiLocalUser[];
	const requests = followers.map((follower, index) => ({
		id: `request-${index}`,
		followerId: follower.id,
		followeeId: followee.id,
		withReplies: false,
		requestId: null,
	}));

	beforeEach(() => {
		vi.clearAllMocks();
		listRequestsMock.mockResolvedValue(requests);
		fetchRequestMock.mockImplementation(async (_db, followerId: string) =>
			followerId === followers[2]!.id ? null : requests.find((request) => request.followerId === followerId),
		);
		listUsersMock.mockResolvedValue(followers);
		fetchUserMock.mockResolvedValue(freshFollowee);
		fetchProfileMock.mockResolvedValue({
			userId: followee.id,
			followedMessage: null,
			notificationRecieveConfig: { follow: { type: 'never' } },
		});
		packMeMock.mockResolvedValue({ id: followee.id });
		xaddNotificationMock.mockResolvedValue('1-0');
		enqueueDeliverMock.mockResolvedValue(undefined);
	});

	test('limits concurrency, waits for completion, and publishes the final state once', async () => {
		let active = 0;
		let maxActive = 0;
		let releaseCreates!: () => void;
		const createBarrier = new Promise<void>((resolve) => {
			releaseCreates = resolve;
		});
		createFollowingMock.mockImplementation(async (db, data) => {
			active++;
			maxActive = Math.max(maxActive, active);
			await createBarrier;
			active--;
			if (data.followerId === followers[3]!.id) throw new Error('stale request');
			return data;
		});
		const publishMainStream = vi.fn();
		const deps = {
			db: {},
			redis: { set: vi.fn().mockResolvedValue('OK') },
			meta: { enableStatsForFederatedInstances: false },
			config: { instance: { url: 'https://example.test' } },
			deliverQueue: {},
			userWebhookDeliverQueue: { add: vi.fn() },
			publishMainStream,
		} as unknown as HonoApiFollowingDependencies;

		const completion = acceptAllFollowRequestsForHonoApi(deps, followee);
		await vi.waitFor(() => expect(createFollowingMock).toHaveBeenCalledTimes(8));
		expect(active).toBe(8);
		releaseCreates();
		await completion;

		expect(createFollowingMock).toHaveBeenCalledTimes(requests.length - 1);
		expect(active).toBe(0);
		expect(maxActive).toBeGreaterThan(1);
		expect(maxActive).toBeLessThanOrEqual(8);
		expect(packMeMock).toHaveBeenCalledTimes(1);
		expect(packMeMock).toHaveBeenCalledWith(deps, freshFollowee, { includeSecrets: false });
		expect(publishMainStream).toHaveBeenCalledWith(followee.id, 'meUpdated', { id: followee.id });
	});

	test('keeps the concurrency slot until notification persistence completes', async () => {
		const [follower] = followers;
		const [request] = requests;
		listRequestsMock.mockResolvedValue([request]);
		fetchRequestMock.mockResolvedValue(request);
		listUsersMock.mockResolvedValue([follower]);
		fetchProfileMock.mockResolvedValue({ userId: followee.id, followedMessage: null });
		createFollowingMock.mockImplementation(async (db, data) => data);
		let releaseNotification!: () => void;
		xaddNotificationMock.mockImplementation(
			() =>
				new Promise<string>((resolve) => {
					releaseNotification = () => resolve('1-0');
				}),
		);
		const deps = {
			db: {},
			redis: { set: vi.fn().mockResolvedValue('OK'), get: vi.fn().mockResolvedValue(null) },
			meta: { enableStatsForFederatedInstances: false },
			config: { instance: { url: 'https://example.test' }, limits: { userNotifications: 100 } },
			deliverQueue: {},
			userWebhookDeliverQueue: { add: vi.fn() },
		} as unknown as HonoApiFollowingDependencies;

		let settled = false;
		const completion = acceptAllFollowRequestsForHonoApi(deps, followee).then(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(xaddNotificationMock).toHaveBeenCalledTimes(1));
		expect(settled).toBe(false);
		releaseNotification();
		await completion;
		expect(settled).toBe(true);
	});

	test('waits for remote delivery enqueue before completing', async () => {
		const remoteFollower = {
			...followers[0],
			host: 'remote.example',
			uri: 'https://remote.example/users/follower',
			inbox: 'https://remote.example/users/follower/inbox',
		} as MiUser;
		const request = { ...requests[0]!, followerId: remoteFollower.id };
		listRequestsMock.mockResolvedValue([request]);
		fetchRequestMock.mockResolvedValue(request);
		listUsersMock.mockResolvedValue([remoteFollower]);
		createFollowingMock.mockImplementation(async (db, data) => data);
		let releaseDelivery!: () => void;
		enqueueDeliverMock.mockImplementation(
			() =>
				new Promise<void>((resolve) => {
					releaseDelivery = resolve;
				}),
		);
		const deps = {
			db: {},
			redis: { set: vi.fn().mockResolvedValue('OK') },
			meta: { enableStatsForFederatedInstances: false },
			config: { instance: { url: 'https://example.test' } },
			deliverQueue: {},
			userWebhookDeliverQueue: { add: vi.fn() },
		} as unknown as HonoApiFollowingDependencies;

		let settled = false;
		const completion = acceptAllFollowRequestsForHonoApi(deps, followee).then(() => {
			settled = true;
		});
		await vi.waitFor(() => expect(enqueueDeliverMock).toHaveBeenCalledTimes(1));
		expect(settled).toBe(false);
		releaseDelivery();
		await completion;
		expect(settled).toBe(true);
	});
});
