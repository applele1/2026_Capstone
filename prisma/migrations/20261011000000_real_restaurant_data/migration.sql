-- 엑셀(restaurants / menus / categories / menu_categories) 구조로 전환하고 예시 식당 테이블을 정리합니다.
-- Supabase에 같은 이름의 테이블을 이미 만들어 두었어도 안전하게 실행되도록 IF NOT EXISTS / 존재 확인을 사용합니다.

-- 1) 식당 데이터 테이블 (이미 있으면 그대로 사용)
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
    "price" INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS "menu_categories" (
    "menu_id" INTEGER NOT NULL,
    "category_id" INTEGER NOT NULL
);

-- Supabase 화면에서 만든 테이블은 id가 int8(bigint)·가격이 numeric 등일 수 있습니다.
-- Prisma 스키마(Int / Float)와 맞도록 열 타입을 통일합니다. (값은 그대로 유지)
DO $$
DECLARE r record; c record; needs boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns x
    JOIN (VALUES ('restaurants','id','integer'),('restaurants','lat','double precision'),('restaurants','lng','double precision'),
                 ('menus','id','integer'),('menus','restaurant_id','integer'),('menus','price','integer'),
                 ('categories','id','integer'),('menu_categories','menu_id','integer'),('menu_categories','category_id','integer')) AS w(t,col,typ)
      ON x.table_name=w.t AND x.column_name=w.col
    WHERE x.table_schema=current_schema() AND x.data_type<>w.typ) INTO needs;
  IF needs THEN
    -- 타입을 바꾸려면 이 테이블들 사이의 외래 키를 잠시 지워야 합니다. (아래에서 다시 연결)
    FOR r IN SELECT conrelid::regclass AS t, conname FROM pg_constraint
             WHERE contype='f' AND (conrelid IN ('"menus"'::regclass,'"menu_categories"'::regclass)
                                 OR confrelid IN ('"restaurants"'::regclass,'"menus"'::regclass,'"categories"'::regclass)) LOOP
      EXECUTE format('ALTER TABLE %s DROP CONSTRAINT %I', r.t, r.conname);
    END LOOP;
    FOR c IN SELECT * FROM (VALUES ('restaurants','id','integer'),('restaurants','lat','double precision'),('restaurants','lng','double precision'),
                 ('menus','id','integer'),('menus','restaurant_id','integer'),('menus','price','integer'),
                 ('categories','id','integer'),('menu_categories','menu_id','integer'),('menu_categories','category_id','integer')) AS w(t,col,typ) LOOP
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name=c.t AND column_name=c.col AND data_type<>c.typ) THEN
        EXECUTE format('ALTER TABLE %I ALTER COLUMN %I TYPE %s USING %I::%s', c.t, c.col, c.typ, c.col, c.typ);
      END IF;
    END LOOP;
  END IF;
END $$;

-- 직접 만든 테이블에 키가 없을 때만 추가합니다.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"restaurants"'::regclass AND contype='p') THEN
    ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"menus"'::regclass AND contype='p') THEN
    ALTER TABLE "menus" ADD CONSTRAINT "menus_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"categories"'::regclass AND contype='p') THEN
    ALTER TABLE "categories" ADD CONSTRAINT "categories_pkey" PRIMARY KEY ("id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"menus"'::regclass AND contype='f') THEN
    DELETE FROM "menus" WHERE "restaurant_id" NOT IN (SELECT "id" FROM "restaurants");
    ALTER TABLE "menus" ADD CONSTRAINT "menus_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"menu_categories"'::regclass AND contype='p') THEN
    DELETE FROM "menu_categories" a USING "menu_categories" b WHERE a.ctid < b.ctid AND a."menu_id"=b."menu_id" AND a."category_id"=b."category_id";
    ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("menu_id","category_id");
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='"menu_categories"'::regclass AND contype='f') THEN
    DELETE FROM "menu_categories" WHERE "menu_id" NOT IN (SELECT "id" FROM "menus") OR "category_id" NOT IN (SELECT "id" FROM "categories");
    ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_menu_id_fkey" FOREIGN KEY ("menu_id") REFERENCES "menus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS "menus_restaurant_id_price_idx" ON "menus"("restaurant_id", "price");

-- 2) 회원 기록(후기·찜·최근)이 새 restaurants 테이블을 가리키도록 변경
ALTER TABLE "Review" DROP CONSTRAINT IF EXISTS "Review_restaurant_id_fkey";
ALTER TABLE "Favorite" DROP CONSTRAINT IF EXISTS "Favorite_restaurant_id_fkey";
ALTER TABLE "RecentView" DROP CONSTRAINT IF EXISTS "RecentView_restaurant_id_fkey";

-- 3) 예시 식당 테이블 정리
--    예시 식당(is_sample=true)에 남은 테스트 후기·찜·최근 기록은 id가 실제 식당과 겹치므로 삭제합니다.
--    예시가 아닌 데이터가 들어 있으면 지우지 않고 _old_ 이름으로 보관합니다.
DO $$ BEGIN
  IF to_regclass('"Restaurant"') IS NOT NULL THEN
    DELETE FROM "Review" WHERE "restaurant_id" IN (SELECT "id" FROM "Restaurant" WHERE "is_sample");
    DELETE FROM "Favorite" WHERE "restaurant_id" IN (SELECT "id" FROM "Restaurant" WHERE "is_sample");
    DELETE FROM "RecentView" WHERE "restaurant_id" IN (SELECT "id" FROM "Restaurant" WHERE "is_sample");
    IF EXISTS (SELECT 1 FROM "Restaurant" WHERE NOT "is_sample") THEN
      ALTER TABLE "Restaurant" RENAME TO "_old_Restaurant";
      IF to_regclass('"Menu"') IS NOT NULL THEN ALTER TABLE "Menu" RENAME TO "_old_Menu"; END IF;
      RAISE NOTICE '예시가 아닌 식당 데이터가 있어 "_old_Restaurant" / "_old_Menu"로 보관했습니다.';
    ELSE
      DROP TABLE IF EXISTS "Menu";
      DROP TABLE "Restaurant";
    END IF;
  END IF;
END $$;

-- 실제 식당에 없는 기록 정리 후 외래 키 다시 연결
DELETE FROM "Review" WHERE "restaurant_id" NOT IN (SELECT "id" FROM "restaurants");
DELETE FROM "Favorite" WHERE "restaurant_id" NOT IN (SELECT "id" FROM "restaurants");
DELETE FROM "RecentView" WHERE "restaurant_id" NOT IN (SELECT "id" FROM "restaurants");
ALTER TABLE "Review" ADD CONSTRAINT "Review_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Favorite" ADD CONSTRAINT "Favorite_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecentView" ADD CONSTRAINT "RecentView_restaurant_id_fkey" FOREIGN KEY ("restaurant_id") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4) 후기 수정 시각 (작성일은 그대로 두고 수정일만 기록)
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "updated_at" TIMESTAMP(3);
