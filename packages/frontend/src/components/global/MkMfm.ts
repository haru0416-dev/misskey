/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import type { SetupContext } from 'vue';
import { renderMfm } from '@/utility/render-mfm.js';
import type { MfmEvents, MfmProps, MfmRenderEnv } from '@/utility/render-mfm.js';
import MkUrl from '@/components/global/MkUrl.vue';
import MkTime from '@/components/global/MkTime.vue';
import MkLink from '@/features/link-preview/components/MkLink.vue';
import MkMention from '@/features/user/components/MkMention.vue';
import MkEmoji from '@/components/global/MkEmoji.vue';
import MkCustomEmoji from '@/components/global/MkCustomEmoji.vue';
import { getHashtagMenu } from '@/features/note/get-hashtag-menu.js';
import MkCode from '@/features/code/components/MkCode.vue';
import MkCodeInline from '@/features/code/components/MkCodeInline.vue';
import MkGoogle from '@/features/search/components/MkGoogle.vue';
import MkSparkle from '@/components/effects/MkSparkle.vue';
import MkA from '@/components/global/MkA.vue';
import { prefer } from '@/preferences.js';

const components: MfmRenderEnv['components'] = {
	Url: MkUrl,
	Link: MkLink,
	Mention: MkMention,
	Emoji: MkEmoji,
	CustomEmoji: MkCustomEmoji,
	A: MkA,
	Time: MkTime,
	Code: MkCode,
	CodeInline: MkCodeInline,
	Search: MkGoogle,
	Sparkle: MkSparkle,
};

export default function (props: MfmProps, { emit }: { emit: SetupContext<MfmEvents>['emit'] }) {
	return renderMfm(props, emit, {
		components,
		advanced: prefer.advancedMfm,
		animated: prefer.animatedMfm,
		hashtagContextMenu: getHashtagMenu,
	});
}
