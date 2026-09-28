/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';

const { createTextureMock, initShaderProgramMock } = vi.hoisted(() => ({
	createTextureMock: vi.fn(() => ({})),
	initShaderProgramMock: vi.fn(() => ({})),
}));

vi.mock('@/utility/webgl.js', () => ({
	createTexture: createTextureMock,
	initShaderProgram: initShaderProgramMock,
}));

import { ImageCompositor } from '@/features/image-editor/core/ImageCompositor.js';

function createGl(): WebGL2RenderingContext {
	return {
		drawingBufferWidth: 100,
		drawingBufferHeight: 100,
		ARRAY_BUFFER: 1,
		STATIC_DRAW: 2,
		TEXTURE0: 3,
		TEXTURE_2D: 4,
		RGBA: 5,
		UNSIGNED_BYTE: 6,
		FLOAT: 7,
		FRAMEBUFFER: 8,
		TRIANGLES: 9,
		viewport: vi.fn(),
		createBuffer: vi.fn(() => ({})),
		bindBuffer: vi.fn(),
		bufferData: vi.fn(),
		activeTexture: vi.fn(),
		bindTexture: vi.fn(),
		texImage2D: vi.fn(),
		getAttribLocation: vi.fn(() => 0),
		vertexAttribPointer: vi.fn(),
		enableVertexAttribArray: vi.fn(),
		useProgram: vi.fn(),
		getUniformLocation: vi.fn(() => ({})),
		uniform1i: vi.fn(),
		uniform1f: vi.fn(),
		uniform2fv: vi.fn(),
		drawArrays: vi.fn(),
		bindFramebuffer: vi.fn(),
		deleteBuffer: vi.fn(),
		deleteProgram: vi.fn(),
		deleteTexture: vi.fn(),
		deleteFramebuffer: vi.fn(),
		getExtension: vi.fn(() => null),
	} as unknown as WebGL2RenderingContext;
}

describe('ImageCompositor', () => {
	test('caches uniforms and does not allocate an unused result texture for the final layer', () => {
		createTextureMock.mockClear();
		initShaderProgramMock.mockClear();
		const gl = createGl();
		const canvas = window.document.createElement('canvas');
		vi.spyOn(canvas, 'getContext').mockReturnValue(gl);
		const compositor = new ImageCompositor({
			canvas,
			renderWidth: 100,
			renderHeight: 100,
			image: null,
			functions: {
				test: {
					shader: 'uniform float u_amount;',
					main: ({ gl: context, u }) => context.uniform1f(u('amount'), 1),
				},
			},
		});
		const layers = [{ id: 'layer', functionId: 'test', params: {} }] as const;

		compositor.render([...layers]);
		const uniformLookups = vi.mocked(gl.getUniformLocation).mock.calls.length;
		compositor.render([...layers]);

		expect(createTextureMock).toHaveBeenCalledOnce();
		expect(gl.getUniformLocation).toHaveBeenCalledTimes(uniformLookups);
		compositor.destroy(false);
		expect(gl.deleteBuffer).toHaveBeenCalledOnce();
	});

	test('fails immediately when a compositor function requests an unknown uniform', () => {
		const gl = createGl();
		const canvas = window.document.createElement('canvas');
		vi.spyOn(canvas, 'getContext').mockReturnValue(gl);
		const compositor = new ImageCompositor({
			canvas,
			renderWidth: 100,
			renderHeight: 100,
			image: null,
			functions: {
				test: {
					shader: 'uniform float u_amount;',
					main: ({ gl: context, u }) => context.uniform1f(u('ammount'), 1),
				},
			},
		});

		expect(() => compositor.render([{ id: 'layer', functionId: 'test', params: {} }])).toThrow(
			'Unknown uniform "ammount" in image compositor function "test"',
		);
	});

	test('fails when WebGL does not expose a declared uniform', () => {
		const gl = createGl();
		vi.mocked(gl.getUniformLocation).mockImplementation((_program, name) =>
			name === 'u_amount' ? null : ({} as WebGLUniformLocation),
		);
		const canvas = window.document.createElement('canvas');
		vi.spyOn(canvas, 'getContext').mockReturnValue(gl);
		const compositor = new ImageCompositor({
			canvas,
			renderWidth: 100,
			renderHeight: 100,
			image: null,
			functions: {
				test: {
					shader: 'uniform float u_amount;',
					main: ({ gl: context, u }) => context.uniform1f(u('amount'), 1),
				},
			},
		});

		expect(() => compositor.render([{ id: 'layer', functionId: 'test', params: {} }])).toThrow(
			'Uniform "amount" is unavailable in image compositor function "test"',
		);
	});

	// 頂点属性の設定は一度だけ行い、全プログラムで共有する。どのプログラムの position も同じ位置に
	// 固定されていないと、リンク時に別の位置が割り当てられた描画用プログラムで頂点が読めなくなる。
	test('pins position to the same attribute location in every vertex shader', () => {
		initShaderProgramMock.mockClear();
		const gl = createGl();
		const canvas = window.document.createElement('canvas');
		vi.spyOn(canvas, 'getContext').mockReturnValue(gl);
		const compositor = new ImageCompositor({
			canvas,
			renderWidth: 100,
			renderHeight: 100,
			image: null,
			functions: {
				a: { shader: 'uniform float u_amount;', main: () => {} },
				b: { shader: 'uniform float u_amount;', main: () => {} },
			},
		});
		compositor.render([{ id: 'first', functionId: 'a', params: {} }]);
		compositor.render([{ id: 'second', functionId: 'b', params: {} }]);

		const vertexShaders = initShaderProgramMock.mock.calls.map((call) => (call as unknown[])[1] as string);
		expect(vertexShaders).toHaveLength(3);
		for (const source of vertexShaders) {
			expect(source).toMatch(/layout\(location = 0\) in vec2 position;/);
		}
		expect(gl.vertexAttribPointer).toHaveBeenCalledWith(0, 2, gl.FLOAT, false, 0, 0);
		expect(gl.enableVertexAttribArray).toHaveBeenCalledWith(0);
		expect(gl.getAttribLocation).not.toHaveBeenCalled();
	});
});
