<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.isMe]: isMe, [$style.grouped]: grouped }]">
	<MkAvatar v-if="!isMe && !grouped" :class="[$style.avatar, prefer.useStickyIcons ? $style.useSticky : null]" :user="message.fromUser!" link :preview="false"/>
	<div :class="[$style.body, message.file != null ? $style.fullWidth : null]" @contextmenu.stop="onContextmenu">
		<div :class="$style.header"><MkUserName v-if="!isMe && !grouped && prefer['chat.showSenderName'] && message.fromUser != null" :user="message.fromUser"/></div>
		<MkFukidashi :class="$style.fukidashi" :tail="isMe ? 'right' : 'left'" :fullWidth="message.file != null" :accented="isMe">
			<Mfm
				v-if="message.text"
				ref="text"
				class="_selectable"
				:text="message.text"
				:i="$i"
				:nyaize="'respect'"
				:enableEmojiMenu="true"
				:enableEmojiMenuReaction="true"
			/>
			<MkMediaList v-if="message.file" :mediaList="[message.file]"/>
		</MkFukidashi>
		<MkUrlPreview v-for="url in urls" :key="url" :url="url" :class="$style.urlPreview"/>
		<div :class="$style.footer">
			<button class="_textButton" style="color: currentColor;" :aria-label="i18n.ts.menu" @click="showMenu"><i class="ti ti-dots-circle-horizontal" aria-hidden="true"></i></button>
			<MkTime :class="$style.time" :time="message.createdAt"/>
			<MkA v-if="isSearchResult && 'toRoom' in message && message.toRoom != null" :to="`/chat/room/${message.toRoomId}`">{{ message.toRoom.name }}</MkA>
			<MkA v-if="isSearchResult && 'toUser' in message && message.toUser != null && isMe" :to="`/chat/user/${message.toUserId}`">@{{ message.toUser.username }}</MkA>
		</div>
		<TransitionGroup
			:enterActiveClass="prefer.animation ? $style.transition_reaction_enterActive : ''"
			:leaveActiveClass="prefer.animation ? $style.transition_reaction_leaveActive : ''"
			:enterFromClass="prefer.animation ? $style.transition_reaction_enterFrom : ''"
			:leaveToClass="prefer.animation ? $style.transition_reaction_leaveTo : ''"
			:moveClass="prefer.animation ? $style.transition_reaction_move : ''"
			tag="div" :class="$style.reactions"
		>
			<div v-for="record in message.reactions" :key="record.reaction + record.user.id" role="button" tabindex="0" :aria-pressed="record.user.id === $i.id" :aria-label="record.reaction" :class="[$style.reaction, record.user.id === $i.id ? $style.reactionMy : null]" @click="onReactionClick(record)" @keydown.enter.prevent="onReactionClick(record)" @keydown.space.prevent="onReactionClick(record)">
				<MkAvatar :user="record.user" :link="false" :class="$style.reactionAvatar"/>
				<MkReactionIcon
					:withTooltip="true"
					:reaction="record.reaction.replace(/^:(\w+):$/, ':$1@.:')"
					:noStyle="true"
					:class="$style.reactionIcon"
				/>
			</div>
		</TransitionGroup>
	</div>
</div>
</template>

<script lang="ts" setup>
import { computed, defineAsyncComponent, provide } from 'vue';
import * as mfm from 'mfm-js';
import * as Misskey from 'misskey-js';
import { url } from '@shared/utility/config.js';
import { isLink } from '@shared/utility/is-link.js';
import type { MenuItem } from '@/types/menu.js';
import type { NormalizedChatMessage } from './room/index.vue';
import { extractUrlFromMfm } from '@/utility/extract-url-from-mfm.js';
import MkUrlPreview from '@/features/link-preview/components/MkUrlPreview.vue';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import MkFukidashi from '@/components/overlay/MkFukidashi.vue';
import * as os from '@/os.js';
import { copyToClipboard } from '@/utility/copy-to-clipboard.js';
import MkMediaList from '@/features/media-viewer/components/MkMediaList.vue';
import { reactionPicker } from '@/features/emoji-picker/reaction-picker.js';
import * as sound from '@/features/sound/sound.js';
import MkReactionIcon from '@/features/notes/components/MkReactionIcon.vue';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { getHTMLElementOrNull } from '@/utility/get-dom-node-or-null.js';

const $i = ensureSignin();

const props = defineProps<{
	message: NormalizedChatMessage | Misskey.entities.ChatMessage;
	isSearchResult?: boolean;
	/** 同一送信者の連投の2件目以降。アバター/送信者名を省略し、行間を詰めて表示する */
	grouped?: boolean;
}>();

const isMe = computed(() => props.message.fromUserId === $i.id);
const urls = computed(() => props.message.text ? extractUrlFromMfm(mfm.parse(props.message.text)) : []);

provide(DI.mfmEmojiReactCallback, (reaction) => {
	if ($i.policies.chatAvailability !== 'available') return;

	sound.playMisskeySfx('reaction');
	misskeyApi('chat/messages/react', {
		messageId: props.message.id,
		reaction: reaction,
	});
});

function react(ev: PointerEvent) {
	if ($i.policies.chatAvailability !== 'available') return;

	const targetEl = getHTMLElementOrNull(ev.currentTarget ?? ev.target);
	if (!targetEl) return;

	reactionPicker.show(targetEl, null, async (reaction) => {
		sound.playMisskeySfx('reaction');
		misskeyApi('chat/messages/react', {
			messageId: props.message.id,
			reaction: reaction,
		});
	});
}

