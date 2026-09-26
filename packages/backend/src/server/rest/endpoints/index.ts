/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { registerEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import { adminEmojiEndpoints } from './admin-emoji.js';
import { antennasEndpoints } from './antennas.js';
import { channelsEndpoints } from './channels.js';
import { chatEndpoints } from './chat.js';
import { clipsEndpoints } from './clips.js';
import { flashEndpoints } from './flash.js';
import { followingEndpoints } from './following.js';
import { galleryEndpoints } from './gallery.js';
import { notesEndpoints } from './notes.js';
import { pagesEndpoints } from './pages.js';

/** 契約 (api/metas) から登録するカテゴリ。ここに並べたエンドポイントは routes/ に手書きの登録を持たない。 */
export function registerContractEndpoints(app: Hono, deps: ApiShellDependencies): void {
	registerEndpoints(app, deps, [
		...adminEmojiEndpoints,
		...antennasEndpoints,
		...channelsEndpoints,
		...chatEndpoints,
		...clipsEndpoints,
		...flashEndpoints,
		...followingEndpoints,
		...galleryEndpoints,
		...notesEndpoints,
		...pagesEndpoints,
	]);
}
