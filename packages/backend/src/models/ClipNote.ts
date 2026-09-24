/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { MiNote } from './Note.js';
import type { MiClip } from './Clip.js';

export class MiClipNote {
	public id: string;

	public noteId: MiNote['id'];

	public note: MiNote | null;

	public clipId: MiClip['id'];

	public clip: MiClip | null;
}
