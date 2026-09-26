/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { QUEUE_TYPES } from '@/core/queue/QueueAdminLogic.js';
import {
	adminQueueClearParamDef,
	adminQueueJobParamDef,
	adminQueueJobsParamDef,
	adminQueueOutboxJobParamDef,
	adminQueueOutboxJobsParamDef,
	adminQueueSelectParamDef,
} from '@/server/rest/admin/admin-queue.js';
import { z } from 'zod';
import { defineContract } from '@/server/rest/endpoint-contract.js';

// deliver-delayed と inbox-delayed は同じ [host, 件数] の組を返す。
const delayedJobCountsByHostSchema = {
	type: 'array',
	optional: false,
	nullable: false,
	items: {
		type: 'array',
		optional: false,
		nullable: false,
		prefixItems: [
			{
				type: 'string',
			},
			{
				type: 'number',
			},
		],
		unevaluatedItems: false,
	},
	example: [['example.com', 12]],
} as const;

const queueNameProperty = {
	type: 'string',
	optional: false,
	nullable: false,
	enum: QUEUE_TYPES,
} as const;

// queues の各要素と queue-stats は同じキュー状態を返す。
const queueStateProperties = {
	counts: {
		type: 'object',
		optional: false,
		nullable: false,
		additionalProperties: {
			type: 'number',
		},
	},
	isPaused: {
		type: 'boolean',
		optional: false,
		nullable: false,
	},
	outbox: {
		type: 'object',
		optional: false,
		nullable: true,
		properties: {
			pending: { type: 'number', optional: false, nullable: false },
			deadLetter: { type: 'number', optional: false, nullable: false },
			deliveryFailed: { type: 'number', optional: false, nullable: false },
			invalidPayload: { type: 'number', optional: false, nullable: false },
			oldestPendingAgeMs: { type: 'number', optional: false, nullable: true },
		},
	},
	metrics: {
		type: 'object',
		optional: false,
		nullable: false,
		properties: {
			completed: {
				optional: false,
				nullable: false,
				ref: 'QueueMetrics',
			},
			failed: {
				optional: false,
				nullable: false,
				ref: 'QueueMetrics',
			},
		},
	},
} as const;

