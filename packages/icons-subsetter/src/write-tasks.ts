/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export async function runWriteTasks(tasks: Iterable<() => Promise<unknown>>): Promise<void> {
	const results = await Promise.allSettled(Array.from(tasks, (task) => task()));
	const failed = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
	if (failed != null) throw failed.reason;
}
