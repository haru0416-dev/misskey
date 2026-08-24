<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :actions="headerActions" :tabs="headerTabs">
	<div class="_spacer">
		<div v-if="tab === '-'" class="_gaps">
			<div :class="$style.queues">
				<div v-for="q in queueInfos" :key="q.name" :class="$style.queue" @click="tab = q.name">
					<div style="display: flex; align-items: center; font-weight: bold;"><i class="ti ti-http-que" style="margin-right: 0.5em;"></i>{{ q.name }}<i v-if="!q.isPaused" style="color: var(--MI_THEME-success); margin-left: auto;" class="ti ti-player-play"></i></div>
					<div :class="$style.queueCounts">
						<MkKeyValue>
							<template #key>Active</template>
							<template #value>{{ kmg(q.counts.active ?? null, 2) }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Delayed</template>
							<template #value>{{ kmg(q.counts.delayed ?? null, 2) }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Waiting</template>
							<template #value>{{ kmg(q.counts.waiting ?? null, 2) }}</template>
						</MkKeyValue>
						<MkKeyValue v-if="q.outbox">
							<template #key>Outbox</template>
							<template #value>{{ kmg(q.outbox.pending, 2) }}</template>
						</MkKeyValue>
						<MkKeyValue v-if="q.outbox && q.outbox.deadLetter > 0">
							<template #key>Dead</template>
							<template #value><span style="color: var(--MI_THEME-error);">{{ kmg(q.outbox.deadLetter, 2) }}</span></template>
						</MkKeyValue>
					</div>
					<XChart :dataSet="{ completed: q.metrics.completed.data, failed: q.metrics.failed.data }"/>
				</div>
			</div>
		</div>
		<div v-else-if="tab === 'outbox'" class="_gaps">
			<MkFolder :defaultOpen="true" :withSpacer="false">
				<template #label>{{ i18n.ts._queueOutbox.deadLetters }}</template>
				<template #icon><i class="ti ti-alert-triangle"></i></template>
				<template #suffix>{{ deadLetters.length }}</template>
				<template #caption>{{ i18n.ts._queueOutbox.deadLettersDescription }}</template>
				<template #footer>
					<div class="_buttons">
						<MkButton rounded @click="fetchDeadLetters()"><i class="ti ti-reload"></i> Refresh view</MkButton>
					</div>
				</template>

				<div class="_spacer">
					<MkLoading v-if="deadLettersInitializing"/>
					<MkResult v-else-if="deadLetters.length === 0" type="empty" :text="i18n.ts._queueOutbox.noDeadLetters"/>
					<div v-else class="_gaps_s _monospace">
						<XOutboxDeadLetter
							v-for="deadLetter in deadLetters"
							:key="deadLetter.id"
							:deadLetter="deadLetter"
							@needRefresh="fetchDeadLetters()"
						/>
						<MkButton v-if="deadLettersCanFetchMore" :disabled="deadLettersFetchingMore" rounded style="margin: 0 auto;" @click="fetchMoreDeadLetters()">{{ i18n.ts.loadMore }}</MkButton>
					</div>
				</div>
			</MkFolder>
		</div>
		<div v-else-if="queueInfo" class="_gaps">
			<MkFolder :defaultOpen="true">
				<template #label>Overview: {{ tab }}</template>
				<template #icon><i class="ti ti-http-que"></i></template>
				<template #suffix>#{{ queueInfo.db.processId }}:{{ queueInfo.db.port }} / {{ queueInfo.db.runId }}</template>
				<template #caption>{{ queueInfo.qualifiedName }}</template>
				<template #footer>
					<div class="_buttons">
						<MkButton rounded @click="promoteAllJobs"><i class="ti ti-player-track-next"></i> Promote all jobs</MkButton>
						<!-- <MkButton rounded @click="createJob"><i class="ti ti-plus"></i> Add job</MkButton> -->
						<MkButton v-if="queueInfo.isPaused" rounded @click="resumeQueue"><i class="ti ti-player-play"></i> Resume queue</MkButton>
						<MkButton v-else rounded danger @click="pauseQueue"><i class="ti ti-player-pause"></i> Pause queue</MkButton>
						<MkButton rounded danger @click="clearQueue"><i class="ti ti-trash"></i> Empty queue</MkButton>
					</div>
				</template>

				<div class="_gaps">
					<XChart :dataSet="{ completed: queueInfo.metrics.completed.data, failed: queueInfo.metrics.failed.data }" :aspectRatio="5"/>
					<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
						<MkKeyValue>
							<template #key>Active</template>
							<template #value>{{ kmg(queueInfo.counts.active ?? null, 2) }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Delayed</template>
							<template #value>{{ kmg(queueInfo.counts.delayed ?? null, 2) }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Waiting</template>
							<template #value>{{ kmg(queueInfo.counts.waiting ?? null, 2) }}</template>
						</MkKeyValue>
					</div>
					<template v-if="queueInfo.outbox">
						<hr>
						<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
							<MkKeyValue>
								<template #key>Outbox: Pending</template>
								<template #value>{{ kmg(queueInfo.outbox.pending, 2) }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>Outbox: Oldest pending</template>
								<template #value>{{ queueInfo.outbox.oldestPendingAgeMs == null ? 'N/A' : `${Math.floor(queueInfo.outbox.oldestPendingAgeMs / 1000)}s` }}</template>
							</MkKeyValue>
							<MkKeyValue>
								<template #key>Outbox: Dead letters</template>
								<template #value>
									<span :style="queueInfo.outbox.deadLetter > 0 ? 'color: var(--MI_THEME-error);' : ''">{{ kmg(queueInfo.outbox.deadLetter, 2) }}</span>
									<span v-if="queueInfo.outbox.deadLetter > 0" style="margin-left: 0.5em;">(<button class="_textButton" @click="tab = 'outbox'">{{ i18n.ts._queueOutbox.deadLetters }}</button>)</span>
								</template>
							</MkKeyValue>
						</div>
					</template>
					<hr>
					<div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px;">
						<MkKeyValue>
							<template #key>Clients: Connected</template>
							<template #value>{{ queueInfo.db.clients.connected }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Clients: Blocked</template>
							<template #value>{{ queueInfo.db.clients.blocked }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Memory: Peak</template>
							<template #value>{{ bytes(queueInfo.db.memory.peak, 1) }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Memory: Total</template>
							<template #value>{{ bytes(queueInfo.db.memory.total, 1) }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Memory: Used</template>
							<template #value>{{ bytes(queueInfo.db.memory.used, 1) }}</template>
						</MkKeyValue>
						<MkKeyValue>
							<template #key>Uptime</template>
							<template #value>{{ queueInfo.db.uptime }}</template>
						</MkKeyValue>
					</div>
				</div>
			</MkFolder>

			<MkFolder :defaultOpen="true" :withSpacer="false">
				<template #label>Jobs: {{ tab }}</template>
				<template #icon><i class="ti ti-list-check"></i></template>
				<template #suffix>&lt;A:{{ kmg(queueInfo.counts.active ?? null, 2) }}&gt; &lt;D:{{ kmg(queueInfo.counts.delayed ?? null, 2) }}&gt; &lt;W:{{ kmg(queueInfo.counts.waiting ?? null, 2) }}&gt;</template>
				<template #header>
					<MkTabs
						v-model:tab="jobState"
						:tabs="[{
							key: 'all',
							title: 'All',
							icon: 'ti ti-code-asterisk',
						}, {
							key: 'latest',
							title: 'Latest',
							icon: 'ti ti-logs',
						}, {
							key: 'completed',
							title: 'Completed',
							icon: 'ti ti-check',
						}, {
							key: 'failed',
							title: 'Failed',
							icon: 'ti ti-circle-x',
						}, {
							key: 'active',
							title: 'Active',
							icon: 'ti ti-player-play',
						}, {
							key: 'delayed',
							title: 'Delayed',
							icon: 'ti ti-clock',
						}, {
							key: 'wait',
							title: 'Waiting',
							icon: 'ti ti-hourglass-high',
						}]"
					/>
				</template>
				<template #footer>
					<div class="_buttons">
						<MkButton rounded @click="fetchJobs()"><i class="ti ti-reload"></i> Refresh view</MkButton>
						<MkButton rounded danger style="margin-left: auto;" @click="removeJobs"><i class="ti ti-trash"></i> Remove jobs</MkButton>
					</div>
				</template>

				<div class="_spacer">
					<MkInput
						v-model="searchQuery"
						:placeholder="i18n.ts.search"
						type="search"
						style="margin-bottom: 16px;"
					>
						<template #prefix><i class="ti ti-search"></i></template>
					</MkInput>

					<MkLoading v-if="jobsFetching"/>
					<MkTl
						v-else
						:events="jobs.map((job) => ({
							id: job.id,
							timestamp: job.finishedOn ?? job.processedOn ?? job.timestamp,
							data: job,
						}))"
						groupBy="h"
						class="_monospace"
					>
						<template #right="{ event: job }">
							<XJob v-if="currentQueue" :job="job" :queueType="currentQueue" style="margin: 4px 0;" @needRefresh="refreshJob(job.id)"/>
						</template>
					</MkTl>
				</div>
			</MkFolder>
		</div>
	</div>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, computed, watch } from 'vue';
