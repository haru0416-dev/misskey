/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { CSSProperties } from 'vue';

// MFM の描画 (frontend の MkMfm と embed の EmMfm) で共有する、見た目だけを変える関数の計算。

type MfmFnArgs = Record<string, string | true>;

export type MfmFnStyleOptions = {
	/** アニメーションを付けるか。 */
	useAnim: boolean;
	/** 位置・拡大・x2 などの装飾を効かせるか (frontend の advancedMfm 設定)。 */
	advanced: boolean;
};

export type MfmFnStyle = {
	/** undefined は「MFM として解釈せず原文のまま出す」。 */
	style: CSSProperties | undefined;
	/** 子の描画に掛ける拡大率。 */
	scaleFactor?: number;
};

export function safeParseFloat(str: unknown): number | null {
	if (typeof str !== 'string' || str === '') {
		return null;
	}
	const num = Number(str);
	if (!Number.isFinite(num)) {
		return null;
	}
	return num;
}

export function validMfmTime(t: string | boolean | null | undefined): string | null {
	if (t == null || typeof t === 'boolean') {
		return null;
	}
	return /^-?(?:\d+(?:\.\d+)?|\.\d+)s$/.test(t) ? t : null;
}

export function validMfmColor(c: unknown): string | null {
	if (typeof c !== 'string') {
		return null;
	}
	return /^(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(c) ? c : null;
}

const BORDER_STYLES = ['hidden', 'dotted', 'dashed', 'solid', 'double', 'groove', 'ridge', 'inset', 'outset'];

/**
 * 見た目だけを変える MFM 関数 (`$[tada ...]` など) の style。
 * 要素の種類を変える関数 (x2・blur・ruby など) と未知の関数は null を返し、呼び出し側が描く。
 */
export function mfmFnStyle(name: string, args: MfmFnArgs, options: MfmFnStyleOptions): MfmFnStyle | null {
	const { useAnim, advanced } = options;
	const speedOr = (fallback: string) => validMfmTime(args['speed']) ?? fallback;
	const delay = () => validMfmTime(args['delay']) ?? '0s';
	switch (name) {
		case 'tada': {
			return {
				style: {
					fontSize: '150%',
					...(useAnim
						? { animation: `global-tada ${speedOr('1s')} linear infinite both`, animationDelay: delay() }
						: {}),
				},
			};
		}
		case 'jelly': {
			return {
				style: useAnim
					? { animation: `mfm-rubberBand ${speedOr('1s')} linear infinite both`, animationDelay: delay() }
					: {},
			};
		}
		case 'twitch': {
			return {
				style: useAnim ? { animation: `mfm-twitch ${speedOr('0.5s')} ease infinite`, animationDelay: delay() } : {},
			};
		}
		case 'shake': {
			return {
				style: useAnim ? { animation: `mfm-shake ${speedOr('0.5s')} ease infinite`, animationDelay: delay() } : {},
			};
		}
		case 'spin': {
			const direction = args['left'] ? 'reverse' : args['alternate'] ? 'alternate' : 'normal';
			const anime = args['x'] ? 'mfm-spinX' : args['y'] ? 'mfm-spinY' : 'mfm-spin';
			return {
				style: useAnim
					? {
							animation: `${anime} ${speedOr('1.5s')} linear infinite`,
							animationDirection: direction,
							animationDelay: delay(),
						}
					: {},
			};
		}
		case 'jump': {
			return {
				style: useAnim ? { animation: `mfm-jump ${speedOr('0.75s')} linear infinite`, animationDelay: delay() } : {},
			};
		}
		case 'bounce': {
			return {
				style: useAnim
					? {
							animation: `mfm-bounce ${speedOr('0.75s')} linear infinite`,
							transformOrigin: 'center bottom',
							animationDelay: delay(),
						}
					: {},
			};
		}
		case 'flip': {
			const transform = args['h'] && args['v'] ? 'scale(-1, -1)' : args['v'] ? 'scaleY(-1)' : 'scaleX(-1)';
			return { style: { transform } };
		}
		case 'font': {
			const family = (['serif', 'monospace', 'cursive', 'fantasy', 'emoji', 'math'] as const).find((f) => args[f]);
			return { style: family ? { fontFamily: family } : undefined };
		}
		case 'rainbow': {
			// アニメーションなしの代替表示は要素を変えるので、呼び出し側が描く。
			if (!useAnim) return null;
			return { style: { animation: `mfm-rainbow ${speedOr('1s')} linear infinite`, animationDelay: delay() } };
		}
		case 'rotate': {
			const degrees = safeParseFloat(args['deg']) ?? 90;
			return { style: { transform: `rotate(${degrees}deg)`, transformOrigin: 'center center' } };
		}
		case 'position': {
			if (!advanced) return { style: undefined };
			const x = safeParseFloat(args['x']) ?? 0;
			const y = safeParseFloat(args['y']) ?? 0;
			return { style: { transform: `translateX(${x}em) translateY(${y}em)` } };
		}
		case 'scale': {
			if (!advanced) return { style: {} };
			const x = Math.min(safeParseFloat(args['x']) ?? 1, 5);
			const y = Math.min(safeParseFloat(args['y']) ?? 1, 5);
			return { style: { transform: `scale(${x}, ${y})` }, scaleFactor: Math.max(x, y) };
		}
		case 'fg': {
			return { style: { color: `#${validMfmColor(args['color']) ?? 'f00'}`, overflowWrap: 'anywhere' } };
		}
		case 'bg': {
			return { style: { backgroundColor: `#${validMfmColor(args['color']) ?? 'f00'}`, overflowWrap: 'anywhere' } };
		}
		case 'border': {
			const color = validMfmColor(args['color']);
			const borderStyle = args['style'];
			const width = safeParseFloat(args['width']) ?? 1;
			const radius = safeParseFloat(args['radius']) ?? 0;
			return {
				style: {
					borderWidth: `${width}px`,
					borderStyle: typeof borderStyle === 'string' && BORDER_STYLES.includes(borderStyle) ? borderStyle : 'solid',
					borderColor: color ? `#${color}` : 'var(--MI_THEME-accent)',
					borderRadius: `${radius}px`,
					...(args['noclip'] ? {} : { overflow: 'clip' }),
				},
			};
		}
		default:
			return null;
	}
}
