/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { SnowfallAnimationScheduler, SnowfallEffect } from '@/utility/snowfall-effect.js';

describe('SnowfallAnimationScheduler', () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	test('pauses while hidden and excludes hidden time after resuming', () => {
		let hidden = false;
		vi.spyOn(window.document, 'hidden', 'get').mockImplementation(() => hidden);
		let nextFrameId = 0;
		const frames = new Map<number, FrameRequestCallback>();
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			const id = ++nextFrameId;
			frames.set(id, callback);
			return id;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => {
			frames.delete(id);
		});
		const onFrame = vi.fn();
		const scheduler = new SnowfallAnimationScheduler(onFrame);

		scheduler.start();
		expect(frames.size).toBe(1);
		let frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](100);
		expect(onFrame).toHaveBeenLastCalledWith(0, 0);

		frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](116);
		expect(onFrame).toHaveBeenLastCalledWith(16, 16);

		hidden = true;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(frames.size).toBe(0);

		hidden = false;
		window.document.dispatchEvent(new Event('visibilitychange'));
		expect(frames.size).toBe(1);
		frame = frames.entries().next().value!;
		frames.delete(frame[0]);
		frame[1](1000);
		expect(onFrame).toHaveBeenLastCalledWith(16, 0);

		scheduler.dispose();
		expect(frames.size).toBe(0);
	});

	test('advances native wind uniforms by elapsed active time, independent of frame rate', () => {
		const random = vi.spyOn(Math, 'random').mockReturnValue(0.5);
		const frames = new Map<number, FrameRequestCallback>();
		let nextId = 0;
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			frames.set(++nextId, callback);
			return nextId;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
		const contexts = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
		const programs = vi.spyOn(WebGL2RenderingContext.prototype, 'createProgram');
		const observed: { time: number; wind: number }[] = [];
		const windSamples = [1, 0.9, 1];
		for (const hz of [30, 60, 144]) {
			random.mockReturnValue(0.5);
			const effect = new SnowfallEffect({}).render();
			let randomCalls = 0;
			random.mockImplementation(() => windSamples[randomCalls++] ?? 0.5);
			try {
				const gl = contexts.mock.results.at(-1)!.value as WebGL2RenderingContext;
				const program = programs.mock.results.at(-1)!.value as WebGLProgram;
				for (let i = 0; i <= hz; i++) {
					const [id, frame] = frames.entries().next().value!;
					frames.delete(id);
					frame((i * 1000) / hz);
				}
				observed.push({
					time: gl.getUniform(program, gl.getUniformLocation(program, 'u_time')!),
					wind: gl.getUniform(program, gl.getUniformLocation(program, 'u_wind')!),
				});
			} finally {
				effect.dispose();
			}
		}
		for (const value of observed) {
			expect(value.time).toBeCloseTo(0.1, 6);
			expect(value.wind).toBeCloseTo(observed[0]!.wind, 6);
		}
	});

	test('resizes native particle count and point size without resetting elapsed animation time', () => {
		const frames = new Map<number, FrameRequestCallback>();
		let nextId = 0;
		vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
			frames.set(++nextId, callback);
			return nextId;
		});
		vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => frames.delete(id));
		const contexts = vi.spyOn(HTMLCanvasElement.prototype, 'getContext');
		const programs = vi.spyOn(WebGL2RenderingContext.prototype, 'createProgram');
		const effect = new SnowfallEffect({}).render();
		const gl = contexts.mock.results.at(-1)!.value as WebGL2RenderingContext;
		const program = programs.mock.results.at(-1)!.value as WebGLProgram;
		const canvas = gl.canvas as HTMLCanvasElement;
		const draw = vi.spyOn(gl, 'drawArrays');
		try {
			for (const time of [0, 500]) {
				const [id, frame] = frames.entries().next().value!;
				frames.delete(id);
				frame(time);
			}
			const elapsed = gl.getUniform(program, gl.getUniformLocation(program, 'u_time')!);
			canvas.style.width = '300px';
			canvas.style.height = '900px';
			window.dispatchEvent(new Event('resize'));
			expect(gl.getUniform(program, gl.getUniformLocation(program, 'u_time')!)).toBe(elapsed);
			const sizeAttribute = gl.getAttribLocation(program, 'a_size');
			const sizeBuffer = gl.getVertexAttrib(sizeAttribute, gl.VERTEX_ATTRIB_ARRAY_BUFFER_BINDING) as WebGLBuffer;
			gl.bindBuffer(gl.ARRAY_BUFFER, sizeBuffer);
			const sizes = new Float32Array(Math.ceil((canvas.offsetWidth / canvas.offsetHeight) * 1000));
			gl.getBufferSubData(gl.ARRAY_BUFFER, 0, sizes);
			expect(sizes[0]).toBeCloseTo((4 * canvas.offsetHeight * window.devicePixelRatio) / 1000);
			const [id, frame] = frames.entries().next().value!;
			frames.delete(id);
			frame(516);
			expect(draw.mock.calls.at(-1)![2]).toBe(sizes.length);
			expect(gl.getError()).toBe(gl.NO_ERROR);
		} finally {
			effect.dispose();
		}
	});
});
