<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="[$style.root, { [$style.children]: depth > 1 }]">
	<div :class="$style.main">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<EmAvatar :class="$style.avatar" :user="note.user" link preview/>
		<div :class="$style.body">
			<EmNoteHeader :class="$style.header" :note="note" :mini="true"/>
			<div>
				<p v-if="note.cw != null" :class="$style.cw">
					<EmMfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw" :author="note.user" :nyaize="'respect'"/>
					<button style="display: block; width: 100%;" class="_buttonGray _buttonRounded" @click="showContent = !showContent">{{ showContent ? i18n.ts._cw.hide : i18n.ts._cw.show }}</button>
				</p>
				<div v-show="note.cw == null || showContent">
					<EmSubNoteContent :class="$style.text" :note="note"/>
				</div>
			</div>
		</div>
	</div>
	<template v-if="depth < 5">
		<EmNoteSub v-for="reply in replies" :key="reply.id" :note="reply" :class="$style.reply" :detail="true" :depth="depth + 1"/>
	</template>
	<div v-else :class="$style.more">
		<EmA class="_link" :to="notePage(note)">{{ i18n.ts.continueThread }} <i class="ti ti-chevron-double-right"></i></EmA>
	</div>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import EmA from '@/components/EmA.vue';
import EmAvatar from '@/components/EmAvatar.vue';
import EmNoteHeader from '@/components/EmNoteHeader.vue';
import EmSubNoteContent from '@/components/EmSubNoteContent.vue';
import { notePage } from '@/utils.js';
import { misskeyApi } from '@/misskey-api.js';
import { i18n } from '@/i18n.js';
import EmMfm from '@/components/EmMfm.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note;
	detail?: boolean;

	// 詳細表示中のノートとの間にあるノートの数
	depth?: number;
}>(), {
	depth: 1,
});

const showContent = ref(false);
const replies = ref<Misskey.entities.Note[]>([]);

if (props.detail) {
	misskeyApi('notes/children', {
		noteId: props.note.id,
		limit: 5,
	}).then(res => {
		replies.value = res;
	});
}
</script>

<style lang="scss" module>
@use '@shared/styles/_note-sub.scss' as note-sub;

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.avatar, .body, .children, .colorBar, .cw, .header, .main, .more, .reply, .root, .text {}

@include note-sub.base;
</style>
