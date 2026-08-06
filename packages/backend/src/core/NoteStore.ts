/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { and, asc, count, desc, eq, gt, inArray, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import { preparedQueryFor, UNNAMED_PREPARED_STATEMENT } from '@/db/prepared.js';
import { note, type NoteInsert, type NoteRow } from '@/db/schema/note.js';
import { noteReaction } from '@/db/schema/note-reaction.js';
import { driveFile } from '@/db/schema/drive-file.js';
import { poll, type PollInsert } from '@/db/schema/poll.js';
import { user as userTable } from '@/db/schema/user.js';
import { channel as channelTable, type ChannelRow } from '@/db/schema/channel.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { EntityNotFoundError } from '@/misc/db-errors.js';
import type { MiNote } from '@/models/Note.js';
import type { MiChannel } from '@/models/Channel.js';
import type { MiRemoteUser, MiUser } from '@/models/User.js';
import { deserializeUser } from '@/core/UserStore.js';
import { sqlLikeEscape } from '@/misc/sql-like-escape.js';
import { PER_NOTE_REACTION_USER_PAIR_CACHE_MAX } from '@/const.js';

function deserializeNote(row: NoteRow): MiNote {
	return {
		...row,
		reply: null,
		renote: null,
		user: null,
		channel: null,
	} as MiNote;
}

function deserializeChannelForNote(row: ChannelRow): MiChannel {
	return {
		...row,
		user: null,
		banner: null,
	} as MiChannel;
}

function noteColumn(alias: string, column: keyof NoteRow): SQL {
	return sql.raw(`"${alias}"."${column}"`);
}

function quoteContentCondition(alias: string): SQL {
	return sql`(
		${noteColumn(alias, 'text')} IS NOT NULL
		OR ${noteColumn(alias, 'cw')} IS NOT NULL
		OR ${noteColumn(alias, 'replyId')} IS NOT NULL
		OR ${noteColumn(alias, 'hasPoll')} = TRUE
		OR ${noteColumn(alias, 'fileIds')} != '{}'
	)`;
}

function quoteCondition(alias: string): SQL {
	return sql`(
		${noteColumn(alias, 'renoteId')} IS NOT NULL
		AND ${quoteContentCondition(alias)}
	)`;
}

function pureRenoteCondition(alias: string): SQL {
	return sql`(
		${noteColumn(alias, 'renoteId')} IS NOT NULL
		AND NOT (${quoteContentCondition(alias)})
	)`;
}

function noteVisibilityCondition(me: { id: MiUser['id'] } | null): SQL {
	if (me == null) {
		return sql`("note"."visibility" = 'public' OR "note"."visibility" = 'home')`;
	}

	return sql`(
		("note"."visibility" = 'public' OR "note"."visibility" = 'home')
		OR "note"."userId" = ${me.id}
		OR ARRAY[${me.id}]::varchar[] <@ "note"."visibleUserIds"
		OR ARRAY[${me.id}]::varchar[] <@ "note"."mentions"
		OR (
			"note"."visibility" = 'followers'
			AND (
				"note"."userId" IN (SELECT "followeeId" FROM "following" WHERE "followerId" = ${me.id})
				OR "note"."replyUserId" = ${me.id}
			)
		)
	)`;
}

function blockedHostCondition(alias: string, blockedHosts: string[]): SQL {
	if (blockedHosts.length === 0) {
		return sql`TRUE`;
	}

	const patterns = blockedHosts.flatMap((host) => [host, `%.${host}`]);
	return sql`(
		${noteColumn(alias, 'userId')} IS NULL
		OR ${noteColumn(alias, 'userHost')} IS NULL
		OR ${noteColumn(alias, 'userHost')} NOT ILIKE ALL(ARRAY[${sql.join(
			patterns.map((pattern) => sql`${pattern}`),
			sql`, `,
		)}])
	)`;
}

/**
 * blockedHostCondition の reply/renote 版。reply/renote 行へのセルフJOINの代わりに、
 * note 行へ非正規化済みの replyUserId/replyUserHost (renote も同様) を参照する。
 * fanout-timeline.ts の blockedHost 判定と同じデータソースで、JOIN 1つ分軽くなる。
 */
function blockedRelatedHostCondition(idColumn: keyof NoteRow, hostColumn: keyof NoteRow, blockedHosts: string[]): SQL {
	if (blockedHosts.length === 0) {
		return sql`TRUE`;
	}

	const patterns = blockedHosts.flatMap((host) => [host, `%.${host}`]);
	return sql`(
		${noteColumn('note', idColumn)} IS NULL
		OR ${noteColumn('note', hostColumn)} IS NULL
		OR ${noteColumn('note', hostColumn)} NOT ILIKE ALL(ARRAY[${sql.join(
			patterns.map((pattern) => sql`${pattern}`),
			sql`, `,
		)}])
	)`;
}

function suspendedUserCondition(): SQL {
	return sql`
		"user"."isSuspended" = FALSE
		AND ("replyUser"."id" IS NULL OR "replyUser"."isSuspended" = FALSE)
		AND ("renoteUser"."id" IS NULL OR "renoteUser"."isSuspended" = FALSE)
	`;
}

function mutedUserCondition(alias: string, me: { id: MiUser['id'] }): SQL {
	return sql`
		(
			${noteColumn(alias, 'userId')} IS NULL
			OR ${noteColumn(alias, 'userId')} NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${me.id})
		)
		AND (
			${noteColumn(alias, 'replyUserId')} IS NULL
			OR ${noteColumn(alias, 'replyUserId')} NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${me.id})
		)
		AND (
			${noteColumn(alias, 'renoteUserId')} IS NULL
			OR ${noteColumn(alias, 'renoteUserId')} NOT IN (SELECT "muteeId" FROM "muting" WHERE "muterId" = ${me.id})
		)
		AND (
			${noteColumn(alias, 'userHost')} IS NULL
			OR NOT ((SELECT "mutedInstances" FROM "user_profile" WHERE "userId" = ${me.id})::jsonb ? ${noteColumn(alias, 'userHost')})
		)
		AND (
			${noteColumn(alias, 'replyUserHost')} IS NULL
			OR NOT ((SELECT "mutedInstances" FROM "user_profile" WHERE "userId" = ${me.id})::jsonb ? ${noteColumn(alias, 'replyUserHost')})
		)
		AND (
			${noteColumn(alias, 'renoteUserHost')} IS NULL
			OR NOT ((SELECT "mutedInstances" FROM "user_profile" WHERE "userId" = ${me.id})::jsonb ? ${noteColumn(alias, 'renoteUserHost')})
		)
	`;
}

function blockedUserCondition(alias: string, me: { id: MiUser['id'] }): SQL {
	return sql`
		(
			${noteColumn(alias, 'userId')} IS NULL
			OR ${noteColumn(alias, 'userId')} NOT IN (SELECT "blockerId" FROM "blocking" WHERE "blockeeId" = ${me.id})
		)
		AND (
			${noteColumn(alias, 'replyUserId')} IS NULL
			OR ${noteColumn(alias, 'replyUserId')} NOT IN (SELECT "blockerId" FROM "blocking" WHERE "blockeeId" = ${me.id})
		)
		AND (
			${noteColumn(alias, 'renoteUserId')} IS NULL
			OR ${noteColumn(alias, 'renoteUserId')} NOT IN (SELECT "blockerId" FROM "blocking" WHERE "blockeeId" = ${me.id})
		)
	`;
}

function mutedUserRenotesCondition(me: { id: MiUser['id'] }): SQL {
	return sql`NOT (
		${pureRenoteCondition('note')}
		AND "note"."userId" IN (SELECT "muteeId" FROM "renote_muting" WHERE "muterId" = ${me.id})
	)`;
}

function baseNoteFilteringCondition(me: { id: MiUser['id'] } | null, blockedHosts: string[]): SQL {
	const conditions: SQL[] = [noteHostAndSuspensionFilteringCondition(blockedHosts)];

	if (me != null) {
		conditions.push(
			mutedUserCondition('note', me),
			blockedUserCondition('note', me),
			mutedUserCondition('renote', me),
			blockedUserCondition('renote', me),
		);
	}

	return sql.join(
		conditions.map((condition) => sql`(${condition})`),
		sql` AND `,
	);
}

function noteHostAndSuspensionFilteringCondition(blockedHosts: string[]): SQL {
	return sql.join(
		[
			blockedHostCondition('note', blockedHosts),
			blockedRelatedHostCondition('replyUserId', 'replyUserHost', blockedHosts),
			blockedRelatedHostCondition('renoteUserId', 'renoteUserHost', blockedHosts),
			suspendedUserCondition(),
		].map((condition) => sql`(${condition})`),
		sql` AND `,
	);
}

function blockedHostConditionExcludeAuthor(blockedHosts: string[]): SQL {
	if (blockedHosts.length === 0) {
		return sql`TRUE`;
	}

	const patterns = blockedHosts.flatMap((host) => [host, `%.${host}`]);
	const nonBlockedHost = (column: SQL): SQL =>
		sql`${column} NOT ILIKE ALL(ARRAY[${sql.join(
			patterns.map((pattern) => sql`${pattern}`),
			sql`, `,
		)}])`;
	const instanceSuspension = (idColumn: keyof NoteRow, hostColumn: keyof NoteRow): SQL => sql`(
		${noteColumn('note', idColumn)} IS NULL
		OR "note"."userId" = ${noteColumn('note', idColumn)}
		OR ${noteColumn('note', hostColumn)} IS NULL
		OR ${nonBlockedHost(noteColumn('note', hostColumn))}
	)`;

	return sql`
		${instanceSuspension('replyUserId', 'replyUserHost')}
		AND ${instanceSuspension('renoteUserId', 'renoteUserHost')}
	`;
}

function suspendedUserConditionExcludeAuthor(): SQL {
	return sql`
		(
			"replyUser"."id" IS NULL
			OR "user"."id" = "replyUser"."id"
			OR "replyUser"."isSuspended" = FALSE
		)
		AND (
			"renoteUser"."id" IS NULL
			OR "user"."id" = "renoteUser"."id"
			OR "renoteUser"."isSuspended" = FALSE
		)
	`;
}

function mutedUserConditionExcludeUser(alias: string, me: { id: MiUser['id'] }, excludeUserId: MiUser['id']): SQL {
	const mutingQuery = sql`SELECT "muteeId" FROM "muting" WHERE "muterId" = ${me.id} AND "muteeId" != ${excludeUserId}`;

	return sql`
		(
			${noteColumn(alias, 'userId')} IS NULL
			OR ${noteColumn(alias, 'userId')} NOT IN (${mutingQuery})
		)
		AND (
			${noteColumn(alias, 'replyUserId')} IS NULL
			OR ${noteColumn(alias, 'replyUserId')} NOT IN (${mutingQuery})
		)
		AND (
			${noteColumn(alias, 'renoteUserId')} IS NULL
			OR ${noteColumn(alias, 'renoteUserId')} NOT IN (${mutingQuery})
		)
		AND (
			${noteColumn(alias, 'userHost')} IS NULL
			OR NOT ((SELECT "mutedInstances" FROM "user_profile" WHERE "userId" = ${me.id})::jsonb ? ${noteColumn(alias, 'userHost')})
		)
		AND (
			${noteColumn(alias, 'replyUserHost')} IS NULL
			OR NOT ((SELECT "mutedInstances" FROM "user_profile" WHERE "userId" = ${me.id})::jsonb ? ${noteColumn(alias, 'replyUserHost')})
		)
		AND (
			${noteColumn(alias, 'renoteUserHost')} IS NULL
			OR NOT ((SELECT "mutedInstances" FROM "user_profile" WHERE "userId" = ${me.id})::jsonb ? ${noteColumn(alias, 'renoteUserHost')})
		)
	`;
}

function userTimelineFilteringCondition(
	me: { id: MiUser['id'] } | null,
	blockedHosts: string[],
	authorId: MiUser['id'],
): SQL {
	const conditions: SQL[] = [blockedHostConditionExcludeAuthor(blockedHosts), suspendedUserConditionExcludeAuthor()];

	if (me != null) {
		conditions.push(
			mutedUserConditionExcludeUser('note', me, authorId),
			blockedUserCondition('note', me),
			mutedUserConditionExcludeUser('renote', me, authorId),
			blockedUserCondition('renote', me),
		);
	}

	return sql.join(
		conditions.map((condition) => sql`(${condition})`),
		sql` AND `,
	);
}

function clipNoteFilteringCondition(me: { id: MiUser['id'] } | null, blockedHosts: string[]): SQL {
	const conditions: SQL[] = [
		blockedHostCondition('note', blockedHosts),
		blockedRelatedHostCondition('replyUserId', 'replyUserHost', blockedHosts),
		blockedRelatedHostCondition('renoteUserId', 'renoteUserHost', blockedHosts),
	];

	if (me != null) {
		conditions.push(
			mutedUserCondition('note', me),
			blockedUserCondition('note', me),
			mutedUserCondition('renote', me),
			blockedUserCondition('renote', me),
		);
	}

	return sql.join(
		conditions.map((condition) => sql`(${condition})`),
		sql` AND `,
	);
}

function mutedNoteThreadCondition(me: { id: MiUser['id'] }): SQL {
	const mutedQuery = sql`SELECT "threadId" FROM "note_thread_muting" WHERE "userId" = ${me.id}`;

	return sql`
		"note"."id" NOT IN (${mutedQuery})
		AND (
			"note"."threadId" IS NULL
			OR "note"."threadId" NOT IN (${mutedQuery})
		)
	`;
}

function notePaginationCondition(options: { sinceId?: MiNote['id'] | null; untilId?: MiNote['id'] | null }): SQL {
	if (options.sinceId && options.untilId) {
		return sql`"note"."id" > ${options.sinceId} AND "note"."id" < ${options.untilId}`;
	}

	if (options.sinceId) {
		return sql`"note"."id" > ${options.sinceId}`;
	}

	if (options.untilId) {
		return sql`"note"."id" < ${options.untilId}`;
	}

	return sql`TRUE`;
}

function notePaginationOrder(options: { sinceId?: MiNote['id'] | null; untilId?: MiNote['id'] | null }): SQL {
	return options.sinceId && !options.untilId ? sql.raw('ASC') : sql.raw('DESC');
}

export async function createNoteInDatabase(db: MiDrizzleDatabase, values: NoteInsert): Promise<void> {
	await db.insert(note).values(values);
}

export async function createNoteWithPollInDatabase(
	db: MiDrizzleDatabase,
	noteValues: NoteInsert,
	pollValues: PollInsert,
): Promise<void> {
	await db.transaction(async (tx) => {
		await tx.insert(note).values(noteValues);

		await tx.insert(poll).values(pollValues);
	});
}

export async function fetchNoteByIdFromDatabase(db: MiDrizzleDatabase, id: MiNote['id']): Promise<MiNote | null> {
	const statement = preparedQueryFor(db, 'note:byId', () =>
		db
			.select()
			.from(note)
			.where(eq(note.id, sql.placeholder('id')))
			.limit(1)
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const [row] = await statement.execute({ id });

	return row ? deserializeNote(row) : null;
}

export async function fetchNoteByIdAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	id: MiNote['id'],
	userId: MiUser['id'],
): Promise<MiNote | null> {
	const [row] = await db
		.select()
		.from(note)
		.where(and(eq(note.id, id), eq(note.userId, userId)))
		.limit(1);

	return row ? deserializeNote(row) : null;
}

export async function adjustNoteClippedCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiNote['id'],
	value: number,
): Promise<void> {
	await db
		.update(note)
		.set({
			clippedCount: sql`${note.clippedCount} + ${value}`,
		})
		.where(eq(note.id, id));
}

