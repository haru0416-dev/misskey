/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import semver from 'semver';
import { fetchMetaFromDatabase } from '@/core/MetaStore.js';
import {
	fetchInstanceByHostFromDatabase,
	listFederationInstancesFromDatabase,
	listInstancesOrderByFollowersCountDescFromDatabase,
	listInstancesOrderByFollowingCountDescFromDatabase,
} from '@/core/InstanceStore.js';
import {
	countFollowingsWithRemoteFolloweeHostFromDatabase,
	countFollowingsWithRemoteFollowerHostFromDatabase,
} from '@/core/FollowingStore.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { Packed, SchemaType } from '@/misc/json-schema.js';
import type { MiInstance, MiMeta } from '@/models/_.js';
import type { MiLocalUser } from '@/models/User.js';
import { isHonoApiModerator } from './hono-api-role-policy.js';
import { parseHonoApiParams } from './hono-api-validation.js';

export type HonoApiFederationDependencies = {
	config: Config;
	db: MiDrizzleDatabase;
	meta: MiMeta;
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

const federationStatsParamDef = {
	type: 'object',
	properties: {
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
	},
	required: [],
} as const;

type FederationInstancesParams = SchemaType<typeof federationInstancesParamDef>;
type FederationShowInstanceParams = SchemaType<typeof federationShowInstanceParamDef>;
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
