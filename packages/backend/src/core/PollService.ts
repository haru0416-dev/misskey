/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiNote } from '@/models/Note.js';
import type { MiUser } from '@/models/User.js';
import { RelayService } from '@/core/RelayService.js';
import { IdService } from '@/core/IdService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { ApDeliverManagerService } from '@/core/activitypub/ApDeliverManagerService.js';
import { bindThis } from '@/decorators.js';
import { UserBlockingService } from '@/core/UserBlockingService.js';
import { createPollVoteInDatabase, listPollVotesByNoteAndUserFromDatabase } from '@/core/PollVoteStore.js';
import { fetchPollByNoteIdFromDatabase, incrementPollVoteInDatabase } from '@/core/PollStore.js';
import { fetchNoteByIdFromDatabase } from '@/core/NoteStore.js';
import { fetchUserByIdFromDatabase } from '@/core/UserStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

@Injectable()
export class PollService {
	constructor(
		@Inject(DI.drizzle)
		private db: MiDrizzleDatabase,

		private userEntityService: UserEntityService,
		private idService: IdService,
		private relayService: RelayService,
		private globalEventService: GlobalEventService,
		private userBlockingService: UserBlockingService,
		private apRendererService: ApRendererService,
		private apDeliverManagerService: ApDeliverManagerService,
	) {
	}

	@bindThis
	public async vote(user: MiUser, note: MiNote, choice: number) {
		const poll = await fetchPollByNoteIdFromDatabase(this.db, note.id);

		if (poll == null) throw new Error('poll not found');

		// Check whether is valid choice
		if (poll.choices[choice] == null) throw new Error('invalid choice param');

		// Check blocking
		if (note.userId !== user.id) {
			const blocked = await this.userBlockingService.checkBlocked(note.userId, user.id);
			if (blocked) {
				throw new Error('blocked');
			}
		}

		// if already voted
		const exist = await listPollVotesByNoteAndUserFromDatabase(this.db, note.id, user.id);

		if (poll.multiple) {
			if (exist.some(x => x.choice === choice)) {
				throw new Error('already voted');
			}
		} else if (exist.length !== 0) {
			throw new Error('already voted');
		}

		await createPollVoteInDatabase(this.db, {
			id: this.idService.gen(),
			noteId: note.id,
			userId: user.id,
			choice: choice,
		});

		// Increment votes count
		await incrementPollVoteInDatabase(this.db, poll.noteId, choice);

		this.globalEventService.publishNoteStream(note, 'pollVoted', {
			choice: choice,
			userId: user.id,
		});
	}

	@bindThis
	public async deliverQuestionUpdate(noteId: MiNote['id']) {
		const note = await fetchNoteByIdFromDatabase(this.db, noteId);
		if (note == null) throw new Error('note not found');

		if (note.localOnly) return;

		const user = await fetchUserByIdFromDatabase(this.db, note.userId);
		if (user == null) throw new Error('note not found');

		if (this.userEntityService.isLocalUser(user)) {
			const content = this.apRendererService.addContext(this.apRendererService.renderUpdate(await this.apRendererService.renderNote(note, false), user));
			this.apDeliverManagerService.deliverToFollowers(user, content);
			this.relayService.deliverToRelays(user, content);
		}
	}
}
