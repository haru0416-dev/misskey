/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { describe, test, assert, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/vue';
import type { RenderResult } from '@testing-library/vue';
import { resetFetchMocks } from './fixtures.js';
import type { UrlPreviewSummary } from 'misskey-js/entities.js';
import { components } from '@/components/index.js';
import { directives } from '@/directives/index.js';
import MkUrlPreview from '@/features/link-preview/components/MkUrlPreview.vue';

describe('MkUrlPreview', () => {
	const renderPreviewBy = async (summary: Partial<UrlPreviewSummary>): Promise<RenderResult> => {
		if (!summary.player) {
			summary.player = {
				url: null,
				width: null,
				height: null,
				allow: [],
			};
		}

		fetchMock.mockOnceIf(
			(req) => {
				const url = new URL(req.url);
				return url.pathname === '/url';
			},
			() => {
				return {
					status: 200,
					body: JSON.stringify(summary),
				};
			},
		);

		const result = render(MkUrlPreview, {
			props: { url: summary.url! },
			global: { directives, components },
		});

		await new Promise<void>((resolve) => {
			const observer = new MutationObserver(() => {
				resolve();
				observer.disconnect();
			});
			observer.observe(result.container, { childList: true, subtree: true });
		});

		return result;
	};

	const renderAndOpenPreview = async (summary: Partial<UrlPreviewSummary>): Promise<HTMLIFrameElement | null> => {
		const mkUrlPreview = await renderPreviewBy(summary);
		const buttons = mkUrlPreview.getAllByRole('button');
		const button = buttons[0];
		if (button == null) {
			throw new Error('URL preview button was not found');
		}
		button.click();
		await Promise.resolve();

		return mkUrlPreview.container.querySelector('iframe');
	};

	afterEach(() => {
		resetFetchMocks();
		cleanup();
	});

	test('renders the description and sets up the player iframe', async () => {
		const mkUrlPreview = await renderPreviewBy({
			url: 'https://example.local',
			description: 'Mocked description',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: [],
			},
		});
		mkUrlPreview.getByText('Mocked description');
		const buttons = mkUrlPreview.getAllByRole('button');
		const playerButton = buttons[0];
		assert.exists(playerButton, 'player button should exist');
		playerButton.click();
		await Promise.resolve();
		const iframe = mkUrlPreview.container.querySelector('iframe');
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.src, 'https://example.local/player?autoplay=1&auto_play=1');
		assert.strictEqual(
			iframe?.sandbox.toString(),
			'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-storage-access-by-user-activation allow-same-origin',
		);
	});

	test('A Summaly proxy response without allow falls back to the default', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: undefined as any,
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'autoplay;encrypted-media;fullscreen');
	});

	test('Filtering the allow list from the Summaly proxy', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: null,
				allow: ['autoplay', 'camera', 'fullscreen', 'web-share'],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.allow, 'autoplay;fullscreen;web-share');
	});

	test('Having a player width should keep the fixed aspect ratio', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: 400,
				height: 200,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.parentElement?.style.paddingTop, '50%');
	});

	test('Having a player width should keep the fixed height', async () => {
		const iframe = await renderAndOpenPreview({
			url: 'https://example.local',
			player: {
				url: 'https://example.local/player',
				width: null,
				height: 200,
				allow: [],
			},
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.parentElement?.style.paddingTop, '200px');
	});

	test.each(['twitter.com', 'x.com'])('Loading a post on %s in iframe', async (host) => {
		const iframe = await renderAndOpenPreview({
			url: `https://${host}/i/web/status/1685072521782325249`,
		});
		assert.exists(iframe, 'iframe should exist');
		assert.strictEqual(iframe?.getAttribute('allow'), 'fullscreen;web-share');
		assert.strictEqual(
			iframe?.getAttribute('sandbox'),
			'allow-popups allow-popups-to-escape-sandbox allow-scripts allow-same-origin',
		);
	});
});
