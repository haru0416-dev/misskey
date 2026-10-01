-- TABLE: __chart_day__ap_request
CREATE TABLE "public"."__chart_day__ap_request" (
    "id" integer NOT NULL,
    "date" integer NOT NULL,
    "___deliverFailed" integer DEFAULT 0 NOT NULL,
    "___deliverSucceeded" integer DEFAULT 0 NOT NULL,
    "___inboxReceived" integer DEFAULT 0 NOT NULL
);

-- SEQUENCE: __chart_day__ap_request_id_seq
CREATE SEQUENCE "public"."__chart_day__ap_request_id_seq"
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;

-- SEQUENCE OWNED BY: __chart_day__ap_request_id_seq
ALTER SEQUENCE "public"."__chart_day__ap_request_id_seq" OWNED BY "public"."__chart_day__ap_request"."id";

-- DEFAULT: __chart_day__ap_request id
ALTER TABLE ONLY "public"."__chart_day__ap_request" ALTER COLUMN "id" SET DEFAULT "nextval"('"public"."__chart_day__ap_request_id_seq"'::"regclass");

-- CONSTRAINT: __chart_day__ap_request PK_9318b49daee320194e23f712e69
ALTER TABLE ONLY "public"."__chart_day__ap_request"
    ADD CONSTRAINT "PK_9318b49daee320194e23f712e69" PRIMARY KEY ("id");

-- CONSTRAINT: __chart_day__ap_request UQ_a848f66d6cec11980a5dd595822
ALTER TABLE ONLY "public"."__chart_day__ap_request"
    ADD CONSTRAINT "UQ_a848f66d6cec11980a5dd595822" UNIQUE ("date");

-- INDEX: IDX_CHART_DAY_AP_REQUEST_DATE_UNIQUE
CREATE UNIQUE INDEX "IDX_CHART_DAY_AP_REQUEST_DATE_UNIQUE" ON "public"."__chart_day__ap_request" USING "btree" ("date");
