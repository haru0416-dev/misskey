/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, render } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

const { signedInUser } = vi.hoisted(() => ({
	signedInUser: {
		id: 'test-user',
		username: 'test-user',
		avatarUrl: null,
		isSilenced: false,
		isAdmin: false,
		isModerator: false,
		notesCount: 0,
		policies: {
			scheduledNoteLimit: 0,
		},
	},
}));

vi.mock('@/i.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/i.js')>()),
	$i: signedInUser,
	ensureSignin: () => signedInUser,
}));

vi.mock('@/utility/misskey-api.js', async (importOriginal) => ({
	...(await importOriginal<typeof import('@/utility/misskey-api.js')>()),
	misskeyApi: vi.fn(async () => []),
	misskeyApiGet: vi.fn(async () => []),
}));

vi.mock('@/features/auth/please-login.js', () => ({
	pleaseLogin: vi.fn(async () => true),
}));

vi.mock('@/features/users/show-moved-dialog.js', () => ({
	showMovedDialog: vi.fn(),
}));

import MkPostForm from '@/features/post-composer/components/MkPostForm.vue';
import MkPostFormDialog from '@/features/post-composer/components/MkPostFormDialog.vue';
import { popups, post } from '@/os.js';
import { prefer } from '@/preferences.js';

describe('post form defaults', () => {
	beforeEach(() => {
		popups.value = [];
	});

	afterEach(() => {
		cleanup();
		popups.value = [];
	});

	test('os.post keeps omitted initialLocalOnly undefined through the dialog', async () => {
		const previousDefault = prefer.defaultNoteLocalOnly;
		const previousRemember = prefer.rememberNoteVisibility;
		try {
			prefer.commit('defaultNoteLocalOnly', true);
			prefer.commit('rememberNoteVisibility', false);
			void post();
			await vi.waitFor(() => expect(popups.value).toHaveLength(1));

			const popup = popups.value[0];
			if (popup == null) {
				throw new Error('Post form dialog was not opened');
			}
			const rendered = render(MkPostFormDialog, {
				props: popup.props,
				global: {
					stubs: {
						MkModal: { template: '<div><slot /></div>' },
					},
				},
			});

			expect(rendered.container.querySelector('.ti-rocket-off')).not.toBeNull();
			expect(rendered.container.querySelector('.ti-rocket')).toBeNull();
		} finally {
			prefer.commit('defaultNoteLocalOnly', previousDefault);
			prefer.commit('rememberNoteVisibility', previousRemember);
		}
	});

	test('uses the default local-only preference when initialLocalOnly is omitted', () => {
		const previousDefault = prefer.defaultNoteLocalOnly;
		const previousRemember = prefer.rememberNoteVisibility;
		try {
			prefer.commit('defaultNoteLocalOnly', true);
			prefer.commit('rememberNoteVisibility', false);
			const rendered = render(MkPostForm, {
				props: { fixed: true },
			});

			expect(rendered.container.querySelector('.ti-rocket-off')).not.toBeNull();
			expect(rendered.container.querySelector('.ti-rocket')).toBeNull();
		} finally {
			prefer.commit('defaultNoteLocalOnly', previousDefault);
			prefer.commit('rememberNoteVisibility', previousRemember);
		}
	});
});
