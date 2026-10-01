-- TABLE: __chart__per_user_reaction
CREATE TABLE "public"."__chart__per_user_reaction" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "group" character varying(128) NOT NULL,
    "___local_count" smallint DEFAULT '0'::smallint NOT NULL,
    "___remote_count" smallint DEFAULT '0'::smallint NOT NULL
);

-- SEQUENCE: __chart__per_user_reaction_id_seq
CREATE SEQUENCE "public"."__chart__per_user_reaction_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__per_user_reaction_id_seq
ALTER SEQUENCE "public"."__chart__per_user_reaction_id_seq" OWNED BY "public"."__chart__per_user_reaction"."id";

-- DEFAULT: __chart__per_user_reaction id
ALTER TABLE ONLY "public"."__chart__per_user_reaction" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__per_user_reaction_id_seq"'::"regclass");

-- CONSTRAINT: __chart__per_user_reaction PK_984f54dae441e65b633e8d27a7f
ALTER TABLE ONLY "public"."__chart__per_user_reaction"
    ADD CONSTRAINT "PK_984f54dae441e65b633e8d27a7f" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__per_user_reaction UQ_229a41ad465f9205f1f57032910
ALTER TABLE ONLY "public"."__chart__per_user_reaction"
    ADD CONSTRAINT "UQ_229a41ad465f9205f1f57032910" UNIQUE ("date", "group");

-- INDEX: IDX_CHART_HOUR_PER_USER_REACTION_DATE_GROUP_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_PER_USER_REACTION_DATE_GROUP_UNIQUE" ON "public"."__chart__per_user_reaction" USING "btree" ("date", "group");
