/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, like, ne, notInArray, or, sql, type SQL } from 'drizzle-orm';
import { instance, type InstanceInsert, type InstanceRow } from '@/db/schema/instance.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import type { MiInstance } from '@/models/Instance.js';

function deserializeInstance(row: InstanceRow): MiInstance {
	return row as MiInstance;
}

export async function fetchInstanceByHostFromDatabase(
	db: MiDrizzleDatabase,
	host: MiInstance['host'],
): Promise<MiInstance | null> {
	const [row] = await db.select().from(instance).where(eq(instance.host, host)).limit(1);

	return row ? deserializeInstance(row) : null;
}

export async function createInstanceInDatabase(db: MiDrizzleDatabase, values: InstanceInsert): Promise<MiInstance> {
	const [row] = await db.insert(instance).values(values).returning();

	if (row == null) {
		throw new EntityNotFoundError('MiInstance', values);
	}

	return deserializeInstance(row);
}

export async function createInstanceIfNotExistsInDatabase(
	db: MiDrizzleDatabase,
	values: InstanceInsert,
): Promise<MiInstance> {
	const [inserted] = await db
		.insert(instance)
		.values(values)
		.onConflictDoNothing({ target: instance.host })
		.returning();
	if (inserted != null) return deserializeInstance(inserted);

	const existing = await fetchInstanceByHostFromDatabase(db, values.host);
	if (existing == null) throw new EntityNotFoundError('MiInstance', values);
	return existing;
}

export async function updateInstanceInDatabase(
	db: MiDrizzleDatabase,
	id: MiInstance['id'],
	values: Partial<InstanceInsert>,
): Promise<MiInstance> {
	const [row] = await db.update(instance).set(values).where(eq(instance.id, id)).returning();

	if (row == null) {
		throw new EntityNotFoundError('MiInstance', { id });
	}

	return deserializeInstance(row);
}

export async function adjustInstanceUsersCountFromDatabase(
	db: MiDrizzleDatabase,
	id: MiInstance['id'],
	delta: number,
): Promise<void> {
	await db
		.update(instance)
		.set({ usersCount: sql`${instance.usersCount} + ${delta}` })
		.where(eq(instance.id, id));
}

export async function adjustInstanceNotesCountFromDatabase(
	db: MiDrizzleDatabase,
	id: MiInstance['id'],
	delta: number,
): Promise<void> {
	await db
		.update(instance)
		.set({ notesCount: sql`${instance.notesCount} + ${delta}` })
		.where(eq(instance.id, id));
}

export async function adjustInstanceFollowingCountFromDatabase(
	db: MiDrizzleDatabase,
	id: MiInstance['id'],
	delta: number,
): Promise<void> {
	await db
		.update(instance)
		.set({ followingCount: sql`${instance.followingCount} + ${delta}` })
		.where(eq(instance.id, id));
}

export async function adjustInstanceFollowersCountFromDatabase(
	db: MiDrizzleDatabase,
	id: MiInstance['id'],
	delta: number,
): Promise<void> {
	await db
		.update(instance)
		.set({ followersCount: sql`${instance.followersCount} + ${delta}` })
		.where(eq(instance.id, id));
}

export async function countInstancesFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await db.select({ value: count() }).from(instance);

	return row?.value ?? 0;
}

export async function listActiveInstanceHostsFromDatabase(db: MiDrizzleDatabase): Promise<MiInstance['host'][]> {
	const rows = await db.select({ host: instance.host }).from(instance).where(eq(instance.suspensionState, 'none'));

	return rows.map((row) => row.host);
}

export type FederationInstancesSort =
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

function resolveFederationInstancesOrderBy(sort: FederationInstancesSort): SQL[] {
	switch (sort) {
		// Preserve the historical last-call-wins ordering for these aliases.
		case '+pubSub':
			return [desc(instance.followersCount)];
		case '-pubSub':
			return [asc(instance.followersCount)];
		case '+notes':
			return [desc(instance.notesCount)];
		case '-notes':
			return [asc(instance.notesCount)];
		case '+users':
			return [desc(instance.usersCount)];
		case '-users':
			return [asc(instance.usersCount)];
		case '+following':
			return [desc(instance.followingCount)];
		case '-following':
			return [asc(instance.followingCount)];
		case '+followers':
			return [desc(instance.followersCount)];
		case '-followers':
			return [asc(instance.followersCount)];
		case '+firstRetrievedAt':
			return [desc(instance.firstRetrievedAt)];
		case '-firstRetrievedAt':
			return [asc(instance.firstRetrievedAt)];
		case '+latestRequestReceivedAt':
			return [sql`${instance.latestRequestReceivedAt} DESC NULLS LAST`];
		case '-latestRequestReceivedAt':
			return [sql`${instance.latestRequestReceivedAt} ASC NULLS FIRST`];
		default:
			return [desc(instance.id)];
	}
}

