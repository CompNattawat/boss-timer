import { PrismaClient } from '@prisma/client';
import fs from 'fs';

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
  { name: 'ชูเลียร?', hours: 35 },
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

async function main() {
  const game = await prisma.game.upsert({
    where: { code: 'L9' },
    update: {},
    create: { code: 'L9', name: 'Lord Nine' },
  });

  for (const b of dailyBosses) {
    await prisma.boss.upsert({
      where: { gameId_name: { gameId: game.id, name: b.name } },
      update: { respawnHours: b.hours, alias: b.alias ?? [] },
      create: { gameId: game.id, name: b.name, respawnHours: b.hours, alias: b.alias ?? [] },
    });
  }

  const fixedCfgPath = 'prisma/fixed-times.json';
  if (!fs.existsSync(fixedCfgPath)) {
    const example = {
      L9: [
        { name: 'ซาฟิรัส', cron: ['0 16 * * 0', '30 10 * * 2'] },
        { name: 'นิวโทร', cron: ['0 18 * * 2', '30 10 * * 4'] },
        { name: 'คลาแมนทิส', cron: ['30 10 * * 1', '0 18 * * 4'] },
        { name: 'ไธเมล', cron: ['0 18 * * 1', '30 10 * * 3'] },
        { name: 'มิลลาวี', cron: ['0 14 * * 6'] },
        { name: 'โรเดอริก', cron: ['0 18 * * 5'] },
        { name: 'ออร์คิด', cron: ['0 20 * * 3', '0 20 * * 0'] },
        { name: 'ริงกอร์', cron: ['0 16 * * 6'] },
        { name: 'ไชฟล็อค', cron: ['0 21 * * 6'] },
      ],
    };
    fs.writeFileSync(fixedCfgPath, JSON.stringify(example, null, 2), 'utf8');
  }
}

main().finally(() => prisma.$disconnect());