/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

//#region 埋め込み関連の定義

export const embeddableEntities = ['notes', 'user-timeline', 'clips', 'tags'] as const;

export type EmbeddableEntity = (typeof embeddableEntities)[number];

export const embedRouteWithScrollbar: EmbeddableEntity[] = ['clips', 'tags', 'user-timeline'];

export type EmbedParams = {
	maxHeight?: number;
	colorMode?: 'light' | 'dark';
	rounded?: boolean;
	border?: boolean;
	autoload?: boolean;
	header?: boolean;
};

export type ParsedEmbedParams = Required<Omit<EmbedParams, 'maxHeight' | 'colorMode'>> & {
	maxHeight: number | undefined;
	colorMode: 'light' | 'dark' | undefined;
};

export const defaultEmbedParams = {
	maxHeight: undefined,
	colorMode: undefined,
	rounded: true,
	border: true,
	autoload: false,
	header: true,
} as const satisfies ParsedEmbedParams;

//#endregion

export function parseEmbedParams(searchParams: URLSearchParams | string): ParsedEmbedParams {
	let _searchParams: URLSearchParams;
	if (typeof searchParams === 'string') {
		_searchParams = new URLSearchParams(searchParams);
	} else if (searchParams instanceof URLSearchParams) {
		_searchParams = searchParams;
	} else {
		throw new Error('searchParams must be URLSearchParams or string');
	}

	function convertBoolean(value: string | null): boolean | undefined {
		if (value === 'true') {
			return true;
		} else if (value === 'false') {
			return false;
		}
		return undefined;
	}

	function convertNumber(value: string | null): number | undefined {
		if (value != null && !isNaN(Number(value))) {
			return Number(value);
		}
		return undefined;
	}

	function convertColorMode(value: string | null): 'light' | 'dark' | undefined {
		if (value != null && ['light', 'dark'].includes(value)) {
			return value as 'light' | 'dark';
		}
		return undefined;
	}

	return {
		maxHeight: convertNumber(_searchParams.get('maxHeight')) ?? defaultEmbedParams.maxHeight,
		colorMode: convertColorMode(_searchParams.get('colorMode')) ?? defaultEmbedParams.colorMode,
		rounded: convertBoolean(_searchParams.get('rounded')) ?? defaultEmbedParams.rounded,
		border: convertBoolean(_searchParams.get('border')) ?? defaultEmbedParams.border,
		autoload: convertBoolean(_searchParams.get('autoload')) ?? defaultEmbedParams.autoload,
		header: convertBoolean(_searchParams.get('header')) ?? defaultEmbedParams.header,
	};
}
