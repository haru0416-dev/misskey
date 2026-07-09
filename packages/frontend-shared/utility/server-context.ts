/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function readServerContext<T>(elementId: string): T | null {
	const providedContextEl = window.document.getElementById(elementId);
	return providedContextEl && providedContextEl.textContent ? JSON.parse(providedContextEl.textContent) : null;
}

export function assertServerContext<Ctx extends Record<string, unknown> | null, K extends keyof NonNullable<Ctx>>(
	ctx: Ctx,
	entity: K,
): ctx is Ctx & Required<Pick<NonNullable<Ctx>, K>> {
	if (ctx == null) return false;
	return entity in ctx && (ctx as NonNullable<Ctx>)[entity] != null;
}
