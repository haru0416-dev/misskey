<!--
SPDX-FileCopyrightText: syuilo and other misskey contributors
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<div :class="$style.root" class="_gaps">
	<MkFolder>
		<template #icon><i class="ti ti-search"></i></template>
		<template #label>{{ i18n.ts._customEmojisManager._gridCommon.searchSettings }}</template>
		<template #caption>{{ i18n.ts._customEmojisManager._gridCommon.searchSettingCaption }}</template>
		<XSearch
			:query="searchQuery"
			@queryUpdated="(query) => searchQuery = query"
			@sortOrderUpdated="(orders) => sortOrders = orders"
			@search="onSearchRequest"
		/>
	</MkFolder>

	<MkFolder>
		<template #icon><i class="ti ti-notes"></i></template>
		<template #label>{{ i18n.ts._customEmojisManager._gridCommon.registrationLogs }}</template>
		<template #caption>{{ i18n.ts._customEmojisManager._gridCommon.registrationLogsCaption }}</template>
		<XRegisterLogs :logs="requestLogs"/>
	</MkFolder>

	<component :is="loadingHandler.component.value" v-if="loadingHandler.showing.value"/>
	<MkResult
		v-else-if="gridItems.length === 0"
		type="empty"
		:text="searchedWithFilter ? i18n.ts._customEmojisManager._gridCommon.noMatchingEmojis : i18n.ts._customEmojisManager._local._list.emojisNothing"
	/>
	<template v-else>
		<div :class="$style.gridArea">
			<MkGrid :data="gridItems" :settings="setupGrid()" @event="onGridEvent"/>
		</div>

		<XGridFooter>
			<template #left>
				<MkButton danger :disabled="deleteItemsCount === 0" @click="onDeleteButtonClicked">
					{{ i18n.ts.delete }} ({{ deleteItemsCount }})
				</MkButton>
			</template>
			<template #center>
				<MkPagingButtons :current="currentPage" :max="allPages" :buttonCount="5" @pageChanged="onPageChanged"/>
			</template>
			<template #right>
				<MkButton primary :disabled="updateButtonDisabled || updatedItemsCount === 0" @click="onUpdateButtonClicked">
					{{ i18n.ts.update }} ({{ updatedItemsCount }})
				</MkButton>
				<MkButton :disabled="updatedItemsCount === 0 && deleteItemsCount === 0" @click="onGridResetButtonClicked">{{ i18n.ts.reset }}</MkButton>
			</template>
		</XGridFooter>
	</template>
</div>
</template>

<script lang="ts">
import type { SortOrder } from '@/components/form/MkSortOrderEditor.define.js';
import type { GridSortOrderKey } from '../../impl.js';

export type EmojiSearchQuery = {
	name: string | null;
	category: string | null;
	aliases: string | null;
	type: string | null;
	license: string | null;
	updatedAtFrom: string | null;
	updatedAtTo: string | null;
	sensitive: string | null;
	localOnly: string | null;
	roles: { id: string; name: string }[];
	sortOrders: SortOrder<GridSortOrderKey>[];
	limit: number;
};
</script>

<script setup lang="ts">
import { computed, onMounted, ref, nextTick, useCssModule } from 'vue';
import * as Misskey from 'misskey-js';
import type { RequestLogItem } from '@/pages/admin/custom-emojis-manager/impl.js';
import type { GridCellValidationEvent, GridCellValueChangeEvent, GridEvent } from '@/components/grid/grid-event.js';
import type { GridSetting } from '@/components/grid/grid.js';
import * as os from '@/os.js';
import {
	emptyStrToEmptyArray,
	emptyStrToNull,
	emptyStrToUndefined,
	createRoleColumnSetting,
	emojiFieldLabel,
	settleEmojiRequest,
	toRequestLogs,
} from '@/pages/admin/custom-emojis-manager/impl.js';
import MkGrid from '@/components/grid/MkGrid.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import XSearch from '@/pages/admin/custom-emojis-manager/local/list/search.vue';
import XRegisterLogs from '@/pages/admin/custom-emojis-manager/logs.vue';
import XGridFooter from '@/pages/admin/custom-emojis-manager/grid-footer.vue';
import { i18n } from '@/i18n.js';
import MkButton from '@/components/form/MkButton.vue';
import { validators } from '@/components/grid/cell-validators.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkPagingButtons from '@/components/layout/MkPagingButtons.vue';
import { selectFile } from '@/features/drive/drive.js';
import { copyGridDataToClipboard, removeDataFromGrid } from '@/components/grid/grid-utils.js';
import { useLoading } from '@/composables/useLoading.js';

