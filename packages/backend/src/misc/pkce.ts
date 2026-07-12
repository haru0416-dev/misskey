/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { createHash, timingSafeEqual } from 'node:crypto';

export function createS256CodeChallenge(verifier: string): string {
	return createHash('sha256').update(verifier).digest('base64url');
}

export function verifyS256CodeChallenge(verifier: string, expectedChallenge: string): boolean {
	const challenge = createS256CodeChallenge(verifier);
	const actual = Buffer.from(challenge, 'ascii');
	const expected = Buffer.from(expectedChallenge, 'ascii');
	return actual.length === expected.length && timingSafeEqual(actual, expected);
}
