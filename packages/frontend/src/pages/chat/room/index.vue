<!--
SPDX-FileCopyrightText: syuilo and misskey-project
SPDX-License-Identifier: AGPL-3.0-only
-->

<template>
<PageWithHeader v-model:tab="tab" :reversed="tab === 'chat'" :tabs="headerTabs" :actions="headerActions">
	<div v-if="tab === 'chat'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<div class="_gaps">
			<div v-if="initializing">
				<MkLoading/>
			</div>

			<div v-else-if="messages.length === 0">
				<div class="_gaps" style="text-align: center;">
					<div>{{ i18n.ts._chat.noMessagesYet }}</div>
					<template v-if="user">
						<div v-if="user.chatScope === 'followers'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowers }}</div>
						<div v-else-if="user.chatScope === 'following'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromFollowing }}</div>
						<div v-else-if="user.chatScope === 'mutual'">{{ i18n.ts._chat.thisUserAllowsChatOnlyFromMutualFollowing }}</div>
						<div v-else-if="user.chatScope === 'none'">{{ i18n.ts._chat.thisUserNotAllowedChatAnyone }}</div>
					</template>
					<template v-else-if="room">
						<div>{{ i18n.ts._chat.inviteUserToChat }}</div>
					</template>
				</div>
			</div>

			<div v-else ref="timelineEl" class="_gaps" role="log" :aria-label="i18n.ts._chat.messages" aria-live="off">
				<div v-if="canFetchMore">
					<MkButton :class="$style.more" :wait="moreFetching" primary rounded @click="fetchMore">{{ i18n.ts.loadMore }}</MkButton>
				</div>

				<TransitionGroup
					:enterActiveClass="prefer.animation ? $style.transition_x_enterActive : ''"
					:leaveActiveClass="prefer.animation ? $style.transition_x_leaveActive : ''"
					:enterFromClass="prefer.animation ? $style.transition_x_enterFrom : ''"
					:leaveToClass="prefer.animation ? $style.transition_x_leaveTo : ''"
					:moveClass="prefer.animation ? $style.transition_x_move : ''"
					tag="div" :class="$style.timeline"
				>
					<template v-for="row in rows" :key="row.item.id">
						<MessageItem v-if="row.item.type === 'item'" :message="row.item.data" :grouped="row.grouped" :class="row.grouped ? $style.timelineRowGrouped : undefined"/>
						<div v-else-if="row.item.type === 'date'" :class="$style.dateDivider">
							<span><i class="ti ti-chevron-up" aria-hidden="true"></i> {{ row.item.nextText }}</span>
							<span :class="$style.dateDividerRule" aria-hidden="true"></span>
							<span>{{ row.item.prevText }} <i class="ti ti-chevron-down" aria-hidden="true"></i></span>
						</div>
					</template>
				</TransitionGroup>
			</div>

			<div v-if="user && (!user.canChat || user.host !== null)">
				<MkInfo warn>{{ i18n.ts._chat.chatNotAvailableInOtherAccount }}</MkInfo>
			</div>

			<MkInfo v-if="$i.policies.chatAvailability !== 'available'" warn>{{ $i.policies.chatAvailability === 'readonly' ? i18n.ts._chat.chatIsReadOnlyForThisAccountOrServer : i18n.ts._chat.chatNotAvailableForThisAccountOrServer }}</MkInfo>
		</div>
	</div>

	<div v-else-if="tab === 'search'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XSearch v-bind="{ ...(userId === undefined ? {} : { userId }), ...(roomId === undefined ? {} : { roomId }) }"/>
	</div>

	<div v-else-if="tab === 'members'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XMembers v-if="room != null" :room="room" @inviteUser="inviteUser"/>
	</div>

	<div v-else-if="tab === 'info'" class="_spacer" style="--MI_SPACER-w: 700px;">
		<XInfo v-if="room != null" :room="room"/>
	</div>

	<template #footer>
		<div v-if="tab === 'chat'" :class="$style.footer">
			<div class="_gaps">
				<span :class="$style.srOnlyLive" role="status" aria-live="polite">{{ showIndicator ? i18n.ts._chat.newMessage : '' }}</span>
				<Transition
					:enterActiveClass="prefer.animation ? $style.transition_fade_enterActive : ''"
					:leaveActiveClass="prefer.animation ? $style.transition_fade_leaveActive : ''"
					:enterFromClass="prefer.animation ? $style.transition_fade_enterFrom : ''"
					:leaveToClass="prefer.animation ? $style.transition_fade_leaveTo : ''"
				>
					<div v-show="showIndicator" :class="$style.new">
						<button class="_buttonPrimary" :class="$style.newButton" @click="onIndicatorClick">
							<i class="fas ti-fw fa-arrow-circle-down" :class="$style.newIcon" aria-hidden="true"></i>{{ i18n.ts._chat.newMessage }}
						</button>
					</div>
				</Transition>
				<XForm v-if="initialized" :user="user" :room="room" :class="$style.form"/>
			</div>
		</div>
	</template>
