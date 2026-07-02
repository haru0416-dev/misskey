/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Inject, Injectable } from '@nestjs/common';
import type { MiUser } from '@/models/User.js';
import { IdService } from '@/core/IdService.js';
import { MemorySingleCache } from '@/misc/cache.js';
import type { MiRelay } from '@/models/Relay.js';
import { QueueService } from '@/core/QueueService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { DI } from '@/di-symbols.js';
import { deepClone } from '@/misc/clone.js';
import { bindThis } from '@/decorators.js';
import { SystemAccountService } from '@/core/SystemAccountService.js';
import {
	createRelayInDatabase,
	deleteRelayFromDatabase,
	fetchRelayByInboxFromDatabase,
	listRelaysByStatusFromDatabase,
	listRelaysFromDatabase,
	updateRelayStatusInDatabase,
} from '@/core/RelayStore.js';
import type { MiDrizzleDatabase } from '@/drizzle.js';

@Injectable()
export class RelayService {
	private relaysCache: MemorySingleCache<MiRelay[]>;

	constructor(
		@Inject(DI.drizzle)
		private drizzle: MiDrizzleDatabase,

		private idService: IdService,
		private queueService: QueueService,
		private systemAccountService: SystemAccountService,
		private apRendererService: ApRendererService,
	) {
		this.relaysCache = new MemorySingleCache<MiRelay[]>(1000 * 60 * 10); // 10m
	}

	@bindThis
	public async addRelay(inbox: string): Promise<MiRelay> {
		const relay = await createRelayInDatabase(this.drizzle, {
			id: this.idService.gen(),
			inbox,
			status: 'requesting',
		});

		const relayActor = await this.systemAccountService.fetch('relay');
		const follow = this.apRendererService.renderFollowRelay(relay, relayActor);
		const activity = this.apRendererService.addContext(follow);
		this.queueService.deliver(relayActor, activity, relay.inbox, false);

		return relay;
	}

	@bindThis
	public async removeRelay(inbox: string): Promise<void> {
		const relay = await fetchRelayByInboxFromDatabase(this.drizzle, inbox);

		if (relay == null) {
			throw new Error('relay not found');
		}

		const relayActor = await this.systemAccountService.fetch('relay');
		const follow = this.apRendererService.renderFollowRelay(relay, relayActor);
		const undo = this.apRendererService.renderUndo(follow, relayActor);
		const activity = this.apRendererService.addContext(undo);
		this.queueService.deliver(relayActor, activity, relay.inbox, false);

		await deleteRelayFromDatabase(this.drizzle, relay.id);
	}

	@bindThis
	public async listRelay(): Promise<MiRelay[]> {
		const relays = await listRelaysFromDatabase(this.drizzle);
		return relays;
	}

	@bindThis
	public async relayAccepted(id: string): Promise<string> {
		const result = await updateRelayStatusInDatabase(this.drizzle, id, 'accepted');

		return JSON.stringify(result);
	}

	@bindThis
	public async relayRejected(id: string): Promise<string> {
		const result = await updateRelayStatusInDatabase(this.drizzle, id, 'rejected');

		return JSON.stringify(result);
	}

	@bindThis
	private getAcceptedRelays(): Promise<MiRelay[]> {
		return this.relaysCache.fetch(() => listRelaysByStatusFromDatabase(this.drizzle, 'accepted'));
	}

	@bindThis
	public async isRelayActor(actor: { inbox: string | null; sharedInbox: string | null }): Promise<boolean> {
		const relays = await this.getAcceptedRelays();
		return relays.some(relay =>
			(actor.inbox != null && relay.inbox === actor.inbox)
			|| (actor.sharedInbox != null && relay.inbox === actor.sharedInbox),
		);
	}

	@bindThis
	public async deliverToRelays(user: { id: MiUser['id']; host: null; }, activity: any): Promise<void> {
		if (activity == null) return;

		const relays = await this.getAcceptedRelays();
		if (relays.length === 0) return;

		const copy = deepClone(activity);
		if (!copy.to) copy.to = ['https://www.w3.org/ns/activitystreams#Public'];

		const signed = await this.apRendererService.attachLdSignature(copy, user);

		for (const relay of relays) {
			this.queueService.deliver(user, signed, relay.inbox, false);
		}
	}
}
