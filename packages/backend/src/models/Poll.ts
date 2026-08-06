/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { noteVisibilities } from '@/types.js';
import { MiNote } from './Note.js';
import type { MiUser } from './User.js';
import type { MiChannel } from '@/models/Channel.js';

export class MiPoll {
	public noteId: MiNote['id'];

	public note: MiNote | null;

	public expiresAt: Date | null;

	public multiple: boolean;

	public choices: string[];

	public votes: number[];

	public noteVisibility: (typeof noteVisibilities)[number];

	public userId: MiUser['id'];

	public userHost: string | null;

	public channelId: MiChannel['id'] | null;

	constructor(data: Partial<MiPoll>) {
		if (data == null) return;

		for (const [k, v] of Object.entries(data)) {
			(this as Record<string, unknown>)[k] = v;
		}
	}
}

export type IPoll = {
	choices: string[];
	votes?: number[];
	multiple: boolean;
	expiresAt: Date | null;
};