export async function fetchNoteByIdOrFailFromDatabase(db: MiDrizzleDatabase, id: MiNote['id']): Promise<MiNote> {
	const found = await fetchNoteByIdFromDatabase(db, id);

	if (found == null) {
		throw new EntityNotFoundError('MiNote', { id });
	}

	return found;
}

export async function listNotesByIdsFromDatabase(db: MiDrizzleDatabase, ids: MiNote['id'][]): Promise<MiNote[]> {
	if (ids.length === 0) return [];

	// IN (...) は件数ぶんプレースホルダが増えて SQL の形が変わるため、
	// 形を固定できる = ANY(配列1個) にして組み立て済みを使い回す
	const statement = preparedQueryFor(db, 'note:byIds', () =>
		db
			.select()
			.from(note)
			.where(sql`${note.id} = ANY(${sql.placeholder('ids')})`)
			.prepare(UNNAMED_PREPARED_STATEMENT),
	);
	const rows = await statement.execute({ ids });

	return rows.map((row) => deserializeNote(row));
}

export async function listNotesByUserIdAndRenoteIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	renoteId: MiNote['id'],
): Promise<MiNote[]> {
	const rows = await db
		.select()
		.from(note)
		.where(and(eq(note.userId, userId), eq(note.renoteId, renoteId)));

	return rows.map((row) => deserializeNote(row));
}

