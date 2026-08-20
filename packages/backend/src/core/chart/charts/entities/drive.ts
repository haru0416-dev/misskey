/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Chart from '../../core.js';

export const name = 'drive';

export const schema = {
	'local.incCount': {},
	'local.incSize': {}, // キロバイト単位
	'local.decCount': {},
	'local.decSize': {}, // キロバイト単位
	'remote.incCount': {},
	'remote.incSize': {}, // キロバイト単位
	'remote.decCount': {},
	'remote.decSize': {}, // キロバイト単位
} as const;

const entity = Chart.schemaToEntity(name, schema);
