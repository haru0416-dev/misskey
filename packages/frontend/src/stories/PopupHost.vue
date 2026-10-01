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

// os.popup / os.popupMenu は popups に登録するだけなので、story にも描画ホストが必要。
</script>
