<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<header :class="$style.root">
	<div v-if="mock" :class="$style.name">
		<MkUserName :user="note.user"/>
	</div>
	<MkA v-else v-user-preview="note.user.id" :class="$style.name" :to="userPage(note.user)">
		<MkUserName :user="note.user"/>
	</MkA>
	<div v-if="note.user.isBot" :class="$style.isBot">bot</div>
	<div :class="$style.username"><MkAcct :user="note.user"/></div>
	<div v-if="note.user.badgeRoles" :class="$style.badgeRoles">
		<img v-for="(role, i) in note.user.badgeRoles" :key="i" v-tooltip="role.name" :class="$style.badgeRole" :src="role.iconUrl!" :alt="role.name"/>
	</div>
	<div :class="$style.info">
		<div v-if="mock">
			<MkTime :time="note.createdAt" colored/>
		</div>
		<MkA v-else :to="notePage(note)">
			<MkTime :time="note.createdAt" colored/>
		</MkA>
		<span v-if="note.visibility !== 'public'" style="margin-left: 0.5em;" :title="i18n.ts._visibility[note.visibility]">
			<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
			<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
			<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
		</span>
		<span v-if="note.localOnly" style="margin-left: 0.5em;" :title="i18n.ts._visibility['disableFederation']"><i class="ti ti-rocket-off"></i></span>
		<span v-if="note.channel" style="margin-left: 0.5em;" :title="note.channel.name"><i class="ti ti-device-tv"></i></span>
	</div>
</header>
</template>

<script lang="ts" setup>
import { inject } from 'vue';
import * as Misskey from 'misskey-js';
import { i18n } from '@/i18n.js';
import { notePage } from '@/filters/note.js';
import { userPage } from '@/filters/user.js';
import { DI } from '@/di.js';

defineProps<{
	note: Misskey.entities.Note;
}>();

const mock = inject(DI.mock, false);
</script>

<style lang="scss" module>
@use '@shared/styles/note-header';

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.badgeRole, .badgeRoles, .isBot, .name, .root, .username {}

@include note-header.base;

// 投稿日時のリンクは押せる範囲を上下左右に広げる。embed は時刻を押す操作を想定しないので持たない。
.info {
	> a {
		display: inline-block;
		padding: 6px 0 6px 6px;
		margin: -6px 0 -6px -6px;
	}
}
</style>
