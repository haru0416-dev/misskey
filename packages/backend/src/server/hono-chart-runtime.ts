/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type * as Redis from 'ioredis';
import Chart, { type KVs } from '@/core/chart/core.js';
import { name as driveChartName, schema as driveChartSchema } from '@/core/chart/charts/entities/drive.js';
import { name as instanceChartName, schema as instanceChartSchema } from '@/core/chart/charts/entities/instance.js';
import { name as perUserDriveChartName, schema as perUserDriveChartSchema } from '@/core/chart/charts/entities/per-user-drive.js';
import { acquireChartInsertLock } from '@/misc/distributed-lock.js';
import type Logger from '@/logger.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import type { MiDriveFile } from '@/models/DriveFile.js';

// Chart.commit() only ever buffers in-memory diffs; Chart.save() (called on a 20-minute
// interval, mirroring ChartManagementService) is what actually persists them. Since the
// Hono server is a long-lived process just like the NestJS one, these writer instances
// are constructed once at boot (see createRuntimeDependencies) and shared across requests
// via deps, not recreated per-request.
type HonoChartWriterDependencies = {
	db: MiDrizzleDatabase;
	redis: Redis.Redis;
	logger: Pick<Logger, 'debug' | 'error' | 'info' | 'warn'>;
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
}

export type HonoChartWriters = {
	driveChart: HonoDriveChartWriter;
	perUserDriveChart: HonoPerUserDriveChartWriter;
	instanceChart: HonoInstanceChartWriter;
};

export function createHonoChartWriters(deps: HonoChartWriterDependencies): HonoChartWriters {
	const lock = (key: string) => acquireChartInsertLock(deps.redis, key);
	const logger = deps.logger as Logger;

	return {
		driveChart: new HonoDriveChartWriter(deps.db, lock, logger, driveChartName, driveChartSchema),
		perUserDriveChart: new HonoPerUserDriveChartWriter(deps.db, lock, logger, perUserDriveChartName, perUserDriveChartSchema, true),
		instanceChart: new HonoInstanceChartWriter(deps.db, lock, logger, instanceChartName, instanceChartSchema, true),
	};
}

export async function saveHonoChartWriters(writers: HonoChartWriters): Promise<void> {
	await Promise.all([
		writers.driveChart.save(),
		writers.perUserDriveChart.save(),
		writers.instanceChart.save(),
	]);
}

export function startHonoChartWriterSaveInterval(writers: HonoChartWriters): NodeJS.Timeout {
	return setInterval(() => {
		void saveHonoChartWriters(writers);
	}, 1000 * 60 * 20);
}