function onReactionClick(record: Misskey.entities.ChatMessage['reactions'][0]) {
	if ($i.policies.chatAvailability !== 'available') return;

	if (record.user.id === $i.id) {
		misskeyApi('chat/messages/unreact', {
			messageId: props.message.id,
			reaction: record.reaction,
		});
	} else {
		if (!props.message.reactions.some(r => r.user.id === $i.id && r.reaction === record.reaction)) {
			sound.playMisskeySfx('reaction');
			misskeyApi('chat/messages/react', {
				messageId: props.message.id,
				reaction: record.reaction,
			});
		}
	}
}

function onContextmenu(ev: PointerEvent) {
	if (ev.target && isLink(ev.target as HTMLElement)) return;
	if (window.getSelection()?.toString() !== '') return;

	showMenu(ev, true);
}

function showMenu(ev: PointerEvent, contextmenu = false) {
	const menu: MenuItem[] = [];

	if (!isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.reaction,
			icon: 'ti ti-mood-plus',
			action: (ev) => {
				react(ev);
			},
		});

		menu.push({
			type: 'divider',
		});
	}

	menu.push({
		text: i18n.ts.copyContent,
		icon: 'ti ti-copy',
		action: () => {
			copyToClipboard(props.message.text ?? '');
		},
	});

	menu.push({
		type: 'divider',
	});

	if (isMe.value && $i.policies.chatAvailability === 'available') {
		menu.push({
			text: i18n.ts.delete,
			icon: 'ti ti-trash',
			danger: true,
			action: () => {
				misskeyApi('chat/messages/delete', {
					messageId: props.message.id,
				});
			},
		});
	}

	if (!isMe.value && props.message.fromUser != null) {
		menu.push({
			text: i18n.ts.reportAbuse,
			icon: 'ti ti-exclamation-circle',
			action: async () => {
				const localUrl = `${url}/chat/messages/${props.message.id}`;
				const { dispose } = await os.popupAsyncWithDialog(import('@/features/abuse-reports/components/MkAbuseReportWindow.vue').then(x => x.default), {
					user: props.message.fromUser!,
					initialComment: `${localUrl}\n-----\n`,
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (contextmenu) {
		os.contextMenu(menu, ev);
	} else {
		os.popupMenu(menu, ev.currentTarget ?? ev.target);
	}
}
</script>

<style lang="scss" module>
.transition_reaction_move,
.transition_reaction_enterActive,
.transition_reaction_leaveActive {
	transition: opacity var(--MI-duration-normal) var(--MI-ease-out), transform var(--MI-duration-normal) var(--MI-ease-out) !important;
}
.transition_reaction_enterFrom,
.transition_reaction_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_reaction_leaveActive {
	position: absolute;
}

.root {
	position: relative;
	display: flex;

	&.isMe {
		flex-direction: row-reverse;
		text-align: right;

		.footer {
			flex-direction: row-reverse;
		}

		.reactions {
			justify-content: flex-end;
		}
	}
}

.avatar {
	display: block;
	width: 50px;
	height: 50px;

	&.useSticky {
		position: sticky;
		top: calc(var(--MI-space-lg) + var(--MI-stickyTop, 0px));
	}
}

// 連投2件目以降はアバターを描画しないため、margin でバブルの左端を初回行と揃える
.root.grouped:not(.isMe) > .body {
	margin-left: calc(50px + var(--MI-space-md));
}

.body {
	margin: 0 var(--MI-space-md);
	// 長文バブルが行いっぱいまで伸びると発言者の左右が判別しづらく行長も読みにくいため、
	// チャット慣習に合わせて上限を設ける (ファイル添付 = fullWidth はメディア表示優先で除外)
	max-width: min(72%, 480px);

	&.fullWidth {
		width: 100%;
		max-width: none;
	}
}

@container (max-width: 450px) {
	.avatar {
		width: 42px;
		height: 42px;
	}

	// grouped 時の左端揃えもアバター縮小に追従させる
	.root.grouped:not(.isMe) > .body {
		margin-left: calc(42px + var(--MI-space-md));
	}

	// 狭幅では折返しが増えすぎないよう上限を緩める
	.body:not(.fullWidth) {
		max-width: 80%;
	}

	.fukidashi {
		font-size: 90%;
	}
}

.header {
	min-height: var(--MI-space-xs); // fukidashiの位置調整も兼ねるため
	font-size: 80%;
}

.fukidashi {
	text-align: left;
}

.urlPreview {
	margin: var(--MI-space-sm) 0;
}

.footer {
	display: flex;
	flex-direction: row;
	gap: 0.5em;
	margin-top: var(--MI-space-xs);
	font-size: 75%;
}

.time {
	opacity: 0.5;
}

.reactions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: var(--MI-space-sm);
	margin-top: var(--MI-space-sm);

	&:empty {
		display: none;
	}
}

.reaction {
	display: flex;
	align-items: center;
	border: solid 1px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-full);
	padding: var(--MI-space-xs) var(--MI-space-sm);

	&.reactionMy {
		border-color: var(--MI_THEME-accent);
		background: var(--MI_THEME-accentedBg);
	}
}

.reactionAvatar {
	width: 24px;
	height: 24px;
	margin-right: var(--MI-space-sm);
}

.reactionIcon {
	width: 24px;
	height: 24px;
}
</style>
