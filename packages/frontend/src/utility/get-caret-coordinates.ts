/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

const copiedStyleProperties = [
	'borderBottomWidth',
	'borderLeftWidth',
	'borderRightWidth',
	'borderStyle',
	'borderTopWidth',
	'boxSizing',
	'direction',
	'fontFamily',
	'fontFeatureSettings',
	'fontKerning',
	'fontSize',
	'fontSizeAdjust',
	'fontStretch',
	'fontStyle',
	'fontVariant',
	'fontWeight',
	'letterSpacing',
	'lineHeight',
	'paddingBottom',
	'paddingLeft',
	'paddingRight',
	'paddingTop',
	'tabSize',
	'textAlign',
	'textDecoration',
	'textIndent',
	'textTransform',
	'wordSpacing',
] as const satisfies readonly (keyof CSSStyleDeclaration)[];

export function getCaretCoordinates(element: HTMLInputElement | HTMLTextAreaElement, position: number) {
	const computedStyle = getComputedStyle(element);
	const mirror = document.createElement('div');
	const isInput = element instanceof HTMLInputElement;

	mirror.style.position = 'absolute';
	mirror.style.visibility = 'hidden';
	mirror.style.overflow = 'hidden';
	mirror.style.width = computedStyle.width;
	mirror.style.height = computedStyle.height;
	mirror.style.whiteSpace = isInput ? 'pre' : 'pre-wrap';
	mirror.style.overflowWrap = 'break-word';

	for (const property of copiedStyleProperties) {
		mirror.style[property] = computedStyle[property];
	}

	if (isInput) {
		const verticalInsets =
			Number.parseFloat(computedStyle.paddingTop) +
			Number.parseFloat(computedStyle.paddingBottom) +
			Number.parseFloat(computedStyle.borderTopWidth) +
			Number.parseFloat(computedStyle.borderBottomWidth);
		if (computedStyle.boxSizing === 'border-box') {
			const contentHeight = Number.parseFloat(computedStyle.height) - verticalInsets;
			const lineHeight = Number.parseFloat(computedStyle.lineHeight);
			mirror.style.lineHeight =
				contentHeight > lineHeight
					? `${contentHeight}px`
					: contentHeight === lineHeight
						? computedStyle.lineHeight
						: '0';
		} else {
			mirror.style.lineHeight = computedStyle.height;
		}
	}

	mirror.textContent = isInput
		? element.value.slice(0, position).replaceAll(/\s/g, '\u00a0')
		: element.value.slice(0, position);

	const marker = document.createElement('span');
	marker.textContent = element.value.slice(position) || '.';
	mirror.append(marker);
	document.body.append(mirror);

	const coordinates = {
		left: marker.offsetLeft + Number.parseFloat(computedStyle.borderLeftWidth),
		top: marker.offsetTop + Number.parseFloat(computedStyle.borderTopWidth),
	};

	mirror.remove();
	return coordinates;
}
