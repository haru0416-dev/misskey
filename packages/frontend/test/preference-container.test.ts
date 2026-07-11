/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick } from 'vue';
import type { Ref } from 'vue';

const mocks = vi.hoisted(() => ({
	popupMenu: vi.fn(),
	contextMenu: vi.fn(),
	dispose: vi.fn(),
	menuState: null as null | {
		overrideByAccount: Ref<boolean>;
		sync: Ref<boolean>;
	},
}));

vi.mock('@/preferences.js', async () => {
	const { ref } = await import('vue');
	mocks.menuState = {
		overrideByAccount: ref(false),
		sync: ref(false),
	};
	return {
		prefer: {
			isAccountOverrided: () => false,
			isSyncEnabled: () => false,
			getPerPrefMenu: () => ({
				items: [],
				overrideByAccount: mocks.menuState!.overrideByAccount,
				sync: mocks.menuState!.sync,
				dispose: mocks.dispose,
			}),
		},
	};
});

vi.mock('@/os.js', () => ({
	popupMenu: mocks.popupMenu,
	contextMenu: mocks.contextMenu,
}));

import MkPreferenceContainer from '@/components/form/MkPreferenceContainer.vue';

describe('MkPreferenceContainer', () => {
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.popupMenu.mockReset();
		mocks.contextMenu.mockReset();
		mocks.dispose.mockReset();
	});

	test('reacts to menu state without polling and disposes watchers when closing', async () => {
		const setInterval = vi.spyOn(window, 'setInterval');
		const result = render(MkPreferenceContainer, {
			props: { k: 'animation' },
		});
		const button = result.container.querySelector('button');
		assert.ok(button instanceof HTMLButtonElement);

		await fireEvent.click(button);
		expect(setInterval.mock.calls.some(([, delay]) => delay === 100)).toBe(false);
		expect(mocks.popupMenu).toHaveBeenCalledOnce();

		mocks.menuState!.overrideByAccount.value = true;
		mocks.menuState!.sync.value = true;
		await nextTick();
		expect(result.container.querySelector('.ti-user-cog')).not.toBeNull();
		expect(result.container.querySelector('.ti-cloud-cog')).not.toBeNull();

		const options = mocks.popupMenu.mock.calls[0][2];
		options.onClosing();
		expect(mocks.dispose).toHaveBeenCalledOnce();

		mocks.menuState!.overrideByAccount.value = false;
		mocks.menuState!.sync.value = false;
		await nextTick();
		expect(result.container.querySelector('.ti-user-cog')).not.toBeNull();
		expect(result.container.querySelector('.ti-cloud-cog')).not.toBeNull();
	});
});
