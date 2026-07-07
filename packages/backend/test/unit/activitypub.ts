/*
 * SPDX-FileCopyrightText: syuilo and misskey-project
 * SPDX-License-Identifier: AGPL-3.0-only
 */

process.env.NODE_ENV = 'test';

import * as assert from 'assert';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { afterAll, describe, beforeAll, beforeEach, test, vi } from 'vitest';
import type * as Redis from 'ioredis';
import type { ModuleRef } from '@nestjs/core';

import { MockResolver } from '../misc/mock-resolver.js';
import type { IActor, IApDocument, ICollection, IObject, IPost } from '@/core/activitypub/type.js';
import type { MiRemoteUser } from '@/models/User.js';
import type { MiDriveFile } from '@/models/DriveFile.js';
import { ApImageService } from '@/core/activitypub/models/ApImageService.js';
import { ApNoteService } from '@/core/activitypub/models/ApNoteService.js';
import { ApPersonService } from '@/core/activitypub/models/ApPersonService.js';
import { ApDbResolverService } from '@/core/activitypub/ApDbResolverService.js';
import { ApRendererService } from '@/core/activitypub/ApRendererService.js';
import { JsonLdService } from '@/core/activitypub/JsonLdService.js';
import { CONTEXT } from '@/core/activitypub/misc/contexts.js';
import { FederatedInstanceService } from '@/core/FederatedInstanceService.js';
import { LoggerService } from '@/core/LoggerService.js';
import type { MiMeta, MiNote } from '@/models/_.js';
import { secureRndstr } from '@/misc/secure-rndstr.js';
import type { DownloadService } from '@/core/DownloadService.js';
import { genAidx } from '@/misc/id/aidx.js';
import { fetchUserProfileByUserIdOrFailFromDatabase } from '@/core/UserProfileStore.js';
import type { MiDrizzleDatabase, MiDrizzlePool } from '@/drizzle.js';

// Direct-construction dependencies. This test used to bootstrap a real NestJS DI
// container (GlobalModule + CoreModule) just to obtain the AP services below; it now
// constructs them with `new` (using the moduleRef-stub trick for the onModuleInit
// services) so the suite no longer depends on Test.createTestingModule.
import { loadConfig } from '@/config.js';
import { createDrizzlePool, createDrizzleDatabase } from '@/drizzle.js';
import { createRedisClient } from '@/runtime-dependencies.js';
import { IdService } from '@/core/IdService.js';
import { UtilityService } from '@/core/UtilityService.js';
import { RemoteLoggerService } from '@/core/RemoteLoggerService.js';
import { ApLoggerService } from '@/core/activitypub/ApLoggerService.js';
import { ChartLoggerService } from '@/core/chart/ChartLoggerService.js';
import { HttpRequestService } from '@/core/HttpRequestService.js';
import { MfmService } from '@/core/MfmService.js';
import { ApMfmService } from '@/core/activitypub/ApMfmService.js';
import { GlobalEventService } from '@/core/GlobalEventService.js';
import { FeaturedService } from '@/core/FeaturedService.js';
import { HashtagService } from '@/core/HashtagService.js';
import { UserEntityService } from '@/core/entities/UserEntityService.js';
import { DriveFolderEntityService } from '@/core/entities/DriveFolderEntityService.js';
import { DriveFileEntityService } from '@/core/entities/DriveFileEntityService.js';
import { ImageProcessingService } from '@/core/ImageProcessingService.js';
import { VideoProcessingService } from '@/core/VideoProcessingService.js';
import { AiService } from '@/core/AiService.js';
import { FileInfoService } from '@/core/FileInfoService.js';
import { InternalStorageService } from '@/core/InternalStorageService.js';
import { S3Service } from '@/core/S3Service.js';
import { CacheService } from '@/core/CacheService.js';
import { RoleService } from '@/core/RoleService.js';
import { DriveService } from '@/core/DriveService.js';
import { NoteCreateService } from '@/core/NoteCreateService.js';
import UsersChart from '@/core/chart/charts/users.js';
import InstanceChart from '@/core/chart/charts/instance.js';
import DriveChart from '@/core/chart/charts/drive.js';
import PerUserDriveChart from '@/core/chart/charts/per-user-drive.js';
import { ApResolverService, Resolver } from '@/core/activitypub/ApResolverService.js';
import { ApAudienceService } from '@/core/activitypub/ApAudienceService.js';
import { ApMentionService } from '@/core/activitypub/models/ApMentionService.js';
import { ApQuestionService } from '@/core/activitypub/models/ApQuestionService.js';

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const host = 'https://host1.test';

