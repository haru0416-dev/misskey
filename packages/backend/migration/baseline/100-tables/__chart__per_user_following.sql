-- TABLE: __chart__per_user_following
CREATE TABLE "public"."__chart__per_user_following" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___local_followings_total" integer DEFAULT 0 NOT NULL,
    "___local_followings_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_followings_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_followers_total" integer DEFAULT 0 NOT NULL,
    "___local_followers_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_followers_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followings_total" integer DEFAULT 0 NOT NULL,
    "___remote_followings_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followings_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followers_total" integer DEFAULT 0 NOT NULL,
    "___remote_followers_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followers_dec" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart__per_user_following_id_seq
CREATE SEQUENCE "public"."__chart__per_user_following_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__per_user_following_id_seq
ALTER SEQUENCE "public"."__chart__per_user_following_id_seq" OWNED BY "public"."__chart__per_user_following"."id";

-- DEFAULT: __chart__per_user_following id
ALTER TABLE ONLY "public"."__chart__per_user_following" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__per_user_following_id_seq"'::"regclass");

-- CONSTRAINT: __chart__per_user_following PK_85bb1b540363a29c2fec83bd907
ALTER TABLE ONLY "public"."__chart__per_user_following"
    ADD CONSTRAINT "PK_85bb1b540363a29c2fec83bd907" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__per_user_following UQ_b77d4dd9562c3a899d9a286fcd7
ALTER TABLE ONLY "public"."__chart__per_user_following"
    ADD CONSTRAINT "UQ_b77d4dd9562c3a899d9a286fcd7" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_PER_USER_FOLLOWING_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_PER_USER_FOLLOWING_DATE_GROUP_UNIQUE" ON "public"."__chart__per_user_following" USING "btree" ("date", "group");