import * as Misskey from 'misskey-js';
import { debounce } from 'throttle-debounce';
import { useInterval } from '@shared/utility/use-interval.js';
import XChart from './chart.vue';
import XJob from './job.vue';
import XOutboxDeadLetter from './outbox-dead-letter.vue';
import * as os from '@/os.js';
import { i18n } from '@/i18n.js';
import { definePage } from '@/page.js';
import MkButton from '@/components/form/MkButton.vue';
import { misskeyApi } from '@/utility/misskey-api.js';
import MkTabs from '@/components/layout/MkTabs.vue';
import MkFolder from '@/components/layout/MkFolder.vue';
import MkKeyValue from '@/components/display/MkKeyValue.vue';
import MkTl from '@/components/layout/MkTl.vue';
import kmg from '@/filters/kmg.js';
import MkInput from '@/components/form/MkInput.vue';
import bytes from '@/filters/bytes.js';

type QueueCounts = Record<string, number> & {
	active?: number;
	delayed?: number;
	waiting?: number;
};

type QueueInfo = Omit<Misskey.entities.AdminQueueQueuesResponse[number], 'counts'> & {
	counts: QueueCounts;
};

type CurrentQueueInfo = Omit<Misskey.entities.AdminQueueQueueStatsResponse, 'counts'> & {
	counts: QueueCounts;
};

