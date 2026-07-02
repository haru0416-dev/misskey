/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import NotesChart from '@/core/chart/charts/notes.js';
import UsersChart from '@/core/chart/charts/users.js';
import { countNoteReactionsFromDatabase } from '@/core/NoteReactionStore.js';
import { countInstancesFromDatabase } from '@/core/InstanceStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { MemoryKVCache } from '@/misc/cache.js';

export const meta = {
	requireCredential: false,

	tags: ['meta'],

	res: {
		type: 'object',
		optional: false, nullable: false,
		properties: {
			notesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			originalNotesCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			usersCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			originalUsersCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			reactionsCount: {
				type: 'number',
				optional: false, nullable: false,
			},
			//originalReactionsCount: {
			//	type: 'number',
			//	optional: false, nullable: false,
			//},
			instances: {
				type: 'number',
				optional: false, nullable: false,
			},
			driveUsageLocal: {
				type: 'number',
				optional: false, nullable: false,
			},
			driveUsageRemote: {
				type: 'number',
				optional: false, nullable: false,
			},
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {},
	required: [],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	private reactionsCountCache: MemoryKVCache<number>;
	private instancesCountCache: MemoryKVCache<number>;

	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private notesChart: NotesChart,
		private usersChart: UsersChart,
	) {
		super(meta, paramDef, async () => {
			const notesChart = await this.notesChart.getChart('hour', 1, null);
			const notesCount = notesChart.local.total[0] + notesChart.remote.total[0];
			const originalNotesCount = notesChart.local.total[0];

			const usersChart = await this.usersChart.getChart('hour', 1, null);
			const usersCount = usersChart.local.total[0] + usersChart.remote.total[0];
			const originalUsersCount = usersChart.local.total[0];

			const [
				reactionsCount,
				//originalReactionsCount,
				instances,
			] = await Promise.all([
				this.reactionsCountCache.fetch('all', () => countNoteReactionsFromDatabase(this.db)),
				//this.noteReactionsRepository.count({ where: { userHost: IsNull() }, cache: 3600000 }),
				this.instancesCountCache.fetch('all', () => countInstancesFromDatabase(this.db)),
			]);

			return {
				notesCount,
				originalNotesCount,
				usersCount,
				originalUsersCount,
				reactionsCount,
				//originalReactionsCount,
				instances,
				driveUsageLocal: 0,
				driveUsageRemote: 0,
			};
		});

		this.reactionsCountCache = new MemoryKVCache<number>(1000 * 60 * 60); // 1h
		this.instancesCountCache = new MemoryKVCache<number>(1000 * 60 * 60); // 1h
	}
}