export async function countNotesByUserIdFromDatabase(db: MiDrizzleDatabase, userId: MiUser['id']): Promise<number> {
	const [row] = await db.select({ value: count() }).from(note).where(eq(note.userId, userId));

	return row?.value ?? 0;
}

export async function countNotesByUserHostFromDatabase(
	db: MiDrizzleDatabase,
	userHost: MiNote['userHost'],
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(note)
		.where(userHost == null ? isNull(note.userHost) : eq(note.userHost, userHost));

	return row?.value ?? 0;
}

export async function countNotesByUserHostNotNullFromDatabase(db: MiDrizzleDatabase): Promise<number> {
	const [row] = await db.select({ value: count() }).from(note).where(isNotNull(note.userHost));

	return row?.value ?? 0;
}

export async function countNotesByUserIdAndChannelIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	channelId: NonNullable<MiNote['channelId']>,
): Promise<number> {
	const [row] = await db
		.select({ value: count() })
		.from(note)
		.where(and(eq(note.userId, userId), eq(note.channelId, channelId)));

	return row?.value ?? 0;
}

export async function listNotesByUserIdWithPaginationFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiNote['id'] | null;
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [eq(note.userId, userId)];

	if (options.sinceId) {
		conditions.push(gt(note.id, options.sinceId));
	}

	const rows = await db
		.select()
		.from(note)
		.where(and(...conditions))
		.orderBy(asc(note.id))
		.limit(options.limit);

	return rows.map((row) => deserializeNote(row));
}

export async function deleteNotesByIdsFromDatabase(db: MiDrizzleDatabase, ids: MiNote['id'][]): Promise<void> {
	if (ids.length === 0) return;

	await db.delete(note).where(inArray(note.id, ids));
}

export async function deleteNoteAndDecrementParentRepliesCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiNote['id'],
	userId: MiUser['id'],
): Promise<void> {
	await db.transaction(async (tx) => {
		const [deleted] = await tx
			.delete(note)
			.where(and(eq(note.id, id), eq(note.userId, userId)))
			.returning({ replyId: note.replyId });

		if (deleted?.replyId == null) return;

		await tx
			.update(note)
			.set({ repliesCount: sql`${note.repliesCount} - 1` })
			.where(eq(note.id, deleted.replyId));
	});
}

