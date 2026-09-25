<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.collapsed]: collapsed }]">
	<div>
		<span v-if="note.isHidden" style="opacity: 0.5">({{ i18n.ts.private }})</span>
		<span v-if="note.deletedAt" style="opacity: 0.5">({{ i18n.ts.deletedNote }})</span>
		<MkA v-if="note.replyId" :class="$style.reply" :to="`/notes/${note.replyId}`"><i class="ti ti-arrow-back-up"></i></MkA>
		<Mfm v-if="note.text" :text="note.text" :author="note.user" :nyaize="'respect'" v-bind="note.emojis === undefined ? {} : { emojiUrls: note.emojis }"/>
		<MkA v-if="note.renoteId" :class="$style.rp" :to="`/notes/${note.renoteId}`">RN: ...</MkA>
	</div>
	<details v-if="note.files && note.files.length > 0">
		<summary>({{ i18n.tsx.withNFiles({ n: note.files.length }) }})</summary>
		<MkMediaList :mediaList="note.files"/>
	</details>
	<details v-if="note.poll">
		<summary>{{ i18n.ts.poll }}</summary>
		<MkPoll
			:noteId="note.id"
			:multiple="note.poll.multiple"
			:expiresAt="note.poll.expiresAt"
			:choices="note.poll.choices"
			:author="note.user"
			v-bind="note.emojis === undefined ? {} : { emojiUrls: note.emojis }"
		/>
	</details>
	<MkA v-if="note.hasPoll && note.poll == null" :to="`/notes/${note.id}`">({{ i18n.ts.poll }})</MkA>
	<button v-if="isLong && collapsed" :class="$style.fade" class="_button" @click="collapsed = false">
		<span :class="$style.fadeLabel">{{ i18n.ts.showMore }}</span>
	</button>
	<button v-else-if="isLong && !collapsed" :class="$style.showLess" class="_button" @click="collapsed = true">
		<span :class="$style.showLessLabel">{{ i18n.ts.showLess }}</span>
	</button>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import { shouldCollapsed } from '@shared/utility/collapsed.js';
import MkMediaList from '@/features/media-viewer/components/MkMediaList.vue';
import MkPoll from '@/features/notes/components/MkPoll.vue';
import { i18n } from '@/i18n.js';

const props = defineProps<{
	note: Misskey.entities.Note;
}>();

const isLong = shouldCollapsed(props.note, []);

const collapsed = ref(isLong);
</script>

<style lang="scss" module>
@use '@shared/styles/_note-content.scss' as note-content;

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.collapsed, .fade, .fadeLabel, .reply, .root, .rp, .showLess, .showLessLabel {}

@include note-content.sub-note-content;
</style>
