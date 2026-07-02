/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import { DI } from '@/di-symbols.js';
import type { MiPage, MiDriveFile } from '@/models/_.js';
import { bindThis } from '@/decorators.js';
import { RoleService } from '@/core/RoleService.js';
import { IdService } from '@/core/IdService.js';
import type { MiUser } from '@/models/User.js';
import { IdentifiableError } from '@/misc/identifiable-error.js';
import { ModerationLogService } from '@/core/ModerationLogService.js';
import { createPageInDatabase, deletePageInDatabase, pageNameExistsForUserInDatabase, updatePageInDatabase } from '@/core/PageStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';
import { adjustNotesPageCountInDatabase } from '@/core/NoteStore.js';
import { fetchUserByIdOrFailFromDatabase } from '@/core/UserStore.js';

export interface PageBody {
	title: string;
	name: string;
	summary: string | null;
	content: Array<Record<string, any>>;
	variables: Array<Record<string, any>>;
	script: string;
	eyeCatchingImage?: MiDriveFile | null;
	font: 'serif' | 'sans-serif';
	alignCenter: boolean;
	hideTitleWhenPinned: boolean;
}

@Injectable()
export class PageService {
	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private roleService: RoleService,
		private moderationLogService: ModerationLogService,
		private idService: IdService,
	) {
	}

	@bindThis
	public async create(
		me: MiUser,
		body: PageBody,
	): Promise<MiPage> {
		if (await pageNameExistsForUserInDatabase(this.drizzle, me.id, body.name)) {
			throw new IdentifiableError('1a79e38e-3d83-4423-845b-a9d83ff93b61');
		}

		const page = await createPageInDatabase(this.drizzle, {
			id: this.idService.gen(),
			updatedAt: new Date(),
			title: body.title,
			name: body.name,
			summary: body.summary,
			content: body.content,
			variables: body.variables,
			script: body.script,
			eyeCatchingImageId: body.eyeCatchingImage ? body.eyeCatchingImage.id : null,
			userId: me.id,
			visibility: 'public',
			alignCenter: body.alignCenter,
			hideTitleWhenPinned: body.hideTitleWhenPinned,
			font: body.font,
		});

		const referencedNotes = this.collectReferencedNotes(page.content);
		if (referencedNotes.length > 0) {
			await adjustNotesPageCountInDatabase(this.drizzle, referencedNotes, 1);
		}

		return page;
	}

	@bindThis
	public async update(
		me: MiUser,
		pageId: MiPage['id'],
		body: Partial<PageBody>,
	): Promise<void> {
		const result = await updatePageInDatabase(this.drizzle, pageId, me.id, {
			title: body.title,
			name: body.name,
			summary: body.summary,
			content: body.content,
			variables: body.variables,
			script: body.script,
			alignCenter: body.alignCenter,
			hideTitleWhenPinned: body.hideTitleWhenPinned,
			font: body.font,
			eyeCatchingImageId: body.eyeCatchingImage === undefined ? undefined : (body.eyeCatchingImage?.id ?? null),
		});

		if (result.status === 'not-found') {
			throw new IdentifiableError('66aefd3c-fdb2-4a71-85ae-cc18bea85d3f');
		}
		if (result.status === 'forbidden') {
			throw new IdentifiableError('d0017699-8256-46f1-aed4-bc03bed73616');
		}
		if (result.status === 'name-conflict') {
			throw new IdentifiableError('d05bfe24-24b6-4ea2-a3ec-87cc9bf4daa4');
		}

		const { before } = result;

		console.log('page.content', before.content);

		if (body.content != null) {
			const beforeReferencedNotes = this.collectReferencedNotes(before.content);
			const afterReferencedNotes = this.collectReferencedNotes(body.content);

			const removedNotes = beforeReferencedNotes.filter(noteId => !afterReferencedNotes.includes(noteId));
			const addedNotes = afterReferencedNotes.filter(noteId => !beforeReferencedNotes.includes(noteId));

			if (removedNotes.length > 0) {
				await adjustNotesPageCountInDatabase(this.drizzle, removedNotes, -1);
			}
			if (addedNotes.length > 0) {
				await adjustNotesPageCountInDatabase(this.drizzle, addedNotes, 1);
			}
		}
	}

	@bindThis
	public async delete(me: MiUser, pageId: MiPage['id']): Promise<void> {
		const isModerator = await this.roleService.isModerator(me);

		const result = await deletePageInDatabase(this.drizzle, pageId, { userId: me.id, isModerator });

		if (result.status === 'not-found') {
			throw new IdentifiableError('66aefd3c-fdb2-4a71-85ae-cc18bea85d3f');
		}
		if (result.status === 'forbidden') {
			throw new IdentifiableError('d0017699-8256-46f1-aed4-bc03bed73616');
		}

		const { page } = result;

		if (page.userId !== me.id) {
			const user = await fetchUserByIdOrFailFromDatabase(this.drizzle, page.userId);
			this.moderationLogService.log(me, 'deletePage', {
				pageId: page.id,
				pageUserId: page.userId,
				pageUserUsername: user.username,
				page,
			});
		}

		const referencedNotes = this.collectReferencedNotes(page.content);
		if (referencedNotes.length > 0) {
			await adjustNotesPageCountInDatabase(this.drizzle, referencedNotes, -1);
		}
	}

	collectReferencedNotes(content: MiPage['content']): string[] {
		const referencingNotes = new Set<string>();
		const recursiveCollect = (content: unknown[]) => {
			for (const contentElement of content) {
				if (typeof contentElement === 'object'
					&& contentElement !== null
					&& 'type' in contentElement) {
					if (contentElement.type === 'note'
						&& 'note' in contentElement
						&& typeof contentElement.note === 'string') {
						referencingNotes.add(contentElement.note);
					}
					if (contentElement.type === 'section'
						&& 'children' in contentElement
						&& Array.isArray(contentElement.children)) {
						recursiveCollect(contentElement.children);
					}
				}
			}
		};
		recursiveCollect(content);
		return [...referencingNotes];
	}
}
