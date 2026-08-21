/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'bun:test';
import { createDependencyInventory, dependencyClosure, parseResolvedPackage } from './dependency-inventory.mjs';

describe('parseResolvedPackage', () => {
	test('parses scoped and unscoped package identifiers', () => {
		expect(parseResolvedPackage('zod@4.4.3')).toEqual({ name: 'zod', version: '4.4.3' });
		expect(parseResolvedPackage('@aws-sdk/client-s3@3.1076.0')).toEqual({
			name: '@aws-sdk/client-s3',
			version: '3.1076.0',
		});
	});
});

test('dependencyClosure handles shared dependencies and cycles', () => {
	const graph = new Map([
		['root', new Set(['a', 'b'])],
		['a', new Set(['shared'])],
		['b', new Set(['shared'])],
		['shared', new Set(['root'])],
	]);
	expect([...dependencyClosure(graph, 'root')].toSorted()).toEqual(['a', 'b', 'root', 'shared']);
});

test('reads the repository JSONC lockfile and source usage', () => {
	const { inventory } = createDependencyInventory();
	expect(inventory.summary.resolvedInstances).toBeGreaterThan(inventory.summary.resolvedPackageNames);
	expect(inventory.nativeCandidates.find((candidate) => candidate.name === 'uuid')?.usage).toContain(
		'packages/aiscript/src/interpreter/lib/std.ts',
	);
});
