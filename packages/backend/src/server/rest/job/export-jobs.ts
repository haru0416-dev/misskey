/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { addDbJob, type DbQueue } from '@/core/queue/queues.js';
import type { Config } from '@/config.js';
import { queueRetentionOptions } from '@/queue/const.js';
import { parseApiParams } from '../validation.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ThinUser } from '@/queue/types.js';

export type ApiExportJobDependencies = {
	config: Config;
	dbQueue: DbQueue;
};

export const exportFollowingParamDef = z.object({
	excludeMuting: z.boolean().optional().default(false),
	excludeInactive: z.boolean().optional().default(false),
});

type SimpleExportJobName =
	| 'exportCustomEmojis'
	| 'exportNotes'
	| 'exportClips'
	| 'exportFavorites'
	| 'exportMuting'
	| 'exportBlocking'
	| 'exportUserLists'
	| 'exportAntennas';

function enqueueSimpleExportJob(deps: ApiExportJobDependencies, jobName: SimpleExportJobName, user: ThinUser): void {
	void addDbJob(deps.dbQueue, {
		name: jobName,
		data: { user: { id: user.id } },
		opts: queueRetentionOptions(deps.config),
	});
}

export function handleApiExportCustomEmojis(deps: ApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportCustomEmojis', me);
}

export function handleApiIExportNotes(deps: ApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportNotes', me);
}

export function handleApiIExportClips(deps: ApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportClips', me);
}

export function handleApiIExportFavorites(deps: ApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportFavorites', me);
}

export function handleApiIExportMute(deps: ApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportMuting', me);
}

export function handleApiIExportBlocking(deps: ApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportBlocking', me);
}

export function handleApiIExportUserLists(deps: ApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportUserLists', me);
}

export function handleApiIExportAntennas(deps: ApiExportJobDependencies, me: MiLocalUser): void {
	enqueueSimpleExportJob(deps, 'exportAntennas', me);
}

export function handleApiIExportFollowing(
	deps: ApiExportJobDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): void {
	const params = parseApiParams(exportFollowingParamDef, body);
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
