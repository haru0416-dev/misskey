-- FK CONSTRAINT: gallery_like gallery_like_postId_gallery_post_id_fk
ALTER TABLE ONLY "public"."gallery_like"
    ADD CONSTRAINT "gallery_like_postId_gallery_post_id_fk" FOREIGN KEY ("postId") REFERENCES "public"."gallery_post"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: gallery_like gallery_like_userId_user_id_fk
ALTER TABLE ONLY "public"."gallery_like"
    ADD CONSTRAINT "gallery_like_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
