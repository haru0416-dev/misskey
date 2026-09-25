/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { genId } from '@/misc/id/gen-id.js';
import { resolveDateIdPagination } from '@/misc/id-pagination.js';
import type { IdPagination } from '@/misc/id-pagination.js';

/**
 * API 引数の sinceDate/untilDate を ID 境界へ変換する。
 * これらのエンドポイントは日時 0 を「指定なし」として受けてきたため、
 * resolveDateIdPagination へ渡す前に 0 を null へ寄せて公開挙動を保つ。
 */
export function resolveApiDateIdPagination(params: {
	sinceId?: string | undefined;
	untilId?: string | undefined;
	sinceDate?: number | undefined;
	untilDate?: number | undefined;
}): IdPagination {
	return resolveDateIdPagination(
		{ gen: genId },
		{
			sinceId: params.sinceId ?? null,
			untilId: params.untilId ?? null,
			sinceDate: params.sinceDate || null,
			untilDate: params.untilDate || null,
		},
	);
}
