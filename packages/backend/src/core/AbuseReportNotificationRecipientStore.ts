/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, eq, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import {
	abuseReportNotificationRecipient,
	type AbuseReportNotificationRecipientInsert,
	type AbuseReportNotificationRecipientRow,
} from '@/db/schema/abuse-report-notification-recipient.js';
import { systemWebhook, deserializeSystemWebhook } from '@/db/schema/system-webhook.js';
import { user as userTable } from '@/db/schema/user.js';
import { userProfile } from '@/db/schema/user-profile.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiAbuseReportNotificationRecipient, RecipientMethod } from '@/models/AbuseReportNotificationRecipient.js';
import type { MiSystemWebhook } from '@/models/SystemWebhook.js';
import type { MiUser } from '@/models/User.js';
import type { MiUserProfile } from '@/models/UserProfile.js';

type AbuseReportNotificationRecipientUpdate = Partial<
	Pick<
		AbuseReportNotificationRecipientInsert,
		'isActive' | 'updatedAt' | 'name' | 'method' | 'userId' | 'systemWebhookId'
	>
>;

type RecipientWithRelations = MiAbuseReportNotificationRecipient & {
	user: MiUser | null;
	userProfile: MiUserProfile | null;
	systemWebhook: MiSystemWebhook | null;
};

function deserializeRecipient(
	row: AbuseReportNotificationRecipientRow,
	relations: {
		user?: MiUser | null;
		userProfile?: MiUserProfile | null;
		systemWebhook?: MiSystemWebhook | null;
	} = {},
): RecipientWithRelations {
	return {
		...row,
		user: relations.user ?? null,
		userProfile: relations.userProfile ?? null,
		systemWebhook: relations.systemWebhook ?? null,
	} as RecipientWithRelations;
}

function recipientFilterCondition(options: {
	ids?: MiAbuseReportNotificationRecipient['id'][];
	method?: RecipientMethod[];
}): SQL | undefined {
	const conditions: SQL[] = [];

	if (options.ids != null) {
		if (options.ids.length === 0) return sql`false`;
		conditions.push(inArray(abuseReportNotificationRecipient.id, options.ids));
	}

	if (options.method != null) {
		const methodConditions: SQL[] = [];

		if (options.method.includes('email')) {
			methodConditions.push(
				and(eq(abuseReportNotificationRecipient.method, 'email'), isNotNull(abuseReportNotificationRecipient.userId))!,
			);
		}

		if (options.method.includes('webhook')) {
			methodConditions.push(
				and(eq(abuseReportNotificationRecipient.method, 'webhook'), isNull(abuseReportNotificationRecipient.userId))!,
			);
		}

		if (methodConditions.length === 0) return sql`false`;
		conditions.push(or(...methodConditions)!);
	}

	return conditions.length > 0 ? and(...conditions) : undefined;
}

export async function fetchAbuseReportNotificationRecipientByIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAbuseReportNotificationRecipient['id'],
): Promise<MiAbuseReportNotificationRecipient | null> {
	const [row] = await db
		.select()
		.from(abuseReportNotificationRecipient)
		.where(eq(abuseReportNotificationRecipient.id, id))
		.limit(1);

	return row == null ? null : deserializeRecipient(row);
}

export async function fetchAbuseReportNotificationRecipientByIdOrFailFromDatabase(
	db: MiDrizzleDatabase,
	id: MiAbuseReportNotificationRecipient['id'],
): Promise<MiAbuseReportNotificationRecipient> {
	const recipient = await fetchAbuseReportNotificationRecipientByIdFromDatabase(db, id);
	if (recipient == null) {
		throw new Error(`Abuse report notification recipient ${id} not found`);
	}

	return recipient;
}

export async function listAbuseReportNotificationRecipientsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		ids?: MiAbuseReportNotificationRecipient['id'][];
		method?: RecipientMethod[];
		joinUser?: boolean;
		joinSystemWebhook?: boolean;
	} = {},
): Promise<MiAbuseReportNotificationRecipient[]> {
	const rows = await db.select().from(abuseReportNotificationRecipient).where(recipientFilterCondition(options));

	if (rows.length === 0) return [];

	const userIds = options.joinUser ? rows.map((row) => row.userId).filter((x) => x != null) : [];
	const users = userIds.length > 0 ? await db.select().from(userTable).where(inArray(userTable.id, userIds)) : [];
	const userProfiles =
		userIds.length > 0 ? await db.select().from(userProfile).where(inArray(userProfile.userId, userIds)) : [];
	const userMap = new Map(users.map((row) => [row.id, row as MiUser]));
	const userProfileMap = new Map(userProfiles.map((row) => [row.userId, row as MiUserProfile]));

	const webhookIds = options.joinSystemWebhook ? rows.map((row) => row.systemWebhookId).filter((x) => x != null) : [];
	const webhooks =
		webhookIds.length > 0 ? await db.select().from(systemWebhook).where(inArray(systemWebhook.id, webhookIds)) : [];
	const webhookMap = new Map(webhooks.map((row) => [row.id, deserializeSystemWebhook(row)]));

	return rows
		.map((row) => {
			const joinedUser = row.userId == null ? null : (userMap.get(row.userId) ?? null);
			const joinedUserProfile = row.userId == null ? null : (userProfileMap.get(row.userId) ?? null);
			const joinedWebhook = row.systemWebhookId == null ? null : (webhookMap.get(row.systemWebhookId) ?? null);

			if (options.joinUser && (joinedUser == null || joinedUserProfile == null)) return null;
			if (options.joinSystemWebhook && joinedWebhook == null) return null;

			return deserializeRecipient(row, {
				user: joinedUser,
				userProfile: joinedUserProfile,
				systemWebhook: joinedWebhook,
			});
		})
		.filter((x) => x != null);
}

export async function listUserAbuseReportNotificationRecipientsFromDatabase(
	db: MiDrizzleDatabase,
): Promise<MiAbuseReportNotificationRecipient[]> {
	const rows = await db
		.select()
		.from(abuseReportNotificationRecipient)
		.where(isNotNull(abuseReportNotificationRecipient.userId));

	return rows.map((row) => deserializeRecipient(row));
}

export async function createAbuseReportNotificationRecipientInDatabase(
	db: MiDrizzleDatabase,
	data: AbuseReportNotificationRecipientInsert,
): Promise<MiAbuseReportNotificationRecipient> {
	const [row] = await db.insert(abuseReportNotificationRecipient).values(data).returning();

	if (row == null) {
		throw new Error('Failed to create abuse report notification recipient');
	}

	return deserializeRecipient(row);
}

export async function updateAbuseReportNotificationRecipientInDatabase(
	db: MiDrizzleDatabase,
	id: MiAbuseReportNotificationRecipient['id'],
	data: AbuseReportNotificationRecipientUpdate,
): Promise<MiAbuseReportNotificationRecipient | null> {
	const [row] = await db
		.update(abuseReportNotificationRecipient)
		.set(data)
		.where(eq(abuseReportNotificationRecipient.id, id))
		.returning();

	return row == null ? null : deserializeRecipient(row);
}

export async function deleteAbuseReportNotificationRecipientsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiAbuseReportNotificationRecipient['id'] | MiAbuseReportNotificationRecipient['id'][],
): Promise<void> {
	const normalizedIds = Array.isArray(ids) ? ids : [ids];
	if (normalizedIds.length === 0) return;

	await db.delete(abuseReportNotificationRecipient).where(inArray(abuseReportNotificationRecipient.id, normalizedIds));
}
