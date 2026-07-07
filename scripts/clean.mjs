/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import * as fs from 'node:fs/promises';

const __dirname = import.meta.dirname;

const buildOutputs = [
	'packages/backend/built',
	'packages/backend/built-test',
	'packages/backend/src-js',
	'packages/frontend/built',
	'packages/frontend-embed/built',
	'packages/icons-subsetter/built',
	'packages/i18n/built',
	'packages/sw/built',
	'packages/misskey-js/built',
	'built',
];

await Promise.all(buildOutputs.map(dir =>
	fs.rm(`${__dirname}/../${dir}`, { recursive: true, force: true }),
));