export async function incrementNoteRepliesCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiNote['id'],
	amount: number,
): Promise<void> {
	await db
		.update(note)
		.set({ repliesCount: sql`${note.repliesCount} + ${amount}` })
		.where(eq(note.id, id));
}

export async function incrementNoteRenoteCountInDatabase(
	db: MiDrizzleDatabase,
	id: MiNote['id'],
	amount: number,
): Promise<void> {
	await db
		.update(note)
		.set({ renoteCount: sql`${note.renoteCount} + ${amount}` })
		.where(eq(note.id, id));
}

export async function incrementNoteReactionInDatabase(
	db: MiDrizzleDatabase,
	id: MiNote['id'],
	reaction: string,
	pairToAppend: string,
): Promise<void> {
	await db
		.update(note)
		.set({
			reactions: sql`jsonb_set(${note.reactions}, ARRAY[${reaction}]::text[], (COALESCE(${note.reactions}->>${reaction}, '0')::int + 1)::text::jsonb)`,
			reactionAndUserPairCache: sql`CASE WHEN cardinality(${note.reactionAndUserPairCache}) < ${PER_NOTE_REACTION_USER_PAIR_CACHE_MAX} THEN array_append(${note.reactionAndUserPairCache}, ${pairToAppend}) ELSE ${note.reactionAndUserPairCache} END`,
		})
		.where(eq(note.id, id));
}

export async function decrementNoteReactionInDatabase(
	db: MiDrizzleDatabase,
	id: MiNote['id'],
	reaction: string,
	pairToRemove: string,
): Promise<void> {
	await db
		.update(note)
		.set({
			reactions: sql`jsonb_set(${note.reactions}, ARRAY[${reaction}]::text[], (COALESCE(${note.reactions}->>${reaction}, '0')::int - 1)::text::jsonb)`,
			reactionAndUserPairCache: sql`array_remove(${note.reactionAndUserPairCache}, ${pairToRemove})`,
		})
		.where(eq(note.id, id));
}

export async function rebuildNoteReactionsInDatabase(db: MiDrizzleDatabase, id: MiNote['id']): Promise<void> {
	await db.transaction(async (transaction) => {
		const [target] = await transaction.select({ id: note.id }).from(note).where(eq(note.id, id)).for('update').limit(1);
		if (target == null) return;

		const counts = await transaction
			.select({ reaction: noteReaction.reaction, count: count() })
			.from(noteReaction)
			.where(eq(noteReaction.noteId, id))
			.groupBy(noteReaction.reaction);
		const recentPairs = await transaction
			.select({ userId: noteReaction.userId, reaction: noteReaction.reaction })
			.from(noteReaction)
			.where(eq(noteReaction.noteId, id))
			.orderBy(desc(noteReaction.id))
			.limit(PER_NOTE_REACTION_USER_PAIR_CACHE_MAX);

		await transaction
			.update(note)
			.set({
				reactions: Object.fromEntries(counts.map((row) => [row.reaction, row.count])),
				reactionAndUserPairCache: recentPairs.toReversed().map((row) => `${row.userId}/${row.reaction}`),
			})
			.where(eq(note.id, id));
	});
}

export async function listRemoteUsersWhoRenotedOrRepliedNoteFromDatabase(
	db: MiDrizzleDatabase,
	noteId: MiNote['id'],
): Promise<MiRemoteUser[]> {
	const rows = await db
		.select({ user: userTable })
		.from(note)
		.innerJoin(userTable, eq(userTable.id, note.userId))
		.where(and(or(eq(note.renoteId, noteId), eq(note.replyId, noteId)), isNotNull(note.userHost)));

	return rows.map((row) => deserializeUser(row.user) as MiRemoteUser);
}

export async function fetchNoteByUriAndUserIdFromDatabase(
	db: MiDrizzleDatabase,
	uri: NonNullable<MiNote['uri']>,
	userId: MiUser['id'],
): Promise<MiNote | null> {
	const [row] = await db
		.select()
		.from(note)
		.where(and(eq(note.uri, uri), eq(note.userId, userId)))
		.limit(1);

	return row ? deserializeNote(row) : null;
}

export async function fetchNoteByUriFromDatabase(
	db: MiDrizzleDatabase,
	uri: NonNullable<MiNote['uri']>,
): Promise<MiNote | null> {
	const [row] = await db.select().from(note).where(eq(note.uri, uri)).limit(1);

	return row ? deserializeNote(row) : null;
}

export async function listPublicFeedNotesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	limit: number,
): Promise<MiNote[]> {
	const rows = await db
		.select()
		.from(note)
		.where(and(eq(note.userId, userId), isNull(note.renoteId), inArray(note.visibility, ['public', 'home'])))
		.orderBy(desc(note.id))
		.limit(limit);

	return rows.map((row) => deserializeNote(row));
}

export async function listActivityPubOutboxNotesByUserIdFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	options: {
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		eq(note.userId, userId),
		inArray(note.visibility, ['public', 'home']),
		eq(note.localOnly, false),
	];

	if (options.sinceId && options.untilId) {
		conditions.push(gt(note.id, options.sinceId));
		conditions.push(sql`${note.id} < ${options.untilId}`);
	} else if (options.sinceId) {
		conditions.push(gt(note.id, options.sinceId));
	} else if (options.untilId) {
		conditions.push(sql`${note.id} < ${options.untilId}`);
	}

	const rows = await db
		.select()
		.from(note)
		.where(and(...conditions))
		.orderBy(options.sinceId && !options.untilId ? asc(note.id) : desc(note.id))
		.limit(options.limit);

	return rows.map((row) => deserializeNote(row));
}

