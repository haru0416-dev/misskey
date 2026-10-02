/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { z } from 'zod';
import { addDbJob } from '@/core/queue/queues.js';
import type { DbQueue } from '@/core/queue/queues.js';
import type { Config } from '@/config.js';
import { queueRetentionOptions } from '@/core/queue/const.js';
import { parseApiParams } from '../validation.js';
import type { MiLocalUser } from '@/models/User.js';
import type { ThinUser } from '@/core/queue/types.js';

export type ExportJobDependencies = {
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

async function enqueueSimpleExportJob(
	deps: ExportJobDependencies,
	jobName: SimpleExportJobName,
	user: ThinUser,
): Promise<void> {
	await addDbJob(deps.dbQueue, {
		name: jobName,
		data: { user: { id: user.id } },
		opts: queueRetentionOptions(deps.config),
	});
}

export async function handleApiExportCustomEmojis(deps: ExportJobDependencies, me: MiLocalUser): Promise<void> {
	await enqueueSimpleExportJob(deps, 'exportCustomEmojis', me);
}

export async function handleApiIExportNotes(deps: ExportJobDependencies, me: MiLocalUser): Promise<void> {
	await enqueueSimpleExportJob(deps, 'exportNotes', me);
}

export async function handleApiIExportClips(deps: ExportJobDependencies, me: MiLocalUser): Promise<void> {
	await enqueueSimpleExportJob(deps, 'exportClips', me);
}

export async function handleApiIExportFavorites(deps: ExportJobDependencies, me: MiLocalUser): Promise<void> {
	await enqueueSimpleExportJob(deps, 'exportFavorites', me);
}

export async function handleApiIExportMute(deps: ExportJobDependencies, me: MiLocalUser): Promise<void> {
	await enqueueSimpleExportJob(deps, 'exportMuting', me);
}

export async function handleApiIExportBlocking(deps: ExportJobDependencies, me: MiLocalUser): Promise<void> {
	await enqueueSimpleExportJob(deps, 'exportBlocking', me);
}

export async function handleApiIExportUserLists(deps: ExportJobDependencies, me: MiLocalUser): Promise<void> {
	await enqueueSimpleExportJob(deps, 'exportUserLists', me);
}

export async function handleApiIExportAntennas(deps: ExportJobDependencies, me: MiLocalUser): Promise<void> {
	await enqueueSimpleExportJob(deps, 'exportAntennas', me);
}

export async function handleApiIExportFollowing(
	deps: ExportJobDependencies,
	me: MiLocalUser,
	body: Record<string, unknown>,
): Promise<void> {
	const params = parseApiParams(exportFollowingParamDef, body);
	await addDbJob(deps.dbQueue, {
		name: 'exportFollowing',
		data: {
			user: { id: me.id },
			excludeMuting: params.excludeMuting,
			excludeInactive: params.excludeInactive,
		},
		opts: queueRetentionOptions(deps.config),
	});
}
