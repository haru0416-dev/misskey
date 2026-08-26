/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { APIRequestContext } from '@playwright/test';
import { expect, test } from '../support/fixtures.js';
import { registerUser, resetState } from '../support/helpers.js';

type DriveFile = { id: string };

function svg(label: string, color: string): Buffer {
	return Buffer.from(
		`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="100%" height="100%" fill="${color}"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-family="sans-serif" font-size="72">${label}</text></svg>`,
	);
}

async function uploadImage(
	request: APIRequestContext,
	token: string,
	name: string,
	label: string,
	color: string,
): Promise<DriveFile> {
	const response = await request.post('/api/drive/files/create', {
		multipart: {
			i: token,
			force: 'true',
			name,
			file: {
				name,
				mimeType: 'image/svg+xml',
				buffer: svg(label, color),
			},
		},
	});
	expect(response.ok(), await response.text()).toBe(true);
	return (await response.json()) as DriveFile;
}

test('実画像ごとにlightboxを開いて移動・ズーム・閉じる', async ({ page }) => {
	await resetState(page);
	const admin = await registerUser(page, 'admin', 'pass', true);
	const first = await uploadImage(page.request, admin.token, 'lightbox-first.svg', 'FIRST', '#b42318');
	const second = await uploadImage(page.request, admin.token, 'lightbox-second.svg', 'SECOND', '#175cd3');
	const noteResponse = await page.request.post('/api/notes/create', {
		data: { i: admin.token, text: 'Native lightbox browser verification', fileIds: [first.id, second.id] },
	});
	expect(noteResponse.ok(), await noteResponse.text()).toBe(true);
	const note = (await noteResponse.json()) as { createdNote: { id: string } };

	const pageErrors: string[] = [];
	page.on('pageerror', (error) => pageErrors.push(error.message));

	await page.goto(`/notes/${note.createdNote.id}`);
	const firstLink = page.getByRole('link', { name: 'lightbox-first.svg' }).first();
	const secondLink = page.getByRole('link', { name: 'lightbox-second.svg' }).first();
	const firstSource = firstLink.locator('[data-marker]');
	const secondSource = secondLink.locator('[data-marker]');
	await expect(firstLink).toBeVisible();
	await expect(secondLink).toBeVisible();
	await firstLink.click();
	const dialog = page.getByRole('dialog', { name: '画像' });
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('[aria-hidden="false"]')).toContainText('lightbox-first.svg');
	await expect(dialog.locator('[aria-hidden="false"] img[src]').last()).toBeInViewport();
	await expect(firstSource).toHaveCSS('visibility', 'hidden');
	await dialog.getByRole('button', { name: '次' }).click();
	await expect(dialog.locator('[aria-hidden="false"]')).toContainText('lightbox-second.svg');
	const secondActiveImage = dialog.locator('[aria-hidden="false"] img[src]').last();
	await expect(secondActiveImage).toBeInViewport({ ratio: 0.9 });
	await expect(secondSource).toHaveCSS('visibility', 'hidden');
	const activeImage = dialog.locator('[aria-hidden="false"] img[src]').last();
	await activeImage.hover();
	await page.mouse.wheel(0, -600);
	const transformer = dialog.locator('[aria-hidden="false"] div[style*="transform:"]').first();
	await expect(transformer).not.toHaveCSS('transform', 'matrix(1, 0, 0, 1, 0, 0)');

	await page.keyboard.press('Escape');
	await expect(dialog).toBeHidden();
	await expect(firstSource).not.toHaveCSS('visibility', 'hidden');
	await expect(secondSource).not.toHaveCSS('visibility', 'hidden');

	await secondLink.click();
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('[aria-hidden="false"]')).toContainText('lightbox-second.svg');
	await expect(dialog.locator('[aria-hidden="false"] img[src]').last()).toBeInViewport();
	await page.goBack();
	await expect(dialog).toBeHidden();
	await expect(secondSource).not.toHaveCSS('visibility', 'hidden');
	expect(pageErrors).toEqual([]);
});
