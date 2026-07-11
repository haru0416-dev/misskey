/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

declare const _LANGS_: string[][];
declare const _VERSION_: string;
declare const _ENV_: string;
declare const _DEV_: boolean;
declare const _PERF_PREFIX_: string;

// for dev-mode
declare const _LANGS_FULL_: string[][];

// TagCanvas
interface TagCanvasOptions {
	textColour: string;
	outlineColour: string;
	outlineRadius: number;
	initial: [number, number];
	frontSelect: boolean;
	imageRadius: number;
	dragThreshold: number;
	wheelZoom: boolean;
	reverse: boolean;
	depth: number;
	maxSpeed: number;
	minSpeed: number;
	stretchX: number;
	stretchY: number;
}

interface TagCanvasApi {
	Start(canvasId: string, tagsId: string, options: TagCanvasOptions): void;
	Delete(canvasId: string): void;
	Update(canvasId: string): void;
}

interface Window {
	TagCanvas?: TagCanvasApi;
}
