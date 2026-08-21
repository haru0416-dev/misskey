/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export async function spawnChecked(command, options = {}) {
	const subprocess = Bun.spawn(command, {
		stdin: 'ignore',
		stdout: 'inherit',
		stderr: 'inherit',
		...options,
	});
	const exitCode = await subprocess.exited;
	if (exitCode !== 0) {
		throw new Error(`${command[0]} exited with code ${exitCode}`);
	}
}
