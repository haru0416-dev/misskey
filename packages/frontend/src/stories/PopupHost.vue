<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<component
	:is="popup.component"
	v-for="popup in popups"
	:key="popup.id"
	v-bind="popup.props"
	v-on="popup.events"
/>
</template>

<script lang="ts" setup>
import { popups } from '@/os.js';

// story が os.popup / os.popupMenu を呼ぶと popups へ積まれるだけなので、
// 描画側 (本体では app shell) をここで肩代わりする。
</script>
