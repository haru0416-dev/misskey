<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<button
	ref="buttonEl"
	v-ripple="canToggle"
	class="_button"
	:class="[$style.root, { [$style.reacted]: myReaction == reaction, [$style.canToggle]: canToggle, [$style.small]: prefer.reactionsDisplaySize === 'small', [$style.large]: prefer.reactionsDisplaySize === 'large' }]"
	@click="toggleReaction()"
	@contextmenu.prevent.stop="menu"
>
	<MkReactionIcon style="pointer-events: none;" :class="prefer.limitWidthOfReaction ? $style.limitWidth : ''" :reaction="reaction" v-bind="reactionEmojis[reaction.substring(1, reaction.length - 1)] === undefined ? {} : { emojiUrl: reactionEmojis[reaction.substring(1, reaction.length - 1)] }"/>
	<span :class="$style.count">{{ count }}</span>
</button>
</template>

<script lang="ts" setup>
import { computed, inject, onMounted, useTemplateRef, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { getUnicodeEmojiOrNull } from '@shared/utility/emojilist.js';
import MkCustomEmojiDetailedDialog from '@/features/custom-emojis/components/MkCustomEmojiDetailedDialog.vue';
import type { MenuItem } from '@/types/menu';
import MkReactionIcon from '@/features/notes/components/MkReactionIcon.vue';
import * as os from '@/os.js';
import { misskeyApi, misskeyApiGet } from '@/utility/misskey-api.js';
import { useTooltip } from '@/composables/useTooltip.js';
import { $i } from '@/i.js';
import MkReactionEffect from '@/features/notes/components/MkReactionEffect.vue';
import { i18n } from '@/i18n.js';
import * as sound from '@/features/sound/sound.js';
import { checkReactionPermissions } from '@/features/notes/check-reaction-permissions.js';
import { customEmojisMap } from '@/features/custom-emojis/custom-emojis.js';
import { prefer } from '@/preferences.js';
import { DI } from '@/di.js';
import { noteEvents } from '@/features/notes/useNoteCapture.js';
import { mute as muteEmoji, unmute as unmuteEmoji, checkMuted as isEmojiMuted } from '@/features/custom-emojis/emoji-mute.js';
import { addToEmojiPalette } from '@/features/emoji-picker/emoji-palette.js';

const props = defineProps<{
	noteId: Misskey.entities.Note['id'];
	reaction: string;
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	count: number;
	isInitial: boolean;
}>();

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'reactionToggled', emoji: string, newCount: number): void;
}>();

const buttonEl = useTemplateRef('buttonEl');

const emojiName = computed(() => props.reaction.replaceAll(/:/g, '').replace(/@\./, ''));

const canToggle = computed(() => {
	const emoji = customEmojisMap.get(emojiName.value) ?? getUnicodeEmojiOrNull(props.reaction);

	return props.reaction.match(/@\w/) == null && $i != null && emoji != null;
});
const canGetInfo = computed(() => !props.reaction.match(/@\w/) && props.reaction.includes(':'));
const isLocalCustomEmoji = props.reaction[0] === ':' && props.reaction.includes('@.');

async function toggleReaction() {
	if (!canToggle.value) return;
	if ($i == null) return;

	const me = $i;

	const oldReaction = props.myReaction;
	if (oldReaction) {
		const confirm = await os.confirm({
			type: 'warning',
			text: oldReaction !== props.reaction ? i18n.ts.changeReactionConfirm : i18n.ts.cancelReactionConfirm,
		});
		if (confirm.canceled) return;

		if (oldReaction !== props.reaction) {
			sound.playMisskeySfx('reaction');
		}

		if (mock) {
			emit('reactionToggled', props.reaction, (props.count - 1));
			return;
		}

		misskeyApi('notes/reactions/delete', {
			noteId: props.noteId,
		}).then(() => {
			noteEvents.emit(`unreacted:${props.noteId}`, {
				userId: me.id,
				reaction: oldReaction,
			});
			if (oldReaction !== props.reaction) {
				misskeyApi('notes/reactions/create', {
					noteId: props.noteId,
					reaction: props.reaction,
				}).then(() => {
					const emoji = customEmojisMap.get(emojiName.value);
					if (emoji == null && getUnicodeEmojiOrNull(props.reaction) == null) {
						return;
					}
					noteEvents.emit(`reacted:${props.noteId}`, {
						userId: me.id,
						reaction: props.reaction,
						...(emoji === undefined ? {} : { emoji }),
					});
				});
			}
		});
	} else {
		if (prefer.confirmOnReact) {
			const confirm = await os.confirm({
				type: 'question',
				text: i18n.tsx.reactAreYouSure({ emoji: props.reaction.replace('@.', '') }),
			});

			if (confirm.canceled) return;
		}

		sound.playMisskeySfx('reaction');

		if (mock) {
			emit('reactionToggled', props.reaction, (props.count + 1));
			return;
		}

		misskeyApi('notes/reactions/create', {
			noteId: props.noteId,
			reaction: props.reaction,
		}).then(() => {
			const emoji = customEmojisMap.get(emojiName.value);
			if (emoji == null && getUnicodeEmojiOrNull(props.reaction) == null) {
				return;
			}

			noteEvents.emit(`reacted:${props.noteId}`, {
				userId: me.id,
				reaction: props.reaction,
				...(emoji === undefined ? {} : { emoji }),
			});
		});
	}
}

