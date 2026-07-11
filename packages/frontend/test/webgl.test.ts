/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { initShaderProgram } from '@/utility/webgl.js';

function createGl(linked = true): WebGL2RenderingContext {
	let shaderId = 0;
	return {
		VERTEX_SHADER: 1,
		FRAGMENT_SHADER: 2,
		COMPILE_STATUS: 3,
		LINK_STATUS: 4,
		createShader: vi.fn(() => ({ id: ++shaderId })),
		shaderSource: vi.fn(),
		compileShader: vi.fn(),
		getShaderParameter: vi.fn(() => true),
		getShaderInfoLog: vi.fn(() => ''),
		deleteShader: vi.fn(),
		createProgram: vi.fn(() => ({})),
		attachShader: vi.fn(),
		linkProgram: vi.fn(),
		getProgramParameter: vi.fn(() => linked),
		getProgramInfoLog: vi.fn(() => 'link error'),
		deleteProgram: vi.fn(),
	} as unknown as WebGL2RenderingContext;
}

describe('initShaderProgram', () => {
	test('releases shaders after a successful link', () => {
		const gl = createGl();

		initShaderProgram(gl, 'vertex', 'fragment');

		expect(gl.deleteShader).toHaveBeenCalledTimes(2);
		expect(gl.deleteProgram).not.toHaveBeenCalled();
	});

	test('releases the program when linking fails', () => {
		const gl = createGl(false);

		expect(() => initShaderProgram(gl, 'vertex', 'fragment')).toThrow('failed to init shader');
		expect(gl.deleteShader).toHaveBeenCalledTimes(2);
		expect(gl.deleteProgram).toHaveBeenCalledOnce();
	});
});
