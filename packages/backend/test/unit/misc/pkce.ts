/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { createS256CodeChallenge, verifyS256CodeChallenge } from '@/misc/pkce.js';

describe('PKCE', () => {
	const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
	const challenge = 'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM';

	test('creates the RFC 7636 S256 challenge', () => {
		expect(createS256CodeChallenge(verifier)).toBe(challenge);
	});

	test('verifies a matching challenge', () => {
		expect(verifyS256CodeChallenge(verifier, challenge)).toBe(true);
	});

	test('rejects a mismatched challenge', () => {
		expect(verifyS256CodeChallenge(verifier, `${challenge}x`)).toBe(false);
	});
});
