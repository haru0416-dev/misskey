/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import { QUEUE_TYPES } from '@/core/QueueAdminLogic.js';
import { adminQueueClearParamDef, adminQueueJobParamDef, adminQueueJobsParamDef, adminQueueSelectParamDef } from '@/server/rest/admin-queue.js';
import { z } from 'zod';

export const endpointMetas = {
	'admin/queue/clear': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		} as const,
		paramDef: adminQueueClearParamDef,
	},
	'admin/queue/deliver-delayed': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'array',
					optional: false, nullable: false,
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
				example: [[
					'example.com',
					12,
				]],
			},
		} as const,
		paramDef: z.object({}),
	},
	'admin/queue/inbox-delayed': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'array',
					optional: false, nullable: false,
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
				example: [[
					'example.com',
					12,
				]],
			},
		} as const,
		paramDef: z.object({}),
	},
	'admin/queue/retry-job': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		} as const,
		paramDef: adminQueueJobParamDef,
	},
	'admin/queue/remove-job': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		} as const,
		paramDef: adminQueueJobParamDef,
	},
	'admin/queue/show-job': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				optional: false, nullable: false,
				ref: 'QueueJob',
			},
		} as const,
		paramDef: adminQueueJobParamDef,
	},
	'admin/queue/show-job-logs': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					optional: false, nullable: false,
					type: 'string',
				},
			},
		} as const,
		paramDef: adminQueueJobParamDef,
	},
	'admin/queue/promote-jobs': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		} as const,
		paramDef: adminQueueSelectParamDef,
	},
	'admin/queue/pause': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		} as const,
		paramDef: adminQueueSelectParamDef,
	},
	'admin/queue/resume': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'write:admin:queue',
		} as const,
		paramDef: adminQueueSelectParamDef,
	},
	'admin/queue/jobs': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					optional: false, nullable: false,
					ref: 'QueueJob',
				},
			},
		} as const,
		paramDef: adminQueueJobsParamDef,
	},
	'admin/queue/stats': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:emoji',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					deliver: {
						optional: false, nullable: false,
						ref: 'QueueCount',
					},
					inbox: {
						optional: false, nullable: false,
						ref: 'QueueCount',
					},
					db: {
						optional: false, nullable: false,
						ref: 'QueueCount',
					},
					objectStorage: {
						optional: false, nullable: false,
						ref: 'QueueCount',
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	'admin/queue/queues': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'array',
				optional: false, nullable: false,
				items: {
					type: 'object',
					optional: false, nullable: false,
					properties: {
						name: {
							type: 'string',
							optional: false, nullable: false,
							enum: QUEUE_TYPES,
						},
						counts: {
							type: 'object',
							optional: false, nullable: false,
							additionalProperties: {
								type: 'number',
							},
						},
						isPaused: {
							type: 'boolean',
							optional: false, nullable: false,
						},
						outbox: {
							type: 'object',
							optional: false, nullable: true,
							properties: {
								pending: { type: 'number', optional: false, nullable: false },
								oldestPendingAgeMs: { type: 'number', optional: false, nullable: true },
							},
						},
						metrics: {
							type: 'object',
							optional: false, nullable: false,
							properties: {
								completed: {
									optional: false, nullable: false,
									ref: 'QueueMetrics',
								},
								failed: {
									optional: false, nullable: false,
									ref: 'QueueMetrics',
								},
							},
						},
					},
				},
			},
		} as const,
		paramDef: z.object({}),
	},
	'admin/queue/queue-stats': {
		meta: {
			tags: ['admin'],

			requireCredential: true,
			requireModerator: true,
			kind: 'read:admin:queue',

			res: {
				type: 'object',
				optional: false, nullable: false,
				properties: {
					name: {
						type: 'string',
						optional: false, nullable: false,
						enum: QUEUE_TYPES,
					},
					qualifiedName: {
						type: 'string',
						optional: false, nullable: false,
					},
					counts: {
						type: 'object',
						optional: false, nullable: false,
						additionalProperties: {
							type: 'number',
						},
					},
					isPaused: {
						type: 'boolean',
						optional: false, nullable: false,
					},
					outbox: {
						type: 'object',
						optional: false, nullable: true,
						properties: {
							pending: { type: 'number', optional: false, nullable: false },
							oldestPendingAgeMs: { type: 'number', optional: false, nullable: true },
						},
					},
					metrics: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							completed: {
								optional: false, nullable: false,
								ref: 'QueueMetrics',
							},
							failed: {
								optional: false, nullable: false,
								ref: 'QueueMetrics',
							},
						},
					},
					db: {
						type: 'object',
						optional: false, nullable: false,
						properties: {
							version: {
								type: 'string',
								optional: false, nullable: false,
							},
							mode: {
								type: 'string',
								optional: false, nullable: false,
								enum: ['cluster', 'standalone', 'sentinel'],
							},
							runId: {
								type: 'string',
								optional: false, nullable: false,
							},
							processId: {
								type: 'string',
								optional: false, nullable: false,
							},
							port: {
								type: 'number',
								optional: false, nullable: false,
							},
							os: {
								type: 'string',
								optional: false, nullable: false,
							},
							uptime: {
								type: 'number',
								optional: false, nullable: false,
							},
							memory: {
								type: 'object',
								optional: false, nullable: false,
								properties: {
									total: {
										type: 'number',
										optional: false, nullable: false,
									},
									used: {
										type: 'number',
										optional: false, nullable: false,
									},
									fragmentationRatio: {
										type: 'number',
										optional: false, nullable: false,
									},
									peak: {
										type: 'number',
										optional: false, nullable: false,
									},
								},
							},
							clients: {
								type: 'object',
								optional: false, nullable: false,
								properties: {
									blocked: {
										type: 'number',
										optional: false, nullable: false,
									},
									connected: {
										type: 'number',
										optional: false, nullable: false,
									},
								},
							},
						},
					}
				},
			},
		} as const,
		paramDef: adminQueueSelectParamDef,
	},
} as const;
