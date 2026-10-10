<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="note" :class="$style.root">
	<MkAvatar :class="[$style.avatar, prefer.useStickyIcons ? $style.useSticky : null]" :user="note.user" link preview/>
	<div :class="$style.main">
		<MkNoteHeader :note="note" :mini="true"/>
		<div>
			<p v-if="note.cw != null" :class="$style.cw">
				<Mfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw" :author="note.user" :nyaize="'respect'" v-bind="note.emojis === undefined ? {} : { emojiUrls: note.emojis }"/>
				<MkCwButton v-model="showContent" :text="note.text" v-bind="{ ...(note.files === undefined ? {} : { files: note.files }), ...(note.poll === undefined ? {} : { poll: note.poll }) }"/>
			</p>
			<div v-show="note.cw == null || showContent">
				<MkSubNoteContent :class="$style.text" :note="note"/>
			</div>
		</div>
	</div>
</div>
<div v-else :class="$style.deleted">
	{{ i18n.ts.deletedNote }}
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkNoteHeader from '@/features/note/components/MkNoteHeader.vue';
import MkSubNoteContent from '@/features/note/components/MkSubNoteContent.vue';
import MkCwButton from '@/features/note/components/MkCwButton.vue';
import { i18n } from '@/i18n.js';
import { prefer } from '@/preferences.js';

const props = defineProps<{
	note: Misskey.entities.Note | null;
}>();

const showContent = ref(false);
</script>

<style lang="scss" module>
.root {
	display: flex;
	margin: 0;
	font-size: var(--MI-text-meta);
	line-height: var(--MI-leading);
}

// 名前の行と本文 1 行目の 2 行分に揃える。
.avatar {
	flex-shrink: 0;
	display: block;
	margin: 0 var(--MI-step-3) 0 0;
	width: calc(2em * var(--MI-leading));
	height: calc(2em * var(--MI-leading));
	border-radius: var(--MI-radius-lg);

	&.useSticky {
		position: sticky;
		top: calc(var(--MI-step-4) + var(--MI-stickyTop, 0px));
		left: 0;
	}
}

.main {
	flex: 1;
	min-width: 0;
}

.cw {
	cursor: default;
	display: block;
	margin: 0;
	padding: 0;
	overflow-wrap: break-word;
}

.text {
	cursor: default;
	margin: 0;
	padding: 0;
}

.deleted {
	text-align: center;
	padding: var(--MI-step-3) !important;
	--color: light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--color) 4px, var(--color) 14px);
	border-radius: 8px;
}
</style>
