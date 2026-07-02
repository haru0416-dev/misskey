/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { MiUser } from './User.js';
import { MiGalleryPost } from './GalleryPost.js';

export class MiGalleryLike {
	public id: string;

	public userId: MiUser['id'];

	public user: MiUser | null;

	public postId: MiGalleryPost['id'];

	public post: MiGalleryPost | null;
}
