<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div v-if="note == null" :class="$style.deleted">
	{{ i18n.ts.deletedNote }}
</div>
<div v-else-if="!muted" :class="[$style.root, { [$style.children]: depth > 1 }]">
	<div :class="$style.main">
		<div v-if="note.channel" :class="$style.colorBar" :style="{ background: note.channel.color }"></div>
		<MkAvatar :class="$style.avatar" :user="note.user" link preview/>
		<div :class="$style.body">
			<MkNoteHeader :class="$style.header" :note="note" :mini="true"/>
			<div>
				<p v-if="note.cw != null" :class="$style.cw">
					<Mfm v-if="note.cw != ''" style="margin-right: 8px;" :text="note.cw" :author="note.user" :nyaize="'respect'"/>
					<MkCwButton v-model="showContent" :text="note.text" v-bind="{ ...(note.files === undefined ? {} : { files: note.files }), ...(note.poll === undefined ? {} : { poll: note.poll }) }"/>
				</p>
				<div v-show="note.cw == null || showContent">
					<MkSubNoteContent :class="$style.text" :note="note"/>
				</div>
			</div>
		</div>
	</div>
	<template v-if="depth < 5">
		<MkNoteSub v-for="reply in replies" :key="reply.id" :note="reply" :class="$style.reply" :detail="true" :depth="depth + 1"/>
	</template>
	<div v-else :class="$style.more">
		<MkA class="_link" :to="notePage(note)">{{ i18n.ts.continueThread }} <i class="ti ti-chevron-double-right"></i></MkA>
	</div>
</div>
<div v-else :class="$style.muted" @click="muted = false">
	<I18n :src="i18n.ts.userSaysSomething" tag="small">
		<template #name>
			<MkA v-user-preview="note.userId" :to="userPage(note.user)">
				<MkUserName :user="note.user"/>
			</MkA>
		</template>
	</I18n>
</div>
</template>

<script lang="ts" setup>
import { ref } from 'vue';
import * as Misskey from 'misskey-js';
import MkNoteHeader from '@/features/notes/components/MkNoteHeader.vue';
import MkSubNoteContent from '@/features/notes/components/MkSubNoteContent.vue';
import MkCwButton from '@/features/notes/components/MkCwButton.vue';
import { notePage } from '@/filters/note.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { i18n } from '@/i18n.js';
import { $i } from '@/i.js';
import { userPage } from '@/filters/user.js';
import { checkWordMute } from '@/features/notes/check-word-mute.js';

const props = withDefaults(defineProps<{
	note: Misskey.entities.Note | null;
	detail?: boolean;

	// 詳細表示中のノートとの間にあるノートの数。
	depth?: number;
}>(), {
	depth: 1,
});

const muted = ref(props.note && $i ? checkWordMute(props.note, $i, $i.mutedWords) : false);

const showContent = ref(false);
const replies = ref<Misskey.entities.Note[]>([]);

if (props.detail && props.note) {
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
.avatar, .body, .children, .colorBar, .cw, .header, .main, .more, .muted, .reply, .root, .text {}

@include note-sub.base;

.deleted {
	text-align: center;
	padding: 8px !important;
	margin: 8px 8px 0 8px;
	--color: light-dark(rgba(0, 0, 0, 0.05), rgba(0, 0, 0, 0.15));
	background-size: auto auto;
	background-image: repeating-linear-gradient(135deg, transparent, transparent 10px, var(--color) 4px, var(--color) 14px);
	border-radius: 8px;
}
</style>
