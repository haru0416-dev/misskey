-- TABLE: abuse_report_notification_recipient
CREATE TABLE "public"."abuse_report_notification_recipient" (
    "id" character varying(32) NOT NULL,
    "isActive" boolean DEFAULT true NOT NULL,
    "updatedAt" timestamp with time zone DEFAULT "now"() NOT NULL,
    "name" character varying(255) NOT NULL,
    "method" character varying(64) NOT NULL,
    "userId" character varying(32) DEFAULT NULL::character varying,
    "systemWebhookId" character varying(32) DEFAULT NULL::character varying
);

-- CONSTRAINT: abuse_report_notification_recipient abuse_report_notification_recipient_pkey
ALTER TABLE ONLY "public"."abuse_report_notification_recipient"
    ADD CONSTRAINT "abuse_report_notification_recipient_pkey" PRIMARY KEY ("id");

-- INDEX: IDX_abuse_report_notification_recipient_isActive
CREATE INDEX "IDX_abuse_report_notification_recipient_isActive" ON "public"."abuse_report_notification_recipient" USING "btree" ("isActive");

-- INDEX: IDX_abuse_report_notification_recipient_method
CREATE INDEX "IDX_abuse_report_notification_recipient_method" ON "public"."abuse_report_notification_recipient" USING "btree" ("method");

-- INDEX: IDX_abuse_report_notification_recipient_systemWebhookId
CREATE INDEX "IDX_abuse_report_notification_recipient_systemWebhookId" ON "public"."abuse_report_notification_recipient" USING "btree" ("systemWebhookId");

-- INDEX: IDX_abuse_report_notification_recipient_userId
CREATE INDEX "IDX_abuse_report_notification_recipient_userId" ON "public"."abuse_report_notification_recipient" USING "btree" ("userId");
