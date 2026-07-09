/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import { sql } from 'drizzle-orm';
import type * as Bull from 'bullmq';
import { deleteNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import { parseId } from '@/misc/id/parse-id.js';
import { genId } from '@/misc/id/gen-id.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiMeta } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';

export type HonoQueueCleanRemoteNotesDependencies = {
	db: MiDrizzleDatabase;
	meta: Pick<MiMeta, 'enableRemoteNotesCleaning' | 'remoteNotesCleaningMaxProcessingDurationInMinutes' | 'remoteNotesCleaningExpiryDaysForEachNotes'>;
};

export type CleanRemoteNotesResult = {
	deletedCount: number;
	oldest: number | null;
	newest: number | null;
	skipped: boolean;
	transientErrors: number;
};

type CandidateNoteRow = {
	id: MiNote['id'];
	isRemovable: boolean;
	isBase: boolean;
};

function getDatabaseErrorCode(error: unknown): string | undefined {
	let current: unknown = error;

	for (let i = 0; i < 5 && current != null && typeof current === 'object'; i++) {
		const candidate = current as {
			code?: unknown;
			cause?: unknown;
			driverError?: unknown;
		};

		if (typeof candidate.code === 'string') {
			return candidate.code;
		}

		current = candidate.driverError ?? candidate.cause;
	}

	return undefined;
}

function removalCriteriaSql(newestLimit: MiNote['id']) {
	return sql`
		note."id" < ${newestLimit}
		AND note."clippedCount" = 0
		AND note."pageCount" = 0
		AND note."userHost" IS NOT NULL
		AND NOT EXISTS (SELECT 1 FROM user_note_pining WHERE "noteId" = note."id")
		AND NOT EXISTS (SELECT 1 FROM note_favorite WHERE "noteId" = note."id")
		AND NOT EXISTS (
			SELECT 1
			FROM note_reaction
			INNER JOIN "user" ON note_reaction."userId" = "user".id
			WHERE note_reaction."noteId" = note."id"
				AND "user"."host" IS NULL
		)
	`;
}

async function fetchMinRemoteRootNoteIdBefore(
	db: MiDrizzleDatabase,
	newestLimit: MiNote['id'],
): Promise<MiNote['id'] | null> {
	const result = await db.execute<{ minId: MiNote['id'] | null }>(sql`
		SELECT MIN(note.id) AS "minId"
		FROM "note" note
		WHERE note."id" < ${newestLimit}
			AND note."userHost" IS NOT NULL
			AND note."replyId" IS NULL
			AND note."renoteId" IS NULL
	`);

	return result.rows[0]?.minId ?? null;
}

async function listRemoteNoteCleaningCandidates(
	db: MiDrizzleDatabase,
	options: {
		cursorLeft: MiNote['id'];
		newestLimit: MiNote['id'];
		limit: number;
	},
): Promise<CandidateNoteRow[]> {
	const result = await db.execute<CandidateNoteRow>(sql`
		WITH RECURSIVE "candidate_notes" AS (
			(
				SELECT "base".*
				FROM (
					SELECT
						note."id" AS "id",
						note."replyId" AS "replyId",
						note."renoteId" AS "renoteId",
						note."id" AS "rootId",
						TRUE AS "isRemovable",
						TRUE AS "isBase"
					FROM "note" note
					WHERE note."id" > ${options.cursorLeft}
						AND ${removalCriteriaSql(options.newestLimit)}
						AND note."replyId" IS NULL
						AND note."renoteId" IS NULL
					ORDER BY note."id" ASC
					LIMIT ${options.limit}
				) AS "base"
			)
			UNION
			SELECT
				note."id" AS "id",
				note."replyId" AS "replyId",
				note."renoteId" AS "renoteId",
				parent."rootId" AS "rootId",
				${removalCriteriaSql(options.newestLimit)} AS "isRemovable",
				FALSE AS "isBase"
			FROM "note" note
			INNER JOIN "candidate_notes" parent
				ON parent."id" = note."replyId" OR parent."id" = note."renoteId"
			WHERE parent."isRemovable" = TRUE
		)
		SELECT
			"candidate_notes"."id" AS "id",
			unremovable."id" IS NULL AS "isRemovable",
			BOOL_OR("candidate_notes"."isBase") AS "isBase"
		FROM "candidate_notes"
		LEFT JOIN "candidate_notes" unremovable
			ON unremovable."rootId" = "candidate_notes"."rootId"
				AND unremovable."isRemovable" = FALSE
		GROUP BY "candidate_notes"."id", unremovable."id" IS NULL
	`);

	return result.rows;
}

async function listRemoteRootNoteIdsWindow(
	db: MiDrizzleDatabase,
	options: {
		cursorLeft: MiNote['id'];
		newestLimit: MiNote['id'];
		limit: number;
	},
): Promise<MiNote['id'][]> {
	const result = await db.execute<{ id: MiNote['id'] }>(sql`
		SELECT note."id" AS "id"
		FROM "note" note
		WHERE note."id" > ${options.cursorLeft}
			AND note."id" < ${options.newestLimit}
			AND note."userHost" IS NOT NULL
			AND note."replyId" IS NULL
			AND note."renoteId" IS NULL
		ORDER BY note."id" ASC
		LIMIT ${options.limit}
	`);

	return result.rows.map(row => row.id);
}

/** CleanRemoteNotesProcessorService.process 相当。 */
export async function handleHonoQueueCleanRemoteNotes(
	deps: HonoQueueCleanRemoteNotesDependencies,
	job: Bull.Job<Record<string, unknown>>,
): Promise<CleanRemoteNotesResult> {
	const computeProgress = (minId: string, maxId: string, cursorLeft: string): number => {
		const minTs = parseId(minId).date.getTime();
		const maxTs = parseId(maxId).date.getTime();
		const cursorTs = parseId(cursorLeft).date.getTime();

		return ((cursorTs - minTs) / (maxTs - minTs)) * 100;
	};

	const getConfig = () => {
		return {
			enabled: deps.meta.enableRemoteNotesCleaning,
			maxDuration: deps.meta.remoteNotesCleaningMaxProcessingDurationInMinutes * 60 * 1000,
			newestLimit: genId(Date.now() - (1000 * 60 * 60 * 24 * deps.meta.remoteNotesCleaningExpiryDaysForEachNotes)),
		};
	};

	const initialConfig = getConfig();
	if (!deps.meta.enableRemoteNotesCleaning) {
		return {
			deletedCount: 0,
			oldest: null,
			newest: null,
			skipped: true,
			transientErrors: 0,
		};
	}

	const startAt = Date.now();

	const minId = await fetchMinRemoteRootNoteIdBefore(deps.db, initialConfig.newestLimit);

	if (!minId) {
		return {
			deletedCount: 0,
			oldest: null,
			newest: null,
			skipped: false,
			transientErrors: 0,
		};
	}

	// start with a conservative limit and adjust it based on the query duration
	const minimumLimit = 10;
	let currentLimit = 100;
	let cursorLeft = '0';

	const stats = {
		deletedCount: 0,
		oldest: null as number | null,
		newest: null as number | null,
	};

	let lowThroughputWarned = false;
	let transientErrors = 0;
	for (;;) {
		const { enabled, maxDuration, newestLimit } = getConfig();
		if (!enabled) {
			break;
		}
		//#region check time
		const batchBeginAt = Date.now();

		const elapsed = batchBeginAt - startAt;

		const progress = computeProgress(minId, newestLimit, cursorLeft > minId ? cursorLeft : minId);

		if (elapsed >= maxDuration) {
			job.log(`Reached maximum duration of ${maxDuration}ms, stopping... (last cursor: ${cursorLeft}, final progress ${progress}%)`);
			job.updateProgress(100);
			break;
		}

		const wallClockUsage = elapsed / maxDuration;
		if (wallClockUsage > 0.5 && progress < 50 && !lowThroughputWarned) {
			job.log(`Not projected to finish in time! (wall clock usage ${wallClockUsage * 100}% at ${progress}%, current limit ${currentLimit})`);
			lowThroughputWarned = true;
		}
		job.updateProgress(progress);
		//#endregion

		const queryBegin = performance.now();
		let noteIds = null;

		try {
			noteIds = await listRemoteNoteCleaningCandidates(deps.db, {
				cursorLeft,
				newestLimit,
				limit: currentLimit,
			});
		} catch (e) {
			if (getDatabaseErrorCode(e) === '57014') {
				if (currentLimit <= minimumLimit) {
					job.log('Local note tree complexity is too high, finding next root note...');

					const idWindow = await listRemoteRootNoteIdsWindow(deps.db, {
						cursorLeft,
						newestLimit,
						limit: minimumLimit + 1,
					});

					job.log(`Skipped note IDs: ${idWindow.slice(0, minimumLimit).join(', ')}`);

					const lastId = idWindow.at(minimumLimit);

					if (!lastId) {
						job.log('No more notes to clean.');
						break;
					}

					cursorLeft = lastId;
					continue;
				}
				currentLimit = Math.max(minimumLimit, Math.floor(currentLimit * 0.25));
				continue;
			}
			throw e;
		}

		if (noteIds.length === 0) {
			job.log('No more notes to clean.');
			break;
		}

		const queryDuration = performance.now() - queryBegin;
		if (queryDuration > 5000 || noteIds.length > 5000) {
			currentLimit = Math.floor(currentLimit * 0.5);
		} else if (queryDuration < 1000 && noteIds.length < 1000) {
			currentLimit = Math.floor(currentLimit * 1.5);
		}
		currentLimit = Math.min(Math.max(currentLimit, minimumLimit), 5000);

		const deletableNoteIds = noteIds.filter(result => result.isRemovable).map(result => result.id);
		if (deletableNoteIds.length > 0) {
			try {
				await deleteNotesByIdsFromDatabase(deps.db, deletableNoteIds);

				for (const id of deletableNoteIds) {
					const t = parseId(id).date.getTime();
					if (stats.oldest === null || t < stats.oldest) {
						stats.oldest = t;
					}
					if (stats.newest === null || t > stats.newest) {
						stats.newest = t;
					}
				}

				stats.deletedCount += deletableNoteIds.length;
			} catch (e) {
				if (getDatabaseErrorCode(e)?.startsWith('23')) {
					transientErrors++;
					job.log(`Error deleting notes: ${e} (transient race condition?)`);
				} else {
					throw e;
				}
			}
		}

		cursorLeft = noteIds.filter(result => result.isBase).reduce((max, { id }) => id > max ? id : max, cursorLeft);

		job.log(`Deleted ${noteIds.length} notes; ${Date.now() - batchBeginAt}ms`);

		if (process.env.NODE_ENV !== 'test') {
			await setTimeout(Math.min(1000 * 5, queryDuration));
		}
	}

	return {
		deletedCount: stats.deletedCount,
		oldest: stats.oldest,
		newest: stats.newest,
		skipped: false,
		transientErrors,
	};
}
