-- TABLE: __chart_day__per_user_following
CREATE TABLE "public"."__chart_day__per_user_following" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___local_followings_total" integer DEFAULT 0 CONSTRAINT "__chart_day__per_user_follow____local_followings_total_not_null" NOT NULL,
    "___local_followings_inc" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followin____local_followings_inc_not_null" NOT NULL,
    "___local_followings_dec" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followin____local_followings_dec_not_null" NOT NULL,
    "___local_followers_total" integer DEFAULT 0 CONSTRAINT "__chart_day__per_user_followi____local_followers_total_not_null" NOT NULL,
    "___local_followers_inc" smallint DEFAULT '0'::smallint NOT NULL,
    "___local_followers_dec" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_followings_total" integer DEFAULT 0 CONSTRAINT "__chart_day__per_user_follo____remote_followings_total_not_null" NOT NULL,
    "___remote_followings_inc" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followi____remote_followings_inc_not_null" NOT NULL,
    "___remote_followings_dec" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followi____remote_followings_dec_not_null" NOT NULL,
    "___remote_followers_total" integer DEFAULT 0 CONSTRAINT "__chart_day__per_user_follow____remote_followers_total_not_null" NOT NULL,
    "___remote_followers_inc" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followin____remote_followers_inc_not_null" NOT NULL,
    "___remote_followers_dec" smallint DEFAULT '0'::smallint CONSTRAINT "__chart_day__per_user_followin____remote_followers_dec_not_null" NOT NULL
);

-- SEQUENCE: __chart_day__per_user_following_id_seq
CREATE SEQUENCE "public"."__chart_day__per_user_following_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__per_user_following_id_seq
ALTER SEQUENCE "public"."__chart_day__per_user_following_id_seq" OWNED BY "public"."__chart_day__per_user_following"."id";

-- DEFAULT: __chart_day__per_user_following id
ALTER TABLE ONLY "public"."__chart_day__per_user_following" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__per_user_following_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__per_user_following PK_68ce6b67da57166da66fc8fb27e
ALTER TABLE ONLY "public"."__chart_day__per_user_following"
    ADD CONSTRAINT "PK_68ce6b67da57166da66fc8fb27e" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__per_user_following UQ_e4849a3231f38281280ea4c0eee
ALTER TABLE ONLY "public"."__chart_day__per_user_following"
    ADD CONSTRAINT "UQ_e4849a3231f38281280ea4c0eee" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_DAY_PER_USER_FOLLOWING_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_PER_USER_FOLLOWING_DATE_GROUP_UNIQUE" ON "public"."__chart_day__per_user_following" USING "btree" ("date", "group");
