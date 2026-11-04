-- ===== 밥잇 전체 테이블 =====
-- Supabase 대시보드 → SQL Editor → 새 쿼리에 전체를 붙여 넣고 Run.
-- 처음 만드는 DB와 이미 테이블이 있는 DB 모두에서 실행할 수 있습니다. (여러 번 실행해도 안전)
-- 실행 순서: 01_schema.sql → 02_seed_catalog.sql → 03_seed_test_users.sql
-- (scripts/generate-seed.js가 만든 파일입니다. 직접 고치기보다 스크립트를 고쳐 다시 만드세요.)

BEGIN;

-- ===== 기본 테이블 (회원 · 식당 · 메뉴 · 카테고리) =====
-- 이미 있는 테이블은 건드리지 않습니다. (IF NOT EXISTS)

CREATE TABLE IF NOT EXISTS "User" (
    "id" SERIAL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,              -- scrypt 해시 (salt:hash). 평문 저장 금지
    "name" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");

CREATE TABLE IF NOT EXISTS "Session" (
    "id" SERIAL PRIMARY KEY,
    "token_hash" TEXT NOT NULL,
    "user_id" INTEGER NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_hash_key" ON "Session"("token_hash");
CREATE INDEX IF NOT EXISTS "Session_expires_at_idx" ON "Session"("expires_at");

CREATE TABLE IF NOT EXISTS "restaurants" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL
);

CREATE TABLE IF NOT EXISTS "categories" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS "menus" (
    "id" SERIAL PRIMARY KEY,
    "restaurant_id" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "price" INTEGER NOT NULL CHECK ("price" > 0),
    CONSTRAINT "menus_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "menus_restaurant_id_price_idx" ON "menus"("restaurant_id", "price");

CREATE TABLE IF NOT EXISTS "menu_categories" (
    "menu_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL,
    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("menu_id", "category_id"),
    CONSTRAINT "menu_categories_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "menu_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "Review" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL CHECK ("rating" BETWEEN 1 AND 5),
    "comment" VARCHAR(300) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3),
    CONSTRAINT "Review_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Review_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
CREATE UNIQUE INDEX IF NOT EXISTS "Review_user_id_restaurant_id_key" ON "Review"("user_id", "restaurant_id");

CREATE TABLE IF NOT EXISTS "Favorite" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Favorite_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Favorite_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "Favorite_user_id_restaurant_id_key" ON "Favorite"("user_id", "restaurant_id");

CREATE TABLE IF NOT EXISTS "RecentView" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "viewed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RecentView_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "RecentView_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "RecentView_user_id_restaurant_id_key" ON "RecentView"("user_id", "restaurant_id");

-- ===== 심층 추천(개인화) =====
-- 메뉴 속성 · 느낌 태그 · 행동 기록 · 관리자 권한을 추가합니다.
-- 여러 번 실행해도 안전하도록 IF NOT EXISTS / 존재 확인을 사용합니다.

-- 1) 관리자 권한: user(일반) · admin(관리자)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'user';
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_role_check') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_role_check" CHECK ("role" IN ('user', 'admin'));
  END IF;
END $$;

-- 2) 메뉴 속성 (추천 조건 비교에 사용)
--    spicy_level   0 안 매움 · 1 살짝 · 2 매콤 · 3 아주 매움
--    portion_level 1 가볍게 · 2 보통 · 3 든든하게
ALTER TABLE "menus" ADD COLUMN IF NOT EXISTS "spicy_level" SMALLINT NOT NULL DEFAULT 0;
ALTER TABLE "menus" ADD COLUMN IF NOT EXISTS "portion_level" SMALLINT NOT NULL DEFAULT 2;
ALTER TABLE "menus" ADD COLUMN IF NOT EXISTS "is_rice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "menus" ADD COLUMN IF NOT EXISTS "is_noodle" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "menus" ADD COLUMN IF NOT EXISTS "is_soup" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "menus" ADD COLUMN IF NOT EXISTS "is_meat" BOOLEAN NOT NULL DEFAULT false;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menus_spicy_level_check') THEN
    ALTER TABLE "menus" ADD CONSTRAINT "menus_spicy_level_check" CHECK ("spicy_level" BETWEEN 0 AND 3);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'menus_portion_level_check') THEN
    ALTER TABLE "menus" ADD CONSTRAINT "menus_portion_level_check" CHECK ("portion_level" BETWEEN 1 AND 3);
  END IF;
