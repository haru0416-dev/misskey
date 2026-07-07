/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { getJsonSchema } from '@/core/chart/core.js';
import { schema } from '@/core/chart/charts/entities/instance.js';
import { instanceChartParamDef } from '@/server/rest/charts.js';

export const meta = {
	tags: ['charts'],

	res: getJsonSchema(schema),

	allowGet: true,
	cacheSec: 60 * 60,
} as const;

export const paramDef = instanceChartParamDef;
