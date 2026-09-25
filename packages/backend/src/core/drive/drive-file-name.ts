/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function validateDriveFileName(name: string): boolean {
	return (
		name.trim().length > 0 && name.length <= 200 && !name.includes('\\') && !name.includes('/') && !name.includes('..')
	);
}
