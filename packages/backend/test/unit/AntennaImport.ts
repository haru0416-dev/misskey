/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test } from 'vitest';
import { exportedAntennasSchema, importedAntennaToCreateValues } from '@/core/AntennaImport.js';

const exportedAntenna = {
	name: 'imported antenna',
	src: 'all' as const,
	userListAccts: null,
	keywords: [['hello']],
	excludeKeywords: [[]],
	users: [],
	caseSensitive: false,
	localOnly: false,
	excludeBots: false,
	withReplies: false,
	withFile: false,
	excludeNotesInSensitiveChannel: false,
};

describe('AntennaImport', () => {
	test('validates and converts an exported antenna', () => {
		const result = exportedAntennasSchema.parse([exportedAntenna]);
		const values = importedAntennaToCreateValues(result[0]!, new Date(0));

		expect(values).toMatchObject({
			name: 'imported antenna',
			src: 'all',
			userListId: null,
			keywords: [['hello']],
		});
	});

	test('converts an exported list to a users antenna', () => {
		const result = exportedAntennasSchema.parse([
			{
				...exportedAntenna,
				src: 'list',
				userListAccts: ['alice@example.com', ''],
			},
		]);
		const values = importedAntennaToCreateValues(result[0]!, new Date(0));

		expect(values.src).toBe('users');
		expect(values.users).toEqual(['alice@example.com']);
	});

	test('rejects the entire file when an entry is invalid', () => {
		expect(exportedAntennasSchema.safeParse([exportedAntenna, { ...exportedAntenna, src: 'invalid' }]).success).toBe(
			false,
		);
	});

	test('accepts exclude-only antennas and rejects empty conditions', () => {
		expect(
			exportedAntennasSchema.safeParse([
				{
					...exportedAntenna,
					keywords: [[]],
					excludeKeywords: [['spam']],
				},
			]).success,
		).toBe(true);
		expect(
			exportedAntennasSchema.safeParse([
				{
					...exportedAntenna,
					keywords: [['']],
					excludeKeywords: [[]],
				},
			]).success,
		).toBe(false);
	});
});
