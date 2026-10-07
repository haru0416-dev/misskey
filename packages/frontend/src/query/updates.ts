/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { InvalidateQueryFilters, QueryKey, SetDataOptions } from '@tanstack/vue-query';
import { queryClient } from '@/query/client.js';

type Patch = (value: unknown) => unknown;
const pendingPatches = new WeakMap<object, Set<Patch[]>>();

// 取得中の stream 更新も応答へ適用し、取得前の snapshot に戻さない。
export async function fetchWithUpdates<T>(queryKey: QueryKey, fetch: () => Promise<T>): Promise<T> {
	const query = queryClient.getQueryCache().find({ queryKey, exact: true });
	if (query == null) return fetch();
	const patches: Patch[] = [];
	let pending = pendingPatches.get(query);
	if (pending == null) {
		pending = new Set();
		pendingPatches.set(query, pending);
	}
	pending.add(patches);
	try {
		let value: unknown = await fetch();
		for (const patch of patches) value = patch(value);
		return value as T;
	} finally {
		pending.delete(patches);
		if (pending.size === 0) pendingPatches.delete(query);
	}
}

export function patchQueryData<T>(
	queryKey: QueryKey,
	patch: (value: T | undefined) => T | undefined,
	options?: SetDataOptions,
): void {
	const query = queryClient.getQueryCache().find({ queryKey, exact: true });
	if (query == null) return;
	for (const patches of pendingPatches.get(query) ?? []) patches.push(patch as Patch);
	const invalidated = query.state.isInvalidated;
	queryClient.setQueryData<T>(queryKey, patch, options);
	// 部分更新では mutation による全体の再取得要求を解消できない。
	if (invalidated) query.invalidate();
}

export function invalidateQueries(filters: InvalidateQueryFilters): Promise<void> {
	// 初回取得にも cancelRefetch を適用する。data が無い取得は core の invalidate だけでは置換されない。
	void queryClient.cancelQueries(filters);
	// Vue の遅延 refetch は、無効化後に利用側が開始した新しい取得を再度中断しない。
	return queryClient.invalidateQueries(filters, { cancelRefetch: false });
}