type GridItem = {
	checked: boolean;
	id: string;
	url: string;
	name: string;
	host: string;
	category: string;
	aliases: string;
	license: string;
	isSensitive: boolean;
	localOnly: boolean;
	roleIdsThatCanBeUsedThisEmojiAsReaction: { id: string; name: string }[];
	fileId?: string;
	updatedAt: string | null;
	publicUrl?: string | null;
	originalUrl?: string | null;
	type: string | null;
};

function setupGrid(): GridSetting {
	const $style = useCssModule();

	const required = validators.required();
	const regex = validators.regex(/^[a-zA-Z0-9_]+$/);
	const unique = validators.unique();
	return {
		root: {
			// 表の領域 (.gridArea) をスクロール領域にして、見出しの行をその中で留める
			noOverflowStyle: true,
		},
		row: {
			showNumber: true,
			selectable: true,
			minimumDefinitionCount: 100,
			styleRules: [
				{
					condition: ({ row }) =>
						JSON.stringify(gridItems.value[row.index]) !== JSON.stringify(originGridItems.value[row.index]),
					applyStyle: { className: $style['changedRow'] ?? '' },
				},
				{
					condition: ({ cells }) => cells.some((it) => !it.violation.valid),
					applyStyle: { className: $style['violationRow'] ?? '' },
				},
			],
			contextMenuFactory: (row, context) => {
				return [
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._gridCommon.copySelectionRows,
						icon: 'ti ti-copy',
						action: () => copyGridDataToClipboard(gridItems, context),
					},
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._local._list.markAsDeleteTargetRows,
						icon: 'ti ti-trash',
						action: () => {
							for (const rangedRow of context.rangedRows) {
								const item = gridItems.value[rangedRow.index];
								if (item != null) {
									item.checked = true;
								}
							}
						},
					},
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._local._list.addTagToSelectionRows,
						icon: 'ti ti-tag',
						action: () => changeTagsOfRows(context.rangedRows, 'add'),
					},
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._local._list.removeTagFromSelectionRows,
						icon: 'ti ti-tag-off',
						action: () => changeTagsOfRows(context.rangedRows, 'remove'),
					},
				];
			},
			events: {
				delete(rows) {
					// 行削除時は元データの行を消さず、削除対象としてマークするのみにする
					for (const row of rows) {
						const item = gridItems.value[row.index];
						if (item != null) {
							item.checked = true;
						}
					}
				},
			},
		},
		cols: [
			{ bindTo: 'checked', icon: 'ti-trash', type: 'boolean', editable: true, width: 34 },
			{
				bindTo: 'url',
				icon: 'ti-icons',
				type: 'image',
				editable: true,
				width: 'auto',
				validators: [required],
				async customValueEditor(row, col, value, cellElement) {
					const file = await selectFile({
						anchorElement: cellElement,
						multiple: false,
					});
					const item = gridItems.value[row.index];
					if (item == null) {
						return value;
					}
					item.url = file.url;
					item.fileId = file.id;

					return file.url;
				},
			},
			{
				bindTo: 'name',
				title: emojiFieldLabel('name'),
				type: 'text',
				editable: true,
				width: 140,
				validators: [required, regex, unique],
			},
			{ bindTo: 'category', title: emojiFieldLabel('category'), type: 'text', editable: true, width: 140 },
			{ bindTo: 'aliases', title: emojiFieldLabel('aliases'), type: 'text', editable: true, width: 140 },
			{ bindTo: 'license', title: emojiFieldLabel('license'), type: 'text', editable: true, width: 140 },
			{ bindTo: 'isSensitive', title: emojiFieldLabel('isSensitive'), type: 'boolean', editable: true, width: 90 },
			{ bindTo: 'localOnly', title: emojiFieldLabel('localOnly'), type: 'boolean', editable: true, width: 90 },
			createRoleColumnSetting(gridItems),
			{ bindTo: 'type', title: emojiFieldLabel('type'), type: 'text', editable: false, width: 90 },
			{ bindTo: 'updatedAt', title: emojiFieldLabel('updatedAt'), type: 'text', editable: false, width: 'auto' },
			{ bindTo: 'publicUrl', title: emojiFieldLabel('publicUrl'), type: 'text', editable: false, width: 180 },
			{ bindTo: 'originalUrl', title: i18n.ts._customEmojisManager._gridCommon.originalUrl, type: 'text', editable: false, width: 180 },
		],
		cells: {
			contextMenuFactory(col, row, value, context) {
				return [
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._gridCommon.copySelectionRanges,
						icon: 'ti ti-copy',
						action: () => {
							return copyGridDataToClipboard(gridItems, context);
						},
					},
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._gridCommon.deleteSelectionRanges,
						icon: 'ti ti-trash',
						action: () => {
							removeDataFromGrid(context, (cell) => {
								(gridItems.value[cell.row.index] as any)[cell.column.setting.bindTo] = undefined;
							});
						},
					},
					{
						type: 'button',
						text: i18n.ts._customEmojisManager._local._list.markAsDeleteTargetRanges,
						icon: 'ti ti-trash',
						action: () => {
							for (const rowIdx of new Set(context.rangedCells.map((it) => it.row.index))) {
								const item = gridItems.value[rowIdx];
								if (item != null) {
									item.checked = true;
								}
							}
						},
					},
				];
			},
		},
	};
}