type NonTransientIActor = IActor & { id: string };
type NonTransientIPost = IPost & { id: string };

function createRandomActor({ actorHost = host } = {}): NonTransientIActor {
	const preferredUsername = secureRndstr(8);
	const actorId = `${actorHost}/users/${preferredUsername.toLowerCase()}`;

	return {
		'@context': 'https://www.w3.org/ns/activitystreams',
		id: actorId,
		type: 'Person',
		preferredUsername,
		inbox: `${actorId}/inbox`,
		outbox: `${actorId}/outbox`,
	};
}

function createRandomNote(actor: NonTransientIActor): NonTransientIPost {
	const id = secureRndstr(8);
	const noteId = `${new URL(actor.id).origin}/notes/${id}`;

	return {
		id: noteId,
		type: 'Note',
		attributedTo: actor.id,
		content: 'test test foo',
	};
}

function createRandomNotes(actor: NonTransientIActor, length: number): NonTransientIPost[] {
	return new Array(length).fill(null).map(() => createRandomNote(actor));
}

function createRandomFeaturedCollection(actor: NonTransientIActor, length: number): ICollection {
	const items = createRandomNotes(actor, length);

	return {
		'@context': 'https://www.w3.org/ns/activitystreams',
		type: 'Collection',
		id: actor.outbox as string,
		totalItems: items.length,
		items,
	};
}

async function createRandomRemoteUser(
	resolver: MockResolver,
	personService: ApPersonService,
): Promise<MiRemoteUser> {
	const actor = createRandomActor();
	resolver.register(actor.id, actor);

	return await personService.createPerson(actor.id, resolver);
}

