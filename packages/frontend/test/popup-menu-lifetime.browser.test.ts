/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { afterEach, describe, expect, test, vi } from 'vitest';
import { cleanup, render } from '@testing-library/vue';
import { defineComponent, h, nextTick, ref } from 'vue';
import type * as PopupMenuModule from '@/components/overlay/MkPopupMenu.vue';
import type * as ContextMenuModule from '@/components/overlay/MkContextMenu.vue';
import { registerRouteElement } from '@/di.js';

const gates = vi.hoisted(() => ({ popup: Promise.withResolvers<void>(), context: Promise.withResolvers<void>() }));
vi.mock('@/components/overlay/MkPopupMenu.vue', async (importOriginal) => {
	await gates.popup.promise;
	return importOriginal<typeof PopupMenuModule>();
});
vi.mock('@/components/overlay/MkContextMenu.vue', async (importOriginal) => {
	await gates.context.promise;
	return importOriginal<typeof ContextMenuModule>();
});
vi.mock('@/preferences.js', () => ({ prefer: { animation: false, menuStyle: 'popup', contextMenu: 'app' } }));

import { contextMenu, popupMenu, popups, waiting } from '@/os.js';

function renderPopups() {
	render(
		defineComponent({
			setup: () => () =>
				h(
					'div',
					popups.value.map((popup) =>
						h(popup.component, {
							...popup.props,
							onClosed: popup.events['closed'],
							onClosing: popup.events['closing'],
							key: popup.id,
						}),
					),
				),
		}),
		{ global: { stubs: { transition: false, 'transition-group': false } } },
	);
}

describe('cold anchored menu lifetime', () => {
	afterEach(async () => {
		cleanup();
		popups.value = [];
		await nextTick();
	});

	test('finishes a canceled popup opening without creating a menu or taking page input', async () => {
		renderPopups();
		const source = document.createElement('button');
		const pageAction = document.createElement('button');
		document.body.append(source, pageAction);
		const existing = popups.value.map((popup) => popup.id);
		try {
			const opening = popupMenu([], source);
			source.remove();
			gates.popup.resolve();
			await opening;
			await nextTick();
			await vi.waitFor(() => expect(popups.value.map((popup) => popup.id)).toEqual(existing));
			pageAction.focus();
			expect(document.activeElement).toBe(pageAction);
		} finally {
			source.remove();
			pageAction.remove();
		}
	});

	test('finishes a canceled context menu opening after its event target disappears', async () => {
		renderPopups();
		const source = document.createElement('button');
		document.body.append(source);
		const existing = popups.value.map((popup) => popup.id);
		let opening: Promise<void> | undefined;
		source.addEventListener('contextmenu', (event) => {
			opening = contextMenu([], event as PointerEvent);
		});
		try {
			source.dispatchEvent(new PointerEvent('contextmenu', { bubbles: true, cancelable: true }));
			source.remove();
			gates.context.resolve();
			await opening;
			await nextTick();
			await vi.waitFor(() => expect(popups.value.map((popup) => popup.id)).toEqual(existing));
		} finally {
			source.remove();
		}
	});

	test('cancels a connected anchor when its captured route owner becomes inactive before opening', async () => {
		renderPopups();
		const source = document.createElement('button');
		document.body.append(source);
		const active = ref(true);
		const unregister = registerRouteElement(source, active);
		const existing = popups.value.map((popup) => popup.id);
		try {
			const opening = popupMenu([], source);
			active.value = false;
			gates.popup.resolve();
			await opening;
			await nextTick();
			expect(source.isConnected).toBe(true);
			expect(popups.value.map((popup) => popup.id)).toEqual(existing);
		} finally {
			unregister();
			source.remove();
		}
	});

	test('settles an already-open owned menu and releases input on route exit', async () => {
		renderPopups();
		gates.popup.resolve();
		const source = document.createElement('button');
		const pageAction = document.createElement('button');
		source.style.pointerEvents = 'all';
		document.body.append(source, pageAction);
		const active = ref(true);
		const unregister = registerRouteElement(source, active);
		const closing = vi.fn();
		const closed = vi.fn();
		try {
			const opening = popupMenu([], source, { onClosing: closing, onClosed: closed });
			await vi.waitFor(() => expect(source.style.pointerEvents).toBe('none'));
			active.value = false;
			await opening;
			await nextTick();
			await nextTick();
			expect(source.style.pointerEvents).toBe('all');
			expect(closing).toHaveBeenCalledOnce();
			expect(closed).toHaveBeenCalledOnce();
			pageAction.focus();
			expect(document.activeElement).toBe(pageAction);
		} finally {
			unregister();
			source.remove();
			pageAction.remove();
		}
	});

	test('does not revive a canceled opening when its route is reactivated before loading completes', async () => {
		renderPopups();
		const source = document.createElement('button');
		document.body.append(source);
		const active = ref(true);
		const unregister = registerRouteElement(source, active);
		const existing = popups.value.map((popup) => popup.id);
		try {
			const opening = popupMenu([], source);
			active.value = false;
			active.value = true;
			gates.popup.resolve();
			await opening;
			await nextTick();
			expect(popups.value.map((popup) => popup.id)).toEqual(existing);
		} finally {
			unregister();
			source.remove();
		}
	});

	test('releases input when a waiting operation finishes before its popup is mounted', async () => {
		renderPopups();
		const pageAction = document.createElement('button');
		document.body.append(pageAction);
		const existing = popups.value.map((popup) => popup.id);
		try {
			const finish = waiting();
			finish();
			await nextTick();
			await vi.waitFor(() => expect(popups.value.map((popup) => popup.id)).toEqual(existing));
			pageAction.focus();
			expect(document.activeElement).toBe(pageAction);
			expect(document.body.inert).toBe(false);
		} finally {
			pageAction.remove();
		}
	});
});
