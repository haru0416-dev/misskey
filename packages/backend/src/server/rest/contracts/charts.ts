/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { schema } from '@/core/chart/entities/active-users.js';
import { schema as schema_2 } from '@/core/chart/entities/ap-request.js';
import { schema as schema_3 } from '@/core/chart/entities/drive.js';
import { schema as schema_4 } from '@/core/chart/entities/federation.js';
import { schema as schema_5 } from '@/core/chart/entities/instance.js';
import { schema as schema_6 } from '@/core/chart/entities/notes.js';
import { schema as schema_7 } from '@/core/chart/entities/per-user-drive.js';
import { schema as schema_8 } from '@/core/chart/entities/per-user-following.js';
import { schema as schema_9 } from '@/core/chart/entities/per-user-notes.js';
import { schema as schema_10 } from '@/core/chart/entities/per-user-pv.js';
import { schema as schema_11 } from '@/core/chart/entities/per-user-reactions.js';
import { schema as schema_12 } from '@/core/chart/entities/users.js';
import { getJsonSchema } from '@/core/chart/core.js';
import { chartParamDef, instanceChartParamDef, perUserChartParamDef } from '@/server/rest/chart/charts.js';
import { defineContract } from '@/server/rest/endpoint-contract.js';

export const endpointMetas = {
	'charts/active-users': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'users'],

			res: getJsonSchema(schema),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: chartParamDef,
	}),
	'charts/ap-request': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts'],

			res: getJsonSchema(schema_2),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: chartParamDef,
	}),
	'charts/drive': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'drive'],

			res: getJsonSchema(schema_3),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: chartParamDef,
	}),
	'charts/federation': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts'],

			res: getJsonSchema(schema_4),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: chartParamDef,
	}),
	'charts/instance': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts'],

			res: getJsonSchema(schema_5),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: instanceChartParamDef,
	}),
	'charts/notes': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'notes'],

			res: getJsonSchema(schema_6),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: chartParamDef,
	}),
	'charts/user/drive': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'drive', 'users'],

			res: getJsonSchema(schema_7),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: perUserChartParamDef,
	}),
	'charts/user/following': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'users', 'following'],

			res: getJsonSchema(schema_8),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: perUserChartParamDef,
	}),
	'charts/user/notes': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'users', 'notes'],

			res: getJsonSchema(schema_9),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: perUserChartParamDef,
	}),
	'charts/user/pv': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'users'],

			res: getJsonSchema(schema_10),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: perUserChartParamDef,
	}),
	'charts/user/reactions': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'users', 'reactions'],

			res: getJsonSchema(schema_11),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: perUserChartParamDef,
	}),
	'charts/users': defineContract({
		meta: {
			allowQuery: true,
			tags: ['charts', 'users'],

			res: getJsonSchema(schema_12),

			allowGet: true,
			cacheSec: 60 * 60,
		},
		paramDef: chartParamDef,
	}),
};
