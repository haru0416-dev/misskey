<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<header :class="$style.root">
	<EmA :class="$style.name" :to="userPage(note.user)">
		<EmUserName :user="note.user"/>
	</EmA>
	<div v-if="note.user.isBot" :class="$style.isBot">bot</div>
	<div :class="$style.username"><EmAcct :user="note.user"/></div>
	<div v-if="note.user.badgeRoles" :class="$style.badgeRoles">
		<img v-for="(role, i) in note.user.badgeRoles" :key="i" :class="$style.badgeRole" :src="role.iconUrl!" :alt="role.name"/>
	</div>
	<div :class="$style.info">
		<EmA :to="notePage(note)">
			<EmTime :time="note.createdAt" colored/>
		</EmA>
		<span v-if="note.visibility !== 'public'" style="margin-left: 0.5em;">
			<i v-if="note.visibility === 'home'" class="ti ti-home"></i>
			<i v-else-if="note.visibility === 'followers'" class="ti ti-lock"></i>
			<i v-else-if="note.visibility === 'specified'" ref="specified" class="ti ti-mail"></i>
		</span>
		<span v-if="note.localOnly" style="margin-left: 0.5em;"><i class="ti ti-rocket-off"></i></span>
		<span v-if="note.channel" style="margin-left: 0.5em;" :title="note.channel.name"><i class="ti ti-device-tv"></i></span>
	</div>
</header>
</template>

<script lang="ts" setup>
import * as Misskey from 'misskey-js';
import { notePage,userPage } from '@/utils.js';
import EmA from '@/components/EmA.vue';
import EmUserName from '@/components/EmUserName.vue';
import EmAcct from '@/components/EmAcct.vue';
import EmTime from '@/components/EmTime.vue';

defineProps<{
	note: Misskey.entities.Note;
}>();
</script>

<style lang="scss" module>
@use '@shared/styles/_note-header.scss' as note-header;

// 共有 mixin が出力するクラスを $style の型へ載せるための列挙。空のルールは CSS に出力されない。
.badgeRole, .badgeRoles, .info, .isBot, .name, .root, .username {}

@include note-header.base;
</style>
