/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { PrimaryColumn, Entity, Index, JoinColumn, Column, ManyToOne } from 'typeorm';
import { id } from './util/id.js';
import { MiUser } from './User.js';

const manualUniqueIndex = { unique: true, synchronize: false } as const;

@Entity('sw_subscription')
@Index('IDX_SW_SUBSCRIPTION_USER_ID_ENDPOINT_UNIQUE', ['userId', 'endpoint'], manualUniqueIndex)
export class MiSwSubscription {
	@PrimaryColumn(id())
	public id: string;

	@Column(id())
	public userId: MiUser['id'];

	@ManyToOne(() => MiUser, {
		onDelete: 'CASCADE',
	})
	@JoinColumn()
	public user: MiUser | null;

	@Column('varchar', {
		length: 512,
	})
	@Index('IDX_SW_SUBSCRIPTION_ENDPOINT', { synchronize: false })
	public endpoint: string;

	@Column('varchar', {
		length: 256,
	})
	public auth: string;

	@Column('varchar', {
		length: 128,
	})
	public publickey: string;

	@Column('boolean', {
		default: false,
	})
	public sendReadMessage: boolean;
}
