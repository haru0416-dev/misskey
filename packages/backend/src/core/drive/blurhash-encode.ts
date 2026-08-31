/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

/*
 * blurhash パッケージの encode と同じ出力を返す。
 * 上流実装はピクセル×成分ごとに Math.cos と Math.pow を呼ぶため 64×64・5×5 で 1 枚 7ms かかる。
 * ここでは sRGB→linear を 256 要素の表に、cos を軸ごとの表に落とし、DCT を行→列の 2 段に分離して
 * 超越関数の呼び出しを (w + h) × 成分数 + 256 回に抑える。
 */

const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';

const SRGB_TO_LINEAR = new Float64Array(256);
for (let i = 0; i < 256; i++) {
	const v = i / 255;
	SRGB_TO_LINEAR[i] = v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function linearToSrgb(value: number): number {
	const v = Math.max(0, Math.min(1, value));
	return v <= 0.0031308
		? Math.trunc(v * 12.92 * 255 + 0.5)
		: Math.trunc((1.055 * Math.pow(v, 1 / 2.4) - 0.055) * 255 + 0.5);
}

function signPow(value: number, exp: number): number {
	return (value < 0 ? -1 : 1) * Math.pow(Math.abs(value), exp);
}

function encode83(value: number, length: number): string {
	let result = '';
	for (let i = 1; i <= length; i++) {
		const digit = (Math.floor(value) / Math.pow(83, length - i)) % 83;
		result += DIGITS[Math.floor(digit)];
	}
	return result;
}

function cosineTable(size: number, components: number): Float64Array {
	const table = new Float64Array(components * size);
	for (let c = 0; c < components; c++) {
		for (let i = 0; i < size; i++) {
			table[c * size + i] = Math.cos((Math.PI * c * i) / size);
		}
	}
	return table;
}

/** RGBA 8bit ピクセル列から blurhash 文字列を計算する。 */
export function encodeBlurhash(
	pixels: Uint8ClampedArray | Uint8Array,
	width: number,
	height: number,
	componentX: number,
	componentY: number,
): string {
	if (componentX < 1 || componentX > 9 || componentY < 1 || componentY > 9) {
		throw new Error('BlurHash must have between 1 and 9 components');
	}
	if (width * height * 4 !== pixels.length) {
		throw new Error('Width and height must match the pixels array');
	}

	const cosX = cosineTable(width, componentX);
	const cosY = cosineTable(height, componentY);

	const rowSums = new Float64Array(height * componentX * 3);
	const linear = new Float64Array(width * 3);
	for (let y = 0; y < height; y++) {
		const rowOffset = y * width * 4;
		for (let x = 0; x < width; x++) {
			const p = rowOffset + x * 4;
			linear[x * 3] = SRGB_TO_LINEAR[pixels[p]!]!;
			linear[x * 3 + 1] = SRGB_TO_LINEAR[pixels[p + 1]!]!;
			linear[x * 3 + 2] = SRGB_TO_LINEAR[pixels[p + 2]!]!;
		}
		for (let cx = 0; cx < componentX; cx++) {
			let r = 0;
			let g = 0;
			let b = 0;
			const cosOffset = cx * width;
			for (let x = 0; x < width; x++) {
				const basis = cosX[cosOffset + x]!;
				r += basis * linear[x * 3]!;
				g += basis * linear[x * 3 + 1]!;
				b += basis * linear[x * 3 + 2]!;
			}
			const out = (y * componentX + cx) * 3;
			rowSums[out] = r;
			rowSums[out + 1] = g;
			rowSums[out + 2] = b;
		}
	}

	const scale = 1 / (width * height);
	const factors = new Float64Array(componentX * componentY * 3);
	for (let cy = 0; cy < componentY; cy++) {
		const cosOffset = cy * height;
		for (let cx = 0; cx < componentX; cx++) {
			const normalisation = cx === 0 && cy === 0 ? 1 : 2;
			let r = 0;
			let g = 0;
			let b = 0;
			for (let y = 0; y < height; y++) {
				const basis = cosY[cosOffset + y]!;
				const idx = (y * componentX + cx) * 3;
				r += basis * rowSums[idx]!;
				g += basis * rowSums[idx + 1]!;
				b += basis * rowSums[idx + 2]!;
			}
			const k = normalisation * scale;
			const out = (cy * componentX + cx) * 3;
			factors[out] = r * k;
			factors[out + 1] = g * k;
			factors[out + 2] = b * k;
		}
	}

	const factor = (i: number): number => factors[i] ?? 0;
	const acCount = componentX * componentY - 1;
	let hash = encode83(componentX - 1 + (componentY - 1) * 9, 1);

	let maximumValue: number;
	if (acCount > 0) {
		let actualMaximum = -Infinity;
		for (let i = 3; i < factors.length; i++) {
			actualMaximum = Math.max(actualMaximum, factor(i));
		}
		const quantised = Math.floor(Math.max(0, Math.min(82, Math.floor(actualMaximum * 166 - 0.5))));
		maximumValue = (quantised + 1) / 166;
		hash += encode83(quantised, 1);
	} else {
		maximumValue = 1;
		hash += encode83(0, 1);
	}

	hash += encode83((linearToSrgb(factor(0)) << 16) + (linearToSrgb(factor(1)) << 8) + linearToSrgb(factor(2)), 4);

	const quantiseAc = (i: number) =>
		Math.floor(Math.max(0, Math.min(18, Math.floor(signPow(factor(i) / maximumValue, 0.5) * 9 + 9.5))));
	for (let i = 1; i <= acCount; i++) {
		hash += encode83(quantiseAc(i * 3) * 19 * 19 + quantiseAc(i * 3 + 1) * 19 + quantiseAc(i * 3 + 2), 2);
	}
	return hash;
}
