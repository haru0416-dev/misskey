/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import type { DbQueue } from '@/core/queues.js';
import { parseHonoApiParams } from './validation.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ThinUser } from '@/queue/types.js';

export type HonoApiExportJobDependencies = {
	dbQueue: DbQueue;
};

const EXPORT_JOB_OPTIONS = {
	removeOnComplete: {
		age: 3600 * 24 * 7,
		count: 30,
	},
	removeOnFail: {
		age: 3600 * 24 * 7,
		count: 100,
	},
} as const;

export const exportFollowingParamDef = z.object({
	excludeMuting: z.boolean().optional().default(false),
	excludeInactive: z.boolean().optional().default(false),
});

type ExportFollowingParams = {
	excludeMuting: boolean;
	excludeInactive: boolean;
};

function enqueueSimpleExportJob(deps: HonoApiExportJobDependencies, jobName: string, user: ThinUser): void {
	deps.dbQueue.add(jobName, {
		user: { id: user.id },
	}, EXPORT_JOB_OPTIONS);
}

export function handleHonoApiExportCustomEmojis(deps: HonoApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportCustomEmojis', me);
}

export function handleHonoApiIExportNotes(deps: HonoApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportNotes', me);
}

export function handleHonoApiIExportClips(deps: HonoApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportClips', me);
}

export function handleHonoApiIExportFavorites(deps: HonoApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportFavorites', me);
}

export function handleHonoApiIExportMute(deps: HonoApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportMuting', me);
}

export function handleHonoApiIExportBlocking(deps: HonoApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportBlocking', me);
}

export function handleHonoApiIExportUserLists(deps: HonoApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportUserLists', me);
}

export function handleHonoApiIExportAntennas(deps: HonoApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportAntennas', me);
}

export function handleHonoApiIExportFollowing(
	deps: HonoApiExportJobDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): void {
	const params = parseHonoApiParams(exportFollowingParamDef, body);
	deps.dbQueue.add('exportFollowing', {
		user: { id: me.id },
		excludeMuting: params.excludeMuting,
		excludeInactive: params.excludeInactive,
	}, EXPORT_JOB_OPTIONS);
}