describe('ActivityPub', () => {
	let pool: MiDrizzlePool;
	let redisClient: Redis.Redis;
	let db: MiDrizzleDatabase;
	let imageService: ApImageService;
	let noteService: ApNoteService;
	let personService: ApPersonService;
	let apDbResolverService: ApDbResolverService;
	let rendererService: ApRendererService;
	let jsonLdService: JsonLdService;
	let resolver: MockResolver;

	const metaInitial = {
		cacheRemoteFiles: true,
		cacheRemoteSensitiveFiles: true,
		enableFanoutTimeline: true,
		enableFanoutTimelineDbFallback: true,
		perUserHomeTimelineCacheMax: 100,
		perLocalUserUserTimelineCacheMax: 100,
		perRemoteUserUserTimelineCacheMax: 100,
		blockedHosts: [] as string[],
		sensitiveWords: [] as string[],
		prohibitedWords: [] as string[],
	} as MiMeta;
	const meta = { ...metaInitial };

	function updateMeta(newMeta: Partial<MiMeta>): void {
		for (const key in meta) {
			delete (meta as any)[key];
		}
		Object.assign(meta, newMeta);
	}

	beforeAll(async () => {
		const config = loadConfig();
		pool = createDrizzlePool(config);
		db = createDrizzleDatabase(pool, config);
		redisClient = createRedisClient(config);

		const unused = undefined as never;
		// pub/sub stubs: nothing is ever published on these channels during these tests,
		// so a no-op subscribe/publish surface is sufficient (real redisClient is still
		// used wherever actual GET/SET/lock semantics are required).
		const redisForSub = { on: () => {}, off: () => {} } as unknown as Redis.Redis;
		const redisForPub = { publish: () => {} } as unknown as Redis.Redis;
		const redisForTimelines = { on: () => {}, off: () => {} } as unknown as Redis.Redis;

		// DownloadService fake, identical to the original overrideProvider: copy a local
		// fixture PNG for `.png` URLs so image tests never hit the network.
		const downloadService = {
			async downloadUrl(url: string, path: string): Promise<{ filename: string }> {
				if (url.endsWith('.png')) {
					fs.copyFileSync(
						_dirname + '/../resources/hw.png',
						path,
					);
				}
				return {
					filename: 'dummy.tmp',
				};
			},
		} as unknown as DownloadService;

		// --- cross-cutting / leaf services ---
		const idService = new IdService(config);
		const utilityService = new UtilityService(config, meta);
		const loggerService = new LoggerService();
		const remoteLoggerService = new RemoteLoggerService(loggerService);
		const apLoggerService = new ApLoggerService(remoteLoggerService);
		const chartLoggerService = new ChartLoggerService(loggerService);
		const httpRequestService = new HttpRequestService(config);
		const mfmService = new MfmService(config);
		const apMfmService = new ApMfmService(mfmService);
		const globalEventService = new GlobalEventService(config, redisForPub);
		const featuredService = new FeaturedService(redisClient);

		// --- entity services (only pure helpers such as isRemoteUser / genLocalUserUri /
		//     getPublicUrl are reached, none of which touch the onModuleInit-resolved
		//     fields, so UserEntityService.onModuleInit() is intentionally not called). ---
		const userEntityService = new UserEntityService(unused, config, meta, redisClient, db);
		const driveFolderEntityService = new DriveFolderEntityService(db, idService);
		const imageProcessingService = new ImageProcessingService();
		const videoProcessingService = new VideoProcessingService(config, imageProcessingService);
		const driveFileEntityService = new DriveFileEntityService(config, meta, db, userEntityService, utilityService, driveFolderEntityService, videoProcessingService, idService);
		const cacheService = new CacheService(redisClient, redisForSub, db, userEntityService);
		const aiService = new AiService(meta, httpRequestService, loggerService);
		const fileInfoService = new FileInfoService(aiService, loggerService);
		const internalStorageService = new InternalStorageService(config);
		const s3Service = new S3Service(httpRequestService);

		// --- charts: .update() only buffers a diff (commit runs on a timer we never
		//     trigger), backed by the real drizzle pool + redis lock. ---
		const usersChart = new UsersChart(db, redisClient, db, userEntityService, chartLoggerService);
		const instanceChart = new InstanceChart(db, redisClient, db, utilityService, chartLoggerService);
		const driveChart = new DriveChart(db, redisClient, chartLoggerService);
		const perUserDriveChart = new PerUserDriveChart(db, redisClient, db, driveFileEntityService, chartLoggerService);

		// --- RoleService: only getUserPolicies is exercised (returns DEFAULT_POLICIES for
		//     these fresh, unroled users). It never touches notificationService (the sole
		//     moduleRef.get target), so onModuleInit is intentionally not called and the
		//     moduleRef / notification-related params are left unused. ---
		const roleService = new RoleService(unused, config, meta, redisForTimelines, redisForSub, db, cacheService, userEntityService, globalEventService, idService, unused, unused);

		const hashtagService = new HashtagService(meta, redisClient, db, userEntityService, featuredService, idService, utilityService);

		const federatedInstanceService = new FederatedInstanceService(redisClient, db, utilityService, idService);
		// Prevent ApPersonService from fetching instance metadata over the network.
		vi.spyOn(federatedInstanceService, 'fetch').mockImplementation(() => new Promise(() => { }));

		// --- DriveService: ApImageService.createImage exercises uploadFromUrl → addFile →
		//     save (internal storage), so its file storage/analysis collaborators are real;
		//     queue/moderation-log deps (never reached for these images) are unused. ---
		const driveService = new DriveService(
			config,
			meta,
			db,
			fileInfoService,
			userEntityService,
			driveFileEntityService,
			idService,
			downloadService,
			internalStorageService,
			s3Service,
			imageProcessingService,
			videoProcessingService,
			globalEventService,
			unused, // queueService
			roleService,
			unused, // moderationLogService
			driveChart,
			perUserDriveChart,
			instanceChart,
			utilityService,
		);

		// --- ApRendererService: only renderAnnounce (userEntityService.genLocalUserUri,
		//     config, idService.parse) and renderDocument (driveFileEntityService.getPublicUrl)
		//     are exercised; the rest is unused. ---
		rendererService = new ApRendererService(
			config,
			meta,
			db,
			unused, // customEmojiService
			userEntityService,
			driveFileEntityService,
			unused, // jsonLdService
			unused, // userKeypairService
			unused, // apMfmService
			unused, // mfmService
			idService,
			utilityService,
		);

		// JsonLdService.use().compact() on the inline @context only resolves preloaded
		// contexts, so httpRequestService is not called; passed real anyway.
		jsonLdService = new JsonLdService(httpRequestService);

		// --- ApResolverService: createResolver() delegates to moduleRef.create(Resolver).
		//     The only Resolver actually built here is used by ApImageService.createImage,
		//     which resolves an inline object (Resolver.resolve returns non-string values
		//     immediately), so only loggerService/utilityService of the Resolver matter. ---
		const resolverModuleRef = {
			create: async () => new Resolver(
				config,
				meta,
				db,
				utilityService,
				unused, // systemAccountService
				unused, // apRequestService
				unused, // httpRequestService
				unused, // apRendererService
				unused, // apDbResolverService
				loggerService,
			),
		} as unknown as ModuleRef;
		const apResolverService = new ApResolverService(resolverModuleRef);

		// --- ApPersonService uses the moduleRef + onModuleInit pattern. Build its collaborator
		//     map up front (filled after the mutually-recursive AP services exist) and hand it a
		//     fake moduleRef that reads from that map; roleService (only reached via avatar/banner
		//     resolution, which these actors never trigger) is left unused. ---
		const personDeps: Record<string, unknown> = {};
		const personModuleRef = { get: (token: string) => personDeps[token] } as unknown as ModuleRef;
		personService = new ApPersonService(personModuleRef, config, meta, db, unused);

		apDbResolverService = new ApDbResolverService(config, db, cacheService, personService, utilityService);
		imageService = new ApImageService(meta, db, apResolverService, driveService, apLoggerService);
		const apAudienceService = new ApAudienceService(personService);
		const apMentionService = new ApMentionService(personService);
		const apQuestionService = new ApQuestionService(config, db, apResolverService, apLoggerService, utilityService);

		// --- NoteCreateService: create() synchronously builds and returns the note via
		//     insertNote (reaching only meta/utilityService/roleService.getUserPolicies/
		//     idService/drizzle). The heavy postNoteCreated() runs later via setImmediate
		//     gated on an AbortController; dispose() aborts it, so every subsequent create()
		//     cleanly skips it and its streaming/timeline/antenna/search collaborators are
		//     left unused (they are never reached and would otherwise require reconstructing
		//     essentially all of CoreModule). ---
		const noteCreateService = new NoteCreateService(
			config,
			meta,
			db,
			redisForTimelines,
			userEntityService,
			unused, // noteEntityService
			idService,
			globalEventService,
			unused, // queueService
			unused, // fanoutTimelineService
			unused, // notificationService
			unused, // relayService
			federatedInstanceService,
			hashtagService,
			unused, // antennaService
			unused, // webhookService
			featuredService,
			unused, // remoteUserResolveService
			unused, // apDeliverManagerService
			rendererService,
			roleService,
			unused, // searchService
			unused, // notesChart
			unused, // perUserNotesChart
			unused, // activeUsersChart
			instanceChart,
			utilityService,
			unused, // userBlockingService
			cacheService,
		);
		await noteCreateService.dispose();

		noteService = new ApNoteService(
			config,
			meta,
			redisClient,
			db,
			idService,
			apMfmService,
			apResolverService,
			personService,
			utilityService,
			apAudienceService,
			apMentionService,
			imageService,
			apQuestionService,
			unused, // pollService (vote path not reached)
			noteCreateService,
			apDbResolverService,
			apLoggerService,
		);

		// Fill ApPersonService's collaborator map, then run its manual lifecycle init.
		Object.assign(personDeps, {
			UtilityService: utilityService,
			UserEntityService: userEntityService,
			DriveFileEntityService: driveFileEntityService,
			IdService: idService,
			GlobalEventService: globalEventService,
			FederatedInstanceService: federatedInstanceService,
			FetchInstanceMetadataService: unused,
			CacheService: cacheService,
			ApResolverService: apResolverService,
			ApNoteService: noteService,
			ApImageService: imageService,
			ApMfmService: apMfmService,
			MfmService: mfmService,
			HashtagService: hashtagService,
			UsersChart: usersChart,
			InstanceChart: instanceChart,
			ApLoggerService: apLoggerService,
			AccountMoveService: unused,
		});
		personService.onModuleInit();

		resolver = new MockResolver(new LoggerService());
	});

	afterAll(async () => {
		await pool.end();
		redisClient.disconnect();
	});

	beforeEach(() => {
		resolver.clear();
	});

	describe('Parse minimum object', () => {
		const actor = createRandomActor();

		const post = {
			'@context': 'https://www.w3.org/ns/activitystreams',
			id: `${host}/users/${secureRndstr(8)}`,
			type: 'Note',
			attributedTo: actor.id,
			to: 'https://www.w3.org/ns/activitystreams#Public',
			content: 'あ',
		};

		test('Minimum Actor', async () => {
			resolver.register(actor.id, actor);

			const user = await personService.createPerson(actor.id, resolver);

			assert.deepStrictEqual(user.uri, actor.id);
			assert.deepStrictEqual(user.username, actor.preferredUsername);
			assert.deepStrictEqual(user.inbox, actor.inbox);
		});

		test('Actor public key', async () => {
			const actor = createRandomActor();
			const publicKey = {
				id: `${actor.id}#main-key`,
				publicKeyPem: '-----BEGIN PUBLIC KEY-----\nactor-test-key\n-----END PUBLIC KEY-----',
			};
			resolver.register(actor.id, { ...actor, publicKey });

			const user = await personService.createPerson(actor.id, resolver);
			const authUser = await apDbResolverService.getAuthUserFromKeyId(publicKey.id);

			assert.notStrictEqual(authUser, null);
			assert.strictEqual(authUser?.user.id, user.id);
			assert.strictEqual(authUser?.key.keyPem, publicKey.publicKeyPem);
		});

		test('Minimum Note', async () => {
			resolver.register(actor.id, actor);
			resolver.register(post.id, post);

			const note = await noteService.createNote(post.id, undefined, resolver, true);

			assert.deepStrictEqual(note?.uri, post.id);
			assert.deepStrictEqual(note.visibility, 'public');
			assert.deepStrictEqual(note.text, post.content);
		});
	});

	describe('Name field', () => {
		test('Truncate long name', async () => {
			const actor = {
				...createRandomActor(),
				name: secureRndstr(129),
			};

			resolver.register(actor.id, actor);

			const user = await personService.createPerson(actor.id, resolver);

			assert.deepStrictEqual(user.name, actor.name.slice(0, 128));
		});

		test('Normalize empty name', async () => {
			const actor = {
				...createRandomActor(),
				name: '',
			};

			resolver.register(actor.id, actor);

			const user = await personService.createPerson(actor.id, resolver);

			assert.strictEqual(user.name, null);
		});
	});

	describe('alsoKnownAs field', () => {
		test('Handle alsoKnownAs as an array', async () => {
			const actor = {
				...createRandomActor(),
				alsoKnownAs: ['https://example.com/users/alice', 'https://example.com/users/alice2'],
			};

			resolver.register(actor.id, actor);

			const user = await personService.createPerson(actor.id, resolver);

			assert.deepStrictEqual(user.alsoKnownAs, actor.alsoKnownAs);
		});

		test('Handle alsoKnownAs as a string', async () => {
			const actor = {
				...createRandomActor(),
				alsoKnownAs: 'https://example.com/users/alice',
			};

			resolver.register(actor.id, actor);

			const user = await personService.createPerson(actor.id, resolver);

			assert.deepStrictEqual(user.alsoKnownAs, [actor.alsoKnownAs]);
		});

		test('Update person with alsoKnownAs as a string', async () => {
			const actor = createRandomActor();
			resolver.register(actor.id, actor);
			const user = await personService.createPerson(actor.id, resolver);

			const updatedActor = {
				...actor,
				alsoKnownAs: 'https://example.com/users/alice',
			};
			resolver.register(actor.id, updatedActor);

			await personService.updatePerson(actor.id, resolver, updatedActor);

			const updatedUser = await personService.fetchPerson(actor.id);
			assert.deepStrictEqual(updatedUser?.alsoKnownAs, [updatedActor.alsoKnownAs]);
		});
	});

	describe('Collection visibility', () => {
		test('Public following/followers', async () => {
			const actor = createRandomActor();
			actor.following = {
				id: `${actor.id}/following`,
				type: 'OrderedCollection',
				totalItems: 0,
				first: `${actor.id}/following?page=1`,
			};
			actor.followers = `${actor.id}/followers`;

			resolver.register(actor.id, actor);
			resolver.register(actor.followers, {
				id: actor.followers,
				type: 'OrderedCollection',
				totalItems: 0,
				first: `${actor.followers}?page=1`,
			});

			const user = await personService.createPerson(actor.id, resolver);
			const userProfile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);

			assert.deepStrictEqual(userProfile.followingVisibility, 'public');
			assert.deepStrictEqual(userProfile.followersVisibility, 'public');
		});

		test('Private following/followers', async () => {
			const actor = createRandomActor();
			actor.following = {
				id: `${actor.id}/following`,
				type: 'OrderedCollection',
				totalItems: 0,
				// first: …
			};
			actor.followers = `${actor.id}/followers`;

			resolver.register(actor.id, actor);
			//resolver.register(actor.followers, { … });

			const user = await personService.createPerson(actor.id, resolver);
			const userProfile = await fetchUserProfileByUserIdOrFailFromDatabase(db, user.id);

			assert.deepStrictEqual(userProfile.followingVisibility, 'private');
			assert.deepStrictEqual(userProfile.followersVisibility, 'private');
		});
	});

	describe('Renderer', () => {
		test('Render an announce with visibility: followers', () => {
			rendererService.renderAnnounce('https://example.com/notes/00example', {
				id: genAidx(Date.now()),
				visibility: 'followers',
			} as MiNote);
		});
	});

	describe('Featured', () => {
		test('Fetch featured notes from IActor', async () => {
			const actor = createRandomActor();
			actor.featured = `${actor.id}/collections/featured`;

			const featured = createRandomFeaturedCollection(actor, 5);

			resolver.register(actor.id, actor);
			resolver.register(actor.featured, featured);

			await personService.createPerson(actor.id, resolver);

			// All notes in `featured` are same-origin, no need to fetch notes again
			assert.deepStrictEqual(resolver.remoteGetTrials(), [actor.id, actor.featured]);

			// Created notes without resolving anything
			for (const item of featured.items as IPost[]) {
				const note = await noteService.fetchNote(item);
				assert.ok(note);
				assert.strictEqual(note.text, 'test test foo');
				assert.strictEqual(note.uri, item.id);
			}
		});

		test('Fetch featured notes from IActor pointing to another remote server', async () => {
			const actor1 = createRandomActor();
			actor1.featured = `${actor1.id}/collections/featured`;
			const actor2 = createRandomActor({ actorHost: 'https://host2.test' });

			const actor2Note = createRandomNote(actor2);
			const featured = createRandomFeaturedCollection(actor1, 0);
			(featured.items as IPost[]).push({
				...actor2Note,
				content: 'test test bar', // fraud!
			});

			resolver.register(actor1.id, actor1);
			resolver.register(actor1.featured, featured);
			resolver.register(actor2.id, actor2);
			resolver.register(actor2Note.id, actor2Note);

			await personService.createPerson(actor1.id, resolver);

			// actor2Note is from a different server and needs to be fetched again
			assert.deepStrictEqual(
				resolver.remoteGetTrials(),
				[actor1.id, actor1.featured, actor2Note.id, actor2.id],
			);

			const note = await noteService.fetchNote(actor2Note.id);
			assert.ok(note);

			// Reflects the original content instead of the fraud
			assert.strictEqual(note.text, 'test test foo');
			assert.strictEqual(note.uri, actor2Note.id);
		});

		test('Fetch a note that is a featured note of the attributed actor', async () => {
			const actor = createRandomActor();
			actor.featured = `${actor.id}/collections/featured`;

			const featured = createRandomFeaturedCollection(actor, 5);
			const firstNote = (featured.items as NonTransientIPost[])[0];

			resolver.register(actor.id, actor);
			resolver.register(actor.featured, featured);
			resolver.register(firstNote.id, firstNote);

			const note = await noteService.createNote(firstNote.id as string, undefined, resolver);
			assert.strictEqual(note?.uri, firstNote.id);
		});
	});

	describe('Images', () => {
		test('Render image document with dimensions', () => {
			const rendered = rendererService.renderDocument({
				id: genAidx(Date.now()),
				type: 'image/png',
				webpublicType: null,
				url: 'https://example.test/files/image.png',
				webpublicUrl: null,
				comment: null,
				isSensitive: false,
				properties: { width: 3600, height: 1890 },
				uri: null,
				userHost: null,
				isLink: false,
				webpublicAccessKey: null,
			} as MiDriveFile);

			assert.strictEqual(rendered.type, 'Document');
			assert.strictEqual(rendered.mediaType, 'image/png');
			assert.strictEqual(rendered.width, 3600);
			assert.strictEqual(rendered.height, 1890);
		});

		test('Create images', async () => {
			const imageObject: IApDocument = {
				type: 'Document',
				mediaType: 'image/png',
				url: 'http://host1.test/foo.png',
				name: '',
			};
			const driveFile = await imageService.createImage(
				await createRandomRemoteUser(resolver, personService),
				imageObject,
			);
			assert.ok(driveFile && !driveFile.isLink);

			const sensitiveImageObject: IApDocument = {
				type: 'Document',
				mediaType: 'image/png',
				url: 'http://host1.test/bar.png',
				name: '',
				sensitive: true,
			};
			const sensitiveDriveFile = await imageService.createImage(
				await createRandomRemoteUser(resolver, personService),
				sensitiveImageObject,
			);
			assert.ok(sensitiveDriveFile && !sensitiveDriveFile.isLink);
		});

		test('cacheRemoteFiles=false disables caching', async () => {
			updateMeta({ ...metaInitial, cacheRemoteFiles: false });

			const imageObject: IApDocument = {
				type: 'Document',
				mediaType: 'image/png',
				url: 'http://host1.test/foo.png',
				name: '',
			};
			const driveFile = await imageService.createImage(
				await createRandomRemoteUser(resolver, personService),
				imageObject,
			);
			assert.ok(driveFile && driveFile.isLink);

			const sensitiveImageObject: IApDocument = {
				type: 'Document',
				mediaType: 'image/png',
				url: 'http://host1.test/bar.png',
				name: '',
				sensitive: true,
			};
			const sensitiveDriveFile = await imageService.createImage(
				await createRandomRemoteUser(resolver, personService),
				sensitiveImageObject,
			);
			assert.ok(sensitiveDriveFile && sensitiveDriveFile.isLink);
		});

		test('cacheRemoteSensitiveFiles=false only affects sensitive files', async () => {
			updateMeta({ ...metaInitial, cacheRemoteSensitiveFiles: false });

			const imageObject: IApDocument = {
				type: 'Document',
				mediaType: 'image/png',
				url: 'http://host1.test/foo.png',
				name: '',
			};
			const driveFile = await imageService.createImage(
				await createRandomRemoteUser(resolver, personService),
				imageObject,
			);
			assert.ok(driveFile && !driveFile.isLink);

			const sensitiveImageObject: IApDocument = {
				type: 'Document',
				mediaType: 'image/png',
				url: 'http://host1.test/bar.png',
				name: '',
				sensitive: true,
			};
			const sensitiveDriveFile = await imageService.createImage(
				await createRandomRemoteUser(resolver, personService),
				sensitiveImageObject,
			);
			assert.ok(sensitiveDriveFile && sensitiveDriveFile.isLink);
		});

		test('Link is not an attachment files', async () => {
			const linkObject: IObject = {
				type: 'Link',
				href: 'https://example.com/',
			};
			const driveFile = await imageService.createImage(
				await createRandomRemoteUser(resolver, personService),
				linkObject,
			);
			assert.strictEqual(driveFile, null);
		});
	});

	describe('JSON-LD', () => {
		test('Compaction', async () => {
			const jsonLd = jsonLdService.use();

			const object = {
				'@context': [
					'https://www.w3.org/ns/activitystreams',
					{
						_misskey_quote: 'https://misskey-hub.net/ns#_misskey_quote',
						unknown: 'https://example.org/ns#unknown',
						undefined: null,
					},
				],
				id: 'https://example.com/notes/42',
				type: 'Note',
				attributedTo: 'https://example.com/users/1',
				to: ['https://www.w3.org/ns/activitystreams#Public'],
				content: 'test test foo',
				_misskey_quote: 'https://example.com/notes/1',
				unknown: 'test test bar',
				undefined: 'test test baz',
			};
			const compacted = await jsonLd.compact(object);

			assert.deepStrictEqual(compacted, {
				'@context': CONTEXT,
				id: 'https://example.com/notes/42',
				type: 'Note',
				attributedTo: 'https://example.com/users/1',
				to: 'as:Public',
				content: 'test test foo',
				_misskey_quote: 'https://example.com/notes/1',
				'https://example.org/ns#unknown': 'test test bar',
				// undefined: 'test test baz',
			});
		});
	});
});
