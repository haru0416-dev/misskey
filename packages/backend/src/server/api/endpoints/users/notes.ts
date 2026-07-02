/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiMeta } from '@/models/_.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { NoteEntityService } from '@/core/entities/NoteEntityService.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { IdService } from '@/core/IdService.js';
import type { MiLocalUser } from '@/models/User.js';
import { FanoutTimelineEndpointService } from '@/core/FanoutTimelineEndpointService.js';
import { FanoutTimelineName } from '@/core/FanoutTimelineService.js';
import { ApiError } from '@/server/api/error.js';
import { ChannelMutingService } from '@/core/ChannelMutingService.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { listUserTimelineNotesFromDatabase } from '@/core/NoteStore.js';

export const meta = {
	tags: ['users', 'notes'],

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'Note',
		},
	},

	errors: {
		noSuchUser: {
			message: 'No such user.',
			code: 'NO_SUCH_USER',
			id: '27e494ba-2ac2-48e8-893b-10d4d8c2387b',
		},

		bothWithRepliesAndWithFiles: {
			message: 'Specifying both withReplies and withFiles is not supported',
			code: 'BOTH_WITH_REPLIES_AND_WITH_FILES',
			id: '91c8cb9f-36ed-46e7-9ca2-7df96ed6e222',
		},

		signinRequired: {
			message: 'Signin required.',
			code: 'SIGNIN_REQUIRED',
			id: 'd1588a9e-4b4d-4c07-807f-16f1486577a2',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		withReplies: { type: 'boolean', default: false },
		withRenotes: { type: 'boolean', default: true },
		withChannelNotes: { type: 'boolean', default: false },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
		allowPartial: { type: 'boolean', default: false }, // true is recommended but for compatibility false by default
		withFiles: { type: 'boolean', default: false },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.meta)
		private serverSettings: MiMeta,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private noteEntityService: NoteEntityService,
		private cacheService: CacheService,
		private idService: IdService,
		private fanoutTimelineEndpointService: FanoutTimelineEndpointService,
		private channelMutingService: ChannelMutingService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const untilId = ps.untilId ?? (ps.untilDate ? this.idService.gen(ps.untilDate!) : null);
			const sinceId = ps.sinceId ?? (ps.sinceDate ? this.idService.gen(ps.sinceDate!) : null);
			const isSelf = me && (me.id === ps.userId);

			if (ps.withReplies && ps.withFiles) throw new ApiError(meta.errors.bothWithRepliesAndWithFiles);

			// early return if me is blocked by requesting user
			if (me != null) {
				const userIdsWhoBlockingMe = await this.cacheService.userBlockedCache.fetch(me.id);
				if (userIdsWhoBlockingMe.has(ps.userId)) {
					return [];
				}
			}

			if (!this.serverSettings.enableFanoutTimeline) {
				const timeline = await this.getFromDb({
					untilId,
					sinceId,
					limit: ps.limit,
					userId: ps.userId,
					withChannelNotes: ps.withChannelNotes,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
				}, me);

				return await this.noteEntityService.packMany(timeline, me);
			}

			const redisTimelines: FanoutTimelineName[] = [ps.withFiles ? `userTimelineWithFiles:${ps.userId}` : `userTimeline:${ps.userId}`];

			if (ps.withReplies) redisTimelines.push(`userTimelineWithReplies:${ps.userId}`);
			if (ps.withChannelNotes) redisTimelines.push(`userTimelineWithChannel:${ps.userId}`);

			const isFollowing = me && Object.hasOwn(await this.cacheService.userFollowingsCache.fetch(me.id), ps.userId);

			const timeline = await this.fanoutTimelineEndpointService.timeline({
				untilId,
				sinceId,
				limit: ps.limit,
				allowPartial: ps.allowPartial,
				me,
				redisTimelines,
				useDbFallback: true,
				ignoreAuthorFromMute: true,
				ignoreAuthorFromInstanceBlock: true,
				ignoreAuthorFromUserSuspension: true,
				excludeReplies: ps.withChannelNotes && !ps.withReplies, // userTimelineWithChannel may include replies
				excludeNoFiles: ps.withChannelNotes && ps.withFiles, // userTimelineWithChannel may include notes without files
				excludePureRenotes: !ps.withRenotes,
				noteFilter: note => {
					if (note.channel?.isSensitive && !isSelf) return false;
					if (note.visibility === 'specified' && (!me || (me.id !== note.userId && !note.visibleUserIds.some(v => v === me.id)))) return false;
					if (note.visibility === 'followers' && !isFollowing && !isSelf) return false;

					return true;
				},
				dbFallback: async (untilId, sinceId, limit) => await this.getFromDb({
					untilId,
					sinceId,
					limit,
					userId: ps.userId,
					withChannelNotes: ps.withChannelNotes,
					withFiles: ps.withFiles,
					withRenotes: ps.withRenotes,
				}, me),
			});

			return timeline;
		});
	}

	private async getFromDb(ps: {
		untilId: string | null,
		sinceId: string | null,
		limit: number,
		userId: string,
		withChannelNotes: boolean,
		withFiles: boolean,
		withRenotes: boolean,
	}, me: MiLocalUser | null) {
		const mutingChannelIds = me
			? await this.channelMutingService
				.list({ requestUserId: me.id }, { idOnly: true })
				.then(x => x.map(x => x.id))
			: [];

		return await listUserTimelineNotesFromDatabase(this.db, {
			userId: ps.userId,
			limit: ps.limit,
			sinceId: ps.sinceId,
			untilId: ps.untilId,
			withChannelNotes: ps.withChannelNotes,
			withFiles: ps.withFiles,
			withRenotes: ps.withRenotes,
			me,
			blockedHosts: this.serverSettings.blockedHosts,
			mutingChannelIds,
		});
	}
}
