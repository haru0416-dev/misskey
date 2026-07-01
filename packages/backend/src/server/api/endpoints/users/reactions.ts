/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { UserProfilesRepository, NotesRepository } from '@/models/_.js';
import type { MiNote } from '@/models/Note.js';
import { Endpoint } from '@/server/api/endpoint-base.js';
import { QueryService } from '@/core/QueryService.js';
import { NoteReactionEntityService } from '@/core/entities/NoteReactionEntityService.js';
import { DI } from '@/di-symbols.js';
import { CacheService } from '@/core/CacheService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { RoleService } from '@/core/RoleService.js';
import { isUserRelated } from '@/misc/is-user-related.js';
import { IdService } from '@/core/IdService.js';
import { listNoteReactionsByUserIdFromDatabase, resolveNoteReactionPagination } from '@/core/NoteReactionStore.js';
import type { NoteReactionRow } from '@/db/schema/note-reaction.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { ApiError } from '../../error.js';

export const meta = {
	tags: ['users', 'reactions'],

	requireCredential: false,

	description: 'Show all reactions this user made.',

	res: {
		type: 'array',
		optional: false, nullable: false,
		items: {
			type: 'object',
			optional: false, nullable: false,
			ref: 'NoteReactionWithNote',
		},
	},

	errors: {
		reactionsNotPublic: {
			message: 'Reactions of the user is not public.',
			code: 'REACTIONS_NOT_PUBLIC',
			id: '673a7dd2-6924-1093-e0c0-e68456ceae5c',
		},
		isRemoteUser: {
			message: 'Currently unavailable to display reactions of remote users. See https://github.com/misskey-dev/misskey/issues/12964',
			code: 'IS_REMOTE_USER',
			id: '6b95fa98-8cf9-2350-e284-f0ffdb54a805',
		},
	},
} as const;

export const paramDef = {
	type: 'object',
	properties: {
		userId: { type: 'string', format: 'misskey:id' },
		limit: { type: 'integer', minimum: 1, maximum: 100, default: 10 },
		sinceId: { type: 'string', format: 'misskey:id' },
		untilId: { type: 'string', format: 'misskey:id' },
		sinceDate: { type: 'integer' },
		untilDate: { type: 'integer' },
	},
	required: ['userId'],
} as const;

@Injectable()
export default class extends Endpoint<typeof meta, typeof paramDef> { // eslint-disable-line import/no-default-export
	constructor(
		@Inject(DI.userProfilesRepository)
		private userProfilesRepository: UserProfilesRepository,

		@Inject(DI.notesRepository)
		private notesRepository: NotesRepository,

		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private cacheService: CacheService,
		private userEntityService: UserEntityService,
		private noteReactionEntityService: NoteReactionEntityService,
		private queryService: QueryService,
		private roleService: RoleService,
		private idService: IdService,
	) {
		super(meta, paramDef, async (ps, me) => {
			const userIdsWhoBlockingMe = me ? await this.cacheService.userBlockedCache.fetch(me.id) : new Set<string>();
			const iAmModerator = me ? await this.roleService.isModerator(me) : false; // Moderators can see reactions of all users
			if (!iAmModerator) {
				const user = await this.cacheService.findUserById(ps.userId);
				if (this.userEntityService.isRemoteUser(user)) {
					throw new ApiError(meta.errors.isRemoteUser);
				}

				const profile = await this.userProfilesRepository.findOneByOrFail({ userId: ps.userId });
				if ((me == null || me.id !== ps.userId) && !profile.publicReactions) {
					throw new ApiError(meta.errors.reactionsNotPublic);
				}

				// early return if me is blocked by requesting user
				if (userIdsWhoBlockingMe.has(ps.userId)) {
					return [];
				}
			}

			const userIdsWhoMeMuting = me ? await this.cacheService.userMutingsCache.fetch(me.id) : new Set<string>();

			// note_reaction 側は自身のテーブルのみを Drizzle で取得し、visibility 等の判定が必要な
			// note 側は従来通り TypeORM の queryService を使って(可視な note の id 集合を導出したうえで)
			// フィルタする。SQL 1本の JOIN だった頃と同じく「limit に達するまで可視な reaction を探す」
			// 挙動を維持するため、reaction をページ単位で取得しながら可視性判定を繰り返す。
			const pagination = resolveNoteReactionPagination(this.idService, ps);
			let sinceId = pagination.sinceId;
			let untilId = pagination.untilId;

			const collected: (NoteReactionRow & { note: MiNote })[] = [];

			// ミュート/ブロック/非公開等で大半が弾かれるケースでもクエリ数が際限なく増えないよう上限を設ける
			const maxPages = 20;
			for (let page_ = 0; page_ < maxPages; page_++) {
				const page = await listNoteReactionsByUserIdFromDatabase(this.db, ps.userId, {
					limit: ps.limit,
					order: pagination.order,
					sinceId,
					untilId,
				});

				if (page.length === 0) break;

				if (pagination.order === 'asc') {
					sinceId = page[page.length - 1].id;
				} else {
					untilId = page[page.length - 1].id;
				}

				const noteIds = page.map(reaction => reaction.noteId);
				const noteQuery = this.notesRepository.createQueryBuilder('note')
					.andWhere('note.id IN (:...noteIds)', { noteIds })
					.leftJoinAndSelect('note.user', 'user')
					.leftJoinAndSelect('note.reply', 'reply')
					.leftJoinAndSelect('note.renote', 'renote')
					.leftJoinAndSelect('reply.user', 'replyUser')
					.leftJoinAndSelect('renote.user', 'renoteUser');

				this.queryService.generateVisibilityQuery(noteQuery, me);
				this.queryService.generateBlockedHostQueryForNote(noteQuery);
				this.queryService.generateSuspendedUserQueryForNote(noteQuery);

				const notes = await noteQuery.getMany();
				const noteMap = new Map(notes.map(note => [note.id, note]));

				for (const reaction of page) {
					if (collected.length >= ps.limit) break;

					const note = noteMap.get(reaction.noteId);
					if (note == null) continue; // 可視性等の条件に合致しない note

					if (note.userId !== ps.userId) { // we can see reactions to note of requesting user unconditionally
						if (me && isUserRelated(note, userIdsWhoBlockingMe)) continue;
						if (me && isUserRelated(note, userIdsWhoMeMuting)) continue;
					}

					collected.push({ ...reaction, note });
				}

				if (collected.length >= ps.limit) break;
				if (page.length < ps.limit) break; // これ以上 reaction が存在しない
			}

			return await this.noteReactionEntityService.packManyWithNote(collected, me);
		});
	}
}
