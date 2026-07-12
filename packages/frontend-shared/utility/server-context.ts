/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

export function parseJsonObject(value: string | null | undefined): Record<string, unknown> | null {
	if (value == null || value.trim() === '') return null;

	try {
		const parsed: unknown = JSON.parse(value);
		return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
			? (parsed as Record<string, unknown>)
			: null;
	} catch {
		return null;
	}
}

export function readServerContext<T>(elementId: string): T | null {
	const providedContextEl = window.document.getElementById(elementId);
	return parseJsonObject(providedContextEl?.textContent) as T | null;
}

export function assertServerContext<Ctx extends Record<string, unknown> | null, K extends keyof NonNullable<Ctx>>(
	ctx: Ctx,
	entity: K,
): ctx is Ctx & Required<Pick<NonNullable<Ctx>, K>> {
	if (ctx == null) return false;
	return entity in ctx && (ctx as NonNullable<Ctx>)[entity] != null;
}
