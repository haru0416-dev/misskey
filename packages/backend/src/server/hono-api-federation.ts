/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import type * as Redis from 'ioredis';
import semver from 'semver';
import { fetchInstanceMetadataWithSideEffects } from '@/core/FetchInstanceMetadataLogic.js';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import { logModerationEventInDatabase } from '@/core/ModerationLogLogic.js';
import type { RelationshipQueue } from '@/core/QueueModule.js';
import {
	createInstanceInDatabase,
	fetchInstanceByHostFromDatabase,
	listFederationInstancesFromDatabase,
	listInstancesOrderByFollowersCountDescFromDatabase,
	listInstancesOrderByFollowingCountDescFromDatabase,
	updateInstanceInDatabase,
} from '@/core/InstanceStore.js';
import { listAllDriveFilesByUserHostFromDatabase } from '@/core/DriveFileStore.js';
import type { HttpRequestService } from '@/core/HttpRequestService.js';
import {
	countFollowingsWithRemoteFolloweeHostFromDatabase,
	countFollowingsWithRemoteFollowerHostFromDatabase,
	listFollowingsByFollowerHostFromDatabase,
	listFollowingsByHostWithPaginationFromDatabase,
} from '@/core/FollowingStore.js';
import { listUsersByHostWithPaginationFromDatabase } from '@/core/UserStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { genId } from '@/misc/id/gen-id.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiInstance, MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import type { RelationshipJobData } from '@/queue/types.js';
import type Logger from '@/logger.js';
import { startHonoApiAdminDriveFileDeletion, type HonoApiAdminDriveDependencies } from './hono-api-admin-drive.js';
import { packFollowingsForHonoApi, resolveHonoApiIdPagination, type FollowingListItem } from './hono-api-following.js';
import { isHonoApiModerator } from './hono-api-role-policy.js';
import { packUserDetailedNotMeManyForHonoApi, type UserDetailedNotMeHonoApiResponse } from './hono-api-user.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiFederationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
};

export type HonoApiAdminFederationDependencies = HonoApiFederationDependencies & HonoApiAdminDriveDependencies & {
	redis: Redis.Redis;
	httpRequestService: Pick<HttpRequestService, 'getJson' | 'getHtml' | 'send'>;
	logger: Pick<Logger, 'error' | 'info'>;
	relationshipQueue: RelationshipQueue;
};

const federationInstancesParamDef = {
	type: 'object',
	properties: {
		host: { type: 'string', nullable: true },
		blocked: { type: 'boolean', nullable: true },
		notResponding: { type: 'boolean', nullable: true },
		suspended: { type: 'boolean', nullable: true },
		silenced: { type: 'boolean', nullable: true },
		federating: { type: 'boolean', nullable: true },
		subscribing: { type: 'boolean', nullable: true },
		publishing: { type: 'boolean', nullable: true },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 30 },
		offset: { type: 'integer', default: 0 },
		sort: {
			type: 'string',
			nullable: true,
			enum: [
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
				null,
			],
		},
	},
	required: [],
} as const;

const federationShowInstanceParamDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
	},
	required: ['host'],
} as const;

const adminFederationUpdateInstanceParamDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
		isSuspended: { type: 'boolean' },
		moderationNote: { type: 'string' },
	},
	required: ['host'],
} as const;

const adminFederationHostParamDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
	},
	required: ['host'],
} as const;

const federationStatsParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: [],
} as const;

type FederationInstancesParams = SchemaType<typeof federationInstancesParamDef>;
type FederationShowInstanceParams = SchemaType<typeof federationShowInstanceParamDef>;
type AdminFederationUpdateInstanceParams = SchemaType<typeof adminFederationUpdateInstanceParamDef>;
type AdminFederationHostParams = SchemaType<typeof adminFederationHostParamDef>;
type FederationStatsParams = SchemaType<typeof federationStatsParamDef>;
type FederationInstancesSort =
	| '+pubSub'
	| '-pubSub'
	| '+notes'
	| '-notes'
	| '+users'
	| '-users'
	| '+following'
	| '-following'
	| '+followers'
	| '-followers'
	| '+firstRetrievedAt'
	| '-firstRetrievedAt'
	| '+latestRequestReceivedAt'
	| '-latestRequestReceivedAt'
	| null;