const loadingHandler = useLoading();

const customEmojis = ref<Misskey.entities.EmojiDetailedAdmin[]>([]);
const allPages = ref<number>(0);
const currentPage = ref<number>(0);

const searchQuery = ref<EmojiSearchQuery>({
	name: null,
	category: null,
	aliases: null,
	type: null,
	license: null,
	updatedAtFrom: null,
	updatedAtTo: null,
	sensitive: null,
	localOnly: null,
	roles: [],
	sortOrders: [],
	limit: 100,
});

const previousQuery = ref<string | undefined>(undefined);
const sortOrders = ref<SortOrder<GridSortOrderKey>[]>([]);
const requestLogs = ref<RequestLogItem[]>([]);

const gridItems = ref<GridItem[]>([]);
const originGridItems = ref<GridItem[]>([]);
const updateButtonDisabled = ref<boolean>(false);

const updatedItemsCount = computed(() => {
	return gridItems.value.filter(
		(it, idx) => !it.checked && JSON.stringify(it) !== JSON.stringify(originGridItems.value[idx]),
	).length;
});
const deleteItemsCount = computed(() => gridItems.value.filter((it) => it.checked).length);

async function onUpdateButtonClicked() {
	const _items = gridItems.value;
	const _originItems = originGridItems.value;
	if (_items.length !== _originItems.length) {
		throw new Error('The number of items has been changed. Please refresh the page and try again.');
	}

	const updatedItems = _items.filter(
		(it, idx) => !it.checked && JSON.stringify(it) !== JSON.stringify(_originItems[idx]),
	);
	if (updatedItems.length === 0) {
		await os.alert({
			type: 'info',
			text: i18n.ts._customEmojisManager._local._list.alertUpdateEmojisNothingDescription,
		});
		return;
	}

	const { canceled } = await os.confirm({
		type: 'info',
		text: i18n.tsx._customEmojisManager._local._list.confirmUpdateEmojisDescription({ count: updatedItems.length }),
	});
	if (canceled) {
		return;
	}

	const action = () => {
		return updatedItems.map((item) =>
			settleEmojiRequest(
				item,
				misskeyApi('admin/emoji/update', {
					id: item.id!,
					name: item.name,
					category: emptyStrToNull(item.category),
					aliases: emptyStrToEmptyArray(item.aliases),
					license: emptyStrToNull(item.license),
					isSensitive: item.isSensitive,
					localOnly: item.localOnly,
					roleIdsThatCanBeUsedThisEmojiAsReaction: item.roleIdsThatCanBeUsedThisEmojiAsReaction.map((it) => it.id),
					...(item.fileId === undefined ? {} : { fileId: item.fileId }),
				}),
			),
		);
	};

	const result = await os.promiseDialog(Promise.all(action()));
	requestLogs.value = await toRequestLogs(result);

	await refreshCustomEmojis();
}