async function menu(ev: PointerEvent) {
	let menuItems: MenuItem[] = [];

	if (canGetInfo.value) {
		menuItems.push({
			text: i18n.ts.info,
			icon: 'ti ti-info-circle',
			action: async () => {
				const { dispose } = os.popup(MkCustomEmojiDetailedDialog, {
					emoji: await misskeyApiGet('emoji', {
						name: props.reaction.replaceAll(/:/g, '').replace(/@\./, ''),
					}),
				}, {
					closed: () => dispose(),
				});
			},
		});
	}

	if (isEmojiMuted(props.reaction).value) {
		menuItems.push({
			text: i18n.ts.emojiUnmute,
			icon: 'ti ti-mood-smile',
			action: () => {
				os.confirm({
					type: 'question',
					title: i18n.tsx.unmuteX({ x: isLocalCustomEmoji ? `:${emojiName.value}:` : props.reaction }),
				}).then(({ canceled }) => {
					if (canceled) return;
					unmuteEmoji(props.reaction);
				});
			},
		});
	} else {
		menuItems.push({
			text: i18n.ts.emojiMute,
			icon: 'ti ti-mood-off',
			action: () => {
				os.confirm({
					type: 'question',
					title: i18n.tsx.muteX({ x: isLocalCustomEmoji ? `:${emojiName.value}:` : props.reaction }),
				}).then(({ canceled }) => {
					if (canceled) return;
					muteEmoji(props.reaction);
				});
			},
		});
	}

	if (canToggle.value) {
		menuItems.push({
			text: i18n.ts.addToEmojiPalette,
			icon: 'ti ti-palette',
			action: () => {
				addToEmojiPalette(isLocalCustomEmoji ? `:${emojiName.value}:` : props.reaction);
			},
		});
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

function anime() {
	if (window.document.hidden || !prefer.animation || buttonEl.value == null) return;

	const rect = buttonEl.value.getBoundingClientRect();
	const x = rect.left + 16;
	const y = rect.top + (buttonEl.value.offsetHeight / 2);
	const { dispose } = os.popup(MkReactionEffect, { reaction: props.reaction, x, y }, {
		end: () => dispose(),
	});
}

watch(() => props.count, (newCount, oldCount) => {
	if (oldCount < newCount) anime();
});

onMounted(() => {
	if (!props.isInitial) anime();
});

if (!mock) {
	useTooltip(buttonEl, async (showing) => {
		if (buttonEl.value == null) return;

		const [reactions, XDetails] = await Promise.all([
			misskeyApiGet('notes/reactions', {
				noteId: props.noteId,
				type: props.reaction,
				limit: 10,
				_cacheKey_: props.count,
			}),
			import('@/features/notes/components/MkReactionsViewer.Details.vue').then((x) => x.default),
		]);

		const users = reactions.map(x => x.user);

		const { dispose } = os.popup(XDetails, {
			showing,
			reaction: props.reaction,
			users,
			count: props.count,
			anchorElement: buttonEl.value,
		}, {
			closed: () => dispose(),
		});
	}, 100);
}
</script>

<style lang="scss" module>
.root {
	display: inline-flex;
	height: 42px;
	padding: 0 6px;
	font-size: 1.5em;
	border-radius: 6px;
	align-items: center;
	justify-content: center;

	&.canToggle {
		background: var(--MI_THEME-buttonBg);

		&:hover {
			background: rgba(0, 0, 0, 0.1);
		}
	}

	&:not(.canToggle) {
		cursor: default;
	}

	&.small {
		height: 32px;
		font-size: 1em;
		border-radius: 4px;

		> .count {
			font-size: 0.9em;
			line-height: 32px;
		}
	}

	&.large {
		height: 52px;
		font-size: 2em;
		border-radius: 8px;

		> .count {
			font-size: 0.6em;
			line-height: 52px;
		}
	}

	&.reacted, &.reacted:hover {
		background: var(--MI_THEME-accentedBg);
		color: var(--MI_THEME-accent);
		box-shadow: 0 0 0 1px var(--MI_THEME-accent) inset;

		> .count {
			color: var(--MI_THEME-accent);
		}

		> .icon {
			filter: drop-shadow(0 0 2px rgba(0, 0, 0, 0.5));
		}
	}
}

.limitWidth {
	max-width: 70px;
	object-fit: contain;
}

.count {
	font-size: 0.7em;
	line-height: 42px;
	margin: 0 0 0 4px;
}
</style>