type QueueJob = Omit<Misskey.entities.QueueJob, 'opts'> & {
	opts: Misskey.entities.QueueJob['opts'] & {
		repeat?: unknown;
		attempts?: number;
	};
};

const tab = ref<typeof Misskey.queueTypes[number] | '-' | 'outbox'>('-');
const jobState = ref<'all' | 'latest' | 'completed' | 'failed' | 'active' | 'delayed' | 'wait'>('all');
const jobs = ref<QueueJob[]>([]);
const jobsFetching = ref(true);
const queueInfos = ref<QueueInfo[]>([]);
const queueInfo = ref<CurrentQueueInfo | null>(null);
const searchQuery = ref('');
const DEAD_LETTERS_FETCH_LIMIT = 50;
const deadLetters = ref<Misskey.entities.AdminQueueOutboxDeadLettersResponse>([]);
// 定期更新のたびにローディング表示へ差し替えると、展開中の折りたたみが毎回閉じてしまうため、
// スピナーは初回取得が終わるまでの間だけ出す
const deadLettersInitializing = ref(true);
const deadLettersCanFetchMore = ref(false);
const deadLettersFetchingMore = ref(false);

// tab はキュー名以外 (概要 / デッドレター) も取りうるので、キュー指定APIにはこちらを渡す
const currentQueue = computed<typeof Misskey.queueTypes[number] | null>(() => {
	const queue = Misskey.queueTypes.find(q => q === tab.value);
	return queue ?? null;
});

async function fetchQueues() {
	if (tab.value !== '-') return;
	queueInfos.value = await misskeyApi('admin/queue/queues');
}

async function fetchCurrentQueue() {
	const queue = currentQueue.value;
	if (queue == null) return;
	queueInfo.value = await misskeyApi('admin/queue/queue-stats', { queue });
}

// 「もっと見る」で広げた表示範囲は10秒ごとの自動更新でも維持する必要があるため、
// 読み込み済みのページ数だけカーソルを辿り直す (先頭50件だけを取り直すと展開した分が毎回消える)
async function fetchDeadLetters() {
	if (deadLettersFetchingMore.value) return;

	const pages = Math.max(1, Math.ceil(deadLetters.value.length / DEAD_LETTERS_FETCH_LIMIT));
	const rows: Misskey.entities.AdminQueueOutboxDeadLettersResponse = [];
	let hasMore = false;
	for (let i = 0; i < pages; i++) {
		const page = await misskeyApi('admin/queue/outbox-dead-letters', {
			limit: DEAD_LETTERS_FETCH_LIMIT,
			...(rows.length === 0 ? {} : { untilId: rows.at(-1)!.id }),
		});
		rows.push(...page);
		hasMore = page.length === DEAD_LETTERS_FETCH_LIMIT;
		if (!hasMore) break;
	}

	deadLetters.value = rows;
	deadLettersCanFetchMore.value = hasMore;
	deadLettersInitializing.value = false;
}

async function fetchMoreDeadLetters() {
	const oldest = deadLetters.value.at(-1);
	if (oldest == null || deadLettersFetchingMore.value) return;

	deadLettersFetchingMore.value = true;
	try {
		const page = await misskeyApi('admin/queue/outbox-dead-letters', {
			limit: DEAD_LETTERS_FETCH_LIMIT,
			untilId: oldest.id,
		});
		deadLetters.value = [...deadLetters.value, ...page];
		deadLettersCanFetchMore.value = page.length === DEAD_LETTERS_FETCH_LIMIT;
	} finally {
		deadLettersFetchingMore.value = false;
	}
}

