/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { computed } from 'vue';
import type { ComputedRef } from 'vue';

// frontend の MkCustomEmoji と embed の EmCustomEmoji が、同じ規則でカスタム絵文字の画像 URL を決めるための共通処理。
// 絵文字一覧とメディアプロキシはアプリごとに別物なので呼び出し側から渡す。

type CustomEmojiUrlProps = {
	readonly name: string;
	readonly host?: string | null | undefined;
	readonly url?: string | undefined;
	readonly useOriginalSize?: boolean | undefined;
};

type CustomEmojiUrlDeps = {
	readonly emojisMap: ReadonlyMap<string, { url: string }>;
	readonly getProxiedImageUrl: (
		imageUrl: string,
		type: 'emoji' | undefined,
		mustOrigin: boolean,
		noFallback: boolean,
	) => string;
};

export function useCustomEmojiUrl(
	props: CustomEmojiUrlProps,
	deps: CustomEmojiUrlDeps,
): {
	customEmojiName: ComputedRef<string>;
	isLocal: ComputedRef<boolean>;
	/** 絵文字が見つからない場合は undefined。 */
	url: ComputedRef<string | undefined>;
	alt: ComputedRef<string>;
} {
	const customEmojiName = computed(() =>
		(props.name[0] === ':' ? props.name.substring(1, props.name.length - 1) : props.name).replace('@.', ''),
	);
	const isLocal = computed(
		() => !props.host && (customEmojiName.value.endsWith('@.') || !customEmojiName.value.includes('@')),
	);

	const rawUrl = computed(() => {
		if (props.url) {
			return props.url;
		}
		if (isLocal.value) {
			return deps.emojisMap.get(customEmojiName.value)?.url ?? null;
		}
		return props.host ? `/emoji/${customEmojiName.value}@${props.host}.webp` : `/emoji/${customEmojiName.value}.webp`;
	});

	// `/emoji/` はサーバー側でメディアプロキシへリダイレクトされるので、ここでは重ねてプロキシしない。
	const url = computed(() => {
		if (rawUrl.value == null) {
			return undefined;
		}

		return rawUrl.value.startsWith('/emoji/') || (props.useOriginalSize && isLocal.value)
			? rawUrl.value
			: deps.getProxiedImageUrl(rawUrl.value, props.useOriginalSize ? undefined : 'emoji', false, true);
	});

	const alt = computed(() => `:${customEmojiName.value}:`);

	return { customEmojiName, isLocal, url, alt };
}
