/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { expect, test } from '@playwright/test';
import type { Locator, Page } from '@playwright/test';
import {
	closeInitialUserSetup,
	login,
	registerUser,
	resetState,
	waitForPageCarryoverGuard,
} from '../support/helpers.js';
import type { TestUser } from '../support/helpers.js';

test.describe('Virtualized note list', () => {
	let admin: TestUser;

	test.beforeEach(async ({ page }) => {
		await resetState(page);
		admin = await registerUser(page, 'admin', 'pass', true);
	});

	test.afterEach(async ({ page }) => {
		await waitForPageCarryoverGuard(page);
	});

	test('keeps a long variable-height list stable while scrolling', async ({ page }) => {
		const alice = await registerUser(page, 'alice', 'alice1234');

		for (let i = 0; i < 70; i++) {
			const response = await page.request.post('/api/notes/create', {
				data: {
					i: alice.token,
					text: Array.from({ length: (i % 8) + 1 }, (__, line) => `Virtualized note ${i + 1}, line ${line + 1}`).join(
						'\n',
					),
				},
			});
			expect(response.ok()).toBe(true);
		}

		await page.goto('/@alice/notes');
		const list = page.locator('[data-cy-notes-timeline]');
		await expect(list.locator('[data-scroll-anchor][data-index]').first()).toBeVisible();

		for (let i = 0; i < 2; i++) {
			await scrollTimeline(list, 1);
			const loadMore = page.locator('[data-cy-pagination-down]');
			await expect(loadMore).toBeVisible();
			const nextPage = page.waitForResponse(
				(response) => response.url().includes('/api/users/notes') && response.request().method() === 'POST',
			);
			await loadMore.click();
			await nextPage;
		}
		await scrollTimeline(list, 1);

		await expect
			.poll(async () => {
				return await list
					.locator('[data-index]')
					.evaluateAll((rows) => Math.max(...rows.map((row) => Number((row as HTMLElement).dataset['index']))));
			})
			.toBeGreaterThanOrEqual(60);

		const state = await list.locator('[data-index]').evaluateAll((rows) => {
			const elements = (rows as HTMLElement[])
				.slice()
				.sort((a, b) => Number(a.dataset['index']) - Number(b.dataset['index']));
			const rects = elements.map((element) => element.getBoundingClientRect());
			return {
				rowCount: elements.length,
				overlaps: rects.some((rect, i) => {
					const previous = rects[i - 1];
					return previous !== undefined && rect.top < previous.bottom - 0.5;
				}),
			};
		});
		expect(state.rowCount).toBeLessThan(30);
		expect(state.overlaps).toBe(false);

		const beforeResize = await list.locator('[data-index]').evaluateAll((rows) => {
			const target = rows[Math.floor(rows.length / 2)] as HTMLElement;
			return target.parentElement!.getBoundingClientRect().height;
		});
		await list.locator('[data-index]').evaluateAll((rows) => {
			const target = rows[Math.floor(rows.length / 2)] as HTMLElement;
			const spacer = document.createElement('div');
			spacer.dataset['virtualTestSpacer'] = 'true';
			spacer.style.height = '500px';
			target.append(spacer);
		});

		await expect
			.poll(async () => {
				return await page
					.locator('[data-virtual-test-spacer]')
					.evaluate((spacer) => spacer.parentElement!.parentElement!.getBoundingClientRect().height);
			})
			.toBeGreaterThanOrEqual(beforeResize + 499);

		const overlapsAfterResize = await page.locator('[data-virtual-test-spacer]').evaluate((spacer) => {
			const target = spacer.parentElement as HTMLElement;
			const next = target.nextElementSibling as HTMLElement | null;
			return next ? next.getBoundingClientRect().top < target.getBoundingClientRect().bottom - 0.5 : false;
		});
		expect(overlapsAfterResize).toBe(false);
	});

	test('keeps streaming, queued notes, and paging stable', async ({ page }) => {
		const alice = await registerUser(page, 'alice', 'alice1234');
		const followResponse = await page.request.post('/api/following/create', {
			data: {
				i: alice.token,
				userId: admin.id,
			},
		});
		expect(followResponse.ok()).toBe(true);

		for (let i = 0; i < 70; i++) {
			const response = await page.request.post('/api/notes/create', {
				data: {
					i: admin.token,
					text: Array.from({ length: (i % 8) + 1 }, (__, line) => `Streaming note ${i + 1}, line ${line + 1}`).join(
						'\n',
					),
				},
			});
			expect(response.ok()).toBe(true);
		}

		await login(page, 'alice', 'alice1234');
		await closeInitialUserSetup(page);

		const timeline = page.locator('[data-cy-streaming-timeline]').first();
		const list = timeline.locator('[data-cy-streaming-notes]');
		await expect(list.locator('[data-index]').first()).toBeVisible();

		for (let i = 0; i < 2; i++) {
			const previousTotalHeight = await list.evaluate((element) => element.getBoundingClientRect().height);
			await scrollTimeline(list, 1);
			await expect
				.poll(async () => {
					return await list.evaluate((element) => element.getBoundingClientRect().height);
				})
				.toBeGreaterThan(previousTotalHeight + 2000);
		}
		await scrollTimeline(list, 1);

		await expect
			.poll(async () => {
				return await list
					.locator('[data-index]')
					.evaluateAll((rows) => Math.max(...rows.map((row) => Number((row as HTMLElement).dataset['index']))));
			})
			.toBeGreaterThanOrEqual(60);

		const pagedState = await inspectVirtualRows(list);
		expect(pagedState.rowCount).toBeLessThan(30);
		expect(pagedState.overlaps).toBe(false);

		await scrollTimeline(list, 0.5);
		await expect
			.poll(async () => {
				return await list
					.locator('[data-index]')
					.evaluateAll((rows) => Math.min(...rows.map((row) => Number((row as HTMLElement).dataset['index']))));
			})
			.toBeGreaterThan(0);
		const anchorBefore = await list.evaluate((listElement) => {
			const elements = [...listElement.querySelectorAll<HTMLElement>('[data-index]')];
			let scrollElement = listElement.parentElement;
			while (scrollElement && !['auto', 'scroll'].includes(getComputedStyle(scrollElement).overflowY)) {
				scrollElement = scrollElement.parentElement;
			}
			const center = scrollElement!.getBoundingClientRect().top + scrollElement!.clientHeight / 2;
			const anchor = elements.reduce((current, element) =>
				Math.abs(element.getBoundingClientRect().top - center) < Math.abs(current.getBoundingClientRect().top - center)
					? element
					: current,
			);
			return {
				id: anchor.dataset['scrollAnchor']!,
				top: anchor.getBoundingClientRect().top,
			};
		});

		const queuedNote = await createNote(page, admin.token, 'Queued streaming note');
		await expect(timeline.locator('[data-cy-streaming-new-notes]')).toBeVisible();
		const anchorAfterQueue = await list
			.locator(`[data-scroll-anchor="${anchorBefore.id}"]`)
			.evaluate((element) => element.getBoundingClientRect().top);
		expect(Math.abs(anchorAfterQueue - anchorBefore.top)).toBeLessThan(1);

		await timeline.locator('[data-cy-streaming-new-notes]').click();
		await expect(list.locator(`[data-scroll-anchor="${queuedNote.id}"]`)).toBeVisible();
		await expect(list.locator(`[data-scroll-anchor="${queuedNote.id}"]`)).toHaveAttribute('data-index', '0');

		const directNote = await createNote(page, admin.token, 'Direct streaming note');
		await expect(list.locator(`[data-scroll-anchor="${directNote.id}"]`)).toBeVisible();
		await expect(list.locator(`[data-scroll-anchor="${directNote.id}"]`)).toHaveAttribute('data-index', '0');
		await expect(timeline.locator('[data-cy-streaming-new-notes]')).toHaveCount(0);

		const beforeResize = await list.evaluate((element) => element.getBoundingClientRect().height);
		await list
			.locator('[data-index]')
			.nth(2)
			.evaluate((row) => {
				const spacer = document.createElement('div');
				spacer.dataset['streamingVirtualTestSpacer'] = 'true';
				spacer.style.height = '500px';
				row.append(spacer);
			});
		await expect
			.poll(async () => await list.evaluate((element) => element.getBoundingClientRect().height))
			.toBeGreaterThanOrEqual(beforeResize + 499);
		const resizedState = await inspectVirtualRows(list);
		expect(resizedState.overlaps).toBe(false);
	});
});

