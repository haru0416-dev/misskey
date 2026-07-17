<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<MkContainer :showHeader="widgetProps.showHeader" :naked="widgetProps.transparent" data-cy-mkw-activity class="mkw-activity">
	<template #icon><i class="ti ti-chart-line"></i></template>
	<template #header>{{ i18n.ts._widgets.activity }}</template>
	<template #func="{ buttonStyleClass }"><button v-tooltip="i18n.ts.switch" class="_button" :class="buttonStyleClass" :aria-label="i18n.ts.switch" @click="toggleView()"><i class="ti ti-selector"></i></button></template>

	<div>
		<MkLoading v-if="fetching"/>
		<template v-else>
			<XCalendar v-show="widgetProps.view === 0" :activity="activity ?? []"/>
			<XChart v-show="widgetProps.view === 1" :activity="activity ?? []"/>
		</template>
	</div>
</MkContainer>
</template>

<script lang="ts">
export function createActivityData(normal: number[], reply: number[], renote: number[]) {
	if (reply.length !== normal.length || renote.length !== normal.length) {
		throw new Error(`Activity series length mismatch: normal=${normal.length}, reply=${reply.length}, renote=${renote.length}`);
	}

	return normal.map((notes, index) => {
		const replies = reply[index];
		const renotes = renote[index];
		if (replies == null || renotes == null) {
			throw new Error(`Activity series value is missing at index ${index}`);
		}
		return {
			total: notes + replies + renotes,
			notes,
			replies,
			renotes,
		};
	});
}
</script>

<script lang="ts" setup>
import { ref } from 'vue';
import { useWidgetPropsManager } from './widget.js';
import type { WidgetComponentProps, WidgetComponentEmits, WidgetComponentExpose } from './widget.js';
import XCalendar from './WidgetActivity.calendar.vue';
import XChart from './WidgetActivity.chart.vue';
import type { FormWithDefault, GetFormResultType } from '@/utility/form.js';
import { misskeyApiGet } from '@/utility/misskey-api.js';
import MkContainer from '@/components/layout/MkContainer.vue';
import { ensureSignin } from '@/i.js';
import { i18n } from '@/i18n.js';

const $i = ensureSignin();

const name = 'activity';

const widgetPropsDef = {
	showHeader: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.showHeader,
		default: true,
	},
	transparent: {
		type: 'boolean',
		label: i18n.ts._widgetOptions.transparent,
		default: false,
	},
	view: {
		type: 'number',
		default: 0,
		hidden: true,
	},
} satisfies FormWithDefault;

type WidgetProps = GetFormResultType<typeof widgetPropsDef>;

const props = defineProps<WidgetComponentProps<WidgetProps>>();
const emit = defineEmits<WidgetComponentEmits<WidgetProps>>();

const { widgetProps, configure, save } = useWidgetPropsManager(name,
	widgetPropsDef,
	props,
	emit,
);

const activity = ref<{
	total: number;
	notes: number;
	replies: number;
	renotes: number;
}[] | null>(null);
const fetching = ref(true);

const toggleView = () => {
	if (widgetProps.view === 1) {
		widgetProps.view = 0;
	} else {
		widgetProps.view++;
	}
	save();
};

misskeyApiGet('charts/user/notes', {
	userId: $i.id,
	span: 'day',
	limit: 7 * 21,
}).then(res => {
	try {
		activity.value = createActivityData(res.diffs.normal, res.diffs.reply, res.diffs.renote);
	} catch (error) {
		console.error(error);
		activity.value = [];
	}
	fetching.value = false;
});

defineExpose<WidgetComponentExpose>({
	name,
	configure,
	id: props.widget ? props.widget.id : null,
});
</script>