export async function listFederationInstancesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		host?: string | null;
		blocked?: boolean | null;
		blockedHosts: string[];
		notResponding?: boolean | null;
		suspended?: boolean | null;
		silenced?: boolean | null;
		silencedHosts: string[];
		federating?: boolean | null;
		subscribing?: boolean | null;
		publishing?: boolean | null;
		limit: number;
		offset: number;
		sort: FederationInstancesSort;
	},
): Promise<MiInstance[]> {
	const conditions: SQL[] = [];

	if (typeof options.blocked === 'boolean') {
		if (options.blocked) {
			if (options.blockedHosts.length === 0) return [];
			conditions.push(inArray(instance.host, options.blockedHosts));
		} else if (options.blockedHosts.length > 0) {
			conditions.push(notInArray(instance.host, options.blockedHosts));
		}
	}

	if (typeof options.notResponding === 'boolean') {
		conditions.push(eq(instance.isNotResponding, options.notResponding));
	}

	if (typeof options.suspended === 'boolean') {
		conditions.push(options.suspended ? ne(instance.suspensionState, 'none') : eq(instance.suspensionState, 'none'));
	}

	if (typeof options.silenced === 'boolean') {
		if (options.silenced) {
			if (options.silencedHosts.length === 0) return [];
			conditions.push(inArray(instance.host, options.silencedHosts));
		} else if (options.silencedHosts.length > 0) {
			conditions.push(notInArray(instance.host, options.silencedHosts));
		}
	}

	if (typeof options.federating === 'boolean') {
		conditions.push(
			options.federating
				? or(gt(instance.followingCount, 0), gt(instance.followersCount, 0))!
				: and(eq(instance.followingCount, 0), eq(instance.followersCount, 0))!,
		);
	}

	if (typeof options.subscribing === 'boolean') {
		conditions.push(options.subscribing ? gt(instance.followersCount, 0) : eq(instance.followersCount, 0));
	}

	if (typeof options.publishing === 'boolean') {
		conditions.push(options.publishing ? gt(instance.followingCount, 0) : eq(instance.followingCount, 0));
	}

	if (options.host) {
		conditions.push(like(instance.host, `%${sqlLikeEscape(options.host.toLowerCase())}%`));
	}

	const query = db
		.select()
		.from(instance)
		.where(conditions.length > 0 ? and(...conditions) : undefined)
		.orderBy(...resolveFederationInstancesOrderBy(options.sort))
		.limit(options.limit)
		.offset(options.offset);

	const rows = await query;

	return rows.map((row) => deserializeInstance(row));
}

export async function listInstancesOrderByFollowersCountDescFromDatabase(
	db: MiDrizzleDatabase,
	limit: number,
): Promise<MiInstance[]> {
	const rows = await db
		.select()
		.from(instance)
		.where(gt(instance.followersCount, 0))
		.orderBy(desc(instance.followersCount))
		.limit(limit);

	return rows.map((row) => deserializeInstance(row));
}

export async function listInstancesOrderByFollowingCountDescFromDatabase(
	db: MiDrizzleDatabase,
	limit: number,
): Promise<MiInstance[]> {
	const rows = await db
		.select()
		.from(instance)
		.where(gt(instance.followingCount, 0))
		.orderBy(desc(instance.followingCount))
		.limit(limit);

	return rows.map((row) => deserializeInstance(row));
}

export async function listSuspendedInstancesFromDatabase(db: MiDrizzleDatabase): Promise<MiInstance[]> {
	const rows = await db.select().from(instance).where(ne(instance.suspensionState, 'none'));

	return rows.map((row) => deserializeInstance(row));
}
