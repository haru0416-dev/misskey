/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { setTimeout } from 'node:timers/promises';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { DI } from '@/di-symbols.js';
import type { MiMeta } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import type Logger from '@/logger.js';
import { bindThis } from '@/decorators.js';
import { IdService } from '@/core/IdService.js';
import { deleteNotesByIdsFromDatabase } from '@/core/NoteStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { QueueLoggerService } from '../QueueLoggerService.js';
import type * as Bull from 'bullmq';

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

@Injectable()
export class CleanRemoteNotesProcessorService {
	private logger: Logger;

	constructor(
		@Inject(DI.meta)
		private meta: MiMeta,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private idService: IdService,
		private queueLoggerService: QueueLoggerService,
	) {
		this.logger = this.queueLoggerService.logger.createSubLogger('clean-remote-notes');
	}

	@bindThis
	private computeProgress(minId: string, maxId: string, cursorLeft: string) {
		const minTs = this.idService.parse(minId).date.getTime();
		const maxTs = this.idService.parse(maxId).date.getTime();
		const cursorTs = this.idService.parse(cursorLeft).date.getTime();

		return ((cursorTs - minTs) / (maxTs - minTs)) * 100;
	}

	@bindThis
	public async process(job: Bull.Job<Record<string, unknown>>): Promise<{
		deletedCount: number;
		oldest: number | null;
		newest: number | null;
		skipped: boolean;
		transientErrors: number;
	}> {
		const getConfig = () => {
			return {
				enabled: this.meta.enableRemoteNotesCleaning,
				maxDuration: this.meta.remoteNotesCleaningMaxProcessingDurationInMinutes * 60 * 1000, // Convert minutes to milliseconds
				// The date limit for the newest note to be considered for deletion.
				// All notes newer than this limit will always be retained.
				newestLimit: this.idService.gen(Date.now() - (1000 * 60 * 60 * 24 * this.meta.remoteNotesCleaningExpiryDaysForEachNotes)),
			};
		};

		const initialConfig = getConfig();
		if (!this.meta.enableRemoteNotesCleaning) {
			this.logger.info('Remote notes cleaning is disabled, skipping...');
			return {
				deletedCount: 0,
				oldest: null,
				newest: null,
				skipped: true,
				transientErrors: 0,
			};
		}

		this.logger.info('cleaning remote notes...');

		const startAt = Date.now();

		const minId = await fetchMinRemoteRootNoteIdBefore(this.db, initialConfig.newestLimit);

		if (!minId) {
			this.logger.info('No notes can possibly be deleted, skipping...');
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

		// A note tree can be deleted if there are no unremovable rows with the same rootId.
		//
		// `candidate_notes` will have the following structure after recursive query (some columns omitted):
		// After performing a LEFT JOIN with `candidate_notes` as `unremovable`,
		// the note tree containing unremovable notes will be anti-joined.
		// For removable rows, the `unremovable` columns will have `NULL` values.
		// | id  | rootId | isRemovable |
		// |-----|--------|-------------|
		// | aaa | aaa    | TRUE        |
		// | bbb | aaa    | FALSE       |
		// | ccc | aaa    | FALSE       |
		// | ddd | ddd    | TRUE        |
		// | eee | ddd    | TRUE        |
		// | fff | fff    | TRUE        |
		// | ggg | ggg    | FALSE       |
		//
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
				this.logger.info('Remote notes cleaning is disabled, processing stopped...');
				break;
			}
			//#region check time
			const batchBeginAt = Date.now();

			const elapsed = batchBeginAt - startAt;

			const progress = this.computeProgress(minId, newestLimit, cursorLeft > minId ? cursorLeft : minId);

			if (elapsed >= maxDuration) {
				job.log(`Reached maximum duration of ${maxDuration}ms, stopping... (last cursor: ${cursorLeft}, final progress ${progress}%)`);
				job.updateProgress(100);
				break;
			}

			const wallClockUsage = elapsed / maxDuration;
			if (wallClockUsage > 0.5 && progress < 50 && !lowThroughputWarned) {
				const msg = `Not projected to finish in time! (wall clock usage ${wallClockUsage * 100}% at ${progress}%, current limit ${currentLimit})`;
				this.logger.warn(msg);
				job.log(msg);
				lowThroughputWarned = true;
			}
			job.updateProgress(progress);
			//#endregion

			const queryBegin = performance.now();
			let noteIds = null;

			try {
				noteIds = await listRemoteNoteCleaningCandidates(this.db, {
					cursorLeft,
					newestLimit,
					limit: currentLimit,
				});
			} catch (e) {
				if (getDatabaseErrorCode(e) === '57014') {
					// Statement timeout (maybe suddenly hit a large note tree), if possible, reduce the limit and try again
					// if not possible, skip the current batch of notes and find the next root note
					if (currentLimit <= minimumLimit) {
						job.log('Local note tree complexity is too high, finding next root note...');

						// This query is only used to advance the cursor past the offending range;
						// it intentionally omits the heavy NOT EXISTS subqueries in `removalCriteria`
						// (user_note_pining / note_favorite / note_reaction) which would otherwise
						// hit the same statement_timeout that triggered this fallback path (#17057).
						// Strict removability is re-evaluated by the next iteration's CTE query.
						const idWindow = await listRemoteRootNoteIdsWindow(this.db, {
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
			// try to adjust such that each query takes about 1~5 seconds and reasonable NodeJS heap so the task stays responsive
			// this should not oscillate..
			if (queryDuration > 5000 || noteIds.length > 5000) {
				currentLimit = Math.floor(currentLimit * 0.5);
			} else if (queryDuration < 1000 && noteIds.length < 1000) {
				currentLimit = Math.floor(currentLimit * 1.5);
			}
			// clamp to a sane range
			currentLimit = Math.min(Math.max(currentLimit, minimumLimit), 5000);

			const deletableNoteIds = noteIds.filter(result => result.isRemovable).map(result => result.id);
			if (deletableNoteIds.length > 0) {
				try {
					await deleteNotesByIdsFromDatabase(this.db, deletableNoteIds);

					for (const id of deletableNoteIds) {
						const t = this.idService.parse(id).date.getTime();
						if (stats.oldest === null || t < stats.oldest) {
							stats.oldest = t;
						}
						if (stats.newest === null || t > stats.newest) {
							stats.newest = t;
						}
					}

					stats.deletedCount += deletableNoteIds.length;
				} catch (e) {
					// check for integrity violation errors (class 23) that might have occurred between the check and the delete
					// we can safely continue to the next batch
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
				await setTimeout(Math.min(1000 * 5, queryDuration)); // Wait a moment to avoid overwhelming the db
			}
		};

		if (transientErrors > 0) {
			const msg = `${transientErrors} transient errors occurred while cleaning remote notes. You may need a second pass to complete the cleaning.`;
			this.logger.warn(msg);
			job.log(msg);
		}
		this.logger.succ('cleaning of remote notes completed.');

		return {
			deletedCount: stats.deletedCount,
			oldest: stats.oldest,
			newest: stats.newest,
			skipped: false,
			transientErrors,
		};
	}
}