</PageWithHeader>
</template>

<script lang="ts" setup>
import { ref, useTemplateRef, computed, onMounted, onBeforeUnmount, onDeactivated, onActivated } from 'vue';
import * as Misskey from 'misskey-js';
import { getScrollContainer } from '@shared/utility/scroll.js';
import MessageItem from '../message-item.vue';
import XForm from './form.vue';
import XSearch from './search.vue';
import XMembers from './members.vue';
import XInfo from './info.vue';
import type { MenuItem } from '@/types/menu.js';
import type { PageHeaderItem } from '@/types/page-header.js';
import * as os from '@/os.js';
import { useStream } from '@/stream.js';
import * as sound from '@/features/sound/sound.js';
import { i18n } from '@/i18n.js';
import { ensureSignin } from '@/i.js';
import { misskeyApi } from '@/utility/misskey-api.js';
import { definePage } from '@/page.js';
import { prefer } from '@/preferences.js';
import MkButton from '@/components/form/MkButton.vue';
import { useRouter } from '@/router.js';
import { useMutationObserver } from '@/composables/useMutationObserver.js';
import MkInfo from '@/components/display/MkInfo.vue';
import { makeDateSeparatedTimelineComputedRef } from '@/features/notes/timeline-date-separate.js';

const $i = ensureSignin();
const router = useRouter();

const props = defineProps<{
	userId?: string;
	roomId?: string;
}>();

export type NormalizedChatMessage = Omit<Misskey.entities.ChatMessageLite, 'fromUser' | 'reactions'> & {
	fromUser: Misskey.entities.UserLite;
	reactions: (Misskey.entities.ChatMessageLite['reactions'][number] & {
		user: Misskey.entities.UserLite;
	})[];
};

const initializing = ref(false);
const initialized = ref(false);
const moreFetching = ref(false);
const messages = ref<NormalizedChatMessage[]>([]);
const canFetchMore = ref(false);
const user = ref<Misskey.entities.UserDetailed | null>(null);
const room = ref<Misskey.entities.ChatRoom | null>(null);
const connection = ref<Misskey.IChannelConnection<Misskey.Channels['chatUser']> | Misskey.IChannelConnection<Misskey.Channels['chatRoom']> | null>(null);
const showIndicator = ref(false);
const timelineEl = useTemplateRef('timelineEl');
const timeline = makeDateSeparatedTimelineComputedRef(messages);

// 表示順 (古い順) に並べ、同一送信者の連続メッセージ (=直前の行も同じ送信者) を grouped として
// マークする。grouped 行はアバター/送信者名を省略し行間を詰めて、連投を1つの束として見せる
const rows = computed(() => {
	const arr = timeline.value.toReversed();
	return arr.map((item, i) => {
		const prev = i > 0 ? arr[i - 1] : undefined;
		return {
			item,
			grouped: item.type === 'item' && prev?.type === 'item' && prev.data.fromUserId === item.data.fromUserId,
		};
	});
});

const SCROLL_HEAD_THRESHOLD = 200;

