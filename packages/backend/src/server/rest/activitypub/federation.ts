/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import type * as Redis from 'ioredis';
import semver from 'semver';
import { z } from 'zod';
import { omitUndefined } from '@/misc/clone.js';
import { fetchInstanceMetadataWithSideEffects } from '@/core/instance/FetchInstanceMetadataLogic.js';
import { fetchMetaFromDatabase } from '@/core/meta/MetaStore.js';
import { logModerationEventInDatabase } from '@/core/moderation/ModerationLogLogic.js';
import type { RelationshipQueue } from '@/core/queue/queues.js';
import {
	createInstanceInDatabase,
	fetchInstanceByHostFromDatabase,
	listFederationInstancesFromDatabase,
	listInstancesOrderByFollowersCountDescFromDatabase,
	listInstancesOrderByFollowingCountDescFromDatabase,
	updateInstanceInDatabase,
	type FederationInstancesSort,
} from '@/core/instance/InstanceStore.js';
import { listAllDriveFilesByUserHostFromDatabase } from '@/core/drive/DriveFileStore.js';
import type { HttpRequestService } from '@/core/net/HttpRequestService.js';
import {
	countFollowingsWithRemoteFolloweeHostFromDatabase,
	countFollowingsWithRemoteFollowerHostFromDatabase,
	listFollowingsByFollowerHostFromDatabase,
	listFollowingsByHostWithPaginationFromDatabase,
} from '@/core/user/FollowingStore.js';
import { listUsersByHostWithPaginationFromDatabase } from '@/core/user/UserStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import type { Packed } from '@/misc/json-schema.js';
import { paginationParams } from '@/misc/zod-params.js';
import type { MiInstance, MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { RelationshipJobData } from '@/queue/types.js';
import { queueRetentionOptions } from '@/queue/const.js';
import type Logger from '@/logger.js';
import { startApiAdminDriveFileDeletion, type ApiAdminDriveDependencies } from '../admin/admin-drive.js';
import { packFollowingsForApi, type FollowingListItem } from '../user/following.js';
import { isApiModerator } from '../role/role-policy.js';
import { packUserDetailedNotMeManyForApi, type UserDetailedNotMeApiResponse } from '../user/user.js';
import { parseApiParams } from '../validation.js';

export type ApiFederationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

export type ApiAdminFederationDependencies = ApiFederationDependencies &
	ApiAdminDriveDependencies & {
		redis: Redis.Redis;
		httpRequestService: Pick<HttpRequestService, 'getJson' | 'getHtml' | 'send'>;
		logger: Pick<Logger, 'error' | 'info'>;
		relationshipQueue: RelationshipQueue;
	};

export const federationInstancesParamDef = z.object({
	host: z.string().nullable().optional(),
	blocked: z.boolean().nullable().optional(),
	notResponding: z.boolean().nullable().optional(),
	suspended: z.boolean().nullable().optional(),
	silenced: z.boolean().nullable().optional(),
	federating: z.boolean().nullable().optional(),
	subscribing: z.boolean().nullable().optional(),
	publishing: z.boolean().nullable().optional(),
	limit: z.int().min(1).max(100).default(30),
	offset: z.int().nonnegative().default(0),
	sort: z
		.union([
			z.enum([
				'+pubSub',
				'-pubSub',
				'+notes',
				'-notes',
				'+users',
				'-users',
				'+following',
				'-following',
				'+followers',
				'-followers',
				'+firstRetrievedAt',
				'-firstRetrievedAt',
				'+latestRequestReceivedAt',
				'-latestRequestReceivedAt',
			]),
			z.null(),
		])
		.optional(),
});

export const federationShowInstanceParamDef = z.object({
	host: z.string(),
});

export const adminFederationUpdateInstanceParamDef = z.object({
	host: z.string(),
	isSuspended: z.boolean().optional(),
	moderationNote: z.string().optional(),
});

export const adminFederationHostParamDef = z.object({
	host: z.string(),
});

export const federationStatsParamDef = z.object({
	limit: z.int().min(1).max(100).default(10),
});

type FederatedInstanceDependencies = {
	db: MiDrizzleDatabase;
};

export function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

export async function fetchOrRegisterFederatedInstance(
	deps: FederatedInstanceDependencies,
	host: string,
): Promise<MiInstance> {
	host = toPuny(host);

	const index = await fetchInstanceByHostFromDatabase(deps.db, host);
	if (index != null) return index;

	return await createInstanceInDatabase(deps.db, {
		id: genId(),
		host,
		firstRetrievedAt: new Date(),
	});
}

export async function fetchFederatedInstance(
	deps: FederatedInstanceDependencies,
	host: string,
): Promise<MiInstance | null> {
	host = toPuny(host);

	return await fetchInstanceByHostFromDatabase(deps.db, host);
}

export async function updateFederatedInstance(
	deps: FederatedInstanceDependencies,
	id: MiInstance['id'],
	data: Partial<MiInstance>,
): Promise<MiInstance> {
	return await updateInstanceInDatabase(deps.db, id, data);
}

export async function tryLockFetchInstanceMetadata(
	deps: { redis: Pick<Redis.Redis, 'set'> },
	host: string,
): Promise<string | null> {
	return await deps.redis.set(`fetchInstanceMetadata:mutex:v2:${host}`, '1', 'EX', 30, 'GET');
}

export async function unlockFetchInstanceMetadata(
	deps: { redis: Pick<Redis.Redis, 'del'> },
	host: string,
): Promise<number> {
	return await deps.redis.del(`fetchInstanceMetadata:mutex:v2:${host}`);
}

function toRelationshipJob(config: Pick<Config, 'queues'>, name: 'unfollow', data: RelationshipJobData) {
	return {
		name,
		data: omitUndefined({
			from: { id: data.from.id },
			to: { id: data.to.id },
			silent: data.silent,
			requestId: data.requestId,
			withReplies: data.withReplies,
		}),
		opts: queueRetentionOptions(config),
	};
}

function isHostMatched(targetHosts: string[], host: string): boolean {
	const lowerHost = host.toLowerCase();
	return targetHosts.some((target) => `.${lowerHost}`.endsWith(`.${target}`));
}

function isBlockedHost(meta: MiMeta, host: string): boolean {
	return isHostMatched(meta.blockedHosts, host);
}

function isSilencedHost(meta: MiMeta, host: string): boolean {
	return isHostMatched(meta.silencedHosts, host);
}

function isMediaSilencedHost(meta: MiMeta, host: string): boolean {
	return isHostMatched(meta.mediaSilencedHosts, host);
}

export function isDeliverSuspendedSoftware(
	meta: Pick<MiMeta, 'deliverSuspendedSoftware'>,
	software: Pick<MiInstance, 'softwareName' | 'softwareVersion'>,
): boolean {
	if (software.softwareName == null) return false;
	if (software.softwareVersion == null) {
		return meta.deliverSuspendedSoftware.some(
			(x) => x.software === software.softwareName && x.versionRange.trim() === '*',
		);
	}

	return meta.deliverSuspendedSoftware.some(
		(x) =>
			x.software === software.softwareName &&
			semver.satisfies(software.softwareVersion!, x.versionRange, { includePrerelease: true }),
	);
}

function packApiFederationInstance(
	meta: MiMeta,
	instance: MiInstance,
	isModerator: boolean,
): Packed<'FederationInstance'> {
	const softwareSuspended = isDeliverSuspendedSoftware(meta, instance);

	return {
		id: instance.id,
		firstRetrievedAt: instance.firstRetrievedAt.toISOString(),
		host: instance.host,
		usersCount: instance.usersCount,
		notesCount: instance.notesCount,
		followingCount: instance.followingCount,
		followersCount: instance.followersCount,
		isNotResponding: instance.isNotResponding,
		isSuspended: instance.suspensionState !== 'none' || softwareSuspended,
		suspensionState:
			instance.suspensionState === 'none' && softwareSuspended ? 'softwareSuspended' : instance.suspensionState,
		isBlocked: isBlockedHost(meta, instance.host),
		softwareName: instance.softwareName,
		softwareVersion: instance.softwareVersion,
		openRegistrations: instance.openRegistrations,
		name: instance.name,
		description: instance.description,
		maintainerName: instance.maintainerName,
		maintainerEmail: instance.maintainerEmail,
		isSilenced: isSilencedHost(meta, instance.host),
		isMediaSilenced: isMediaSilencedHost(meta, instance.host),
		iconUrl: instance.iconUrl,
		faviconUrl: instance.faviconUrl,
		themeColor: instance.themeColor,
		infoUpdatedAt: instance.infoUpdatedAt?.toISOString() ?? null,
		latestRequestReceivedAt: instance.latestRequestReceivedAt?.toISOString() ?? null,
		moderationNote: isModerator ? instance.moderationNote : null,
	};
}

async function packApiFederationInstances(
	deps: ApiFederationDependencies,
	instances: MiInstance[],
	user: MiLocalUser | null,
	meta: MiMeta,
): Promise<Packed<'FederationInstance'>[]> {
	const isModerator = await isApiModerator(deps, user);
	return packApiFederationInstancesWithModerator(meta, instances, isModerator);
}

function packApiFederationInstancesWithModerator(
	meta: MiMeta,
	instances: MiInstance[],
	isModerator: boolean,
): Packed<'FederationInstance'>[] {
	return instances.map((instance) => packApiFederationInstance(meta, instance, isModerator));
}

export async function handleApiFederationInstances(
	deps: ApiFederationDependencies,
	user: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<Packed<'FederationInstance'>[]> {
	const params = parseApiParams(federationInstancesParamDef, body);
	const meta =
		typeof params.blocked === 'boolean' || typeof params.silenced === 'boolean'
			? await fetchMetaFromDatabase(deps.db)
			: deps.meta;
	const instances = await listFederationInstancesFromDatabase(
		deps.db,
		omitUndefined({
			host: params.host,
			blocked: params.blocked,
			blockedHosts: meta.blockedHosts,
			notResponding: params.notResponding,
			suspended: params.suspended,
			silenced: params.silenced,
			silencedHosts: meta.silencedHosts,
			federating: params.federating,
			subscribing: params.subscribing,
			publishing: params.publishing,
			limit: params.limit,
			offset: params.offset,
			sort: (params.sort ?? null) as FederationInstancesSort,
		}),
	);

	return await packApiFederationInstances(deps, instances, user, meta);
}

export async function handleApiFederationShowInstance(
	deps: ApiFederationDependencies,
	user: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<Packed<'FederationInstance'> | null> {
	const params = parseApiParams(federationShowInstanceParamDef, body);
	const found = await fetchInstanceByHostFromDatabase(deps.db, toPuny(params.host));
	if (found == null) return null;

	const [packed] = await packApiFederationInstances(deps, [found], user, deps.meta);
	return packed ?? null;
}

export async function handleApiAdminFederationUpdateInstance(
	deps: ApiAdminFederationDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminFederationUpdateInstanceParamDef, body);
	const instance = await fetchInstanceByHostFromDatabase(deps.db, toPuny(params.host));

	if (instance == null) {
		throw new Error('instance not found');
	}

	const isSuspendedBefore = instance.suspensionState !== 'none';
	let suspensionState: undefined | 'manuallySuspended' | 'none';

	if (params.isSuspended != null && isSuspendedBefore !== params.isSuspended) {
		suspensionState = params.isSuspended ? 'manuallySuspended' : 'none';
	}

	await updateInstanceInDatabase(deps.db, instance.id, {
		suspensionState,
		moderationNote: params.moderationNote,
	});

	if (params.isSuspended != null && isSuspendedBefore !== params.isSuspended) {
		await logModerationEventInDatabase(
			deps,
			me,
			params.isSuspended ? 'suspendRemoteInstance' : 'unsuspendRemoteInstance',
			{
				id: instance.id,
				host: instance.host,
			},
		);
	}

	if (params.moderationNote != null && instance.moderationNote !== params.moderationNote) {
		await logModerationEventInDatabase(deps, me, 'updateRemoteInstanceNote', {
			id: instance.id,
			host: instance.host,
			before: instance.moderationNote,
			after: params.moderationNote,
		});
	}
}

export async function handleApiAdminFederationRefreshRemoteInstanceMetadata(
	deps: ApiAdminFederationDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminFederationHostParamDef, body);
	const instance = await fetchInstanceByHostFromDatabase(deps.db, toPuny(params.host));

	if (instance == null) {
		throw new Error('instance not found');
	}

	void fetchInstanceMetadataWithSideEffects(
		{
			httpRequestService: deps.httpRequestService,
			logger: deps.logger,
			tryLock: (host) => tryLockFetchInstanceMetadata(deps, host),
			unlock: (host) => unlockFetchInstanceMetadata(deps, host),
			fetchOrRegisterInstance: (host) => fetchOrRegisterFederatedInstance(deps, host),
			updateInstance: async (id, updates) => {
				await updateInstanceInDatabase(deps.db, id, updates);
			},
		},
		instance,
		true,
	);
}

export async function handleApiAdminFederationDeleteAllFiles(
	deps: ApiAdminFederationDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminFederationHostParamDef, body);
	const files = await listAllDriveFilesByUserHostFromDatabase(deps.db, params.host);

	for (const file of files) {
		await startApiAdminDriveFileDeletion(deps, file);
	}
}

