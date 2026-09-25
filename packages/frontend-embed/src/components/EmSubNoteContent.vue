<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.collapsed]: collapsed }]">
	<div>
		<span v-if="note.isHidden" style="opacity: 0.5">({{ i18n.ts.private }})</span>
		<span v-if="note.deletedAt" style="opacity: 0.5">({{ i18n.ts.deletedNote }})</span>
		<EmA v-if="note.replyId" :class="$style.reply" :to="`/notes/${note.replyId}`"><i class="ti ti-arrow-back-up"></i></EmA>
		<EmMfm v-if="note.text" :text="note.text" :author="note.user" :nyaize="'respect'" :emojiUrls="note.emojis"/>
		<EmA v-if="note.renoteId" :class="$style.rp" :to="`/notes/${note.renoteId}`">RN: ...</EmA>
	</div>
	<details v-if="note.files && note.files.length > 0">
		<summary>({{ i18n.tsx.withNFiles({ n: note.files.length }) }})</summary>
		<EmMediaList :mediaList="note.files" :originalEntityUrl="`${url}/notes/${note.id}`"/>
	</details>
	<details v-if="note.poll">
		<summary>{{ i18n.ts.poll }}</summary>
		<EmPoll :noteId="note.id" :poll="note.poll"/>
	</details>
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
import EmMediaList from '@/components/EmMediaList.vue';
import EmPoll from '@/components/EmPoll.vue';
import { i18n } from '@/i18n.js';
import { url } from '@shared/utility/config.js';
import { shouldCollapsed } from '@shared/utility/collapsed.js';
import EmA from '@/components/EmA.vue';
import EmMfm from '@/components/EmMfm.js';

const props = defineProps<{
	note: Misskey.entities.Note;
}>();

const isLong = shouldCollapsed(props.note, []);

const collapsed = ref(isLong);
</script>

<style lang="scss" module>
@use '@shared/styles/note-content';

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.collapsed, .fade, .fadeLabel, .reply, .root, .rp, .showLess, .showLessLabel {}

@include note-content.sub-note-content;
</style>
