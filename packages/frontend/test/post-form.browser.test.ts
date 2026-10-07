/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { cleanup, fireEvent, render, waitFor } from '@testing-library/vue';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { nextTick } from 'vue';
import type * as Misskey from 'misskey-js';
import type { MenuItem } from '@/types/menu.js';

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

vi.mock('@/features/user/show-moved-dialog.js', () => ({
	showMovedDialog: vi.fn(),
}));

vi.mock('@/os.js', { spy: true });
vi.mock('@/accounts.js', { spy: true });

import MkPostForm from '@/features/post-composer/components/MkPostForm.vue';
import MkPostFormDialog from '@/features/post-composer/components/MkPostFormDialog.vue';
import * as os from '@/os.js';
import * as Accounts from '@/accounts.js';
import { popups } from '@/os.js';
import { post } from '@/features/post-composer/post.js';
import { prefer } from '@/preferences.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { readLocalDraft, writeLocalDraft } from '@/features/post-composer/local-drafts.js';
import { parseLocalDraft, serializeLocalDraft } from '@/features/post-composer/post-form-logic.js';
import type { PostFormFields } from '@/features/post-composer/post-form-logic.js';
import MkAcct from '@/components/global/MkAcct.vue';
import MkEllipsis from '@/components/global/MkEllipsis.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkTip from '@/components/global/MkTip.vue';
import I18n from '@/components/global/I18n.vue';
import { clickAnimeDirective } from '@/directives/click-anime.js';
import { tooltipDirective } from '@/directives/tooltip.js';

const composerGlobals = {
	components: { MkAcct, MkEllipsis, MkTime, MkTip, I18n },
	directives: { 'click-anime': clickAnimeDirective, tooltip: tooltipDirective },
};

const { popup: originalPopup } = await vi.importActual<typeof import('@/os.js')>('@/os.js');

beforeEach(() => {
	window.localStorage.clear();
	vi.mocked(misskeyApi).mockReset().mockResolvedValue([]);
	vi.mocked(os.popup).mockReset();
	vi.mocked(os.popupMenu).mockReset();
	vi.mocked(os.confirm).mockReset();
	vi.mocked(Accounts.getAccountMenu).mockReset();
});

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
					...composerGlobals,
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
				global: composerGlobals,
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

const owner = { accountId: signedInUser.id };
const recipient = (id: string) => ({ id, username: id, host: null }) as Misskey.entities.UserDetailed;

function localDraft(overrides: Partial<PostFormFields> = {}) {
	return serializeLocalDraft(
		{
			text: 'saved draft',
			useCw: false,
			cw: null,
			visibility: 'specified',
			localOnly: false,
			files: [],
			poll: null,
			visibleUserIds: ['recipient-a', 'recipient-b'],
			quoteId: null,
			reactionAcceptance: null,
			scheduledAt: null,
			...overrides,
		},
		new Date(0),
	);
}

function composerInput(container: Element) {
	const input = container.querySelector<HTMLTextAreaElement>('[data-cy-post-form-text]');
	if (!input) throw new Error('Composer textarea was not rendered');
	return input;
}

function serverDraft(overrides: Partial<Misskey.entities.NoteDraft> = {}) {
	return {
		id: 'server-draft',
		text: 'server draft',
		cw: null,
		visibility: 'specified',
		localOnly: false,
		files: [],
		poll: null,
		visibleUserIds: [],
		reactionAcceptance: null,
		scheduledAt: null,
		channel: null,
		reply: null,
		renote: null,
		...overrides,
	} as Misskey.entities.NoteDraft;
}

async function serverRestorer(container: Element) {
	const menuOpened = Promise.withResolvers<(MenuItem | null)[]>();
	const dialogOpened = Promise.withResolvers<(draft: Misskey.entities.NoteDraft) => Promise<void>>();
	vi.mocked(Accounts.getAccountMenu).mockResolvedValue([]);
	vi.mocked(os.popupMenu).mockImplementation(async (items) => {
		menuOpened.resolve(items);
	});
	vi.mocked(os.popup).mockImplementation((_component, _props, events) => {
		if (!events || !('restore' in events)) return originalPopup(_component, _props, events);
		if (typeof events['restore'] !== 'function') throw new Error('Draft dialog restore callback was not supplied');
		const restore = events['restore'] as (draft: Misskey.entities.NoteDraft) => Promise<void>;
		dialogOpened.resolve(restore);
		return { dispose: vi.fn() };
	});
	const button = container.querySelector<HTMLButtonElement>('[data-cy-post-form-account]');
	if (!button) throw new Error('Account menu button was not rendered');
	await fireEvent.click(button);
	const items = await menuOpened.promise;
	const restoreItem = items.find(
		(item) => item != null && typeof item === 'object' && 'icon' in item && item.icon === 'ti ti-cloud-download',
	);
	if (
		!restoreItem ||
		typeof restoreItem !== 'object' ||
		!('action' in restoreItem) ||
		typeof restoreItem.action !== 'function'
	) {
		throw new Error('Server draft action was not opened');
	}
	await restoreItem.action(new PointerEvent('click'));
	return await dialogOpened.promise;
}

