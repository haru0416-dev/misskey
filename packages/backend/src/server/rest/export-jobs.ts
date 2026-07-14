/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { addDbJob, type DbQueue } from '@/core/queues.js';
import type { Config } from '@/config.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { parseHonoApiParams } from './validation.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ThinUser } from '@/queue/types.js';

export type HonoApiExportJobDependencies = {
	config: Config;
	dbQueue: DbQueue;
};

export const exportFollowingParamDef = z.object({
	excludeMuting: z.boolean().optional().default(false),
	excludeInactive: z.boolean().optional().default(false),
});

type ExportFollowingParams = {
	excludeMuting: boolean;
	excludeInactive: boolean;
};

type SimpleExportJobName =
	| 'exportCustomEmojis'
	| 'exportNotes'
	| 'exportClips'
	| 'exportFavorites'
	| 'exportMuting'
	| 'exportBlocking'
	| 'exportUserLists'
	| 'exportAntennas';

function enqueueSimpleExportJob(deps: HonoApiExportJobDependencies, jobName: SimpleExportJobName, user: ThinUser): void {
	void addDbJob(deps.dbQueue, {
		name: jobName,
		data: { user: { id: user.id } },
		opts: queueRetentionOptions(deps.config),
	});
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
	void addDbJob(deps.dbQueue, {
		name: 'exportFollowing',
		data: {
			user: { id: me.id },
			excludeMuting: params.excludeMuting,
			excludeInactive: params.excludeInactive,
		},
		opts: queueRetentionOptions(deps.config),
	});
}
