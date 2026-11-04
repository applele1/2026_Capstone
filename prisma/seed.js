import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {sampleRestaurants} from '../src/models/sampleData.js';
const db = new PrismaClient();
try {
 await db.$transaction(async tx => {
  for (const {id,menus,...restaurant} of sampleRestaurants) {
   const exists = await tx.restaurant.findUnique({where:{id}});
   if (!exists) {
    await tx.restaurant.create({data:{id,...restaurant,menus:{create:menus.map(({id,...menu})=>menu)}}});
   }
  }
  await tx.$executeRaw`SELECT setval(pg_get_serial_sequence('"Restaurant"','id'), COALESCE((SELECT MAX(id) FROM "Restaurant"),1), true)`;
 });
 console.log('예시 식당 시드 완료. 실제 영업 정보로 교체하세요.');
} finally {
 await db.$disconnect();
}