describe('post form draft ownership', () => {
	let previousMode: typeof prefer.draftRestoreMode;

	beforeEach(() => {
		previousMode = prefer.draftRestoreMode;
		prefer.commit('draftRestoreMode', 'always');
	});

	afterEach(() => {
		cleanup();
		prefer.commit('draftRestoreMode', previousMode);
		vi.restoreAllMocks();
		popups.value = [];
	});

	test('最後に削除した指名宛先は閉じて復元しても戻らない', async () => {
		writeLocalDraft(owner, localDraft(), true);
		vi.mocked(misskeyApi).mockResolvedValue([recipient('recipient-a'), recipient('recipient-b')]);
		const first = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		await waitFor(() => expect(first.container.textContent).toContain('recipient-b'));
		const remove = first.container.querySelectorAll<HTMLElement>('button .ti-x')[1]?.parentElement;
		if (!remove) throw new Error('Recipient removal button was not rendered');
		await fireEvent.click(remove);
		first.unmount();
		expect(parseLocalDraft(readLocalDraft(owner))?.visibleUserIds).toEqual(['recipient-a']);

		vi.mocked(misskeyApi).mockResolvedValue([recipient('recipient-a')]);
		const second = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		await waitFor(() => expect(second.container.textContent).toContain('recipient-a'));
		expect(second.container.textContent).not.toContain('recipient-b');
	});

	test.each([
		{ source: 'local', recipientIds: ['recipient-b'] },
		{ source: 'initialNote', recipientIds: ['recipient-b'] },
		{ source: 'local', recipientIds: [] },
		{ source: 'initialNote', recipientIds: [] },
	])('古い宛先応答は後から復元した下書きに混ざらない: %j', async ({ source, recipientIds }) => {
		const oldUsers = Promise.withResolvers<Misskey.entities.UserDetailed[]>();
		vi.mocked(misskeyApi).mockImplementation(async (_endpoint, params) => {
			if (params && 'userIds' in params && Array.isArray(params.userIds) && params.userIds.includes('recipient-a'))
				return await oldUsers.promise;
			return [recipient('recipient-b')];
		});
		if (source === 'local') writeLocalDraft(owner, localDraft({ visibleUserIds: ['recipient-a'] }), true);
		const rendered = render(MkPostForm, {
			global: composerGlobals,
			props: {
				fixed: true,
				autofocus: false,
				...(source === 'initialNote'
					? {
							initialNote: {
								text: 'initial',
								visibility: 'specified',
								visibleUserIds: ['recipient-a'],
								reactionAcceptance: null,
							} as Misskey.entities.Note,
						}
					: {}),
			},
		});
		await waitFor(() => expect(misskeyApi).toHaveBeenCalledWith('users/show', { userIds: ['recipient-a'] }));
		const restore = await serverRestorer(rendered.container);
		await restore(serverDraft({ visibleUserIds: recipientIds }));
		if (recipientIds.length > 0) {
			await waitFor(() => expect(rendered.container.textContent).toContain('recipient-b'));
		} else {
			await waitFor(() => expect(composerInput(rendered.container).value).toBe('server draft'));
		}
		oldUsers.resolve([recipient('recipient-a')]);
		await nextTick();
		await nextTick();
		expect(rendered.container.textContent).not.toContain('recipient-a');
		expect(parseLocalDraft(readLocalDraft(owner))?.visibleUserIds ?? []).toEqual(recipientIds);
	});

	test('復元確認を待つ間の入力は上書きせず保存する', async () => {
		prefer.commit('draftRestoreMode', 'ask');
		writeLocalDraft(owner, localDraft({ text: 'old text', visibleUserIds: [] }), true);
		const answer = Promise.withResolvers<{ canceled: boolean }>();
		vi.mocked(os.confirm).mockReturnValue(answer.promise);
		const rendered = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		await waitFor(() => expect(os.confirm).toHaveBeenCalled());
		await fireEvent.update(composerInput(rendered.container), 'new intent');
		answer.resolve({ canceled: false });
		await nextTick();
		await nextTick();
		expect(composerInput(rendered.container).value).toBe('new intent');
		expect(parseLocalDraft(readLocalDraft(owner))?.text).toBe('new intent');
	});

	test('閉じた後に復元確認や宛先応答が完了しても下書きを書き換えない', async () => {
		prefer.commit('draftRestoreMode', 'ask');
		writeLocalDraft(owner, localDraft(), true);
		const answer = Promise.withResolvers<{ canceled: boolean }>();
		vi.mocked(os.confirm).mockReturnValue(answer.promise);
		const first = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		await waitFor(() => expect(os.confirm).toHaveBeenCalled());
		first.unmount();
		const beforeAnswer = readLocalDraft(owner);
		answer.resolve({ canceled: false });
		await nextTick();
		await nextTick();
		expect(readLocalDraft(owner)).toEqual(beforeAnswer);
		expect(misskeyApi).not.toHaveBeenCalled();

		prefer.commit('draftRestoreMode', 'always');
		const users = Promise.withResolvers<Misskey.entities.UserDetailed[]>();
		vi.mocked(misskeyApi).mockReturnValue(users.promise);
		const second = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		await waitFor(() => expect(misskeyApi).toHaveBeenCalled());
		second.unmount();
		const beforeUsers = readLocalDraft(owner);
		users.resolve([recipient('recipient-a'), recipient('recipient-b')]);
		await nextTick();
		await nextTick();
		expect(readLocalDraft(owner)).toEqual(beforeUsers);
	});

	test('一度復元した投票とチャンネルは次の下書きに無ければ解除する', async () => {
		const rendered = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		const restore = await serverRestorer(rendered.container);
		await restore(
			serverDraft({
				visibility: 'public',
				poll: { choices: ['yes', 'no'], multiple: false, expiresAt: null },
				channel: {
					id: 'channel',
					name: 'channel name',
					color: '#000000',
					isSensitive: false,
					allowRenoteToExternal: true,
					userId: null,
				},
			}),
		);
		await waitFor(() => expect(rendered.getByDisplayValue('yes')).toBeTruthy());
		await restore(serverDraft({ visibility: 'public' }));
		await nextTick();
		expect(rendered.queryByDisplayValue('yes')).toBeNull();
		expect(rendered.container.textContent).not.toContain('channel name');
		expect(parseLocalDraft(readLocalDraft(owner))?.poll).toBeNull();
	});

	test('不正な端末投票は無視して本文を編集できる', async () => {
		const malformedDraft = { ...localDraft(), data: { text: 'malformed poll', poll: {} } };
		writeLocalDraft(owner, malformedDraft, true);
		const rendered = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		await waitFor(() => expect(composerInput(rendered.container).value).toBe('malformed poll'));
		await fireEvent.update(composerInput(rendered.container), 'still editable');
		expect(parseLocalDraft(readLocalDraft(owner))?.text).toBe('still editable');
		expect(rendered.container.querySelector('[data-cy-open-post-form-submit]')?.hasAttribute('disabled')).toBe(false);
	});

	test('送信主体の情報が変わっても開いた時の所有者へ保存する', async () => {
		const rendered = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		const openedBy = signedInUser.id;
		try {
			signedInUser.id = 'other-account';
			await fireEvent.update(composerInput(rendered.container), 'owned by opener');
			expect(parseLocalDraft(readLocalDraft({ accountId: openedBy }))?.text).toBe('owned by opener');
			expect(readLocalDraft({ accountId: 'other-account' })).toBeUndefined();
		} finally {
			signedInUser.id = openedBy;
		}
	});

	test('Vue の保存 flush 前に閉じても最後の入力を同期保存する', async () => {
		const rendered = render(MkPostForm, { props: { fixed: true, autofocus: false }, global: composerGlobals });
		const input = composerInput(rendered.container);
		input.value = 'final synchronous input';
		input.dispatchEvent(new Event('input', { bubbles: true }));
		rendered.unmount();
		expect(parseLocalDraft(readLocalDraft(owner))?.text).toBe('final synchronous input');
	});
});