async function onDeleteButtonClicked() {
	const _items = gridItems.value;
	const _originItems = originGridItems.value;
	if (_items.length !== _originItems.length) {
		throw new Error('The number of items has been changed. Please refresh the page and try again.');
	}

	const deleteItems = _items.filter((it) => it.checked);
	if (deleteItems.length === 0) {
		await os.alert({
			type: 'info',
			text: i18n.ts._customEmojisManager._local._list.alertDeleteEmojisNothingDescription,
		});
		return;
	}

	// 削除のあとに表を読み直すので、削除しない行の未保存の変更は消える。先に確かめる
	if (updatedItemsCount.value > 0) {
		const { canceled } = await os.confirm({
			type: 'warning',
			title: i18n.ts._customEmojisManager._local._list.confirmChangeView,
			text: i18n.ts._customEmojisManager._local._list.confirmMovePageDesciption,
		});
		if (canceled) {
			return;
		}
	}

	const { canceled } = await os.confirm({
		type: 'info',
		text: i18n.tsx._customEmojisManager._local._list.confirmDeleteEmojisDescription({ count: deleteItems.length }),
	});
	if (canceled) {
		return;
	}

	async function action() {
		const deleteIds = deleteItems.map((it) => it.id!);
		await misskeyApi('admin/emoji/delete-bulk', { ids: deleteIds });
	}

	await os.promiseDialog(action());
	// 削除した行がチェックの付いたまま表に残らないよう、読み直す
	await refreshCustomEmojis();
}

// 表への貼り付けはタグの欄を丸ごと置き換えるので、各絵文字の既存のタグを残したまま足す・外す操作は別に用意する
async function changeTagsOfRows(rows: { index: number }[], mode: 'add' | 'remove') {
	const ids = rows.map((row) => gridItems.value[row.index]?.id).filter((id): id is string => id != null);
	if (ids.length === 0) {
		return;
	}
	if (updatedItemsCount.value > 0) {
		const { canceled } = await os.confirm({
			type: 'warning',
			title: i18n.ts._customEmojisManager._local._list.confirmChangeView,
			text: i18n.ts._customEmojisManager._local._list.confirmMovePageDesciption,
		});
		if (canceled) {
			return;
		}
	}
	const { canceled, result } = await os.inputText({
		title: mode === 'add' ? i18n.ts._customEmojisManager._local._list.addTagToSelectionRows : i18n.ts._customEmojisManager._local._list.removeTagFromSelectionRows,
		text: i18n.tsx._customEmojisManager._local._list.tagsInputDescription({ count: ids.length }),
		minLength: 1,
	});
	if (canceled) {
		return;
	}
	const aliases = result.split(/\s+/).filter((it) => it !== '');
	if (aliases.length === 0) {
		return;
	}
	await os.apiWithDialog(mode === 'add' ? 'admin/emoji/add-aliases-bulk' : 'admin/emoji/remove-aliases-bulk', { ids, aliases });
	await refreshCustomEmojis();
}

async function onGridResetButtonClicked() {
	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.resetAreYouSure,
		text: i18n.ts._customEmojisManager._local._list.confirmResetDescription,
	});

	if (canceled) {
		return;
	}

	refreshGridItems();
}

async function onSearchRequest() {
	// 検索し直すと表の未保存の変更が消えるので、ページ切り替えと同じく確かめる
	if (updatedItemsCount.value > 0) {
		const { canceled } = await os.confirm({
			type: 'warning',
			title: i18n.ts._customEmojisManager._local._list.confirmChangeView,
			text: i18n.ts._customEmojisManager._local._list.confirmMovePageDesciption,
		});
		if (canceled) {
			return;
		}
	}
	await refreshCustomEmojis();
}

const searchedWithFilter = ref(false);

async function onPageChanged(pageNumber: number) {
	if (updatedItemsCount.value > 0) {
		const { canceled } = await os.confirm({
			type: 'warning',
			title: i18n.ts._customEmojisManager._local._list.confirmMovePage,
			text: i18n.ts._customEmojisManager._local._list.confirmMovePageDesciption,
		});
		if (canceled) {
			return;
		}
	}

	currentPage.value = pageNumber;
	await nextTick();
	refreshCustomEmojis();
}

function onGridEvent(event: GridEvent) {
	switch (event.type) {
		case 'cell-validation':
			onGridCellValidation(event);
			break;
		case 'cell-value-change':
			onGridCellValueChange(event);
			break;
	}
}

function onGridCellValidation(event: GridCellValidationEvent) {
	updateButtonDisabled.value = event.all.some((it) => !it.valid);
}

function onGridCellValueChange(event: GridCellValueChangeEvent) {
	const { row, column, newValue } = event;
	const item = gridItems.value[row.index];
	if (item != null && column.setting.bindTo in item) {
		(item as any)[column.setting.bindTo] = newValue;
	}
}

