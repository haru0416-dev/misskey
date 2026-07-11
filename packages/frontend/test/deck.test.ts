/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { beforeEach, describe, expect, test, vi } from 'vitest';

const { deepCloneMock, prefer } = vi.hoisted(() => {
	const profile = {
		id: 'profile',
		name: 'Main',
		columns: [{ id: 'column', type: 'widgets', name: null, width: 300, widgets: [] }],
		layout: [['column']],
	};
	return {
		deepCloneMock: vi.fn(<T>(value: T): T => JSON.parse(JSON.stringify(value)) as T),
		prefer: {
			'deck.profile': 'Main',
			'deck.profiles': [profile],
			commit: vi.fn(),
		},
	};
});

vi.mock('@/utility/clone.js', () => ({ deepClone: deepCloneMock }));
vi.mock('@/preferences.js', () => ({ prefer }));
vi.mock('@/os.js', () => ({ inputText: vi.fn(), popupMenu: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _deck: {} } } }));

import { addColumnWidget, columns } from '@/deck.js';

describe('deck column updates', () => {
	beforeEach(() => {
		deepCloneMock.mockClear();
	});

	test('does not clone the selected column again after cloning the collection', () => {
		addColumnWidget('column', { id: 'widget', name: 'clock', data: {} });

		expect(columns.value[0]?.widgets?.[0]?.id).toBe('widget');
		// columns collection + persisted profile
		expect(deepCloneMock).toHaveBeenCalledTimes(2);
	});
});