export const endpointMetas = {
	'admin/queue/clear': defineContract({
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		},
		paramDef: adminQueueClearParamDef,
	}),
	'admin/queue/deliver-delayed': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: delayedJobCountsByHostSchema,
		},
		paramDef: z.object({}),
	}),
	'admin/queue/inbox-delayed': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: delayedJobCountsByHostSchema,
		},
		paramDef: z.object({}),
	}),
	'admin/queue/retry-job': defineContract({
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		},
		paramDef: adminQueueJobParamDef,
	}),
	'admin/queue/remove-job': defineContract({
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		},
		paramDef: adminQueueJobParamDef,
	}),
	'admin/queue/show-job': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				optional: false,
				nullable: false,
				ref: 'QueueJob',
			},
		},
		paramDef: adminQueueJobParamDef,
	}),
	'admin/queue/show-job-logs': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					optional: false,
					nullable: false,
					type: 'string',
				},
			},
		},
		paramDef: adminQueueJobParamDef,
	}),
	'admin/queue/promote-jobs': defineContract({
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		},
		paramDef: adminQueueSelectParamDef,
	}),
	'admin/queue/pause': defineContract({
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		},
		paramDef: adminQueueSelectParamDef,
	}),
	'admin/queue/resume': defineContract({
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		},
		paramDef: adminQueueSelectParamDef,
	}),
	'admin/queue/jobs': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					optional: false,
					nullable: false,
					ref: 'QueueJob',
				},
			},
		},
		paramDef: adminQueueJobsParamDef,
	}),
	'admin/queue/outbox-dead-letters': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					properties: {
						id: { type: 'string', optional: false, nullable: false },
						queue: { type: 'string', optional: false, nullable: false, enum: ['deliver', 'db'] },
						name: { type: 'string', optional: false, nullable: false },
						coordinatorId: { type: 'string', optional: false, nullable: true },
						externalJobId: { type: 'string', optional: false, nullable: true },
						// 隔離する 2 つの経路はどちらも理由を書くが、列は null を許す。壊れた行でも一覧を返せるよう null を宣言する。
						deadLetterReason: {
							type: 'string',
							optional: false,
							nullable: true,
							enum: ['deliveryFailed', 'invalidPayload', null],
						},
						lastError: { type: 'object', optional: false, nullable: true, additionalProperties: true },
						revision: { type: 'number', optional: false, nullable: false },
						// deadLetterReason='invalidPayload' の行は「data / opts がジョブとして解釈できない値だった」ことが隔離理由そのものなので、
						// 配列・文字列・null など object 以外もそのまま入っている。object と宣言すると生成SDKの型が実物と食い違う
						data: { optional: false, nullable: true },
						opts: { optional: false, nullable: true },
						createdAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
						updatedAt: { type: 'string', optional: false, nullable: false, format: 'date-time' },
					},
				},
			},
		},
		paramDef: adminQueueOutboxJobsParamDef,
	}),
	'admin/queue/retry-outbox-dead-letter': defineContract({
		meta: {
			tags: ['admin'],
			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
			errors: {
				stateChanged: {
					message: 'The queue outbox item has changed.',
					code: 'QUEUE_OUTBOX_STATE_CHANGED',
					id: '9209ed67-4fa3-44e9-955b-a6c5d6df172f',
				},
			},
		},
		paramDef: adminQueueOutboxJobParamDef,
	}),
	'admin/queue/abandon-outbox-dead-letter': defineContract({
		meta: {
			tags: ['admin'],
			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
			errors: {
				stateChanged: {
					message: 'The queue outbox item has changed.',
					code: 'QUEUE_OUTBOX_STATE_CHANGED',
					id: '9209ed67-4fa3-44e9-955b-a6c5d6df172f',
				},
			},
		},
		paramDef: adminQueueOutboxJobParamDef,
	}),
	'admin/queue/stats': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					deliver: {
						optional: false,
						nullable: false,
						ref: 'QueueCount',
					},
					inbox: {
						optional: false,
						nullable: false,
						ref: 'QueueCount',
					},
					db: {
						optional: false,
						nullable: false,
						ref: 'QueueCount',
					},
					objectStorage: {
						optional: false,
						nullable: false,
						ref: 'QueueCount',
					},
				},
			},
		},
		paramDef: z.object({}),
	}),
	'admin/queue/queues': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					properties: {
						name: queueNameProperty,
						...queueStateProperties,
					},
				},
			},
		},
		paramDef: z.object({}),
	}),
	'admin/queue/queue-stats': defineContract({
		meta: {
			allowQuery: true,
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				properties: {
					name: queueNameProperty,
					qualifiedName: {
						type: 'string',
						optional: false,
						nullable: false,
					},
					...queueStateProperties,
					db: {
						type: 'object',
						optional: false,
						nullable: false,
						properties: {
							version: {
								type: 'string',
								optional: false,
								nullable: false,
							},
							mode: {
								type: 'string',
								optional: false,
								nullable: false,
								enum: ['cluster', 'standalone', 'sentinel'],
							},
							runId: {
								type: 'string',
								optional: false,
								nullable: false,
							},
							processId: {
								type: 'string',
								optional: false,
								nullable: false,
							},
							port: {
								type: 'number',
								optional: false,
								nullable: false,
							},
							os: {
								type: 'string',
								optional: false,
								nullable: false,
							},
							uptime: {
								type: 'number',
								optional: false,
								nullable: false,
							},
							memory: {
								type: 'object',
								optional: false,
								nullable: false,
								properties: {
									total: {
										type: 'number',
										optional: false,
										nullable: false,
									},
									used: {
										type: 'number',
										optional: false,
										nullable: false,
									},
									fragmentationRatio: {
										type: 'number',
										optional: false,
										nullable: false,
									},
									peak: {
										type: 'number',
										optional: false,
										nullable: false,
									},
								},
							},
							clients: {
								type: 'object',
								optional: false,
								nullable: false,
								properties: {
									blocked: {
										type: 'number',
										optional: false,
										nullable: false,
									},
									connected: {
										type: 'number',
										optional: false,
										nullable: false,
									},
								},
							},
						},
					},
				},
			},
		},
		paramDef: adminQueueSelectParamDef,
	}),
};