export async function listChildNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		noteId: MiNote['id'];
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${notePaginationCondition(options)}
			AND (
				"note"."replyId" = ${options.noteId}
				OR (
					"note"."renoteId" = ${options.noteId}
					AND ${quoteContentCondition('note')}
				)
			)
			AND ${noteVisibilityCondition(options.me)}
			AND ${baseNoteFilteringCondition(options.me, options.blockedHosts)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listMentionNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		me: { id: MiUser['id'] };
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		visibility?: string | null;
		following: boolean;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		sql`(
			ARRAY[${options.me.id}]::varchar[] <@ "note"."mentions"
			OR ARRAY[${options.me.id}]::varchar[] <@ "note"."visibleUserIds"
		)`,
		noteVisibilityCondition(options.me),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
		mutedNoteThreadCondition(options.me),
	];

	if (options.visibility) {
		conditions.push(sql`"note"."visibility" = ${options.visibility}`);
	}

	if (options.following) {
		conditions.push(sql`(
			"note"."userId" IN (SELECT "followeeId" FROM "following" WHERE "followerId" = ${options.me.id})
			OR "note"."userId" = ${options.me.id}
		)`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY CONCAT("note"."id") ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listReplyNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		replyId: MiNote['id'];
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${notePaginationCondition(options)}
			AND "note"."replyId" = ${options.replyId}
			AND ${noteVisibilityCondition(options.me)}
			AND ${baseNoteFilteringCondition(options.me, options.blockedHosts)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listRenoteNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		renoteId: MiNote['id'];
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${notePaginationCondition(options)}
			AND "note"."renoteId" = ${options.renoteId}
			AND ${noteVisibilityCondition(options.me)}
			AND ${baseNoteFilteringCondition(options.me, options.blockedHosts)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listPublicNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		local?: boolean;
		reply?: boolean;
		renote?: boolean;
		withFiles?: boolean;
		poll?: boolean;
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		eq(note.visibility, 'public'),
		eq(note.localOnly, false),
	];

	if (options.local) {
		conditions.push(isNull(note.userHost));
	}

	if (options.reply !== undefined) {
		conditions.push(options.reply ? isNotNull(note.replyId) : isNull(note.replyId));
	}

	if (options.renote !== undefined) {
		conditions.push(options.renote ? isNotNull(note.renoteId) : isNull(note.renoteId));
	}

	if (options.withFiles !== undefined) {
		conditions.push(options.withFiles ? sql`${note.fileIds} != '{}'` : sql`${note.fileIds} = '{}'`);
	}

	if (options.poll !== undefined) {
		conditions.push(eq(note.hasPoll, options.poll));
	}

	const rows = await db
		.select()
		.from(note)
		.where(and(...conditions))
		.orderBy(options.sinceId && !options.untilId ? asc(note.id) : desc(note.id))
		.limit(options.limit);

	return rows.map((row) => deserializeNote(row));
}

export async function listNotesByAttachedFileIdFromDatabase(
	db: MiDrizzleDatabase,
	fileId: MiNote['fileIds'][number],
	options: {
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
	},
): Promise<MiNote[]> {
	const rows = await db
		.select()
		.from(note)
		.where(and(notePaginationCondition(options), sql`ARRAY[${fileId}]::varchar[] <@ ${note.fileIds}`))
		.orderBy(options.sinceId && !options.untilId ? asc(note.id) : desc(note.id))
		.limit(options.limit);

	return rows.map((row) => deserializeNote(row));
}

export async function listFeaturedNotesByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiNote['id'][],
	blockedHosts: string[],
): Promise<MiNote[]> {
	if (ids.length === 0) return [];

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE "note"."id" IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`, `,
		)})
			AND ${baseNoteFilteringCondition(null, blockedHosts)}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listVisibleNotesByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiNote['id'][],
	options: {
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	if (ids.length === 0) return [];

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE "note"."id" IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`, `,
		)})
			AND ${noteVisibilityCondition(options.me)}
			AND ${noteHostAndSuspensionFilteringCondition(options.blockedHosts)}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listVisibleNotesWithUsersByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiNote['id'][],
	me: { id: MiUser['id'] } | null,
): Promise<(MiNote & { user: MiUser })[]> {
	if (ids.length === 0) return [];

	const rows = await db
		.select({
			note,
			user: userTable,
		})
		.from(note)
		.innerJoin(userTable, eq(userTable.id, note.userId))
		.where(and(inArray(note.id, ids), noteVisibilityCondition(me)));

	return rows.map((row) => ({
		...deserializeNote(row.note),
		user: deserializeUser(row.user),
	}));
}

export async function listHydratedNotesByIdsFromDatabase(
	db: MiDrizzleDatabase,
	ids: MiNote['id'][],
): Promise<MiNote[]> {
	if (ids.length === 0) return [];

	const replyNote = alias(note, 'reply');
	const renoteNote = alias(note, 'renote');
	const replyUser = alias(userTable, 'replyUser');
	const renoteUser = alias(userTable, 'renoteUser');

	const rows = await db
		.select({
			note,
			user: userTable,
			reply: replyNote,
			renote: renoteNote,
			replyUser,
			renoteUser,
			channel: channelTable,
		})
		.from(note)
		.innerJoin(userTable, eq(userTable.id, note.userId))
		.leftJoin(replyNote, eq(replyNote.id, note.replyId))
		.leftJoin(renoteNote, eq(renoteNote.id, note.renoteId))
		.leftJoin(replyUser, eq(replyUser.id, note.replyUserId))
		.leftJoin(renoteUser, eq(renoteUser.id, note.renoteUserId))
		.leftJoin(channelTable, eq(channelTable.id, note.channelId))
		.where(inArray(note.id, ids));

	return rows.map((row) => {
		const hydrated = deserializeNote(row.note);
		hydrated.user = deserializeUser(row.user);
		hydrated.reply = row.reply == null ? null : deserializeNote(row.reply);
		if (hydrated.reply != null && row.replyUser != null) {
			hydrated.reply.user = deserializeUser(row.replyUser);
		}
		hydrated.renote = row.renote == null ? null : deserializeNote(row.renote);
		if (hydrated.renote != null && row.renoteUser != null) {
			hydrated.renote.user = deserializeUser(row.renoteUser);
		}
		hydrated.channel = row.channel == null ? null : deserializeChannelForNote(row.channel);
		return hydrated;
	});
}

