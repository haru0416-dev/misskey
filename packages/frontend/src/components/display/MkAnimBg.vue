<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<canvas ref="canvasEl" style="display: block; width: 100%; height: 100%; pointer-events: none;"></canvas>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, useTemplateRef, watch } from 'vue';
import vertexShaderSource from './MkAnimBg.vertex.glsl';
import fragmentShaderSource from './MkAnimBg.fragment.glsl';
import { initShaderProgram } from '@/utility/webgl.js';
import { prefer } from '@/preferences.js';

const canvasEl = useTemplateRef('canvasEl');

const props = withDefaults(defineProps<{
	scale?: number;
	focus?: number;
}>(), {
	scale: 1.0,
	focus: 1.0,
});

let handle: ReturnType<typeof window['requestAnimationFrame']> | null = null;
let resizeObserver: ResizeObserver | null = null;
let intersectionObserver: IntersectionObserver | null = null;
let stopAnimationWatch: (() => void) | null = null;
let removeVisibilityListener: (() => void) | null = null;

onMounted(() => {
	const canvas = canvasEl.value!;
	let width = canvas.offsetWidth;
	let height = canvas.offsetHeight;
	let isVisible = true;
	let lastTimeStamp = 0;
	canvas.width = width;
	canvas.height = height;

	const maybeGl = canvas.getContext('webgl2', { premultipliedAlpha: true });
	if (maybeGl == null) return;

	const gl = maybeGl;

	gl.clearColor(0.0, 0.0, 0.0, 0.0);
	gl.clear(gl.COLOR_BUFFER_BIT);

	const positionBuffer = gl.createBuffer();
	gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);

	const shaderProgram = initShaderProgram(gl, vertexShaderSource, fragmentShaderSource);
	if (shaderProgram == null) return;

	gl.useProgram(shaderProgram);
	const u_resolution = gl.getUniformLocation(shaderProgram, 'u_resolution');
	const u_time = gl.getUniformLocation(shaderProgram, 'u_time');
	const u_spread = gl.getUniformLocation(shaderProgram, 'u_spread');
	const u_speed = gl.getUniformLocation(shaderProgram, 'u_speed');
	const u_warp = gl.getUniformLocation(shaderProgram, 'u_warp');
	const u_focus = gl.getUniformLocation(shaderProgram, 'u_focus');
	const u_itensity = gl.getUniformLocation(shaderProgram, 'u_itensity');
	const u_scale = gl.getUniformLocation(shaderProgram, 'u_scale');
	gl.uniform2fv(u_resolution, [canvas.width, canvas.height]);
	gl.uniform1f(u_spread, 1.0);
	gl.uniform1f(u_speed, 1.0);
	gl.uniform1f(u_warp, 1.0);
	gl.uniform1f(u_focus, props.focus);
	gl.uniform1f(u_itensity, 0.5);
	gl.uniform2fv(u_scale, [props.scale, props.scale]);

	const vertex = gl.getAttribLocation(shaderProgram, 'position');
	gl.enableVertexAttribArray(vertex);
	gl.vertexAttribPointer(vertex, 2, gl.FLOAT, false, 0, 0);

	const vertices = [1.0, 1.0, -1.0, 1.0, 1.0, -1.0, -1.0, -1.0];
	gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vertices), gl.DYNAMIC_DRAW);

	function draw(timeStamp: number) {
		lastTimeStamp = timeStamp;
		gl.uniform1f(u_time, timeStamp);
		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
	}

	function shouldAnimate() {
		return prefer.animation && isVisible && window.document.visibilityState === 'visible';
	}

	function stop() {
		if (handle == null) return;
		window.cancelAnimationFrame(handle);
		handle = null;
	}

	function render(timeStamp: number) {
		handle = null;
		if (!shouldAnimate()) return;
		draw(timeStamp);
		handle = window.requestAnimationFrame(render);
	}

	function start() {
		if (handle != null || !shouldAnimate()) return;
		handle = window.requestAnimationFrame(render);
	}

	function updateSize() {
		const nextWidth = canvas.offsetWidth;
		const nextHeight = canvas.offsetHeight;
		if (Math.abs(height - nextHeight) <= 2 && Math.abs(width - nextWidth) <= 2) return;

		width = nextWidth;
		height = nextHeight;
		canvas.width = width;
		canvas.height = height;
		gl.uniform2fv(u_resolution, [width, height]);
		gl.viewport(0, 0, width, height);
		if (!shouldAnimate()) draw(lastTimeStamp);
	}

	draw(0);

	resizeObserver = new ResizeObserver(updateSize);
	resizeObserver.observe(canvas);
	intersectionObserver = new IntersectionObserver(([entry]) => {
		isVisible = entry?.isIntersecting ?? false;
		if (isVisible) start();
		else stop();
	});
	intersectionObserver.observe(canvas);
	stopAnimationWatch = watch(() => prefer.animation, (animation) => {
		if (animation) start();
		else stop();
	}, { immediate: true });
	const onVisibilityChange = () => {
		if (window.document.visibilityState === 'visible') start();
		else stop();
	};
	window.document.addEventListener('visibilitychange', onVisibilityChange, { passive: true });
	removeVisibilityListener = () => window.document.removeEventListener('visibilitychange', onVisibilityChange);
});

onUnmounted(() => {
	if (handle != null) window.cancelAnimationFrame(handle);
	handle = null;
	resizeObserver?.disconnect();
	resizeObserver = null;
	intersectionObserver?.disconnect();
	intersectionObserver = null;
	stopAnimationWatch?.();
	stopAnimationWatch = null;
	removeVisibilityListener?.();
	removeVisibilityListener = null;

});
</script>
