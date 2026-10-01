-- TABLE: __chart__per_user_drive
CREATE TABLE "public"."__chart__per_user_drive" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___totalCount" integer DEFAULT 0 NOT NULL,
    "___totalSize" integer DEFAULT 0 NOT NULL,
    "___incCount" smallint DEFAULT '0'::smallint NOT NULL,
    "___incSize" integer DEFAULT 0 NOT NULL,
    "___decCount" smallint DEFAULT '0'::smallint NOT NULL,
    "___decSize" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__per_user_drive_id_seq
CREATE SEQUENCE "public"."__chart__per_user_drive_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__per_user_drive_id_seq
ALTER SEQUENCE "public"."__chart__per_user_drive_id_seq" OWNED BY "public"."__chart__per_user_drive"."id";

-- DEFAULT: __chart__per_user_drive id
ALTER TABLE ONLY "public"."__chart__per_user_drive" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__per_user_drive_id_seq"'::"regclass");

-- CONSTRAINT: __chart__per_user_drive PK_d0ef23d24d666e1a44a0cd3d208
ALTER TABLE ONLY "public"."__chart__per_user_drive"
    ADD CONSTRAINT "PK_d0ef23d24d666e1a44a0cd3d208" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__per_user_drive UQ_30bf67687f483ace115c5ca6429
ALTER TABLE ONLY "public"."__chart__per_user_drive"
    ADD CONSTRAINT "UQ_30bf67687f483ace115c5ca6429" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_PER_USER_DRIVE_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_PER_USER_DRIVE_DATE_GROUP_UNIQUE" ON "public"."__chart__per_user_drive" USING "btree" ("date", "group");
