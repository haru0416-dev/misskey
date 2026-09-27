/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';

const { deepClone, prefer } = vi.hoisted(() => {
	const profile = {
		id: 'profile',
		name: 'Main',
		columns: [{ id: 'column', type: 'widgets', name: null, width: 300, widgets: [] }],
		layout: [['column']],
	};
	return {
		deepClone: <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T,
		prefer: {
			'deck.profile': 'Main',
			'deck.profiles': [profile],
			commit: vi.fn(),
		},
	};
});

vi.mock('@/utility/clone.js', () => ({ deepClone }));
vi.mock('@/preferences.js', () => ({ prefer }));
vi.mock('@/os.js', () => ({ inputText: vi.fn(), popupMenu: vi.fn() }));
vi.mock('@/i18n.js', () => ({ i18n: { ts: { _deck: {} } } }));

import { addColumnWidget, columns } from '@/deck.js';

describe('deck column updates', () => {
	test('adds a widget to the selected column', () => {
		addColumnWidget('column', { id: 'widget', name: 'clock', data: {} });

		expect(columns.value[0]?.widgets?.[0]?.id).toBe('widget');
	});
});
