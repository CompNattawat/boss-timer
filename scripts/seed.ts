// src/scripts/seed.ts
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import cronParser from 'cron-parser';

const prisma = new PrismaClient();

const dailyBosses: { name: string; hours: number; alias?: string[] }[] = [
  { name: 'เวนาตัส', hours: 10 },
  { name: 'วีโอเลนท์', hours: 10 },
  { name: 'เลดี้ดาเลีย', hours: 18 },
  { name: 'เอโก้', hours: 21 },
  { name: 'ริเวอร์ร่า', hours: 24 },
  { name: 'อาราเนโอ', hours: 24 },
  { name: 'อันโดมิเอล', hours: 24 },
  { name: 'อาเมนติส', hours: 29 },
  { name: 'นายพลอะคูเลส', hours: 29 },
  { name: 'บารอนบราวด์มอร์', hours: 32 },
  { name: 'กาเลส', hours: 32 },
  { name: 'ชูเลียร์', hours: 35 },
  { name: 'ลาบาร์', hours: 35 },
  { name: 'คาเธน่า', hours: 35 },
  { name: 'ธีฮอร์', hours: 37 },
  { name: 'วานิตัส', hours: 48 },
  { name: 'เมทูส', hours: 48 },
  { name: 'ดูพลิแคน', hours: 48 },
  { name: 'ซูโพร์', hours: 62, alias: ['Supore'] },
  { name: 'อัสตา', hours: 62, alias: ['Asta'] },
  { name: 'ออร์โด', hours: 62, alias: ['Ordo'] },
  { name: 'ซีเครต้า', hours: 62, alias: ['Secreta'] },
];

async function seedDailyBosses() {
  const game = await prisma.game.findUnique({ where: { code: 'L9' } });
  if (!game) {
    // สร้างเกมถ้ายังไม่มี
    const created = await prisma.game.create({ data: { code: 'L9', name: 'Lord Nine' } });
    console.log('✅ created game L9');
    return seedDailyBosses(); // เรียกใหม่หลังสร้างเกม
  }

  for (const b of dailyBosses) {
    const existed = await prisma.boss.findFirst({
      where: { gameId: game.id, name: b.name },
      select: { id: true },
    });

    if (existed) {
      console.log(`⏭️  skip existing boss: ${b.name}`);
      continue; // ไม่อัปเดตค่าเดิม
    }

    await prisma.boss.create({
      data: {
        gameId: game.id,
        name: b.name,
        respawnHours: b.hours,
        alias: b.alias ?? [],
      },
    });
    console.log(`✅ created boss: ${b.name}`);
  }
}

async function seedFixedRules() {
  const game = await prisma.game.findUnique({ where: { code: 'L9' } });
  if (!game) throw new Error('Game L9 not found (should be created earlier)');

  const fixedCfgPath = 'prisma/fixed-times.json';

  // ถ้าไม่มีไฟล์ ให้สร้างตัวอย่าง
  if (!fs.existsSync(fixedCfgPath)) {
    const example = {
      L9: [
        { name: 'ซาฟิรัส',  cron: ['0 16 * * 0', '30 10 * * 2'] },
        { name: 'นิวโทร',   cron: ['0 18 * * 2', '30 10 * * 4'] },
        { name: 'คลาแมนทิส', cron: ['30 10 * * 1', '0 18 * * 4'] },
        { name: 'ไธเมล',    cron: ['0 18 * * 1', '30 10 * * 3'] },
        { name: 'มิลลาวี',  cron: ['0 14 * * 6'] },
        { name: 'โรเดอริก', cron: ['0 18 * * 5'] },
        { name: 'ออร์คิด',  cron: ['0 20 * * 3', '0 20 * * 0'] },
        { name: 'ริงกอร์',  cron: ['0 16 * * 6'] },
        { name: 'ไชฟล็อค',  cron: ['0 21 * * 6'] },
      ],
    };
    fs.writeFileSync(fixedCfgPath, JSON.stringify(example, null, 2), 'utf8');
    console.log('✍️  wrote example prisma/fixed-times.json');
  }

  const cfg = JSON.parse(fs.readFileSync(fixedCfgPath, 'utf8')) as {
    [gameCode: string]: { name: string; cron: string[]; tz?: string; enabled?: boolean }[];
  };

  const rules = cfg['L9'] ?? [];
  const TZ = 'Asia/Bangkok';

  for (const r of rules) {
    // ให้มี boss แน่ๆ (บางตัวอาจไม่อยู่ใน dailyBosses)
    let boss = await prisma.boss.findFirst({
      where: { gameId: game.id, name: r.name },
    });
    if (!boss) {
      boss = await prisma.boss.create({
        data: { gameId: game.id, name: r.name, respawnHours: 0, alias: [] },
      });
      console.log(`✅ created boss for fixed rule: ${r.name}`);
    }

    for (const cron of r.cron) {
      // validate cron
      try {
        cronParser.parseExpression(cron, { tz: r.tz || TZ });
      } catch {
        console.warn(`⚠️  skip invalid cron "${cron}" for boss "${r.name}"`);
        continue;
      }

      // ถ้ายังไม่มี rule นี้ค่อยสร้าง (ไม่ overwrite)
      const existed = await prisma.fixedRule.findFirst({
        where: { bossId: boss.id, cron },
        select: { id: true },
      });

      if (existed) {
        console.log(`⏭️  skip existing rule for ${r.name} @ ${cron}`);
        continue;
      }

      await prisma.fixedRule.create({
        data: {
          bossId: boss.id,
          gameId: game.id,
          cron,
          tz: r.tz || TZ,
          enabled: r.enabled ?? true,
          nextPreparedAt: null,
        },
      });
      console.log(`✅ created rule for ${r.name} @ ${cron}`);
    }
  }
}

async function main() {
  await seedDailyBosses();
  await seedFixedRules();
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());