// column-reverseなので本来はスクロール位置の最下部への追従は不要なはずだが、おそらくブラウザのバグにより、最下部にスクロールした状態でも追従されない場合がある(スクロール位置が少数になることがあるのが関わっていそう)
// そのため補助としてMutationObserverを使って追従を行う
useMutationObserver(timelineEl, {
	subtree: true,
	childList: true,
	attributes: false,
}, () => {
	const scrollContainer = getScrollContainer(timelineEl.value)!;
	// column-reverseなのでscrollTopは負になる
	if (-scrollContainer.scrollTop < SCROLL_HEAD_THRESHOLD) {
		scrollContainer.scrollTo({
			top: 0,
			behavior: 'instant',
		});
	}
});

function normalizeMessage(message: Misskey.entities.ChatMessageLite | Misskey.entities.ChatMessage): NormalizedChatMessage {
	return {
		...message,
		fromUser: message.fromUser ?? (message.fromUserId === $i.id ? $i : user.value!),
		reactions: message.reactions.map(record => ({
			...record,
			user: record.user ?? (message.fromUserId === $i.id ? user.value! : $i),
		})),
	};
}

async function initialize() {
	const LIMIT = 20;

	if (initializing.value) return;

	initializing.value = true;
	initialized.value = false;

	if (props.userId) {
		const [u, m] = await Promise.all([
			misskeyApi('users/show', { userId: props.userId }),
			misskeyApi('chat/messages/user-timeline', { userId: props.userId, limit: LIMIT }),
		]);

		user.value = u;
		messages.value = m.map(x => normalizeMessage(x));

		if (messages.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatUser', {
			otherId: user.value.id,
		});
		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);
	} else if (props.roomId) {
		const [rResult, mResult] = await Promise.allSettled([
			misskeyApi('chat/rooms/show', { roomId: props.roomId }),
			misskeyApi('chat/messages/room-timeline', { roomId: props.roomId, limit: LIMIT }),
		]);

		if (rResult.status === 'rejected') {
			os.alert({
				type: 'error',
				text: i18n.ts.somethingHappened,
			});
			initializing.value = false;
			return;
		}

		const r = rResult.value as Misskey.entities.ChatRoomsShowResponse;

		if (r.invitationExists) {
			const confirm = await os.confirm({
				type: 'question',
				title: r.name,
				text: i18n.ts._chat.youAreNotAMemberOfThisRoomButInvited + '\n' + i18n.ts._chat.doYouAcceptInvitation,
			});
			if (confirm.canceled) {
				initializing.value = false;
				router.push('/chat');
				return;
			} else {
				await os.apiWithDialog('chat/rooms/join', { roomId: r.id });
				initializing.value = false;
				initialize();
				return;
			}
		}

		const m = mResult.status === 'fulfilled' ? mResult.value as Misskey.entities.ChatMessagesRoomTimelineResponse : [];

		room.value = r;
		messages.value = m.map(x => normalizeMessage(x));

		if (messages.value.length === LIMIT) {
			canFetchMore.value = true;
		}

		connection.value = useStream().useChannel('chatRoom', {
			roomId: room.value.id,
		});
		connection.value.on('message', onMessage);
		connection.value.on('deleted', onDeleted);
		connection.value.on('react', onReact);
		connection.value.on('unreact', onUnreact);
	}

	window.document.addEventListener('visibilitychange', onVisibilitychange);

	initialized.value = true;
	initializing.value = false;
}

let isActivated = true;

onActivated(() => {
	isActivated = true;
});

onDeactivated(() => {
	isActivated = false;
});

async function fetchMore() {
	const LIMIT = 30;

	moreFetching.value = true;
	const lastMessage = messages.value.at(-1);
	if (lastMessage == null) {
		moreFetching.value = false;
		return;
	}

	const newMessages = props.userId && user.value != null ? await misskeyApi('chat/messages/user-timeline', {
		userId: user.value.id,
		limit: LIMIT,
		untilId: lastMessage.id,
	}) : room.value != null ? await misskeyApi('chat/messages/room-timeline', {
		roomId: room.value.id,
		limit: LIMIT,
		untilId: lastMessage.id,
	}) : [];

	messages.value.push(...newMessages.map(x => normalizeMessage(x)));

	canFetchMore.value = newMessages.length === LIMIT;
	moreFetching.value = false;
}

