-- 旧 3-legged 認可 (app/create + auth/session) の廃止に伴い、その経路で発行したトークンを消す。
-- これらの権限は app 側にあり、列を落とすと権限が空のまま認証だけ通るトークンになるため、列より先に消す。
DELETE FROM "access_token" WHERE "appId" IS NOT NULL;
