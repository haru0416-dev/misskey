/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { handleApiIExportFollowing, handleApiIExportNotes } from '@/server/rest/job/export-jobs.js';
import type { ExportJobDependencies } from '@/server/rest/job/export-jobs.js';
import type { MiLocalUser } from '@/models/User.js';

describe('export jobs', () => {
	const failingDeps = {
		config: {
			queues: {
				retention: {
					completedMaximumAgeSeconds: 60,
					completedMaximumCount: 10,
					failedMaximumAgeSeconds: 60,
					failedMaximumCount: 10,
				},
			},
		},
		dbQueue: {
			add: async () => {
				throw new Error('queue unavailable');
			},
		},
	} as unknown as ExportJobDependencies;
	const me = { id: 'exporter' } as MiLocalUser;

	test('キューへの登録に失敗したら、受け付けたことにせず失敗を返す', async () => {
		await expect(handleApiIExportNotes(failingDeps, me)).rejects.toThrow('queue unavailable');
		await expect(handleApiIExportFollowing(failingDeps, me, {})).rejects.toThrow('queue unavailable');
	});
});