export async function handleApiAdminFederationRemoveAllFollowing(
	deps: ApiAdminFederationDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(adminFederationHostParamDef, body);
	const followings = await listFollowingsByFollowerHostFromDatabase(deps.db, params.host);
	const jobs = followings.map((following) =>
		toRelationshipJob(deps.config, 'unfollow', {
			from: { id: following.followerId },
			to: { id: following.followeeId },
			silent: true,
		}),
	);

	if (jobs.length > 0) {
		await deps.relationshipQueue.addBulk(jobs);
	}
}

export async function handleApiFederationStats(
	deps: ApiFederationDependencies,
	user: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<{
	topSubInstances: Packed<'FederationInstance'>[];
	otherFollowersCount: number;
	topPubInstances: Packed<'FederationInstance'>[];
	otherFollowingCount: number;
}> {
	const params = parseApiParams(federationStatsParamDef, body);
	const [topSubInstances, topPubInstances, allSubCount, allPubCount] = await Promise.all([
		listInstancesOrderByFollowersCountDescFromDatabase(deps.db, params.limit),
		listInstancesOrderByFollowingCountDescFromDatabase(deps.db, params.limit),
		countFollowingsWithRemoteFolloweeHostFromDatabase(deps.db),
		countFollowingsWithRemoteFollowerHostFromDatabase(deps.db),
	]);
	const gotSubCount = topSubInstances.map((x) => x.followersCount).reduce((a, b) => a + b, 0);
	const gotPubCount = topPubInstances.map((x) => x.followingCount).reduce((a, b) => a + b, 0);

	const isModerator = await isApiModerator(deps, user);

	return {
		topSubInstances: packApiFederationInstancesWithModerator(deps.meta, topSubInstances, isModerator),
		otherFollowersCount: Math.max(0, allSubCount - gotSubCount),
		topPubInstances: packApiFederationInstancesWithModerator(deps.meta, topPubInstances, isModerator),
		otherFollowingCount: Math.max(0, allPubCount - gotPubCount),
	};
}

export const federationUsersParamDef = z.object({
	host: z.string(),
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
});

export async function handleApiFederationUsers(
	deps: ApiFederationDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeApiResponse[]> {
	const params = parseApiParams(federationUsersParamDef, body);

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;
	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(params.sinceDate);
		if (params.untilDate) untilId = genId(params.untilDate);
	}

	const users = await listUsersByHostWithPaginationFromDatabase(deps.db, {
		host: params.host,
		limit: params.limit,
		sinceId,
		untilId,
	});

	return await packUserDetailedNotMeManyForApi(deps, users, me);
}

export const federationHostFollowingParamDef = z.object({
	host: z.string(),
	...paginationParams,
	limit: z.int().min(1).max(100).default(10),
});

export async function handleApiFederationFollowers(
	deps: ApiFederationDependencies,
	body: Record<string, unknown>,
): Promise<FollowingListItem[]> {
	const params = parseApiParams(federationHostFollowingParamDef, body);
	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const followings = await listFollowingsByHostWithPaginationFromDatabase(deps.db, 'followee', params.host, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFollowingsForApi(deps, followings);
}

export async function handleApiFederationFollowing(
	deps: ApiFederationDependencies,
	body: Record<string, unknown>,
): Promise<FollowingListItem[]> {
	const params = parseApiParams(federationHostFollowingParamDef, body);
	const pagination = resolveDateIdPagination({ gen: (time) => genId(time) }, params);
	const followings = await listFollowingsByHostWithPaginationFromDatabase(deps.db, 'follower', params.host, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFollowingsForApi(deps, followings);
}
