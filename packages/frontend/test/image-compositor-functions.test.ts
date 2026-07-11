/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, expect, test, vi } from 'vitest';
import { fn as blockNoise } from '@/utility/image-compositor-functions/blockNoise.js';
import { fn as tearing } from '@/utility/image-compositor-functions/tearing.js';

describe('image compositor functions', () => {
	test('cache dynamic array uniform locations per program', () => {
		const gl = {
			getUniformLocation: vi.fn(() => ({})),
			uniform1i: vi.fn(),
			uniform1f: vi.fn(),
			uniform2f: vi.fn(),
		} as unknown as WebGL2RenderingContext;
		const program = {} as WebGLProgram;
		const common = { gl, program, width: 100, height: 100, textures: new Map() };
		const blockContext = {
			...common,
			u: { amount: {} as WebGLUniformLocation, channelShift: {} as WebGLUniformLocation },
			params: { amount: 2, strength: 0.1, width: 0.2, height: 0.2, channelShift: 0, seed: 1 },
		};
		const tearingContext = {
			...common,
			u: { amount: {} as WebGLUniformLocation, channelShift: {} as WebGLUniformLocation },
			params: { amount: 2, strength: 0.1, size: 0.2, channelShift: 0, seed: 1 },
		};

		blockNoise.main(blockContext);
		tearing.main(tearingContext);
		expect(gl.getUniformLocation).toHaveBeenCalledTimes(12);
		blockNoise.main(blockContext);
		tearing.main(tearingContext);
		expect(gl.getUniformLocation).toHaveBeenCalledTimes(12);
	});
});
