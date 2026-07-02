/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiClip } from './Clip.js';

export class MiClipFavorite {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public clipId: MiClip['id'];

	public clip: MiClip | null;
}