const federationIntegerQueryParams = new Set(['limit', 'offset']);
const federationBooleanQueryParams = new Set([
	'blocked',
	'notResponding',
	'suspended',
	'silenced',
	'federating',
	'subscribing',
	'publishing',
]);
const federationNullableQueryParams = new Set([
	'host',
	'blocked',
	'notResponding',
	'suspended',
	'silenced',
	'federating',
	'subscribing',
	'publishing',
	'sort',
]);

export function normalizeHonoApiFederationQuery(query: Record<string, string>): Record<string, unknown> {
	const body: Record<string, unknown> = {};

	for (const [key, value] of Object.entries(query)) {
		if (federationNullableQueryParams.has(key) && value === 'null') {
			body[key] = null;
		} else if (federationIntegerQueryParams.has(key)) {
			const numeric = Number(value);
			body[key] = Number.isInteger(numeric) ? numeric : value;
		} else if (federationBooleanQueryParams.has(key) && (value === 'true' || value === 'false')) {
			body[key] = value === 'true';
		} else {
			body[key] = value;
		}
	}

	return body;
}

function toPuny(host: string): string {
	return domainToASCII(host.toLowerCase());
}

async function updateFederatedInstanceCache(
	deps: HonoApiAdminFederationDependencies,
	instance: MiInstance,
): Promise<void> {
	await deps.redis.set(
		`kvcache:federatedInstance:${instance.host}`,
		JSON.stringify(instance),
		'EX',
		60 * 30,
	);
}

async function fetchOrRegisterFederatedInstance(
	deps: HonoApiAdminFederationDependencies,
	host: string,
): Promise<MiInstance> {
	host = toPuny(host);

	const index = await fetchInstanceByHostFromDatabase(deps.db, host);
	if (index != null) {
		await updateFederatedInstanceCache(deps, index);
		return index;
	}

	const created = await createInstanceInDatabase(deps.db, {
		id: genId(deps.config),
		host,
		firstRetrievedAt: new Date(),
	});

	await updateFederatedInstanceCache(deps, created);
	return created;
}

async function tryLockFetchInstanceMetadata(deps: HonoApiAdminFederationDependencies, host: string): Promise<string | null> {
	// TODO: マイグレーションなのであとで消す (2024.3.1)
	await deps.redis.del(`fetchInstanceMetadata:mutex:${host}`);

	return await deps.redis.set(
		`fetchInstanceMetadata:mutex:v2:${host}`, '1',
		'EX', 30,
		'GET',
	);
}

async function unlockFetchInstanceMetadata(deps: HonoApiAdminFederationDependencies, host: string): Promise<number> {
	return await deps.redis.del(`fetchInstanceMetadata:mutex:v2:${host}`);
}

function toRelationshipJob(name: 'unfollow', data: RelationshipJobData) {
	return {
		name,
		data: {
			from: { id: data.from.id },
			to: { id: data.to.id },
			silent: data.silent,
			requestId: data.requestId,
			withReplies: data.withReplies,
		},
		opts: {
			removeOnComplete: {
				age: 3600 * 24 * 7,
				count: 30,
			},
			removeOnFail: {
				age: 3600 * 24 * 7,
				count: 100,
			},
		},
	};
}

