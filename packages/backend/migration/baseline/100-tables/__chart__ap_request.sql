-- TABLE: __chart__ap_request
CREATE TABLE "public"."__chart__ap_request" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___deliverFailed" integer DEFAULT 0 NOT NULL,
    "___deliverSucceeded" integer DEFAULT 0 NOT NULL,
    "___inboxReceived" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart__ap_request_id_seq
CREATE SEQUENCE "public"."__chart__ap_request_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart__ap_request_id_seq
ALTER SEQUENCE "public"."__chart__ap_request_id_seq" OWNED BY "public"."__chart__ap_request"."id";

-- DEFAULT: __chart__ap_request id
ALTER TABLE ONLY "public"."__chart__ap_request" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart__ap_request_id_seq"'::"regclass");

-- CONSTRAINT: __chart__ap_request PK_56a25cd447c7ee08876b3baf8d8
ALTER TABLE ONLY "public"."__chart__ap_request"
    ADD CONSTRAINT "PK_56a25cd447c7ee08876b3baf8d8" PRIMARY KEY ("id");

-- CONSTRAINT: __chart__ap_request UQ_e56f4beac5746d44bc3e19c80d0
ALTER TABLE ONLY "public"."__chart__ap_request"
    ADD CONSTRAINT "UQ_e56f4beac5746d44bc3e19c80d0" UNIQUE ("date");

-- INDEX: IDX_CHART_HOUR_AP_REQUEST_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_HOUR_AP_REQUEST_DATE_UNIQUE" ON "public"."__chart__ap_request" USING "btree" ("date");
