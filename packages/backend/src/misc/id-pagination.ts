/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export type IdPaginationOptions = {
	sinceId?: string | null;
	untilId?: string | null;
};

export type DateIdPaginationOptions = IdPaginationOptions & {
	sinceDate?: number | null;
	untilDate?: number | null;
};

export type IdPagination = {
	sinceId: string | null;
	untilId: string | null;
	order: 'asc' | 'desc';
};

export type IdGenerator = {
	gen(time?: number): string;
};

export function resolveIdPagination(options: IdPaginationOptions): IdPagination {
	if (options.sinceId && options.untilId) {
		return { sinceId: options.sinceId, untilId: options.untilId, order: 'desc' };
	} else if (options.sinceId) {
		return { sinceId: options.sinceId, untilId: null, order: 'asc' };
	} else if (options.untilId) {
		return { sinceId: null, untilId: options.untilId, order: 'desc' };
	} else {
		return { sinceId: null, untilId: null, order: 'desc' };
	}
}

/** ID が指定されている場合は日時境界を参照しない。 */
export function resolveDateIdPagination(idGenerator: IdGenerator, options: DateIdPaginationOptions): IdPagination {
	if (options.sinceId || options.untilId) {
		return resolveIdPagination(options);
	}

	return resolveIdPagination({
		sinceId: options.sinceDate ? idGenerator.gen(options.sinceDate) : null,
		untilId: options.untilDate ? idGenerator.gen(options.untilDate) : null,
	});
}
