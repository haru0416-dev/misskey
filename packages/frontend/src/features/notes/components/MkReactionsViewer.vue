<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="prefer.animation ? TransitionGroup : 'div'"
	:enterActiveClass="$style.transition_x_enterActive"
	:leaveActiveClass="$style.transition_x_leaveActive"
	:enterFromClass="$style.transition_x_enterFrom"
	:leaveToClass="$style.transition_x_leaveTo"
	:moveClass="$style.transition_x_move"
	tag="div" :class="$style.root"
>
	<XReaction
		v-for="[reaction, count] in _reactions"
		:key="reaction"
		:reaction="reaction"
		:reactionEmojis="props.reactionEmojis"
		:count="count"
		:isInitial="initialReactions.has(reaction)"
		:noteId="props.noteId"
		:myReaction="props.myReaction"
		@reactionToggled="onMockToggleReaction"
	/>
	<slot v-if="hasMoreReactions" name="more"></slot>
</component>
</template>

<script lang="ts">
export function requireReactionCount(reactions: Record<string, number>, reaction: string): number {
	const count = reactions[reaction];
	if (count == null) {
		throw new Error(`Reaction count is missing for the current user's reaction: ${reaction}`);
	}
	return count;
}
</script>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { inject, watch, ref } from 'vue';
import { TransitionGroup } from 'vue';
import { isSupportedEmoji } from '@shared/utility/emojilist.js';
import XReaction from '@/features/notes/components/MkReactionsViewer.Reaction.vue';
import { $i } from '@/i.js';
import { prefer } from '@/preferences.js';
import { customEmojisMap } from '@/features/custom-emojis/custom-emojis.js';
import { DI } from '@/di.js';

const props = withDefaults(defineProps<{
	noteId: Misskey.entities.Note['id'];
	reactions: Misskey.entities.Note['reactions'];
	reactionEmojis: Misskey.entities.Note['reactionEmojis'];
	myReaction: Misskey.entities.Note['myReaction'];
	maxNumber?: number;
}>(), {
	maxNumber: Infinity,
});

const mock = inject(DI.mock, false);

const emit = defineEmits<{
	(ev: 'mockUpdateMyReaction', emoji: string, delta: number): void;
}>();

const initialReactions = new Set(Object.keys(props.reactions));

const _reactions = ref<[string, number][]>([]);
const hasMoreReactions = ref(false);

if (props.myReaction != null) {
	requireReactionCount(props.reactions, props.myReaction);
}

function onMockToggleReaction(emoji: string, count: number) {
	if (!mock) return;

	const i = _reactions.value.findIndex((item) => item[0] === emoji);
	if (i < 0) return;
	const reaction = _reactions.value[i];
	if (reaction == null) return;

	emit('mockUpdateMyReaction', emoji, (count - reaction[1]));
}

function canReact(reaction: string) {
	if (!$i) return false;
	return !reaction.match(/@\w/) && (customEmojisMap.has(reaction) || isSupportedEmoji(reaction));
}

watch([() => props.reactions, () => props.maxNumber], ([newSource, maxNumber]) => {
	let newReactions: [string, number][] = [];
	hasMoreReactions.value = Object.keys(newSource).length > maxNumber;

	for (let i = 0; i < _reactions.value.length; i++) {
		const current = _reactions.value[i];
		if (current == null) continue;
		const reaction = current[0];
		const count = newSource[reaction];
		if (count != null && count !== 0) {
			current[1] = count;
			newReactions.push(current);
		}
	}

	const newReactionsNames = new Set(newReactions.map(([x]) => x));
	const sourceEntries = Object.entries(newSource);
	const reactionAvailability = prefer.showAvailableReactionsFirstInNote
		? new Map(sourceEntries.map(([reaction]) => [reaction, canReact(reaction)]))
		: null;
	newReactions = [
		...newReactions,
		...sourceEntries
			.sort(([emojiA, countA], [emojiB, countB]) => {
				if (reactionAvailability != null) {
					const emojiAIsAvailable = reactionAvailability.get(emojiA) ?? false;
					const emojiBIsAvailable = reactionAvailability.get(emojiB) ?? false;
					if (!emojiAIsAvailable && emojiBIsAvailable) return 1;
					if (emojiAIsAvailable && !emojiBIsAvailable) return -1;
					return countB - countA;
				} else {
					return countB - countA;
				}
			})
			.filter(([y], i) => i < maxNumber && !newReactionsNames.has(y)),
	];

	newReactions = newReactions.slice(0, props.maxNumber);

	if (props.myReaction && !newReactions.some(([reaction]) => reaction === props.myReaction)) {
		const count = requireReactionCount(newSource, props.myReaction);
		newReactions.push([props.myReaction, count]);
	}

	_reactions.value = newReactions;
}, { immediate: true, deep: true });
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity 0.2s cubic-bezier(0,.5,.5,1), transform 0.2s cubic-bezier(0,.5,.5,1) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: scale(0.7);
}
.transition_x_leaveActive {
	position: absolute;
}

.root {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 4px;

	&:empty {
		display: none;
	}
}
</style>