async function createNote(page: Page, token: string, text: string): Promise<{ id: string }> {
	const response = await page.request.post('/api/notes/create', {
		data: {
			i: token,
			text,
		},
	});
	expect(response.ok()).toBe(true);
	const body = (await response.json()) as { createdNote: { id: string } };
	return body.createdNote;
}

async function scrollTimeline(list: Locator, fraction: number): Promise<void> {
	await list.evaluate((listElement, scrollFraction) => {
		let scrollElement = listElement.parentElement;
		while (scrollElement && !['auto', 'scroll'].includes(getComputedStyle(scrollElement).overflowY)) {
			scrollElement = scrollElement.parentElement;
		}
		if (scrollElement)
			scrollElement.scrollTop = (scrollElement.scrollHeight - scrollElement.clientHeight) * scrollFraction;
	}, fraction);
}

async function inspectVirtualRows(list: Locator): Promise<{ rowCount: number; overlaps: boolean }> {
	return await list.locator('[data-index]').evaluateAll((rows) => {
		const elements = (rows as HTMLElement[])
			.slice()
			.sort((a, b) => Number(a.dataset['index']) - Number(b.dataset['index']));
		const rects = elements.map((element) => element.getBoundingClientRect());
		return {
			rowCount: elements.length,
			overlaps: rects.some((rect, i) => {
				const previous = rects[i - 1];
				return previous !== undefined && rect.top < previous.bottom - 0.5;
			}),
		};
	});
}