export async function searchNotesByTextFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		query: string;
		usePgroonga: boolean;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		userId?: MiNote['userId'] | null;
		channelId?: MiNote['channelId'] | null;
		host?: string | null;
		rangeStartId?: MiNote['id'] | null;
		rangeEndId?: MiNote['id'] | null;
		withFiles?: boolean | null;
		withSensitiveFiles?: boolean | null;
		withReplies?: boolean | null;
		withQuotes?: boolean | null;
		withCw?: boolean | null;
		visibility?: MiNote['visibility'] | null;
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		noteVisibilityCondition(options.me),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
	];

	if (options.userId) {
		conditions.push(sql`"note"."userId" = ${options.userId}`);
	} else if (options.channelId) {
		conditions.push(sql`"note"."channelId" = ${options.channelId}`);
	}

	if (options.usePgroonga) {
		conditions.push(sql`"note"."text" &@~ ${options.query}`);
	} else {
		conditions.push(sql`LOWER("note"."text") LIKE ${`%${sqlLikeEscape(options.query.toLowerCase())}%`}`);
	}

	if (options.host) {
		if (options.host === '.') {
			conditions.push(sql`"note"."userHost" IS NULL`);
		} else {
			conditions.push(sql`"note"."userHost" = ${options.host}`);
		}
	}

	if (options.rangeStartId) {
		conditions.push(sql`"note"."id" > ${options.rangeStartId}`);
	}

	if (options.rangeEndId) {
		conditions.push(sql`"note"."id" < ${options.rangeEndId}`);
	}

	if (options.withFiles != null) {
		conditions.push(
			options.withFiles ? sql`cardinality("note"."fileIds") > 0` : sql`cardinality("note"."fileIds") = 0`,
		);
	}

	if (options.withSensitiveFiles != null) {
		const hasSensitiveFiles = sql`EXISTS (
			SELECT 1
			FROM ${driveFile}
			WHERE ${driveFile.id} = ANY("note"."fileIds")
			AND ${driveFile.isSensitive} = TRUE
		)`;
		conditions.push(options.withSensitiveFiles ? hasSensitiveFiles : sql`NOT (${hasSensitiveFiles})`);
	}

	if (options.withReplies != null) {
		conditions.push(options.withReplies ? sql`"note"."replyId" IS NOT NULL` : sql`"note"."replyId" IS NULL`);
	}

	const isQuote = quoteCondition('note');
	if (options.withQuotes != null) {
		conditions.push(options.withQuotes ? isQuote : sql`NOT (${isQuote})`);
	}

	if (options.withCw != null) {
		conditions.push(options.withCw ? sql`"note"."cw" IS NOT NULL` : sql`"note"."cw" IS NULL`);
	}

	if (options.visibility != null) {
		conditions.push(sql`"note"."visibility" = ${options.visibility}`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listFilteredTimelineNotesByIdsFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		ids: MiNote['id'][];
		me: { id: MiUser['id'] };
		blockedHosts: string[];
		publicOnly?: boolean;
		mutingChannelIds?: string[];
	},
): Promise<MiNote[]> {
	if (options.ids.length === 0) return [];

	const conditions: SQL[] = [
		sql`"note"."id" IN (${sql.join(
			options.ids.map((id) => sql`${id}`),
			sql`, `,
		)})`,
		noteVisibilityCondition(options.me),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
	];

	if (options.publicOnly) {
		conditions.push(sql`"note"."visibility" = 'public'`);
	}

	if (options.mutingChannelIds && options.mutingChannelIds.length > 0) {
		const channelIds = sql.join(
			options.mutingChannelIds.map((id) => sql`${id}`),
			sql`, `,
		);
		conditions.push(sql`("note"."channelId" IS NULL OR "note"."channelId" NOT IN (${channelIds}))`);
		conditions.push(sql`("note"."renoteChannelId" IS NULL OR "note"."renoteChannelId" NOT IN (${channelIds}))`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listNotesByTagSearchFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		tagQuery: string[][];
		reply?: boolean | null;
		renote?: boolean | null;
		withFiles?: boolean;
		poll?: boolean | null;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const tagConditions = options.tagQuery.map((tags) => {
		const andConditions = tags.map((tag) => sql`ARRAY[${tag}]::varchar[] <@ "note"."tags"`);
		return sql`(${sql.join(andConditions, sql` AND `)})`;
	});
	const conditions: SQL[] = [
		notePaginationCondition(options),
		sql`(${sql.join(tagConditions, sql` OR `)})`,
		noteVisibilityCondition(options.me),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
	];

	if (options.reply != null) {
		conditions.push(options.reply ? isNotNull(note.replyId) : isNull(note.replyId));
	}

	if (options.renote != null) {
		conditions.push(options.renote ? isNotNull(note.renoteId) : isNull(note.renoteId));
	}

	if (options.withFiles) {
		conditions.push(sql`${note.fileIds} != '{}'`);
	}

	if (options.poll != null) {
		conditions.push(eq(note.hasPoll, options.poll));
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listClipNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		clipId: string;
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		searchWords?: string[];
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		sql`"clipNote"."clipId" = ${options.clipId}`,
		noteVisibilityCondition(options.me),
		clipNoteFilteringCondition(options.me, options.blockedHosts),
	];

	for (const word of options.searchWords ?? []) {
		conditions.push(sql`("note"."text" ILIKE ${`%${word}%`} OR "note"."cw" ILIKE ${`%${word}%`})`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "clip_note" AS "clipNote" ON "clipNote"."noteId" = "note"."id"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listGlobalTimelineNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		withFiles: boolean;
		withRenotes: boolean;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		sql`"note"."visibility" = 'public'`,
		isNull(note.channelId),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
	];

	if (options.me != null) {
		conditions.push(mutedUserRenotesCondition(options.me));
	}

	if (options.withFiles) {
		conditions.push(sql`${note.fileIds} != '{}'`);
	}

	if (!options.withRenotes) {
		conditions.push(sql`NOT (${pureRenoteCondition('note')})`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listLocalTimelineNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		withFiles: boolean;
		withReplies: boolean;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
		mutedChannelIds?: string[];
		withRenotes: boolean;
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		sql`"note"."visibility" = 'public'`,
		isNull(note.userHost),
		isNull(note.channelId),
		noteVisibilityCondition(options.me),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
	];

	if (options.me != null) {
		conditions.push(mutedUserRenotesCondition(options.me));
	}

	if (options.mutedChannelIds && options.mutedChannelIds.length > 0) {
		conditions.push(sql`(
			"note"."renoteChannelId" IS NULL
			OR "note"."renoteChannelId" NOT IN (${sql.join(
				options.mutedChannelIds.map((id) => sql`${id}`),
				sql`, `,
			)})
		)`);
	}

	if (options.withFiles) {
		conditions.push(sql`${note.fileIds} != '{}'`);
	}

	if (!options.withReplies) {
		conditions.push(sql`(
			"note"."replyId" IS NULL
			OR (
				"note"."replyId" IS NOT NULL
				AND "note"."replyUserId" = "note"."userId"
			)
		)`);
	}

	if (!options.withRenotes) {
		conditions.push(sql`NOT (${pureRenoteCondition('note')})`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listChannelTimelineNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		channelId: NonNullable<MiNote['channelId']>;
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
		mutedChannelIds?: string[];
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		eq(note.channelId, options.channelId),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
	];

	if (options.mutedChannelIds && options.mutedChannelIds.length > 0) {
		const channelIds = sql.join(
			options.mutedChannelIds.map((id) => sql`${id}`),
			sql`, `,
		);
		conditions.push(sql`"note"."channelId" NOT IN (${channelIds})`);
		conditions.push(sql`(
			"note"."renoteChannelId" IS NULL
			OR "note"."renoteChannelId" NOT IN (${channelIds})
		)`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listUserTimelineNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		userId: MiUser['id'];
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		withChannelNotes: boolean;
		withFiles: boolean;
		withRenotes: boolean;
		me: { id: MiUser['id'] } | null;
		blockedHosts: string[];
		mutingChannelIds: string[];
	},
): Promise<MiNote[]> {
	const isSelf = options.me != null && options.me.id === options.userId;
	const conditions: SQL[] = [
		notePaginationCondition(options),
		sql`"note"."userId" = ${options.userId}`,
		noteVisibilityCondition(options.me),
		userTimelineFilteringCondition(options.me, options.blockedHosts, options.userId),
	];

	if (options.withChannelNotes) {
		if (options.mutingChannelIds.length > 0) {
			conditions.push(sql`(
				"note"."channelId" IS NULL
				OR "note"."channelId" NOT IN (${sql.join(
					options.mutingChannelIds.map((id) => sql`${id}`),
					sql`, `,
				)})
			)`);
		}

		if (!isSelf) {
			conditions.push(sql`(
				"note"."channelId" IS NULL
				OR "channel"."isSensitive" = FALSE
			)`);
		}
	} else {
		conditions.push(sql`"note"."channelId" IS NULL`);
	}

	if (options.mutingChannelIds.length > 0) {
		conditions.push(sql`(
			"note"."renoteChannelId" IS NULL
			OR "note"."renoteChannelId" NOT IN (${sql.join(
				options.mutingChannelIds.map((id) => sql`${id}`),
				sql`, `,
			)})
		)`);
	}

	// リノートは note 自体のチャンネルが NULL なので withChannelNotes の分岐に入れてはいけない
	// (withChannelNotes: false でもセンシティブチャンネル投稿のリノートは本文ごと出てしまう)
	if (!isSelf) {
		conditions.push(sql`(
			"note"."renoteChannelId" IS NULL
			OR "renoteChannel"."isSensitive" = FALSE
		)`);
	}

	if (options.withFiles) {
		conditions.push(sql`${note.fileIds} != '{}'`);
	}

	if (!options.withRenotes) {
		conditions.push(sql`(
			"note"."userId" != ${options.userId}
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "channel" AS "channel" ON "channel"."id" = "note"."channelId"
		LEFT JOIN "channel" AS "renoteChannel" ON "renoteChannel"."id" = "note"."renoteChannelId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listHomeTimelineNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		me: { id: MiUser['id'] };
		followeeIds: MiUser['id'][];
		followingChannelIds: string[];
		mutingChannelIds: string[];
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		includeMyRenotes: boolean;
		includeRenotedMyNotes: boolean;
		includeLocalRenotes: boolean;
		withFiles: boolean;
		withRenotes: boolean;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		sql`(
			"note"."replyId" IS NULL
			OR (
				"note"."replyId" IS NOT NULL
				AND "note"."replyUserId" = "note"."userId"
			)
		)`,
		noteVisibilityCondition(options.me),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
		mutedUserRenotesCondition(options.me),
	];

	// フォロー数が多いユーザーで IN ($1,...,$N) のプレースホルダ展開が数万個に膨らむのを避けるため、
	// 配列1パラメータの = ANY() で渡す (node-postgres がJS配列をPostgreSQL配列にシリアライズする)。
	const meOrFolloweeIds = [options.me.id, ...options.followeeIds];

	if (options.followeeIds.length > 0 && options.followingChannelIds.length > 0) {
		conditions.push(sql`(
			(
				"note"."userId" = ANY(${sql.param(meOrFolloweeIds)})
				AND "note"."channelId" IS NULL
			)
			OR "note"."channelId" IN (${sql.join(
				options.followingChannelIds.map((id) => sql`${id}`),
				sql`, `,
			)})
		)`);
	} else if (options.followeeIds.length > 0) {
		conditions.push(sql`
			"note"."channelId" IS NULL
			AND "note"."userId" = ANY(${sql.param(meOrFolloweeIds)})
		`);

		if (options.mutingChannelIds.length > 0) {
			conditions.push(sql`(
				"note"."renoteChannelId" IS NULL
				OR "note"."renoteChannelId" NOT IN (${sql.join(
					options.mutingChannelIds.map((id) => sql`${id}`),
					sql`, `,
				)})
			)`);
		}
	} else if (options.followingChannelIds.length > 0) {
		conditions.push(sql`(
			"note"."channelId" IN (${sql.join(
				options.followingChannelIds.map((id) => sql`${id}`),
				sql`, `,
			)})
			OR "note"."userId" = ${options.me.id}
		)`);
	} else {
		conditions.push(sql`
			"note"."channelId" IS NULL
			AND "note"."userId" = ${options.me.id}
		`);
	}

	if (!options.includeMyRenotes) {
		conditions.push(sql`(
			"note"."userId" != ${options.me.id}
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (!options.includeRenotedMyNotes) {
		conditions.push(sql`(
			"note"."renoteUserId" != ${options.me.id}
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (!options.includeLocalRenotes) {
		conditions.push(sql`(
			"note"."renoteUserHost" IS NOT NULL
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (options.withFiles) {
		conditions.push(sql`${note.fileIds} != '{}'`);
	}

	if (!options.withRenotes) {
		conditions.push(sql`NOT (${pureRenoteCondition('note')})`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listHybridTimelineNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		me: { id: MiUser['id'] };
		followeeIds: MiUser['id'][];
		followingChannelIds: string[];
		mutingChannelIds: string[];
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		includeMyRenotes: boolean;
		includeRenotedMyNotes: boolean;
		includeLocalRenotes: boolean;
		withFiles: boolean;
		withRenotes: boolean;
		withReplies: boolean;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	// followeeIds の渡し方は listHomeTimelineNotesFromDatabase と同じ理由で = ANY(配列1パラメータ)。
	const meOrFolloweeIds = [options.me.id, ...options.followeeIds];
	const conditions: SQL[] = [
		notePaginationCondition(options),
		options.followeeIds.length > 0
			? sql`(
				"note"."userId" = ANY(${sql.param(meOrFolloweeIds)})
				OR (
					"note"."visibility" = 'public'
					AND "note"."userHost" IS NULL
				)
			)`
			: sql`(
				"note"."userId" = ${options.me.id}
				OR (
					"note"."visibility" = 'public'
					AND "note"."userHost" IS NULL
				)
			)`,
		noteVisibilityCondition(options.me),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
		mutedUserRenotesCondition(options.me),
	];

	if (options.followingChannelIds.length > 0) {
		conditions.push(sql`(
			"note"."channelId" IN (${sql.join(
				options.followingChannelIds.map((id) => sql`${id}`),
				sql`, `,
			)})
			OR "note"."channelId" IS NULL
		)`);
	} else {
		conditions.push(sql`"note"."channelId" IS NULL`);
	}

	if (options.mutingChannelIds.length > 0) {
		conditions.push(sql`(
			"note"."renoteChannelId" IS NULL
			OR "note"."renoteChannelId" NOT IN (${sql.join(
				options.mutingChannelIds.map((id) => sql`${id}`),
				sql`, `,
			)})
		)`);
	}

	if (!options.withReplies) {
		conditions.push(sql`(
			"note"."replyId" IS NULL
			OR (
				"note"."replyId" IS NOT NULL
				AND "note"."replyUserId" = "note"."userId"
			)
		)`);
	}

	if (!options.includeMyRenotes) {
		conditions.push(sql`(
			"note"."userId" != ${options.me.id}
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (!options.includeRenotedMyNotes) {
		conditions.push(sql`(
			"note"."renoteUserId" != ${options.me.id}
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (!options.includeLocalRenotes) {
		conditions.push(sql`(
			"note"."renoteUserHost" IS NOT NULL
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (!options.withRenotes) {
		conditions.push(sql`NOT (${pureRenoteCondition('note')})`);
	}

	if (options.withFiles) {
		conditions.push(sql`${note.fileIds} != '{}'`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function listUserListTimelineNotesFromDatabase(
	db: MiDrizzleDatabase,
	options: {
		listId: string;
		me: { id: MiUser['id'] };
		mutedChannelIds: string[];
		limit: number;
		sinceId?: MiNote['id'] | null;
		untilId?: MiNote['id'] | null;
		includeMyRenotes: boolean;
		includeRenotedMyNotes: boolean;
		includeLocalRenotes: boolean;
		withRenotes: boolean;
		withFiles: boolean;
		blockedHosts: string[];
	},
): Promise<MiNote[]> {
	const conditions: SQL[] = [
		notePaginationCondition(options),
		sql`"userListMemberships"."userListId" = ${options.listId}`,
		sql`"note"."channelId" IS NULL`,
		sql`(
			"note"."replyId" IS NULL
			OR (
				"note"."replyId" IS NOT NULL
				AND "note"."replyUserId" = "note"."userId"
			)
			OR (
				"note"."replyId" IS NOT NULL
				AND "note"."replyUserId" = ${options.me.id}
			)
			OR (
				"note"."replyId" IS NOT NULL
				AND "userListMemberships"."withReplies" = TRUE
			)
		)`,
		noteVisibilityCondition(options.me),
		baseNoteFilteringCondition(options.me, options.blockedHosts),
		mutedUserRenotesCondition(options.me),
	];

	if (options.mutedChannelIds.length > 0) {
		conditions.push(sql`(
			"note"."renoteChannelId" IS NULL
			OR "note"."renoteChannelId" NOT IN (${sql.join(
				options.mutedChannelIds.map((id) => sql`${id}`),
				sql`, `,
			)})
		)`);
	}

	if (!options.includeMyRenotes) {
		conditions.push(sql`(
			"note"."userId" != ${options.me.id}
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (!options.includeRenotedMyNotes) {
		conditions.push(sql`(
			"note"."renoteUserId" != ${options.me.id}
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (!options.includeLocalRenotes) {
		conditions.push(sql`(
			"note"."renoteUserHost" IS NOT NULL
			OR NOT (${pureRenoteCondition('note')})
		)`);
	}

	if (!options.withRenotes) {
		conditions.push(sql`NOT (${pureRenoteCondition('note')})`);
	}

	if (options.withFiles) {
		conditions.push(sql`${note.fileIds} != '{}'`);
	}

	const result = await db.execute<NoteRow>(sql`
		SELECT "note".*
		FROM "note" AS "note"
		INNER JOIN "user_list_membership" AS "userListMemberships" ON "userListMemberships"."userId" = "note"."userId"
		INNER JOIN "user" AS "user" ON "user"."id" = "note"."userId"
		LEFT JOIN "note" AS "renote" ON "renote"."id" = "note"."renoteId"
		LEFT JOIN "user" AS "replyUser" ON "replyUser"."id" = "note"."replyUserId"
		LEFT JOIN "user" AS "renoteUser" ON "renoteUser"."id" = "note"."renoteUserId"
		WHERE ${sql.join(
			conditions.map((condition) => sql`(${condition})`),
			sql` AND `,
		)}
		ORDER BY "note"."id" ${notePaginationOrder(options)}
		LIMIT ${options.limit}
	`);

	return result.rows.map((row) => deserializeNote(row));
}

export async function adjustNotesPageCountInDatabase(
	db: MiDrizzleDatabase,
	ids: MiNote['id'][],
	delta: number,
): Promise<void> {
	if (ids.length === 0) return;

	await db.execute(sql`
		UPDATE "note"
		SET "pageCount" = "pageCount" + ${delta}
		WHERE "id" IN (${sql.join(
			ids.map((id) => sql`${id}`),
			sql`, `,
		)})
	`);
}

export async function listFrequentlyRepliedUsersFromDatabase(
	db: MiDrizzleDatabase,
	userId: MiUser['id'],
	limit: number,
): Promise<{ userId: MiUser['id']; count: number }[]> {
	const result = await db.execute<{ userId: MiUser['id']; count: string | number }>(sql`
		WITH "recent_replies" AS (
			SELECT DISTINCT "replyId"
			FROM (
				SELECT "replyId"
				FROM "note"
				WHERE "userId" = ${userId}
					AND "replyId" IS NOT NULL
				ORDER BY "id" DESC
				LIMIT 1000
			) AS "recent_notes"
		)
		SELECT "target"."userId" AS "userId", COUNT(*) AS "count"
		FROM "note" AS "target"
		INNER JOIN "recent_replies" ON "recent_replies"."replyId" = "target"."id"
		GROUP BY "target"."userId"
		ORDER BY "count" DESC
		LIMIT ${limit}
	`);

	return result.rows.map((row) => ({
		userId: row.userId,
		count: Number(row.count),
	}));
}
