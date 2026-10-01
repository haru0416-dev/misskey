-- TABLE: drive_folder
CREATE TABLE "public"."drive_folder" (
    "id" character varying(32) NOT NULL,
    "name" character varying(128) NOT NULL,
    "userId" character varying(32),
    "parentId" character varying(32)
);

-- CONSTRAINT: drive_folder drive_folder_pkey
ALTER TABLE ONLY "public"."drive_folder"
    ADD CONSTRAINT "drive_folder_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_DRIVE_FOLDER_PARENT_ID
CREATE INDEX "IDX_DRIVE_FOLDER_PARENT_ID" ON "public"."drive_folder" USING "btree" ("parentId");

-- INDEX: IDX_DRIVE_FOLDER_USER_ID
CREATE INDEX "IDX_DRIVE_FOLDER_USER_ID" ON "public"."drive_folder" USING "btree" ("userId");
