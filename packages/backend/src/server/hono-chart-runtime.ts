/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { domainToASCII } from 'node:url';
import type * as Redis from 'ioredis';
import Chart, { type KVs } from '@/core/chart/core.js';
import { name as activeUsersChartName, schema as activeUsersChartSchema } from '@/core/chart/charts/entities/active-users.js';
import { name as driveChartName, schema as driveChartSchema } from '@/core/chart/charts/entities/drive.js';
import { name as instanceChartName, schema as instanceChartSchema } from '@/core/chart/charts/entities/instance.js';
import { name as notesChartName, schema as notesChartSchema } from '@/core/chart/charts/entities/notes.js';
import { name as perUserDriveChartName, schema as perUserDriveChartSchema } from '@/core/chart/charts/entities/per-user-drive.js';
import { name as perUserNotesChartName, schema as perUserNotesChartSchema } from '@/core/chart/charts/entities/per-user-notes.js';
import { name as perUserReactionsChartName, schema as perUserReactionsChartSchema } from '@/core/chart/charts/entities/per-user-reactions.js';
import { name as perUserPvChartName, schema as perUserPvChartSchema } from '@/core/chart/charts/entities/per-user-pv.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import { parseId } from '@/misc/id/parse-id.js';
import type Logger from '@/logger.js';
import type { Config } from '@/config.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';

// Chart.commit() only ever buffers in-memory diffs; Chart.save() (called on a 20-minute
// interval, mirroring ChartManagementService) is what actually persists them. Since the
// Hono server is a long-lived process just like the NestJS one, these writer instances
// are constructed once at boot (see createRuntimeDependencies) and shared across requests
// via deps, not recreated per-request.
type HonoChartWriterDependencies = {
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
	config: Pick<Config, 'id'>;
};

class HonoDriveChartWriter extends Chart<typeof driveChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof driveChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof driveChartSchema>>> {
		return {};
	}

	public async update(file: MiDriveFile, isAdditional: boolean): Promise<void> {
		const fileSizeKb = file.size / 1000;
		await this.commit(file.userHost === null ? {
			'local.incCount': isAdditional ? 1 : 0,
			'local.incSize': isAdditional ? fileSizeKb : 0,
			'local.decCount': isAdditional ? 0 : 1,
			'local.decSize': isAdditional ? 0 : fileSizeKb,
		} : {
			'remote.incCount': isAdditional ? 1 : 0,
			'remote.incSize': isAdditional ? fileSizeKb : 0,
			'remote.decCount': isAdditional ? 0 : 1,
			'remote.decSize': isAdditional ? 0 : fileSizeKb,
		});
	}
}

class HonoPerUserDriveChartWriter extends Chart<typeof perUserDriveChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof perUserDriveChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserDriveChartSchema>>> {
		return {};
	}

	public async update(file: MiDriveFile, isAdditional: boolean): Promise<void> {
		if (file.userId == null) return;
		const fileSizeKb = file.size / 1000;
		await this.commit({
			'totalCount': isAdditional ? 1 : -1,
			'totalSize': isAdditional ? fileSizeKb : -fileSizeKb,
			'incCount': isAdditional ? 1 : 0,
			'incSize': isAdditional ? fileSizeKb : 0,
			'decCount': isAdditional ? 0 : 1,
			'decSize': isAdditional ? 0 : fileSizeKb,
		}, file.userId);
	}
}