function onMessage(message: Misskey.entities.ChatMessageLite) {
	sound.playMisskeySfx('chatMessage');

	// スクロールが最下部付近から離れているとMutationObserverの追従が行われず新着が視界に入らないため、
	// 相手からのメッセージならインジケータで知らせる (追従される場合は出さない)
	if (message.fromUserId !== $i.id && timelineEl.value != null) {
		const scrollContainer = getScrollContainer(timelineEl.value);
		// column-reverseなのでscrollTopは負になる
		if (scrollContainer != null && -scrollContainer.scrollTop >= SCROLL_HEAD_THRESHOLD) {
			notifyNewMessage();
		}
	}

	messages.value.unshift(normalizeMessage(message));

	// TODO: DOM的にバックグラウンドになっていないかどうかも考慮する
	if (message.fromUserId !== $i.id && !window.document.hidden && isActivated) {
		connection.value?.send('read', {
			id: message.id,
		});
	}
}

function onDeleted(id: string) {
	const index = messages.value.findIndex(m => m.id === id);
	if (index !== -1) {
		messages.value.splice(index, 1);
	}
}

function onReact(ctx: Parameters<Misskey.Channels['chatUser']['events']['react']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['react']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		if (room.value == null) { // 1on1の時はuserは省略される
			message.reactions.push({
				reaction: ctx.reaction,
				user: message.fromUserId === $i.id ? user.value! : $i,
			});
		} else {
			message.reactions.push({
				reaction: ctx.reaction,
				user: ctx.user!,
			});
		}
	}
}

function onUnreact(ctx: Parameters<Misskey.Channels['chatUser']['events']['unreact']>[0] | Parameters<Misskey.Channels['chatRoom']['events']['unreact']>[0]) {
	const message = messages.value.find(m => m.id === ctx.messageId);
	if (message) {
		const index = message.reactions.findIndex(r => r.reaction === ctx.reaction && r.user.id === ctx.user!.id);
		if (index !== -1) {
			message.reactions.splice(index, 1);
		}
	}
}

function onIndicatorClick() {
	showIndicator.value = false;
	// column-reverseなので最下部 = scrollTop 0
	const scrollContainer = timelineEl.value != null ? getScrollContainer(timelineEl.value) : null;
	scrollContainer?.scrollTo({ top: 0, behavior: prefer.animation ? 'smooth' : 'instant' });
}

function notifyNewMessage() {
	showIndicator.value = true;
}

function onVisibilitychange() {
	if (window.document.hidden) return;
	// TODO
}

onMounted(() => {
	initialize();
});

onActivated(() => {
	if (!initialized.value) {
		initialize();
	}
});

onBeforeUnmount(() => {
	connection.value?.dispose();
	window.document.removeEventListener('visibilitychange', onVisibilitychange);
});

async function inviteUser() {
	if (room.value == null) return;

	const invitee = await os.selectUser({ includeSelf: false, localOnly: true });
	os.apiWithDialog('chat/rooms/invitations/create', {
		roomId: room.value.id,
		userId: invitee.id,
	});
}

async function leaveRoom() {
	if (room.value == null) return;

	const { canceled } = await os.confirm({
		type: 'warning',
		text: i18n.ts.areYouSure,
	});
	if (canceled) return;

	misskeyApi('chat/rooms/leave', {
		roomId: room.value.id,
	});
	router.push('/chat');
}

