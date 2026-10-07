/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, assert, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/vue';
import { nextTick, ref } from 'vue';
import type { Ref } from 'vue';
import { DI } from '@/di.js';

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
	beforeEach(() => {
		mocks.popupMenu.mockReturnValue(Promise.withResolvers<void>().promise);
		mocks.contextMenu.mockReturnValue(Promise.withResolvers<void>().promise);
	});
	afterEach(() => {
		cleanup();
		vi.restoreAllMocks();
		mocks.popupMenu.mockReset();
		mocks.contextMenu.mockReset();
		mocks.dispose.mockReset();
	});

	test('reacts to menu state and disposes watchers when closing', async () => {
		const result = render(MkPreferenceContainer, {
			props: { k: 'animation' },
		});
		const button = result.container.querySelector('button');
		assert.ok(button instanceof HTMLButtonElement);

		await fireEvent.click(button);
		expect(mocks.popupMenu).toHaveBeenCalledOnce();

		mocks.menuState!.overrideByAccount.value = true;
		mocks.menuState!.sync.value = true;
		await nextTick();
		expect(result.container.querySelector('.ti-user-cog')).not.toBeNull();
		expect(result.container.querySelector('.ti-cloud-cog')).not.toBeNull();

		const popupCall = mocks.popupMenu.mock.calls[0];
		assert.ok(popupCall != null);
		const options = popupCall[2];
		options.onClosing();
		expect(mocks.dispose).toHaveBeenCalledOnce();

		mocks.menuState!.overrideByAccount.value = false;
		mocks.menuState!.sync.value = false;
		await nextTick();
		expect(result.container.querySelector('.ti-user-cog')).not.toBeNull();
		expect(result.container.querySelector('.ti-cloud-cog')).not.toBeNull();
	});

	test('disposes a menu that finishes before opening, including a handled import failure', async () => {
		mocks.popupMenu.mockResolvedValue(undefined);
		const result = render(MkPreferenceContainer, { props: { k: 'animation' } });
		await fireEvent.click(result.getByRole('button'));
		await nextTick();
		expect(mocks.dispose).toHaveBeenCalledOnce();
	});

	test('releases an unresolved opening when its owner is removed', async () => {
		const pending = Promise.withResolvers<void>();
		mocks.popupMenu.mockReturnValue(pending.promise);
		const result = render(MkPreferenceContainer, { props: { k: 'animation' } });
		await fireEvent.click(result.getByRole('button'));
		result.unmount();
		expect(mocks.dispose).toHaveBeenCalledOnce();
		pending.resolve();
		await nextTick();
		expect(mocks.dispose).toHaveBeenCalledOnce();
	});

	test('releases pending menu observers immediately on a connected route exit', async () => {
		const pending = Promise.withResolvers<void>();
		mocks.popupMenu.mockReturnValue(pending.promise);
		const active = ref(true);
		const result = render(MkPreferenceContainer, {
			props: { k: 'animation' },
			global: { provide: { [DI.routeActive as symbol]: active } },
		});
		await fireEvent.click(result.getByRole('button'));
		active.value = false;
		expect(mocks.dispose).toHaveBeenCalledOnce();
		pending.resolve();
		await nextTick();
		expect(mocks.dispose).toHaveBeenCalledOnce();
	});
});
