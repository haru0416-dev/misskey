/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { endpointMetas as adminSystemWebhookContracts } from '@/server/api/metas/admin-system-webhook.js';
import { implementEndpoints } from '../endpoint-definition.js';
import type { ApiShellDependencies } from '../shell.js';
import {
	handleApiAdminSystemWebhookCreate,
	handleApiAdminSystemWebhookDelete,
	handleApiAdminSystemWebhookList,
	handleApiAdminSystemWebhookShow,
	handleApiAdminSystemWebhookTest,
	handleApiAdminSystemWebhookUpdate,
} from '../admin/admin-system-webhooks.js';

export const adminSystemWebhookEndpoints = implementEndpoints<ApiShellDependencies>()(adminSystemWebhookContracts, {
	'admin/system-webhook/create': async ({ deps, input, me }) =>
		await handleApiAdminSystemWebhookCreate(deps, me, input),
	'admin/system-webhook/delete': async ({ deps, input, me }) => {
		await handleApiAdminSystemWebhookDelete(deps, me, input);
	},
	'admin/system-webhook/list': async ({ deps, input }) => await handleApiAdminSystemWebhookList(deps, input),
	'admin/system-webhook/show': async ({ deps, input }) => await handleApiAdminSystemWebhookShow(deps, input),
	'admin/system-webhook/test': async ({ deps, errors, input }) => {
		await handleApiAdminSystemWebhookTest(deps, input, errors);
	},
	'admin/system-webhook/update': async ({ deps, input, me }) =>
		await handleApiAdminSystemWebhookUpdate(deps, me, input),
});