async function fetchJobs() {
	const queue = currentQueue.value;
	if (queue == null) return;
	jobsFetching.value = true;
	const state = jobState.value;
	jobs.value = await misskeyApi('admin/queue/jobs', {
		queue,
		state: state === 'all' ? ['completed', 'failed', 'active', 'delayed', 'wait'] : state === 'latest' ? ['completed', 'failed'] : [state],
		...(searchQuery.value.trim() === '' ? {} : { search: searchQuery.value }),
	}).then((res: Misskey.entities.AdminQueueJobsResponse) => {
		if (state === 'all') {
			res.sort((a, b) => (a.processedOn ?? a.timestamp) > (b.processedOn ?? b.timestamp) ? -1 : 1);
		} else if (state === 'latest') {
			res.sort((a, b) => a.processedOn! > b.processedOn! ? -1 : 1);
		} else if (state === 'delayed') {
			res.sort((a, b) => (a.processedOn ?? a.timestamp) > (b.processedOn ?? b.timestamp) ? -1 : 1);
		}
		return res;
	});
	jobsFetching.value = false;
}

watch([tab], async () => {
	if (tab.value === '-') {
		fetchQueues();
	} else if (tab.value === 'outbox') {
		fetchDeadLetters();
	} else {
		fetchCurrentQueue();
		fetchJobs();
	}
}, { immediate: true });

watch([jobState], () => {
	fetchJobs();
});

const search = debounce(1000, () => {
	fetchJobs();
});

watch([searchQuery], () => {
	search();
});

useInterval(() => {
	if (tab.value === '-') {
		fetchQueues();
	} else if (tab.value === 'outbox') {
		fetchDeadLetters();
	} else {
		fetchCurrentQueue();
	}
}, 1000 * 10, {
	immediate: false,
	afterMounted: true,
});

async function clearQueue() {
	const queue = currentQueue.value;
	if (queue == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.areYouSure,
	});
	if (canceled) return;

	os.apiWithDialog('admin/queue/clear', { queue, state: '*' });

	fetchCurrentQueue();
	fetchJobs();
}

async function promoteAllJobs() {
	const queue = currentQueue.value;
	if (queue == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.areYouSure,
	});
	if (canceled) return;

	os.apiWithDialog('admin/queue/promote-jobs', { queue });

	fetchCurrentQueue();
	fetchJobs();
}

async function pauseQueue() {
	const queue = currentQueue.value;
	if (queue == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.areYouSure,
	});
	if (canceled) return;

	await os.apiWithDialog('admin/queue/pause', { queue });

	fetchCurrentQueue();
	fetchJobs();
}

async function resumeQueue() {
	const queue = currentQueue.value;
	if (queue == null) return;

	await os.apiWithDialog('admin/queue/resume', { queue });

	fetchCurrentQueue();
	fetchJobs();
}

async function removeJobs() {
	const queue = currentQueue.value;
	if (queue == null || jobState.value === 'latest') return;

	const { canceled } = await os.confirm({
		type: 'warning',
		title: i18n.ts.areYouSure,
	});
	if (canceled) return;

	os.apiWithDialog('admin/queue/clear', { queue, state: jobState.value === 'all' ? '*' : jobState.value });

	fetchCurrentQueue();
	fetchJobs();
}

async function refreshJob(jobId: string) {
	const queue = currentQueue.value;
	if (queue == null) return;
	const newJob = await misskeyApi('admin/queue/show-job', { queue, jobId });
	const index = jobs.value.findIndex((job) => job.id === jobId);
	if (index !== -1) {
		jobs.value[index] = newJob;
	}
}

const headerActions = computed(() => []);

const headerTabs = computed<{
	key: string;
	title: string;
	icon?: string;
}[]>(() => [{
	key: '-',
	title: i18n.ts.jobQueue,
	icon: 'ti ti-list-check',
}, {
	key: 'outbox',
	title: i18n.ts._queueOutbox.deadLetters,
	icon: 'ti ti-alert-triangle',
}, ...Misskey.queueTypes.map((q) => ({
	key: q,
	title: q,
}))]);

definePage(() => ({
	title: i18n.ts.jobQueue,
	icon: 'ti ti-clock-play',
	needWideArea: true,
}));
</script>

<style lang="scss" module>
.queues {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
	gap: 14px;
}

.queue {
	padding: 14px 18px;
	background-color: var(--MI_THEME-panel);
	border-radius: 8px;
	cursor: pointer;
}

.queueCounts {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(80px, 1fr));
	gap: 8px;
	font-size: 85%;
	margin: 6px 0;
}
</style>
