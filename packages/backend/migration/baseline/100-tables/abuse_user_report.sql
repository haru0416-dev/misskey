-- TABLE: abuse_user_report
CREATE TABLE "public"."abuse_user_report" (
    "id" character varying(32) NOT NULL,
    "targetUserId" character varying(32) NOT NULL,
    "reporterId" character varying(32) NOT NULL,
    "assigneeId" character varying(32),
    "resolved" boolean DEFAULT false NOT NULL,
    "forwarded" boolean DEFAULT false NOT NULL,
    "comment" character varying(2048) NOT NULL,
    "moderationNote" character varying(8192) DEFAULT ''::character varying NOT NULL,
    "resolvedAs" character varying(128),
    "targetUserHost" character varying(128),
    "reporterHost" character varying(128)
);

-- CONSTRAINT: abuse_user_report abuse_user_report_pkey
ALTER TABLE ONLY "public"."abuse_user_report"
    ADD CONSTRAINT "abuse_user_report_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_ABUSE_USER_REPORT_ASSIGNEE_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_ASSIGNEE_ID" ON "public"."abuse_user_report" USING "btree" ("assigneeId");

-- INDEX: IDX_ABUSE_USER_REPORT_REPORTER_HOST
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_HOST" ON "public"."abuse_user_report" USING "btree" ("reporterHost");

-- INDEX: IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_HOST_ID" ON "public"."abuse_user_report" USING "btree" ("reporterHost", "id");

-- INDEX: IDX_ABUSE_USER_REPORT_REPORTER_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_REPORTER_ID" ON "public"."abuse_user_report" USING "btree" ("reporterId");

-- INDEX: IDX_ABUSE_USER_REPORT_RESOLVED
CREATE INDEX "IDX_ABUSE_USER_REPORT_RESOLVED" ON "public"."abuse_user_report" USING "btree" ("resolved");

-- INDEX: IDX_ABUSE_USER_REPORT_RESOLVED_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_RESOLVED_ID" ON "public"."abuse_user_report" USING "btree" ("resolved", "id");

-- INDEX: IDX_ABUSE_USER_REPORT_TARGET_HOST_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_HOST_ID" ON "public"."abuse_user_report" USING "btree" ("targetUserHost", "id");

-- INDEX: IDX_ABUSE_USER_REPORT_TARGET_USER_HOST
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_USER_HOST" ON "public"."abuse_user_report" USING "btree" ("targetUserHost");

-- INDEX: IDX_ABUSE_USER_REPORT_TARGET_USER_ID
CREATE INDEX "IDX_ABUSE_USER_REPORT_TARGET_USER_ID" ON "public"."abuse_user_report" USING "btree" ("targetUserId");
