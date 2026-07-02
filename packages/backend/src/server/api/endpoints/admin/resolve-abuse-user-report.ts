/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { DI } from '@/di-symbols.js';
import { ApiError } from '@/server/api/error.js';
import { AbuseReportService } from '@/core/AbuseReportService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { fetchAbuseUserReportByIdFromDatabase } from '@/core/AbuseUserReportStore.js';

export const meta = {
	tags: ['admin'],

	requireCredential: true,
	requireModerator: true,
	kind: 'write:admin:resolve-abuse-user-report',

	errors: {
		noSuchAbuseReport: {
			message: 'No such abuse report.',
			code: 'NO_SUCH_ABUSE_REPORT',
			id: 'ac3794dd-2ce4-d878-e546-73c60c06b398',
			kind: 'server',
			httpStatusCode: 404,
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		reportId: { type: 'string', format: 'misskey:id' },
		resolvedAs: { type: 'string', enum: ['accept', 'reject', null], nullable: true },
	},
	required: ['reportId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,
		private abuseReportService: AbuseReportService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const report = await fetchAbuseUserReportByIdFromDatabase(this.db, ps.reportId);
			if (!report) {
				throw new ApiError(meta.errors.noSuchAbuseReport);
			}

			await this.abuseReportService.resolve([{ reportId: report.id, resolvedAs: ps.resolvedAs ?? null }], me);
		});
	}
}
