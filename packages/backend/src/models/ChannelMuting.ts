/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { Column, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';
import { MiChannel } from './Channel.js';

const manualUniqueIndex = { unique: true, synchronize: false } as const;

@Entity('channel_muting')
@Index('IDX_CHANNEL_MUTING_USER_ID_CHANNEL_ID_UNIQUE', ['userId', 'channelId'], manualUniqueIndex)
export class MiChannelMuting {
	@PrimaryColumn(id())
	public id: string;

	@Index()
	@Column({
		...id(),
	})
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Index()
	@Column({
		...id(),
	})
	public channelId: MiChannel['id'];

	@ManyToOne(() => MiChannel, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public channel: MiChannel | null;

	@Index()
	@Column('timestamp with time zone', {
		nullable: true,
	})
	public expiresAt: Date | null;
}