async function refreshCustomEmojis() {
	const limit = searchQuery.value.limit;

	const name = emptyStrToUndefined(searchQuery.value.name);
	const type = emptyStrToUndefined(searchQuery.value.type);
	const aliases = emptyStrToUndefined(searchQuery.value.aliases);
	const category = emptyStrToUndefined(searchQuery.value.category);
	const license = emptyStrToUndefined(searchQuery.value.license);
	const updatedAtFrom = emptyStrToUndefined(searchQuery.value.updatedAtFrom);
	const updatedAtTo = emptyStrToUndefined(searchQuery.value.updatedAtTo);
	const query: NonNullable<Misskey.entities.V2AdminEmojiListRequest['query']> = {
		...(name === undefined ? {} : { name }),
		...(type === undefined ? {} : { type }),
		...(aliases === undefined ? {} : { aliases }),
		...(category === undefined ? {} : { category }),
		...(license === undefined ? {} : { license }),
		// 選択肢の値は文字列の 'true' / 'false' なので、Boolean() ではなく比べて真偽にする ('false' も Boolean では true になる)
		...(searchQuery.value.sensitive == null ? {} : { isSensitive: searchQuery.value.sensitive === 'true' }),
		...(searchQuery.value.localOnly == null ? {} : { localOnly: searchQuery.value.localOnly === 'true' }),
		...(updatedAtFrom === undefined ? {} : { updatedAtFrom }),
		...(updatedAtTo === undefined ? {} : { updatedAtTo }),
		roleIds: searchQuery.value.roles.map((it) => it.id),
		hostType: 'local',
	};

	// 件数を変えたときもページを 1 に戻す (戻さないと、件数を増やしたときに範囲外のページを引いて空になる)
	const queryKey = JSON.stringify({ query, limit });
	if (queryKey !== previousQuery.value) {
		currentPage.value = 1;
	}

	const result = await loadingHandler.scope(() =>
		misskeyApi('v2/admin/emoji/list', {
			query,
			limit,
			page: currentPage.value,
			sortKeys: sortOrders.value.map(({ key, direction }) => `${direction}${key}` as any),
		}),
	);

	// 最後のページの行をすべて削除すると、今のページが範囲外になって空になる。最後のページへ戻して読み直す
	if (result.emojis.length === 0 && result.allPages > 0 && currentPage.value > result.allPages) {
		currentPage.value = result.allPages;
		previousQuery.value = queryKey;
		await refreshCustomEmojis();
		return;
	}

	customEmojis.value = result.emojis;
	allPages.value = result.allPages;

	previousQuery.value = queryKey;
	// 空のときの文言は、入力中の欄ではなく実際に検索した条件で決める
	searchedWithFilter.value = Object.keys(query).some((key) => key !== 'hostType' && key !== 'roleIds') || (query.roleIds?.length ?? 0) > 0;

	refreshGridItems();
}

function refreshGridItems() {
	gridItems.value = customEmojis.value.map((it) => ({
		checked: false,
		id: it.id,
		url: it.publicUrl,
		name: it.name,
		host: it.host ?? '',
		category: it.category ?? '',
		aliases: it.aliases.join(' '),
		license: it.license ?? '',
		isSensitive: it.isSensitive,
		localOnly: it.localOnly,
		roleIdsThatCanBeUsedThisEmojiAsReaction: it.roleIdsThatCanBeUsedThisEmojiAsReaction,
		updatedAt: it.updatedAt,
		publicUrl: it.publicUrl,
		originalUrl: it.originalUrl,
		type: it.type,
	}));
	originGridItems.value = JSON.parse(JSON.stringify(gridItems.value));
}

onMounted(async () => {
	await refreshCustomEmojis();
});
</script>

<style module lang="scss">
.root {
	padding: 16px;
	container-type: inline-size;
}

.changedRow {
	background-color: var(--MI_THEME-infoBg) !important;
}

.violationRow {
	background-color: var(--MI_THEME-infoWarnBg) !important;
}

/* 列が多く画面より広く、行も多いので、表だけを縦横にスクロールさせて見出しの行を上に留める */
.gridArea {
	overflow: auto;
	max-height: calc(100dvh - var(--MI-stickyTop, 0px) - var(--MI-stickyBottom, 0px) - 80px);
}
</style>