class HonoInstanceChartWriter extends Chart<typeof instanceChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof instanceChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof instanceChartSchema>>> {
		return {};
	}

	public async updateDrive(file: MiDriveFile, isAdditional: boolean): Promise<void> {
		const fileSizeKb = file.size / 1000;
		await this.commit({
			'drive.totalFiles': isAdditional ? 1 : -1,
			'drive.incFiles': isAdditional ? 1 : 0,
			'drive.incUsage': isAdditional ? fileSizeKb : 0,
			'drive.decFiles': isAdditional ? 1 : 0,
			'drive.decUsage': isAdditional ? fileSizeKb : 0,
		}, file.userHost);
	}

	public async updateNote(host: string, note: Pick<MiNote, 'replyId' | 'renoteId' | 'fileIds'>, isAdditional: boolean): Promise<void> {
		await this.commit({
			'notes.total': isAdditional ? 1 : -1,
			'notes.inc': isAdditional ? 1 : 0,
			'notes.dec': isAdditional ? 0 : 1,
			'notes.diffs.normal': note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
			'notes.diffs.renote': note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
			'notes.diffs.reply': note.replyId != null ? (isAdditional ? 1 : -1) : 0,
			'notes.diffs.withFile': note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
		}, domainToASCII(host.toLowerCase()));
	}
}

class HonoNotesChartWriter extends Chart<typeof notesChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof notesChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof notesChartSchema>>> {
		return {};
	}

	public async update(note: Pick<MiNote, 'userHost' | 'replyId' | 'renoteId' | 'fileIds'>, isAdditional: boolean): Promise<void> {
		const prefix = note.userHost === null ? 'local' : 'remote';

		await this.commit({
			[`${prefix}.total`]: isAdditional ? 1 : -1,
			[`${prefix}.inc`]: isAdditional ? 1 : 0,
			[`${prefix}.dec`]: isAdditional ? 0 : 1,
			[`${prefix}.diffs.normal`]: note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
			[`${prefix}.diffs.renote`]: note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
			[`${prefix}.diffs.reply`]: note.replyId != null ? (isAdditional ? 1 : -1) : 0,
			[`${prefix}.diffs.withFile`]: note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
		});
	}
}

class HonoPerUserNotesChartWriter extends Chart<typeof perUserNotesChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof perUserNotesChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserNotesChartSchema>>> {
		return {};
	}

	public update(user: { id: MiUser['id'] }, note: Pick<MiNote, 'replyId' | 'renoteId' | 'fileIds'>, isAdditional: boolean): void {
		this.commit({
			'total': isAdditional ? 1 : -1,
			'inc': isAdditional ? 1 : 0,
			'dec': isAdditional ? 0 : 1,
			'diffs.normal': note.replyId == null && note.renoteId == null ? (isAdditional ? 1 : -1) : 0,
			'diffs.renote': note.renoteId != null ? (isAdditional ? 1 : -1) : 0,
			'diffs.reply': note.replyId != null ? (isAdditional ? 1 : -1) : 0,
			'diffs.withFile': note.fileIds.length > 0 ? (isAdditional ? 1 : -1) : 0,
		}, user.id);
	}
}

class HonoPerUserReactionsChartWriter extends Chart<typeof perUserReactionsChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof perUserReactionsChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserReactionsChartSchema>>> {
		return {};
	}

	public update(user: { id: MiUser['id']; host: MiUser['host'] }, note: Pick<MiNote, 'userId'>): void {
		const prefix = user.host == null ? 'local' : 'remote';
		this.commit({
			[`${prefix}.count`]: 1,
		}, note.userId);
	}
}

class HonoPerUserPvChartWriter extends Chart<typeof perUserPvChartSchema> {
	protected async tickMajor(): Promise<Partial<KVs<typeof perUserPvChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof perUserPvChartSchema>>> {
		return {};
	}

	public async commitByUser(user: { id: MiUser['id'] }, key: string): Promise<void> {
		await this.commit({
			'upv.user': [key],
			'pv.user': 1,
		}, user.id);
	}

	public async commitByVisitor(user: { id: MiUser['id'] }, key: string): Promise<void> {
		await this.commit({
			'upv.visitor': [key],
			'pv.visitor': 1,
		}, user.id);
	}
}

