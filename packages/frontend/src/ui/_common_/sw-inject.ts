/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { post } from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { $i } from '@/i.js';
import { getAccountFromId } from '@/features/users/get-account-from-id.js';
import { deepClone } from '@/utility/clone.js';
import { mainRouter } from '@/router.js';
import { login } from '@/accounts.js';
import type { PostFormProps } from '@/types/post-form.js';

let injected = false;

type PostOptions = {
	initialText?: string;
	reply?: { id: string };
	renote?: { id: string };
};

type OrderMessage = {
	type: 'order';
	loginId?: string;
	url: string;
} & (
	| {
			order: 'push';
	  }
	| {
			order: 'post';
			options: PostOptions;
	  }
);

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeUrl(value: unknown): value is string {
	if (typeof value !== 'string' || !value.startsWith('/')) return false;
	return new URL(value, window.location.origin).origin === window.location.origin;
}

function isPostOptions(value: unknown): value is PostOptions {
	if (!isRecord(value)) return false;
	if (value['initialText'] !== undefined && typeof value['initialText'] !== 'string') return false;
	for (const key of ['reply', 'renote']) {
		const note = value[key];
		if (note !== undefined && (!isRecord(note) || typeof note['id'] !== 'string' || note['id'].length === 0))
			return false;
	}
	return true;
}

function isOrderMessage(data: unknown): data is OrderMessage {
	if (!isRecord(data) || data['type'] !== 'order' || !isSafeUrl(data['url'])) return false;
	if (data['loginId'] !== undefined && (typeof data['loginId'] !== 'string' || data['loginId'].length === 0))
		return false;
	if (data['order'] === 'push') return true;
	return data['order'] === 'post' && isPostOptions(data['options']);
}

export function swInject() {
	if (injected) return;
	injected = true;
	navigator.serviceWorker.addEventListener('message', async (ev) => {
		if (_DEV_) {
			console.log('sw msg', ev.data);
		}

		if (isRecord(ev.data) && ev.data['type'] === 'requestClientAccount') {
			ev.ports[0]?.postMessage({ loginId: $i?.id ?? null });
			return;
		}

		if (!isOrderMessage(ev.data)) return;

		if (ev.data.loginId && ev.data.loginId !== $i?.id) {
			return getAccountFromId(ev.data.loginId).then((account) => {
				if (!account) return;
				return login(account.token, ev.data.url);
			});
		}

		switch (ev.data.order) {
			case 'post': {
				const options = deepClone(ev.data.options);
				const props: PostFormProps = {
					...(options.initialText === undefined ? {} : { initialText: options.initialText }),
				};
				// プッシュ通知から来たreply,renoteはtruncateBodyが通されているため、
				// 完全なノートを取得しなおす
				if (options.reply) {
					props.reply = await misskeyApi('notes/show', { noteId: options.reply.id });
				}
				if (options.renote) {
					props.renote = await misskeyApi('notes/show', { noteId: options.renote.id });
				}
				return post(props);
			}
			case 'push':
				if (mainRouter.currentRoute.value.path === ev.data.url) {
					return window.scroll({ top: 0, behavior: 'smooth' });
				}
				return mainRouter.pushByPath(ev.data.url);
			default:
				return;
		}
	});
}
