<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root">
	<button
		v-for="[reaction, count] in entries"
		:key="reaction"
		class="_button"
		:class="[$style.reaction, { [$style.reacted]: reaction === announcement.myReaction }]"
		:aria-pressed="reaction === announcement.myReaction"
		:disabled="busy || readonly"
		@click="toggle(reaction)"
	>
		<MkReactionIcon :class="$style.icon" :reaction="reaction"/>
		<span :class="$style.count">{{ count }}</span>
	</button>
	<button
		v-if="$i != null && !readonly"
		ref="pickerAnchor"
		class="_button"
		:class="[$style.reaction, $style.add]"
		:aria-label="i18n.ts.reaction"
		:disabled="busy"
		@click="pick"
	>
		<i class="ti ti-plus"></i>
	</button>
</div>
</template>

<script lang="ts">
/**
 * サーバーは 1 ユーザー 1 リアクションしか持たないので、別の絵文字を選んだときは
 * 付け替え (unreact してから react) になる。
 */
</script>

<script lang="ts" setup>
import { computed, ref, useTemplateRef } from 'vue';
import type * as Misskey from 'misskey-js';
import MkReactionIcon from '@/features/notes/components/MkReactionIcon.vue';
import * as os from '@/os.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { toStoredAnnouncementReaction } from '@/features/announcements/reaction-key.js';

const props = defineProps<{
	announcement: Misskey.entities.Announcement;
	/** 終了したお知らせでは件数だけ見せる (サーバー側も付け外しを受け付けない)。 */
	readonly?: boolean;
}>();

const emit = defineEmits<{
	(ev: 'updated', announcement: Misskey.entities.Announcement): void;
}>();

const busy = ref(false);
const pickerAnchor = useTemplateRef('pickerAnchor');

const entries = computed(() => Object.entries(props.announcement.reactions));

function applied(reactions: Record<string, number>, myReaction: string | null): Misskey.entities.Announcement {
	return { ...props.announcement, reactions, myReaction };
}

/** 楽観的に反映する。件数が 0 になったリアクションは表示から落とす。 */
function withDelta(reaction: string, delta: number): Record<string, number> {
	const reactions = { ...props.announcement.reactions };
	const next = (reactions[reaction] ?? 0) + delta;
	if (next <= 0) delete reactions[reaction];
	else reactions[reaction] = next;
	return reactions;
}

async function unreact(): Promise<void> {
	const current = props.announcement.myReaction;
	if (current == null) return;
	await misskeyApi('announcements/unreact', { announcementId: props.announcement.id });
	emit('updated', applied(withDelta(current, -1), null));
}

async function react(reaction: string): Promise<void> {
	await misskeyApi('announcements/react', { announcementId: props.announcement.id, reaction });
	const stored = toStoredAnnouncementReaction(reaction);
	emit('updated', applied(withDelta(stored, 1), stored));
}

async function toggle(reaction: string): Promise<void> {
	if ($i == null || busy.value || props.readonly) return;
	busy.value = true;
	try {
		if (props.announcement.myReaction === reaction) {
			await unreact();
		} else {
			await unreact();
			await react(reaction);
		}
	} catch (err) {
		os.alert({ type: 'error', text: String(err) });
	} finally {
		busy.value = false;
	}
}

async function pick(): Promise<void> {
	if (pickerAnchor.value == null) return;
	const reaction = await os.pickEmoji(pickerAnchor.value, { asReactionPicker: true });
	await toggle(reaction);
}
</script>

<style lang="scss" module>
.root {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
}

.reaction {
	display: inline-flex;
	align-items: center;
	gap: 4px;
	height: 32px;
	padding: 0 8px;
	border-radius: 4px;
	background: var(--MI_THEME-buttonBg);

	&:hover:not(:disabled) {
		background: var(--MI_THEME-buttonHoverBg);
	}

	&:disabled {
		opacity: 0.7;
	}
}

.reacted {
	background: var(--MI_THEME-accentedBg);
	color: var(--MI_THEME-accent);
}

.add {
	color: var(--MI_THEME-fgTransparentWeak);
}

.icon {
	height: 1.25em;
}

.count {
	font-size: 0.9em;
	font-variant-numeric: tabular-nums;
}
</style>
