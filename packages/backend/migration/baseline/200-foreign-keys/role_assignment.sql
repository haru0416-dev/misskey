-- FK CONSTRAINT: role_assignment role_assignment_roleId_role_id_fk
ALTER TABLE ONLY "public"."role_assignment"
    ADD CONSTRAINT "role_assignment_roleId_role_id_fk" FOREIGN KEY ("roleId") REFERENCES "public"."role"("id") ON DELETE CASCADE;

-- FK CONSTRAINT: role_assignment role_assignment_userId_user_id_fk
ALTER TABLE ONLY "public"."role_assignment"
    ADD CONSTRAINT "role_assignment_userId_user_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."user"("id") ON DELETE CASCADE;
