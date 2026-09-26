/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { Hono } from 'hono';
import { registerEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import { adminEndpoints } from './admin.js';
import { adminAbuseReportEndpoints } from './admin-abuse-report.js';
import { adminEmojiEndpoints } from './admin-emoji.js';
import { adminQueueEndpoints } from './admin-queue.js';
import { adminRolesEndpoints } from './admin-roles.js';
import { adminSystemWebhookEndpoints } from './admin-system-webhook.js';
import { antennasEndpoints } from './antennas.js';
import { channelsEndpoints } from './channels.js';
import { chartsEndpoints } from './charts.js';
import { chatEndpoints } from './chat.js';
import { clipsEndpoints } from './clips.js';
import { driveEndpoints } from './drive.js';
import { federationEndpoints } from './federation.js';
import { flashEndpoints } from './flash.js';
import { followingEndpoints } from './following.js';
import { galleryEndpoints } from './gallery.js';
import { hashtagsEndpoints } from './hashtags.js';
import { iEndpoints } from './i.js';
import { miscEndpoints } from './misc.js';
import { notesEndpoints } from './notes.js';
import { pagesEndpoints } from './pages.js';
import { usersEndpoints } from './users.js';

/** 契約 (api/metas) から登録するカテゴリ。ここに並べたエンドポイントは routes/ に手書きの登録を持たない。 */
export function registerContractEndpoints(app: Hono, deps: ApiShellDependencies): void {
	registerEndpoints(app, deps, [
		...adminEndpoints,
		...adminAbuseReportEndpoints,
		...adminEmojiEndpoints,
		...adminQueueEndpoints,
		...adminRolesEndpoints,
		...adminSystemWebhookEndpoints,
		...antennasEndpoints,
		...channelsEndpoints,
		...chartsEndpoints,
		...chatEndpoints,
		...clipsEndpoints,
		...driveEndpoints,
		...federationEndpoints,
		...flashEndpoints,
		...followingEndpoints,
		...galleryEndpoints,
		...hashtagsEndpoints,
		...iEndpoints,
		...miscEndpoints,
		...notesEndpoints,
		...pagesEndpoints,
		...usersEndpoints,
	]);
}
