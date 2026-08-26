/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, or } from 'drizzle-orm';
import { chatApproval, type ChatApprovalInsert, type ChatApprovalRow } from '@/db/schema/chat-approval.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiUser } from '@/models/User.js';

export async function listChatApprovalsBetweenUsers(
	db: MiDrizzleDatabase,
	fromUserId: MiUser['id'],
	toUserId: MiUser['id'],
): Promise<ChatApprovalRow[]> {
	return db
		.select()
		.from(chatApproval)
		.where(
			or(
				and(eq(chatApproval.userId, fromUserId), eq(chatApproval.otherId, toUserId)),
				and(eq(chatApproval.userId, toUserId), eq(chatApproval.otherId, fromUserId)),
			),
		)
		.limit(2);
}

export async function createChatApprovalInDatabase(db: MiDrizzleDatabase, data: ChatApprovalInsert): Promise<void> {
	await db
		.insert(chatApproval)
		.values(data)
		.onConflictDoNothing({
			target: [chatApproval.userId, chatApproval.otherId],
		});
}
