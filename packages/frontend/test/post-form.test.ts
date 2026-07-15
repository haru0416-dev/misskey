/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { defineComponent, h } from 'vue';
import { cleanup, render } from '@testing-library/vue';
import { beforeEach, describe, expect, test, vi } from 'vitest';

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

function isRecord(value: unknown): value is Record<PropertyKey, unknown> {
	return typeof value === 'object' && value !== null;
}

type ComponentCandidate = Record<PropertyKey, unknown> & {
	props?: unknown;
};

type PropsCandidate = Record<PropertyKey, unknown> & {
	initialLocalOnly?: unknown;
};

type BooleanPropCandidate = Record<PropertyKey, unknown> & {
	type?: unknown;
	default?: unknown;
};

function isComponentCandidate(value: unknown): value is ComponentCandidate {
	return isRecord(value);
}

function isPropsCandidate(value: unknown): value is PropsCandidate {
	return isRecord(value);
}

function isBooleanPropCandidate(value: unknown): value is BooleanPropCandidate {
	return isRecord(value);
}

function expectUndefinedBooleanDefault(component: unknown) {
	expect(isComponentCandidate(component)).toBe(true);
	if (!isComponentCandidate(component)) return;
	expect(isPropsCandidate(component.props)).toBe(true);
	if (!isPropsCandidate(component.props)) return;
	const option = component.props.initialLocalOnly;
	expect(isBooleanPropCandidate(option)).toBe(true);
	if (!isBooleanPropCandidate(option)) return;
	expect(option.type).toBe(Boolean);
	expect(option.default).toBeTypeOf('function');
	if (typeof option.default !== 'function') return;
	expect(option.default()).toBeUndefined();
}

describe('post form defaults', () => {
	beforeEach(() => {
		cleanup();
		popups.value = [];
	});

	test('os.post keeps omitted initialLocalOnly undefined through the dialog', async () => {
		void post();
		await vi.waitFor(() => expect(popups.value).toHaveLength(1));

		const popup = popups.value[0];
		expect(popup).toBeDefined();
		if (popup == null) return;
		expect(Object.hasOwn(popup.props, 'initialLocalOnly')).toBe(false);

		let forwardedProps: Record<string, unknown> | undefined;
		const PostFormStub = defineComponent({
			inheritAttrs: false,
			setup(_, { attrs }) {
				forwardedProps = attrs;
				return () => h('div');
			},
		});
		render(MkPostFormDialog, {
			props: popup.props,
			global: {
				stubs: {
					MkModal: { template: '<div><slot /></div>' },
					MkPostForm: PostFormStub,
				},
			},
		});

		expect(forwardedProps).toBeDefined();
		expect(forwardedProps == null ? true : Object.hasOwn(forwardedProps, 'initialLocalOnly')).toBe(false);
		expectUndefinedBooleanDefault(MkPostFormDialog);
		expectUndefinedBooleanDefault(MkPostForm);
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
