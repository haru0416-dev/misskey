-- TABLE: user_ip
CREATE TABLE "public"."user_ip" (
    "id" integer NOT NULL,
    "createdAt" timestamp with time zone NOT NULL,
    "userId" character varying(32) NOT NULL,
    "ip" character varying(128) NOT NULL
);

-- SEQUENCE: user_ip_id_seq
CREATE SEQUENCE "public"."user_ip_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: user_ip_id_seq
ALTER SEQUENCE "public"."user_ip_id_seq" OWNED BY "public"."user_ip"."id";

-- DEFAULT: user_ip id
ALTER TABLE ONLY "public"."user_ip" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."user_ip_id_seq"'::"regclass");

-- CONSTRAINT: user_ip user_ip_pkey
ALTER TABLE ONLY "public"."user_ip"
    ADD CONSTRAINT "user_ip_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_USER_IP_USER_ID
CREATE INDEX "IDX_USER_IP_USER_ID" ON "public"."user_ip" USING "btree" ("userId");

-- INDEX: IDX_USER_IP_USER_ID_IP_UNIQUE
CREATE UNIQUE INDEX "IDX_USER_IP_USER_ID_IP_UNIQUE" ON "public"."user_ip" USING "btree" ("userId", "ip");
