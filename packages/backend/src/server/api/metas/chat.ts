/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

import {
	chatHistoryParamDef,
	chatMessagesCreateToRoomParamDef,
	chatMessagesCreateToUserParamDef,
	chatMessagesDeleteParamDef,
	chatMessagesReactParamDef,
	chatMessagesRoomTimelineParamDef,
	chatMessagesSearchParamDef,
	chatMessagesShowParamDef,
	chatMessagesUnreactParamDef,
	chatMessagesUserTimelineParamDef,
	chatRoomsCreateParamDef,
	chatRoomsDeleteParamDef,
	chatRoomsInvitationsCreateParamDef,
	chatRoomsInvitationsIgnoreParamDef,
	chatRoomsInvitationsInboxParamDef,
	chatRoomsInvitationsOutboxParamDef,
	chatRoomsJoinParamDef,
	chatRoomsJoiningParamDef,
	chatRoomsLeaveParamDef,
	chatRoomsMembersParamDef,
	chatRoomsMuteParamDef,
	chatRoomsOwnedParamDef,
	chatRoomsShowParamDef,
	chatRoomsUpdateParamDef,
} from '@/server/rest/chat.js';
import { z } from 'zod';
import { HOUR, DAY } from '@/const.js';

export const endpointMetas = {
	'chat/messages/create-to-user': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:chat',

			limit: {
				duration: HOUR,
				max: 500,
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'ChatMessageLiteFor1on1',
			},

			errors: {
				recipientIsYourself: {
					message: 'You can not send a message to yourself.',
					code: 'RECIPIENT_IS_YOURSELF',
					id: '17e2ba79-e22a-4cbc-bf91-d327643f4a7e',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '11795c64-40ea-4198-b06e-3c873ed9039d',
				},

				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: '4372b8e2-185d-4146-8749-2f68864a3e5f',
				},

				contentRequired: {
					message: 'Content required. You need to set text or fileId.',
					code: 'CONTENT_REQUIRED',
					id: '25587321-b0e6-449c-9239-f8925092942c',
				},

				youHaveBeenBlocked: {
					message: 'You cannot send a message because you have been blocked by this user.',
					code: 'YOU_HAVE_BEEN_BLOCKED',
					id: 'c15a5199-7422-4968-941a-2a462c478f7d',
				},

				chatNotAvailable: {
					message: 'Chat is not available with this user.',
					code: 'CHAT_NOT_AVAILABLE',
					id: '0b6812b5-f0c3-486b-a99a-4973d22c44b2',
				},
			},
		} as const,
		paramDef: chatMessagesCreateToUserParamDef,
	},
	'chat/messages/create-to-room': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:chat',

			limit: {
				duration: HOUR,
				max: 500,
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'ChatMessageLiteForRoom',
			},

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: '8098520d-2da5-4e8f-8ee1-df78b55a4ec6',
				},

				noSuchFile: {
					message: 'No such file.',
					code: 'NO_SUCH_FILE',
					id: 'b6accbd3-1d7b-4d9f-bdb7-eb185bac06db',
				},

				contentRequired: {
					message: 'Content required. You need to set text or fileId.',
					code: 'CONTENT_REQUIRED',
					id: '340517b7-6d04-42c0-bac1-37ee804e3594',
				},
			},
		} as const,
		paramDef: chatMessagesCreateToRoomParamDef,
	},
	'chat/messages/delete': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {
				noSuchMessage: {
					message: 'No such message.',
					code: 'NO_SUCH_MESSAGE',
					id: '36b67f0e-66a6-414b-83df-992a55294f17',
				},
			},
		} as const,
		paramDef: chatMessagesDeleteParamDef,
	},
	'chat/messages/show': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'ChatMessage',
			},

			errors: {
				noSuchMessage: {
					message: 'No such message.',
					code: 'NO_SUCH_MESSAGE',
					id: '3710865b-1848-4da9-8d61-cfed15510b93',
				},
			},
		} as const,
		paramDef: chatMessagesShowParamDef,
	},
	'chat/messages/react': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {
				noSuchMessage: {
					message: 'No such message.',
					code: 'NO_SUCH_MESSAGE',
					id: '9b5839b9-0ba0-4351-8c35-37082093d200',
				},

				tooManyReactions: {
					message: 'This message has too many reactions.',
					code: 'TOO_MANY_REACTIONS',
					id: '86753281-61b8-4dea-9a38-a08c0439f151',
				},
			},
		} as const,
		paramDef: chatMessagesReactParamDef,
	},
	'chat/messages/unreact': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {
				noSuchMessage: {
					message: 'No such message.',
					code: 'NO_SUCH_MESSAGE',
					id: 'c39ea42f-e3ca-428a-ad57-390e0a711595',
				},
			},
		} as const,
		paramDef: chatMessagesUnreactParamDef,
	},
	'chat/messages/user-timeline': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatMessageLiteFor1on1',
				},
			},

			errors: {
				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '11795c64-40ea-4198-b06e-3c873ed9039d',
				},
			},
		} as const,
		paramDef: chatMessagesUserTimelineParamDef,
	},
	'chat/messages/room-timeline': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatMessageLiteForRoom',
				},
			},

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: 'c4d9f88c-9270-4632-b032-6ed8cee36f7f',
				},
			},
		} as const,
		paramDef: chatMessagesRoomTimelineParamDef,
	},
	'chat/messages/search': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatMessage',
				},
			},

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: '460b3669-81b0-4dc9-a997-44442141bf83',
				},
			},
		} as const,
		paramDef: chatMessagesSearchParamDef,
	},
	'chat/rooms/create': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:chat',

			limit: {
				duration: DAY,
				max: 10,
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'ChatRoom',
			},

			errors: {},
		} as const,
		paramDef: chatRoomsCreateParamDef,
	},
	'chat/rooms/delete': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: 'd4e3753d-97bf-4a19-ab8e-21080fbc0f4b',
				},
			},
		} as const,
		paramDef: chatRoomsDeleteParamDef,
	},
	'chat/rooms/join': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: '84416476-5ce8-4a2c-b568-9569f1b10733',
				},

				cannotJoinRoom: {
					message: 'Cannot join this room.',
					code: 'CANNOT_JOIN_ROOM',
					id: 'c5a1e411-996d-46e1-be6e-82a8b996d1a1',
				},
			},
		} as const,
		paramDef: chatRoomsJoinParamDef,
	},
	'chat/rooms/leave': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: 'cb7f3179-50e8-4389-8c30-dbe2650a67c9',
				},
			},
		} as const,
		paramDef: chatRoomsLeaveParamDef,
	},
	'chat/rooms/mute': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: 'c2cde4eb-8d0f-42f1-8f2f-c4d6bfc8e5df',
				},
			},
		} as const,
		paramDef: chatRoomsMuteParamDef,
	},
	'chat/rooms/show': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'ChatRoom',
			},

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: '857ae02f-8759-4d20-9adb-6e95fffe4fd7',
				},
			},
		} as const,
		paramDef: chatRoomsShowParamDef,
	},
	'chat/rooms/owned': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatRoom',
				},
			},

			errors: {},
		} as const,
		paramDef: chatRoomsOwnedParamDef,
	},
	'chat/rooms/joining': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatRoomMembership',
				},
			},

			errors: {},
		} as const,
		paramDef: chatRoomsJoiningParamDef,
	},
	'chat/rooms/update': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'ChatRoom',
			},

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: 'fcdb0f92-bda6-47f9-bd05-343e0e020932',
				},
			},
		} as const,
		paramDef: chatRoomsUpdateParamDef,
	},
	'chat/rooms/members': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatRoomMembership',
				},
			},

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: '7b9fe84c-eafc-4d21-bf89-485458ed2c18',
				},
			},
		} as const,
		paramDef: chatRoomsMembersParamDef,
	},
	'chat/rooms/invitations/create': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			prohibitMoved: true,

			kind: 'write:chat',

			limit: {
				duration: DAY,
				max: 50,
			},

			res: {
				type: 'object',
				optional: false,
				nullable: false,
				ref: 'ChatRoomInvitation',
			},

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: '916f9507-49ba-4e90-b57f-1fd4deaa47a5',
				},

				noSuchUser: {
					message: 'No such user.',
					code: 'NO_SUCH_USER',
					id: '0f451b9e-fc21-491a-b2bf-46331103a945',
				},

				cannotCreateInvitation: {
					message: 'Cannot create an invitation for this room.',
					code: 'CANNOT_CREATE_INVITATION',
					id: 'a3482fe1-78c8-4489-bcbf-a488631e95f4',
				},
			},
		} as const,
		paramDef: chatRoomsInvitationsCreateParamDef,
	},
	'chat/rooms/invitations/ignore': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: '5130557e-5a11-4cfb-9cc5-fe60cda5de0d',
				},
			},
		} as const,
		paramDef: chatRoomsInvitationsIgnoreParamDef,
	},
	'chat/rooms/invitations/inbox': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatRoomInvitation',
				},
			},

			errors: {},
		} as const,
		paramDef: chatRoomsInvitationsInboxParamDef,
	},
	'chat/rooms/invitations/outbox': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatRoomInvitation',
				},
			},

			errors: {
				noSuchRoom: {
					message: 'No such room.',
					code: 'NO_SUCH_ROOM',
					id: 'a3c6b309-9717-4316-ae94-a69b53437237',
				},
			},
		} as const,
		paramDef: chatRoomsInvitationsOutboxParamDef,
	},
	'chat/history': {
		meta: {
			allowQuery: true,
			tags: ['chat'],

			requireCredential: true,

			kind: 'read:chat',

			res: {
				type: 'array',
				optional: false,
				nullable: false,
				items: {
					type: 'object',
					optional: false,
					nullable: false,
					ref: 'ChatMessage',
				},
			},

			errors: {},
		} as const,
		paramDef: chatHistoryParamDef,
	},
	'chat/read-all': {
		meta: {
			tags: ['chat'],

			requireCredential: true,

			kind: 'write:chat',

			errors: {},
		} as const,
		paramDef: z.object({}),
	},
} as const;
