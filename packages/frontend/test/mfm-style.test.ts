/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { FN, TEXT } from 'mfm-js';
import type { CSSProperties, VNode } from 'vue';
import MkMfm from '@/components/global/MkMfm.js';

function renderFunctionStyle(name: string, args: Record<string, string | true>): CSSProperties {
	const root = MkMfm({
		text: 'test',
		parsedNodes: [FN(name, args, [TEXT('test')])],
	}, { emit: vi.fn() }) as VNode;
	const children = root.children as VNode[];
	return children[0]?.props?.style as CSSProperties;
}

describe('MFM function styles', () => {
	test('binds validated values as individual style properties', () => {
		expect(renderFunctionStyle('rotate', { deg: '45.5' })).toStrictEqual({
			display: 'inline-block',
			transform: 'rotate(45.5deg)',
			transformOrigin: 'center center',
		});
		expect(renderFunctionStyle('fg', { color: 'a1b2c3' })).toStrictEqual({
			display: 'inline-block',
			color: '#a1b2c3',
			overflowWrap: 'anywhere',
		});
	});

	test('rejects values that could append CSS declarations', () => {
		expect(renderFunctionStyle('rotate', { deg: '1; color: red' })).toStrictEqual({
			display: 'inline-block',
			transform: 'rotate(90deg)',
			transformOrigin: 'center center',
		});
		expect(renderFunctionStyle('fg', { color: 'fff;background:red' })).toStrictEqual({
			display: 'inline-block',
			color: '#f00',
			overflowWrap: 'anywhere',
		});
		expect(renderFunctionStyle('border', {
			width: '1; color: red',
			radius: '2; background: red',
			color: 'fff;outline:red',
			style: 'solid;display:block',
		})).toStrictEqual({
			display: 'inline-block',
			borderWidth: '1px',
			borderStyle: 'solid',
			borderColor: 'var(--MI_THEME-accent)',
			borderRadius: '0px',
			overflow: 'clip',
		});
	});
});
