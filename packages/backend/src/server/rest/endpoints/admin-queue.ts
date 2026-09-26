/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as adminQueueContracts } from '@/server/api/metas/admin-queue.js';
import { pickContracts } from '../endpoint-contract.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiAdminQueueAbandonOutboxDeadLetter,
	handleApiAdminQueueClear,
	handleApiAdminQueueJobs,
	handleApiAdminQueueOutboxDeadLetters,
	handleApiAdminQueuePause,
	handleApiAdminQueuePromoteJobs,
	handleApiAdminQueueQueueStats,
	handleApiAdminQueueRemoveJob,
	handleApiAdminQueueResume,
	handleApiAdminQueueRetryJob,
	handleApiAdminQueueRetryOutboxDeadLetter,
	handleApiAdminQueueShowJob,
	handleApiAdminQueueShowJobLogs,
} from '../admin/admin-queue.js';

export const adminQueueEndpoints = implementEndpoints<ApiShellDependencies>()(
	pickContracts(adminQueueContracts, [
		'admin/queue/clear',
		'admin/queue/retry-job',
		'admin/queue/remove-job',
		'admin/queue/show-job',
		'admin/queue/show-job-logs',
		'admin/queue/promote-jobs',
		'admin/queue/pause',
		'admin/queue/resume',
		'admin/queue/jobs',
		'admin/queue/outbox-dead-letters',
		'admin/queue/retry-outbox-dead-letter',
		'admin/queue/abandon-outbox-dead-letter',
		'admin/queue/queue-stats',
	]),
	{
		'admin/queue/clear': async ({ deps, input, me }) => {
			await handleApiAdminQueueClear(deps, me, input);
		},
		'admin/queue/retry-job': async ({ deps, input }) => {
			await handleApiAdminQueueRetryJob(deps, input);
		},
		'admin/queue/remove-job': async ({ deps, input }) => {
			await handleApiAdminQueueRemoveJob(deps, input);
		},
		'admin/queue/show-job': async ({ deps, input }) => await handleApiAdminQueueShowJob(deps, input),
		'admin/queue/show-job-logs': async ({ deps, input }) => await handleApiAdminQueueShowJobLogs(deps, input),
		'admin/queue/promote-jobs': async ({ deps, input, me }) => {
			await handleApiAdminQueuePromoteJobs(deps, me, input);
		},
		'admin/queue/pause': async ({ deps, input, me }) => {
			await handleApiAdminQueuePause(deps, me, input);
		},
		'admin/queue/resume': async ({ deps, input, me }) => {
			await handleApiAdminQueueResume(deps, me, input);
		},
		'admin/queue/jobs': async ({ deps, input }) => await handleApiAdminQueueJobs(deps, input),
		'admin/queue/outbox-dead-letters': async ({ deps, input }) =>
			await handleApiAdminQueueOutboxDeadLetters(deps, input),
		'admin/queue/retry-outbox-dead-letter': async ({ deps, input }) => {
			await handleApiAdminQueueRetryOutboxDeadLetter(deps, input);
		},
		'admin/queue/abandon-outbox-dead-letter': async ({ deps, input }) => {
			await handleApiAdminQueueAbandonOutboxDeadLetter(deps, input);
		},
		'admin/queue/queue-stats': async ({ deps, input }) => await handleApiAdminQueueQueueStats(deps, input),
	},
);
