-- TABLE: __chart_day__per_user_drive
CREATE TABLE "public"."__chart_day__per_user_drive" (
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

-- SEQUENCE: __chart_day__per_user_drive_id_seq
CREATE SEQUENCE "public"."__chart_day__per_user_drive_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__per_user_drive_id_seq
ALTER SEQUENCE "public"."__chart_day__per_user_drive_id_seq" OWNED BY "public"."__chart_day__per_user_drive"."id";

-- DEFAULT: __chart_day__per_user_drive id
ALTER TABLE ONLY "public"."__chart_day__per_user_drive" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__per_user_drive_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__per_user_drive PK_1ae135254c137011645da7f4045
ALTER TABLE ONLY "public"."__chart_day__per_user_drive"
    ADD CONSTRAINT "PK_1ae135254c137011645da7f4045" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__per_user_drive UQ_62aa5047b5aec92524f24c701d7
ALTER TABLE ONLY "public"."__chart_day__per_user_drive"
    ADD CONSTRAINT "UQ_62aa5047b5aec92524f24c701d7" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_PER_USER_DRIVE_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_PER_USER_DRIVE_DATE_GROUP_UNIQUE" ON "public"."__chart_day__per_user_drive" USING "btree" ("date", "group");
