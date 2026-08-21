/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import path from 'node:path';

export function createTargetFileMatcher(root: string, patterns: string[]): (id: string) => boolean {
	return (id) => {
		const relativePath = path.posix.relative(root, id);
		if (relativePath.split('/').some((segment) => segment.startsWith('.'))) return false;
		return patterns.some((pattern) => path.posix.matchesGlob(relativePath, pattern));
	};
}