class HonoActiveUsersChartWriter extends Chart<typeof activeUsersChartSchema> {
	constructor(
		db: MiDrizzleDatabase,
		lock: (key: string) => ReturnType<typeof acquireChartInsertLock>,
		logger: Logger,
		private config: Pick<Config, 'id'>,
	) {
		super(db, lock, logger, activeUsersChartName, activeUsersChartSchema);
	}

	protected async tickMajor(): Promise<Partial<KVs<typeof activeUsersChartSchema>>> {
		return {};
	}

	protected async tickMinor(): Promise<Partial<KVs<typeof activeUsersChartSchema>>> {
		return {};
	}

	public async write(user: { id: MiUser['id']; host: null }): Promise<void> {
		await this.commit({
			'write': [user.id],
		});
	}

	public async read(user: { id: MiUser['id']; host: null }): Promise<void> {
		const week = 1000 * 60 * 60 * 24 * 7;
		const month = 1000 * 60 * 60 * 24 * 30;
		const year = 1000 * 60 * 60 * 24 * 365;
		const createdAt = parseId(this.config, user.id).date;
		const age = Date.now() - createdAt.getTime();

		await this.commit({
			'read': [user.id],
			'registeredWithinWeek': age < week ? [user.id] : [],
			'registeredWithinMonth': age < month ? [user.id] : [],
			'registeredWithinYear': age < year ? [user.id] : [],
			'registeredOutsideWeek': age > week ? [user.id] : [],
			'registeredOutsideMonth': age > month ? [user.id] : [],
			'registeredOutsideYear': age > year ? [user.id] : [],
		});
	}
}

export type HonoChartWriters = {
	driveChart: HonoDriveChartWriter;
	perUserDriveChart: HonoPerUserDriveChartWriter;
	instanceChart: HonoInstanceChartWriter;
	notesChart: HonoNotesChartWriter;
	perUserNotesChart: HonoPerUserNotesChartWriter;
	activeUsersChart: HonoActiveUsersChartWriter;
	perUserReactionsChart: HonoPerUserReactionsChartWriter;
	perUserPvChart: HonoPerUserPvChartWriter;
};

export function createHonoChartWriters(deps: HonoChartWriterDependencies): HonoChartWriters {
	const lock = (key: string) => acquireChartInsertLock(deps.redis, key);
	const logger = deps.logger as Logger;

	return {
		driveChart: new HonoDriveChartWriter(deps.db, lock, logger, driveChartName, driveChartSchema),
		perUserDriveChart: new HonoPerUserDriveChartWriter(deps.db, lock, logger, perUserDriveChartName, perUserDriveChartSchema, true),
		instanceChart: new HonoInstanceChartWriter(deps.db, lock, logger, instanceChartName, instanceChartSchema, true),
		notesChart: new HonoNotesChartWriter(deps.db, lock, logger, notesChartName, notesChartSchema),
		perUserNotesChart: new HonoPerUserNotesChartWriter(deps.db, lock, logger, perUserNotesChartName, perUserNotesChartSchema, true),
		activeUsersChart: new HonoActiveUsersChartWriter(deps.db, lock, logger, deps.config),
		perUserReactionsChart: new HonoPerUserReactionsChartWriter(deps.db, lock, logger, perUserReactionsChartName, perUserReactionsChartSchema, true),
		perUserPvChart: new HonoPerUserPvChartWriter(deps.db, lock, logger, perUserPvChartName, perUserPvChartSchema, true),
	};
}

export async function saveHonoChartWriters(writers: HonoChartWriters): Promise<void> {
	await Promise.all([
		writers.driveChart.save(),
		writers.perUserDriveChart.save(),
		writers.instanceChart.save(),
		writers.notesChart.save(),
		writers.perUserNotesChart.save(),
		writers.activeUsersChart.save(),
		writers.perUserReactionsChart.save(),
		writers.perUserPvChart.save(),
	]);
}

export function startHonoChartWriterSaveInterval(writers: HonoChartWriters): NodeJS.Timeout {
	return setInterval(() => {
		void saveHonoChartWriters(writers);
	}, 1000 * 60 * 20);
}