function isHostMatched(targetHosts: string[], host: string): boolean {
	const lowerHost = host.toLowerCase();
	return targetHosts.some(target => `.${lowerHost}`.endsWith(`.${target}`));
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

function isDeliverSuspendedSoftware(meta: MiMeta, software: Pick<MiInstance, 'softwareName' | 'softwareVersion'>): boolean {
	if (software.softwareName == null) return false;
	if (software.softwareVersion == null) {
		return meta.deliverSuspendedSoftware.some(x =>
			x.software === software.softwareName &&
			x.versionRange.trim() === '*');
	}

	return meta.deliverSuspendedSoftware.some(x =>
		x.software === software.softwareName &&
		semver.satisfies(software.softwareVersion!, x.versionRange, { includePrerelease: true }));
}

function packHonoApiFederationInstance(
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
		suspensionState: instance.suspensionState === 'none' && softwareSuspended ? 'softwareSuspended' : instance.suspensionState,
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

async function packHonoApiFederationInstances(
	deps: HonoApiFederationDependencies,
	instances: MiInstance[],
	user: MiLocalUser | null,
	meta: MiMeta,
): Promise<Packed<'FederationInstance'>[]> {
	const isModerator = await isHonoApiModerator(deps, user);
	return packHonoApiFederationInstancesWithModerator(meta, instances, isModerator);
}

function packHonoApiFederationInstancesWithModerator(
	meta: MiMeta,
	instances: MiInstance[],
	isModerator: boolean,
): Packed<'FederationInstance'>[] {
	return instances.map(instance => packHonoApiFederationInstance(meta, instance, isModerator));
}

export async function handleHonoApiFederationInstances(
	deps: HonoApiFederationDependencies,
	user: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<Packed<'FederationInstance'>[]> {
	const params = parseHonoApiParams(federationInstancesParamDef, body) as FederationInstancesParams;
	const meta = typeof params.blocked === 'boolean' || typeof params.silenced === 'boolean'
		? await fetchMetaFromDatabase(deps.db)
		: deps.meta;
	const instances = await listFederationInstancesFromDatabase(deps.db, {
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
	});

	return await packHonoApiFederationInstances(deps, instances, user, meta);
}

export async function handleHonoApiFederationShowInstance(
	deps: HonoApiFederationDependencies,
	user: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<Packed<'FederationInstance'> | null> {
	const params = parseHonoApiParams(federationShowInstanceParamDef, body) as FederationShowInstanceParams;
	const found = await fetchInstanceByHostFromDatabase(deps.db, toPuny(params.host));
	if (found == null) return null;

	const [packed] = await packHonoApiFederationInstances(deps, [found], user, deps.meta);
	return packed ?? null;
}

export async function handleHonoApiAdminFederationUpdateInstance(
	deps: HonoApiAdminFederationDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminFederationUpdateInstanceParamDef, body) as AdminFederationUpdateInstanceParams;
	const instance = await fetchInstanceByHostFromDatabase(deps.db, toPuny(params.host));

	if (instance == null) {
		throw new Error('instance not found');
	}

	const isSuspendedBefore = instance.suspensionState !== 'none';
	let suspensionState: undefined | 'manuallySuspended' | 'none';

	if (params.isSuspended != null && isSuspendedBefore !== params.isSuspended) {
		suspensionState = params.isSuspended ? 'manuallySuspended' : 'none';
	}

	const updated = await updateInstanceInDatabase(deps.db, instance.id, {
		suspensionState,
		moderationNote: params.moderationNote,
	});
	await updateFederatedInstanceCache(deps, updated);

	if (params.isSuspended != null && isSuspendedBefore !== params.isSuspended) {
		await logModerationEventInDatabase(deps, me, params.isSuspended ? 'suspendRemoteInstance' : 'unsuspendRemoteInstance', {
			id: instance.id,
			host: instance.host,
		});
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

export async function handleHonoApiAdminFederationRefreshRemoteInstanceMetadata(
	deps: HonoApiAdminFederationDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminFederationHostParamDef, body) as AdminFederationHostParams;
	const instance = await fetchInstanceByHostFromDatabase(deps.db, toPuny(params.host));

	if (instance == null) {
		throw new Error('instance not found');
	}

	void fetchInstanceMetadataWithSideEffects({
		httpRequestService: deps.httpRequestService,
		logger: deps.logger,
		tryLock: host => tryLockFetchInstanceMetadata(deps, host),
		unlock: host => unlockFetchInstanceMetadata(deps, host),
		fetchOrRegisterInstance: host => fetchOrRegisterFederatedInstance(deps, host),
		updateInstance: async (id, updates) => {
			const updated = await updateInstanceInDatabase(deps.db, id, updates);
			await updateFederatedInstanceCache(deps, updated);
		},
	}, instance, true);
}

export async function handleHonoApiAdminFederationDeleteAllFiles(
	deps: HonoApiAdminFederationDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminFederationHostParamDef, body) as AdminFederationHostParams;
	const files = await listAllDriveFilesByUserHostFromDatabase(deps.db, params.host);

	for (const file of files) {
		startHonoApiAdminDriveFileDeletion(deps, file);
	}
}

export async function handleHonoApiAdminFederationRemoveAllFollowing(
	deps: HonoApiAdminFederationDependencies,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseHonoApiParams(adminFederationHostParamDef, body) as AdminFederationHostParams;
	const followings = await listFollowingsByFollowerHostFromDatabase(deps.db, params.host);
	const jobs = followings.map(following => toRelationshipJob('unfollow', {
		from: { id: following.followerId },
		to: { id: following.followeeId },
		silent: true,
	}));

	if (jobs.length > 0) {
		await deps.relationshipQueue.addBulk(jobs);
	}
}

export async function handleHonoApiFederationStats(
	deps: HonoApiFederationDependencies,
	user: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<{
	topSubInstances: Packed<'FederationInstance'>[];
	otherFollowersCount: number;
	topPubInstances: Packed<'FederationInstance'>[];
	otherFollowingCount: number;
}> {
	const params = parseHonoApiParams(federationStatsParamDef, body) as FederationStatsParams;
	const [topSubInstances, topPubInstances, allSubCount, allPubCount] = await Promise.all([
		listInstancesOrderByFollowersCountDescFromDatabase(deps.db, params.limit),
		listInstancesOrderByFollowingCountDescFromDatabase(deps.db, params.limit),
		countFollowingsWithRemoteFolloweeHostFromDatabase(deps.db),
		countFollowingsWithRemoteFollowerHostFromDatabase(deps.db),
	]);
	const gotSubCount = topSubInstances.map(x => x.followersCount).reduce((a, b) => a + b, 0);
	const gotPubCount = topPubInstances.map(x => x.followingCount).reduce((a, b) => a + b, 0);

	const isModerator = await isHonoApiModerator(deps, user);

	return {
		topSubInstances: packHonoApiFederationInstancesWithModerator(deps.meta, topSubInstances, isModerator),
		otherFollowersCount: Math.max(0, allSubCount - gotSubCount),
		topPubInstances: packHonoApiFederationInstancesWithModerator(deps.meta, topPubInstances, isModerator),
		otherFollowingCount: Math.max(0, allPubCount - gotPubCount),
	};
}

const federationUsersParamDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['host'],
} as const;

type FederationUsersParams = SchemaType<typeof federationUsersParamDef>;

export async function handleHonoApiFederationUsers(
	deps: HonoApiFederationDependencies,
	me: MiLocalUser | null,
	body: Record<string, unknown>,
): Promise<UserDetailedNotMeHonoApiResponse[]> {
	const params = parseHonoApiParams(federationUsersParamDef, body) as FederationUsersParams;

	let sinceId = params.sinceId ?? null;
	let untilId = params.untilId ?? null;
	if (sinceId == null && untilId == null) {
		if (params.sinceDate) sinceId = genId(deps.config, params.sinceDate);
		if (params.untilDate) untilId = genId(deps.config, params.untilDate);
	}

	const users = await listUsersByHostWithPaginationFromDatabase(deps.db, {
		host: params.host,
		limit: params.limit,
		sinceId,
		untilId,
	});

	return await packUserDetailedNotMeManyForHonoApi(deps, users);
}

const federationHostFollowingParamDef = {
	type: 'object',
	properties: {
		host: { type: 'string' },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: ['host'],
} as const;

type FederationHostFollowingParams = SchemaType<typeof federationHostFollowingParamDef>;

export async function handleHonoApiFederationFollowers(
	deps: HonoApiFederationDependencies,
	body: Record<string, unknown>,
): Promise<FollowingListItem[]> {
	const params = parseHonoApiParams(federationHostFollowingParamDef, body) as FederationHostFollowingParams;
	const pagination = resolveHonoApiIdPagination(deps.config, params);
	const followings = await listFollowingsByHostWithPaginationFromDatabase(deps.db, 'followee', params.host, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFollowingsForHonoApi(deps, followings);
}

export async function handleHonoApiFederationFollowing(
	deps: HonoApiFederationDependencies,
	body: Record<string, unknown>,
): Promise<FollowingListItem[]> {
	const params = parseHonoApiParams(federationHostFollowingParamDef, body) as FederationHostFollowingParams;
	const pagination = resolveHonoApiIdPagination(deps.config, params);
	const followings = await listFollowingsByHostWithPaginationFromDatabase(deps.db, 'follower', params.host, {
		limit: params.limit,
		order: pagination.order,
		sinceId: pagination.sinceId,
		untilId: pagination.untilId,
	});

	return await packFollowingsForHonoApi(deps, followings);
}
