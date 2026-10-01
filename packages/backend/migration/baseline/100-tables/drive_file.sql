-- TABLE: drive_file
CREATE TABLE "public"."drive_file" (
    "id" character varying(32) NOT NULL,
    "userId" character varying(32),
    "userHost" character varying(128),
    "md5" character varying(32),
    "name" character varying(256) NOT NULL,
    "type" character varying(128) NOT NULL,
    "size" integer NOT NULL,
    "comment" character varying(512),
    "blurhash" character varying(128),
    "properties" "jsonb" DEFAULT '{}'::"jsonb" NOT NULL,
    "storedInternal" boolean NOT NULL,
    "url" character varying(1024) NOT NULL,
    "thumbnailUrl" character varying(512),
    "webpublicUrl" character varying(512),
    "webpublicType" character varying(128),
    "accessKey" character varying(256),
    "thumbnailAccessKey" character varying(256),
    "webpublicAccessKey" character varying(256),
    "uri" character varying(1024),
    "src" character varying(1024),
    "folderId" character varying(32),
    "isSensitive" boolean DEFAULT false NOT NULL,
    "maybeSensitive" boolean DEFAULT false NOT NULL,
    "maybePorn" boolean DEFAULT false NOT NULL,
    "isLink" boolean DEFAULT false NOT NULL,
    "requestHeaders" "jsonb" DEFAULT '{}'::"jsonb",
    "requestIp" character varying(128)
);

-- CONSTRAINT: drive_file drive_file_pkey
ALTER TABLE ONLY "public"."drive_file"
    ADD CONSTRAINT "drive_file_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_DRIVE_FILE_ACCESS_KEY_UNIQUE
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_ACCESS_KEY_UNIQUE" ON "public"."drive_file" USING "btree" ("accessKey");

-- INDEX: IDX_DRIVE_FILE_FOLDER_ID
CREATE INDEX "IDX_DRIVE_FILE_FOLDER_ID" ON "public"."drive_file" USING "btree" ("folderId");

-- INDEX: IDX_DRIVE_FILE_IS_LINK
CREATE INDEX "IDX_DRIVE_FILE_IS_LINK" ON "public"."drive_file" USING "btree" ("isLink");

-- INDEX: IDX_DRIVE_FILE_IS_SENSITIVE
CREATE INDEX "IDX_DRIVE_FILE_IS_SENSITIVE" ON "public"."drive_file" USING "btree" ("isSensitive");

-- INDEX: IDX_DRIVE_FILE_MAYBE_PORN
CREATE INDEX "IDX_DRIVE_FILE_MAYBE_PORN" ON "public"."drive_file" USING "btree" ("maybePorn");

-- INDEX: IDX_DRIVE_FILE_MAYBE_SENSITIVE
CREATE INDEX "IDX_DRIVE_FILE_MAYBE_SENSITIVE" ON "public"."drive_file" USING "btree" ("maybeSensitive");

-- INDEX: IDX_DRIVE_FILE_MD5
CREATE INDEX "IDX_DRIVE_FILE_MD5" ON "public"."drive_file" USING "btree" ("md5");

-- INDEX: IDX_DRIVE_FILE_THUMBNAIL_ACCESS_KEY_UNIQUE
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_THUMBNAIL_ACCESS_KEY_UNIQUE" ON "public"."drive_file" USING "btree" ("thumbnailAccessKey");

-- INDEX: IDX_DRIVE_FILE_TYPE
CREATE INDEX "IDX_DRIVE_FILE_TYPE" ON "public"."drive_file" USING "btree" ("type");

-- INDEX: IDX_DRIVE_FILE_URI
CREATE INDEX "IDX_DRIVE_FILE_URI" ON "public"."drive_file" USING "btree" ("uri");

-- INDEX: IDX_DRIVE_FILE_USER_HOST
CREATE INDEX "IDX_DRIVE_FILE_USER_HOST" ON "public"."drive_file" USING "btree" ("userHost");

-- INDEX: IDX_DRIVE_FILE_USER_ID
CREATE INDEX "IDX_DRIVE_FILE_USER_ID" ON "public"."drive_file" USING "btree" ("userId");

-- INDEX: IDX_DRIVE_FILE_USER_ID_FOLDER_ID_ID
CREATE INDEX "IDX_DRIVE_FILE_USER_ID_FOLDER_ID_ID" ON "public"."drive_file" USING "btree" ("userId", "folderId", "id");

-- INDEX: IDX_DRIVE_FILE_USER_ID_SIZE
CREATE INDEX "IDX_DRIVE_FILE_USER_ID_SIZE" ON "public"."drive_file" USING "btree" ("userId") INCLUDE ("size") WHERE ("isLink" = false);

-- INDEX: IDX_DRIVE_FILE_WEBPUBLIC_ACCESS_KEY_UNIQUE
CREATE UNIQUE INDEX "IDX_DRIVE_FILE_WEBPUBLIC_ACCESS_KEY_UNIQUE" ON "public"."drive_file" USING "btree" ("webpublicAccessKey");
