/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { defineComponent, h, KeepAlive, nextTick, ref } from 'vue';
import { DI } from '@/di.js';

vi.mock('@/utility/device-kind.js', () => ({ deviceKind: 'smartphone' }));
vi.mock('@/preferences.js', () => ({ prefer: { animation: false, 'experimental.enableFolderPageView': true } }));

import MkFolder from '@/components/layout/MkFolder.vue';
import MkFolderPage from '@/components/layout/MkFolderPage.vue';
import MkStickyContainer from '@/components/global/MkStickyContainer.vue';
import { popups } from '@/os.js';

describe('folder page ownership', () => {
	afterEach(() => {
		cleanup();
	});

	test.each(['unmount', 'inactive', 'deactivate'] as const)(
		'releases the global folder page on source %s',
		async (exit) => {
			const active = ref(true);
			const visible = ref(true);
			const CachedFolder = defineComponent({
				setup:
					(_props, { slots }) =>
					() =>
						h(KeepAlive, () => (visible.value ? h(MkFolder, null, slots) : null)),
			});
			render(
				defineComponent({
					setup: () => () =>
						h(
							'div',
							popups.value.map((popup) =>
								h(popup.component, {
									...popup.props,
									onClosed: popup.events['closed'],
									key: popup.id,
								}),
							),
						),
				}),
			);
			const owner = render(exit === 'deactivate' ? CachedFolder : MkFolder, {
				global: { components: { MkStickyContainer }, provide: { [DI.routeActive as symbol]: active } },
				slots: { label: 'Folder', default: 'Folder content' },
			});
			await fireEvent.click(owner.getByRole('button'));
			await nextTick();
			const popup = popups.value.find((candidate) => candidate.component === MkFolderPage);
			expect(popup).toBeDefined();
			if (exit === 'unmount') owner.unmount();
			else if (exit === 'inactive') active.value = false;
			else visible.value = false;
			await nextTick();
			await nextTick();
			expect(popups.value.some((candidate) => candidate.id === popup!.id)).toBe(false);
		},
	);
});
