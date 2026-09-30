/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { followAcceptance } from '@/db/schema/follow-acceptance.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { DeliverJobInput } from '@/core/queue/queues.js';
import { enqueueDeliverJobInOutbox } from '@/core/queue/QueueOutboxStore.js';

export type FollowAcceptanceIdentity = {
	actorUri: string;
	followeeId: string;
	requestId?: string;
	followingId: string;
};

export function followAcceptanceKey(requestId: string | undefined, followingId?: string): string {
	// ID のない外部 Follow は、現在の関係の世代に限って同じ承認として扱う。
	const value = requestId ?? followingId;
	if (value == null) throw new Error('Follow acceptance requires an activity or relationship identity');
	return createHash('sha256')
		.update(requestId == null ? 'relation\0' : 'activity\0')
		.update(value)
		.digest('hex');
}

export async function hasAcceptedFollowInDatabase(
	db: MiDrizzleDatabase,
	identity: Omit<FollowAcceptanceIdentity, 'followingId'>,
): Promise<boolean> {
	if (identity.requestId == null) return false;
	const [row] = await db
		.select()
		.from(followAcceptance)
		.where(eq(followAcceptance.id, followAcceptanceKey(identity.requestId)))
		.limit(1);
	if (row == null) return false;
	if (
		row.actorUri !== identity.actorUri ||
		row.followeeId !== identity.followeeId ||
		row.requestId !== identity.requestId
	) {
		throw new Error('Follow activity identity conflicts with its previous acceptance');
	}
	return true;
}

export async function registerFollowAcceptanceDeliveryInDatabase(
	db: MiDrizzleDatabase,
	identity: FollowAcceptanceIdentity,
	job: DeliverJobInput,
): Promise<void> {
	const id = followAcceptanceKey(identity.requestId, identity.followingId);
	await db.transaction(async (transaction) => {
		const tx = transaction as MiDrizzleDatabase;
		const inserted = await tx
			.insert(followAcceptance)
			.values({
				id,
				actorUri: identity.actorUri,
				followeeId: identity.followeeId,
				requestId: identity.requestId ?? null,
				followingId: identity.followingId,
			})
			.onConflictDoNothing()
			.returning({ id: followAcceptance.id });
		if (inserted.length === 0) {
			const [existing] = await tx.select().from(followAcceptance).where(eq(followAcceptance.id, id)).limit(1);
			if (
				existing == null ||
				existing.actorUri !== identity.actorUri ||
				existing.followeeId !== identity.followeeId ||
				existing.requestId !== (identity.requestId ?? null)
			) {
				throw new Error('Follow acceptance identity conflicts with the registered delivery');
			}
			return;
		}
		// 受信済みの記録だけを保存して配送を失わないよう、outbox と同じ transaction で確定する。
		await enqueueDeliverJobInOutbox(tx, job);
	});
}
