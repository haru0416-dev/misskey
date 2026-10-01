-- FK CONSTRAINT: gallery_post gallery_post_userId_user_id_fk
ALTER TABLE ONLY "public"."gallery_post"
    ADD CONSTRAINT "gallery_post_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
