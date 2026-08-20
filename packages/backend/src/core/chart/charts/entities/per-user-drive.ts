/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import Chart from '../../core.js';

export const name = 'perUserDrive';

export const schema = {
	totalCount: { accumulate: true },
	totalSize: { accumulate: true }, // キロバイト単位
	incCount: { range: 'small' },
	incSize: {}, // キロバイト単位
	decCount: { range: 'small' },
	decSize: {}, // キロバイト単位
} as const;

const entity = Chart.schemaToEntity(name, schema, true);