END $$;

-- 3) 느낌 태그 (뜨끈한 · 시원한 · 바삭한 · 치즈 · 해산물 · 건강한 · 간편한)
CREATE TABLE IF NOT EXISTS "tags" (
    "id" SERIAL PRIMARY KEY,
    "name" TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "tags_name_key" ON "tags"("name");

CREATE TABLE IF NOT EXISTS "menu_tags" (
    "menu_id" INTEGER NOT NULL,
    "tag_id" INTEGER NOT NULL,
    CONSTRAINT "menu_tags_pkey" PRIMARY KEY ("menu_id", "tag_id"),
    CONSTRAINT "menu_tags_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "menu_tags_tag_id_fkey" FOREIGN KEY ("tag_id") REFERENCES "tags"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "menu_tags_tag_id_idx" ON "menu_tags"("tag_id");

-- 4) 행동 기록 (개인 취향 계산에 사용)
--    view: 식당 상세 열기 · click: 추천 목록에서 메뉴 선택 · recommend_click: 심층 추천 결과 선택
--    찜·후기는 "Favorite"·"Review" 테이블을 그대로 쓰므로 여기에 중복 저장하지 않습니다.
CREATE TABLE IF NOT EXISTS "user_menu_interactions" (
    "id" SERIAL PRIMARY KEY,
    "user_id" INTEGER NOT NULL,
    "restaurant_id" INTEGER NOT NULL,
    "menu_id" INTEGER,
    "type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "user_menu_interactions_type_check" CHECK ("type" IN ('view', 'click', 'recommend_click')),
    CONSTRAINT "user_menu_interactions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_menu_interactions_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "user_menu_interactions_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "user_menu_interactions_user_id_created_at_idx" ON "user_menu_interactions"("user_id", "created_at");
CREATE INDEX IF NOT EXISTS "user_menu_interactions_menu_id_idx" ON "user_menu_interactions"("menu_id");

-- 5) 확인용 뷰: Supabase 테이블 편집기에서 메뉴 속성과 인기도를 한눈에 봅니다.
--    security_invoker: 뷰를 조회하는 사람의 권한(RLS)을 그대로 적용합니다.
CREATE OR REPLACE VIEW "menu_features" WITH (security_invoker = true) AS
SELECT m."id", r."name" AS "restaurant", m."name", m."price",
       m."spicy_level", m."portion_level", m."is_rice", m."is_noodle", m."is_soup", m."is_meat",
       COALESCE((SELECT string_agg(c."name", ', ' ORDER BY c."id") FROM "menu_categories" mc JOIN "categories" c ON c."id" = mc."category_id" WHERE mc."menu_id" = m."id"), '') AS "categories",
       COALESCE((SELECT string_agg(t."name", ', ' ORDER BY t."id") FROM "menu_tags" mt JOIN "tags" t ON t."id" = mt."tag_id" WHERE mt."menu_id" = m."id"), '') AS "tags",
       (SELECT count(*) FROM "user_menu_interactions" i WHERE i."menu_id" = m."id") AS "interactions"
FROM "menus" m JOIN "restaurants" r ON r."id" = m."restaurant_id";

-- 6) 보안: Supabase는 public 스키마를 REST API(anon 키)로 공개합니다.
--    이 앱은 서버(Prisma, 테이블 소유자)로만 접속하므로 RLS를 켜고 정책을 만들지 않아 API 직접 접근을 막습니다.
--    (비밀번호 해시가 있는 "User" 테이블이 특히 중요합니다. 테이블 소유자는 RLS 영향을 받지 않습니다.)
ALTER TABLE "User" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Session" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Review" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "Favorite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "RecentView" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "restaurants" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menus" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_categories" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "menu_tags" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "user_menu_interactions" ENABLE ROW LEVEL SECURITY;

COMMIT;
