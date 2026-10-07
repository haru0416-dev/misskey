/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { prefer } from './fixtures.js';
import MkAnimBg from '@/components/display/MkAnimBg.vue';
import { SnowfallEffect } from '@/utility/snowfall-effect.js';
import { initShaderProgram } from '@/utility/webgl.js';

const vertex = 'attribute vec4 position; void main() { gl_Position = position; }';
const originalAnimation = prefer.model('animation').value;

describe('native WebGL resource ownership', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		prefer.commit('animation', originalAnimation);
	});

	test('renders the background with native shaders and releases its objects on unmount', () => {
		prefer.commit('animation', false);
		const buffers = vi.spyOn(WebGL2RenderingContext.prototype, 'createBuffer');
		const programs = vi.spyOn(WebGL2RenderingContext.prototype, 'createProgram');
		const view = render(MkAnimBg);
		const canvas = view.container.querySelector('canvas')!;
		const gl = canvas.getContext('webgl2')!;
		expect(gl).not.toBeNull();
		const buffer = buffers.mock.results[0]!.value as WebGLBuffer;
		const program = programs.mock.results[0]!.value as WebGLProgram;
		expect(gl.isBuffer(buffer)).toBe(true);
		expect(gl.isProgram(program)).toBe(true);
		expect(gl.getError()).toBe(gl.NO_ERROR);

		view.unmount();
		expect(gl.isBuffer(buffer)).toBe(false);
		expect(gl.isProgram(program)).toBe(false);
	});

	test('releases the compiled vertex shader if the fragment shader fails', () => {
		const gl = document.createElement('canvas').getContext('webgl2')!;
		expect(gl).not.toBeNull();
		const shaders = vi.spyOn(gl, 'createShader');
		expect(() => initShaderProgram(gl, vertex, 'invalid fragment shader')).toThrow();
		for (const result of shaders.mock.results) {
			expect(gl.isShader(result.value as WebGLShader)).toBe(false);
		}
	});

	test('releases partial snowfall construction when texture initialization throws', () => {
		const before = document.querySelectorAll('canvas').length;
		const contexts = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
		const buffers = vi.spyOn(WebGL2RenderingContext.prototype, 'createBuffer');
		const programs = vi.spyOn(WebGL2RenderingContext.prototype, 'createProgram');
		vi.spyOn(WebGL2RenderingContext.prototype, 'createTexture').mockImplementation(() => {
			throw new Error('texture initialization failed');
		});
		expect(() => new SnowfallEffect({})).toThrow('texture initialization failed');
		const gl = contexts.mock.results.find((result) => result.value instanceof WebGL2RenderingContext)!
			.value as WebGL2RenderingContext;
		expect(document.querySelectorAll('canvas')).toHaveLength(before);
		for (const result of buffers.mock.results) expect(gl.isBuffer(result.value as WebGLBuffer)).toBe(false);
		for (const result of programs.mock.results) expect(gl.isProgram(result.value as WebGLProgram)).toBe(false);
	});

	test('does not upload a native image that finishes loading after snowfall disposal', async () => {
		const loaded = Promise.withResolvers<void>();
		const descriptor = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'onload')!;
		vi.spyOn(HTMLElement.prototype, 'onload', 'set').mockImplementation(function (this: HTMLElement, handler) {
			descriptor.set!.call(this, function (this: HTMLElement, event: Event) {
				handler?.call(this, event);
				loaded.resolve();
			});
		});
		const contexts = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
		const uploads = vi.spyOn(WebGL2RenderingContext.prototype, 'texImage2D');
		const effect = new SnowfallEffect({});
		const gl = contexts.mock.results.at(-1)!.value as WebGL2RenderingContext;
		effect.dispose();
		uploads.mockClear();
		await loaded.promise;
		expect(uploads).not.toHaveBeenCalled();
		expect(gl.getError()).toBe(gl.NO_ERROR);
	});
});