function showMenu(ev: PointerEvent) {
	const menuItems: MenuItem[] = [];

	if (room.value) {
		if (room.value.ownerId === $i.id) {
			menuItems.push({
				text: i18n.ts._chat.inviteUser,
				icon: 'ti ti-user-plus',
				action: () => {
					inviteUser();
				},
			});
		} else {
			menuItems.push({
				text: i18n.ts._chat.leave,
				icon: 'ti ti-x',
				action: () => {
					leaveRoom();
				},
			});
		}
	}

	os.popupMenu(menuItems, ev.currentTarget ?? ev.target);
}

const tab = ref('chat');

const headerTabs = computed(() => room.value ? [{
	key: 'chat',
	title: i18n.ts._chat.messages,
	icon: 'ti ti-messages',
}, {
	key: 'members',
	title: i18n.ts._chat.members,
	icon: 'ti ti-users',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}, {
	key: 'info',
	title: i18n.ts.info,
	icon: 'ti ti-info-circle',
}] : [{
	key: 'chat',
	title: i18n.ts._chat.messages,
	icon: 'ti ti-messages',
}, {
	key: 'search',
	title: i18n.ts.search,
	icon: 'ti ti-search',
}]);

const headerActions = computed<PageHeaderItem[]>(() => [{
	icon: 'ti ti-dots',
	handler: showMenu,
}]);

definePage(computed(() => {
	if (initialized.value) {
		if (user.value) {
			return {
				userName: user.value,
				title: user.value.name ?? user.value.username,
				avatar: user.value,
			};
		} else if (room.value) {
			return {
				title: room.value.name,
				icon: 'ti ti-users',
			};
		} else {
			return {
				title: i18n.ts.directMessage,
			};
		}
	} else {
		return {
			title: i18n.ts.directMessage,
		};
	}
}));
</script>

<style lang="scss" module>
.transition_x_move,
.transition_x_enterActive,
.transition_x_leaveActive {
	transition: opacity var(--MI-duration-normal) var(--MI-ease-out), transform var(--MI-duration-normal) var(--MI-ease-out) !important;
}
.transition_x_enterFrom,
.transition_x_leaveTo {
	opacity: 0;
	transform: translateY(80px);
}
.transition_x_leaveActive {
	position: absolute;
}

.transition_fade_enterActive,
.transition_fade_leaveActive {
	transition: opacity var(--MI-duration-normal) var(--MI-ease-out);
}
.transition_fade_enterFrom,
.transition_fade_leaveTo {
	opacity: 0;
}

.more {
	margin: 0 auto;
}

// _gaps の一律 gap の代わりに行間を自前で管理する。
// 通常の行間は xl、同一送信者の連投 (timelineRowGrouped) は sm に詰めて束として見せる
.timeline {
	display: flex;
	flex-direction: column;
}

.timeline > * {
	margin-top: var(--MI-space-xl);
}

.timeline > *:first-child {
	margin-top: 0;
}

.timeline > .timelineRowGrouped {
	margin-top: var(--MI-space-sm);
}

.footer {
	width: 100%;
	padding-top: var(--MI-space-sm);
}

.new {
	width: 100%;
	padding-bottom: var(--MI-space-sm);
	text-align: center;
}

.newButton {
	display: inline-block;
	margin: 0;
	padding: 0 var(--MI-space-md);
	line-height: 32px;
	font-size: 12px;
	border-radius: var(--MI-radius-full);
}

.newIcon {
	display: inline-block;
	margin-right: var(--MI-space-sm);
}

.srOnlyLive {
	position: absolute;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	border: 0;
	overflow: hidden;
	clip: rect(0 0 0 0);
	clip-path: inset(50%);
	white-space: nowrap;
}

.form {
	margin: 0 auto;
	width: 100%;
	max-width: 700px;
}

.dateDivider {
	display: flex;
	font-size: 85%;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	opacity: 0.75;
	border: solid 0.5px var(--MI_THEME-divider);
	border-radius: var(--MI-radius-full);
	width: fit-content;
	padding: 0.5em 1em;
	margin-inline: auto; // .timeline > * の margin-top を潰さないよう shorthand を避ける
}

.dateDividerRule {
	height: 1em;
	width: 1px;
	background: var(--MI_THEME-divider);
}
</style>
