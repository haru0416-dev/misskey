/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { ImageEffectorFxParamDefs } from './ImageEffector.js';
import type { ImageCompositorFunction } from '@/features/image-editor/core/ImageCompositor.js';
import { i18n } from '@/i18n.js';

// fill/blur/pixelate が共有する矩形・楕円の適用範囲。
// シェーダー側の u_offset/u_scale/u_ellipse/u_angle と名前・スケールを揃える必要がある。
export type ImageEffectorRegionParams = {
	offsetX: number;
	offsetY: number;
	scaleX: number;
	scaleY: number;
	ellipse: boolean;
	angle: number;
};

type Ctx = Parameters<ImageCompositorFunction<ImageEffectorRegionParams>['main']>[0];

export function setRegionUniforms({ gl, u, params }: Pick<Ctx, 'gl' | 'u' | 'params'>) {
	gl.uniform2f(u('offset'), params.offsetX / 2, params.offsetY / 2);
	gl.uniform2f(u('scale'), params.scaleX / 2, params.scaleY / 2);
	gl.uniform1i(u('ellipse'), params.ellipse ? 1 : 0);
	gl.uniform1f(u('angle'), params.angle / 2);
}

export const regionParamDefs = {
	offsetX: {
		label: i18n.ts._imageEffector._fxProps.offset + ' X',
		type: 'number',
		default: 0.0,
		min: -1.0,
		max: 1.0,
		step: 0.01,
		toViewValue: (v) => Math.round(v * 100) + '%',
	},
	offsetY: {
		label: i18n.ts._imageEffector._fxProps.offset + ' Y',
		type: 'number',
		default: 0.0,
		min: -1.0,
		max: 1.0,
		step: 0.01,
		toViewValue: (v) => Math.round(v * 100) + '%',
	},
	scaleX: {
		label: i18n.ts._imageEffector._fxProps.scale + ' W',
		type: 'number',
		default: 0.5,
		min: 0.0,
		max: 1.0,
		step: 0.01,
		toViewValue: (v) => Math.round(v * 100) + '%',
	},
	scaleY: {
		label: i18n.ts._imageEffector._fxProps.scale + ' H',
		type: 'number',
		default: 0.5,
		min: 0.0,
		max: 1.0,
		step: 0.01,
		toViewValue: (v) => Math.round(v * 100) + '%',
	},
	ellipse: {
		label: i18n.ts._imageEffector._fxProps.circle,
		type: 'boolean',
		default: false,
	},
	angle: {
		label: i18n.ts._imageEffector._fxProps.angle,
		type: 'number',
		default: 0,
		min: -1.0,
		max: 1.0,
		step: 0.01,
		toViewValue: (v) => Math.round(v * 90) + '°',
	},
} satisfies ImageEffectorFxParamDefs;
