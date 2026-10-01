-- FK CONSTRAINT: page_like page_like_pageId_page_id_fk
ALTER TABLE ONLY "public"."page_like"
    ADD CONSTRAINT "page_like_pageId_page_id_fk" FOREIGN KEY ("pageId") REFERENCES "public"."page"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: page_like page_like_userId_user_id_fk
ALTER TABLE ONLY "public"."page_like"
    ADD CONSTRAINT "page_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
