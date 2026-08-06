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

const RELAY_CACHE_TTL_MS = 1000 * 60;
const relaysByStatusCache = new Map<string, { rows: RelayRow[]; cachedAt: number }>();

function invalidateRelayCache(): void {
	relaysByStatusCache.clear();
}

/**
 * listRelaysByStatusFromDatabase のプロセスローカル短命キャッシュ版 (原典 RelayService の
 * 10分 MemorySingleCache 相当)。公開ノート作成毎の accepted リレー解決と inbox の
 * リレーアクター判定ホットパス専用。リレーは管理者操作でしか変化せず、このプロセスの書き込みは
 * RelayStore の書き込み関数内で同期無効化される。管理系一覧は非キャッシュ版を使うこと。
 */
export async function listRelaysByStatusFromDatabaseCached(
	db: MiDrizzleDatabase,
	status: MiRelay['status'],
): Promise<RelayRow[]> {
	const hit = relaysByStatusCache.get(status);
	if (hit != null && Date.now() - hit.cachedAt < RELAY_CACHE_TTL_MS) {
		return hit.rows;
	}

	const rows = await listRelaysByStatusFromDatabase(db, status);
	relaysByStatusCache.set(status, { rows, cachedAt: Date.now() });
	return rows;
}

export async function createRelayInDatabase(db: MiDrizzleDatabase, data: RelayInsert): Promise<RelayRow> {
	const [row] = await db.insert(relay).values(data).returning();

	if (!row) {
		throw new Error('Relay row was not created');
	}

	invalidateRelayCache();
	return row;
}

export async function fetchRelayByInboxFromDatabase(
	db: MiDrizzleDatabase,
	inbox: MiRelay['inbox'],
): Promise<RelayRow | null> {
	const [row] = await db.select().from(relay).where(eq(relay.inbox, inbox)).limit(1);

	return row ?? null;
}

export async function deleteRelayFromDatabase(db: MiDrizzleDatabase, id: MiRelay['id']): Promise<void> {
	await db.delete(relay).where(eq(relay.id, id));

	invalidateRelayCache();
}

export async function listRelaysFromDatabase(db: MiDrizzleDatabase): Promise<RelayRow[]> {
	return db.select().from(relay);
}

export async function listRelaysByStatusFromDatabase(
	db: MiDrizzleDatabase,
	status: MiRelay['status'],
): Promise<RelayRow[]> {
	return db.select().from(relay).where(eq(relay.status, status));
}

export async function updateRelayStatusInDatabase(
	db: MiDrizzleDatabase,
	id: MiRelay['id'],
	status: MiRelay['status'],
): Promise<UpdateResultLike> {
	const rows = await db.update(relay).set({ status }).where(eq(relay.id, id)).returning({ id: relay.id });

	invalidateRelayCache();
	return {
		generatedMaps: [],
		raw: [],
		affected: rows.length,
	};
}
