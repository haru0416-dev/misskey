/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from 'bun:test';
import { spawnChecked } from './spawn-checked.mjs';

test('resolves for a successful subprocess', async () => {
	await expect(spawnChecked([process.execPath, '-e', 'process.exit(0)'])).resolves.toBeUndefined();
});

test('rejects for a failed subprocess', async () => {
	await expect(spawnChecked([process.execPath, '-e', 'process.exit(7)'])).rejects.toThrow('exited with code 7');
});
