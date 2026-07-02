/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { eq } from 'drizzle-orm';
import { relay, type RelayInsert, type RelayRow } from '@/db/schema/relay.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiRelay } from '@/models/Relay.js';

type UpdateResultLike = {
	generatedMaps: [];
	raw: [];
	affected: number;
};

export async function createRelayInDatabase(db: MiDrizzleDatabase, data: RelayInsert): Promise<RelayRow> {
	const [row] = await db
		.insert(relay)
		.values(data)
		.returning();

	if (!row) {
		throw new Error('Relay row was not created');
	}

	return row;
}

export async function fetchRelayByInboxFromDatabase(db: MiDrizzleDatabase, inbox: MiRelay['inbox']): Promise<RelayRow | null> {
	const [row] = await db
		.select()
		.from(relay)
		.where(eq(relay.inbox, inbox))
		.limit(1);

	return row ?? null;
}

export async function deleteRelayFromDatabase(db: MiDrizzleDatabase, id: MiRelay['id']): Promise<void> {
	await db
		.delete(relay)
		.where(eq(relay.id, id));
}

export async function listRelaysFromDatabase(db: MiDrizzleDatabase): Promise<RelayRow[]> {
	return db
		.select()
		.from(relay);
}

export async function listRelaysByStatusFromDatabase(db: MiDrizzleDatabase, status: MiRelay['status']): Promise<RelayRow[]> {
	return db
		.select()
		.from(relay)
		.where(eq(relay.status, status));
}

export async function updateRelayStatusInDatabase(db: MiDrizzleDatabase, id: MiRelay['id'], status: MiRelay['status']): Promise<UpdateResultLike> {
	const rows = await db
		.update(relay)
		.set({ status })
		.where(eq(relay.id, id))
		.returning({ id: relay.id });

	return {
		generatedMaps: [],
		raw: [],
		affected: rows.length,
	};
}
