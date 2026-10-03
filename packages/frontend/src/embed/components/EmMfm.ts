/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SetupContext } from 'vue';
import { renderMfm } from '@/utility/render-mfm.js';
import type { MfmEvents, MfmProps, MfmRenderEnv } from '@/utility/render-mfm.js';
import EmUrl from '@/embed/components/EmUrl.vue';
import MkTime from '@/components/global/MkTime.vue';
import EmLink from '@/embed/components/EmLink.vue';
import EmMention from '@/embed/components/EmMention.vue';
import EmEmoji from '@/embed/components/EmEmoji.vue';
import EmCustomEmoji from '@/embed/components/EmCustomEmoji.vue';
import EmA from '@/embed/components/EmA.vue';

// 埋め込みには利用者の設定が無いので、装飾は常に有効にする。コード・検索・sparkle は素の要素で描く。
const env: MfmRenderEnv = {
	components: {
		Url: EmUrl,
		Link: EmLink,
		Mention: EmMention,
		Emoji: EmEmoji,
		CustomEmoji: EmCustomEmoji,
		A: EmA,
		Time: MkTime,
	},
	advanced: true,
	animated: true,
};

export default function (props: MfmProps, { emit }: { emit: SetupContext<MfmEvents>['emit'] }) {
	return renderMfm(props, emit, env);
}
