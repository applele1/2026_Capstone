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
