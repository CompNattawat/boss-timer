import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
  } from 'discord.js';
import dayjs from 'dayjs';
import customParse from 'dayjs/plugin/customParseFormat.js';
import timezone from 'dayjs/plugin/timezone.js';
import utc from 'dayjs/plugin/utc.js';
dayjs.extend(customParse); dayjs.extend(timezone); dayjs.extend(utc);
  
import { prisma } from '../lib/prisma.js';
import { updateScheduleMessage } from '../services/discord.service.js';
import { scheduleJobs } from '../services/schedule.service.js';
import cronParser from 'cron-parser';
import { alertQueue, spawnQueue } from '../scheduler/queues.js';
import { safeDefer, safeReply } from '../lib/interaction.js';

  const TZ = 'Asia/Bangkok';
  
  export const data = new SlashCommandBuilder()
    .setName('boss')
    .setDescription('จัดการบอส')
    .addSubcommand(sc => sc.setName('add')
      .setDescription('เพิ่ม/แก้บอส')
      .addStringOption(o => o.setName('name').setDescription('ชื่อบอส').setRequired(true))
      .addIntegerOption(o => o.setName('hours').setDescription('ชั่วโมงเกิดซ้ำ').setRequired(true))
      .addStringOption(o => o.setName('game').setDescription('โค้ดเกม'))
    )
    .addSubcommand(sub =>
      sub
        .setName('delete')
        .setDescription('ลบบอสออก')
        .addStringOption(o =>
          o.setName('name').setDescription('ชื่อบอส').setRequired(true),
        ),
    )
    .addSubcommand(sc => sc.setName('death')
      .setDescription('บันทึกเวลาตาย (เวลาไทย) เช่น "07:26" หรือ "07:26 02/09/25"')
      .addStringOption(o => o.setName('name').setDescription('ชื่อบอส').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('HH:mm [DD/MM/YY]').setRequired(true))
      .addStringOption(o => o.setName('game').setDescription('โค้ดเกม'))
    )
    .addSubcommand(sc => sc.setName('reset')
      .setDescription('รีเซ็ตเวลาบอส “เฉพาะตัวนี้”')
      .addStringOption(o => o.setName('name').setDescription('ชื่อบอส').setRequired(true))
      .addStringOption(o => o.setName('game').setDescription('โค้ดเกม'))
    )
    .addSubcommand(sc => sc.setName('reset-all').setDescription('รีเซ็ตเวลาบอสทั้งหมด'))
    .addSubcommand(sc => sc.setName('table').setDescription('อัปเดตตารางบอสในแชนแนล'));

    async function getNextFixedSpawn(bossId: string, deathLocalISO: string) {
      const rules = await prisma.fixedRule.findMany({
        where: { bossId, enabled: true },
      });
      if (!rules.length) return null;
    
      const base = new Date(deathLocalISO); // เวลาไทยถูก parse แล้ว (ด้านล่าง)
      const candidates: Date[] = [];
    
      for (const r of rules) {
        try {
          const it = cronParser.parseExpression(r.cron, {
            tz: r.tz || TZ,
            currentDate: base,          // หา occurrence ถัดไป “หลัง” เวลาตาย
          });
          candidates.push(it.next().toDate());
        } catch (e) {
          console.warn('skip invalid cron for rule', r.id, r.cron, e);
        }
      }
    
      if (!candidates.length) return null;
      // หาค่าที่เร็วที่สุด
      return candidates.reduce((a, b) => (a < b ? a : b));
    }

    async function cancelJobsForBoss(bossId: string) {
      const delayedA = await alertQueue.getDelayed();
      const delayedS = await spawnQueue.getDelayed();
    
      await Promise.all(
        delayedA
          .filter(j => j.data?.bossId === bossId)
          .map(j => j.remove().catch(() => {}))
      );
      await Promise.all(
        delayedS
          .filter(j => j.data?.bossId === bossId)
          .map(j => j.remove().catch(() => {}))
      );
    }
  
  export async function execute(i: ChatInputCommandInteraction) {
    const sub = i.options.getSubcommand();
    const gameCode = (i.options.get('game')?.value as string | undefined) ?? 'L9';
  
    if (sub === 'add') {
        // ✅ defer ไว้ก่อน ป้องกัน interaction timeout
        await safeDefer(i, false);

        if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
          return await safeReply(i,{ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์' });
    
        const name = i.options.get('name', true).value as string;
        const hours = i.options.get('hours', true).value as number;
    
        const game = await prisma.game.upsert({
          where: { code: gameCode },
          update: {},
          create: { code: gameCode, name: gameCode },
        });
        await prisma.boss.upsert({
          where: { gameId_name: { gameId: game.id, name } },
          update: { respawnHours: hours },
          create: { gameId: game.id, name, respawnHours: hours },
        });
        await updateScheduleMessage(gameCode);
        return await safeReply(i,{ content: `เพิ่ม/อัปเดตบอส **${name}** (${hours}ชม.) แล้ว` });
    }

    if (sub === 'delete') {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await safeReply(i, { content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์' });
      }

      const name = i.options.get('name', true).value as string;
      const game = await prisma.game.findUnique({ where: { code: gameCode } });
      if (!game) {
        return await safeReply(i, { content: `ยังไม่มีเกม ${gameCode}` });
      }

      const boss = await prisma.boss.findUnique({
        where: { gameId_name: { gameId: game.id, name } },
      });
      if (!boss) {
        return await safeReply(i, { content: `ไม่พบบอสชื่อ **${name}**` });
      }

      // ลบ boss พร้อม fixedRules ที่เกี่ยวข้อง
      await prisma.fixedRule.deleteMany({ where: { bossId: boss.id } });
      await prisma.boss.delete({ where: { id: boss.id } });

      await updateScheduleMessage(gameCode);
      return await safeReply(i, { content: `ลบบอส **${name}** แล้ว` });
    }
    
    if (sub === 'death') {
      const name = i.options.get('name', true).value as string;
      const timeText = i.options.get('time', true).value as string;

      const now = dayjs().tz(TZ);
      const [hm, dmy = now.format('DD/MM/YY')] = timeText.trim().split(/\s+/);
      const deathLocal = dayjs.tz(`${dmy} ${hm}`, 'DD/MM/YY HH:mm', TZ);
      // ✅ defer ไว้ก่อน ป้องกัน interaction timeout
      await safeDefer(i, false);

      if (!deathLocal.isValid())
        return await safeReply(i,{ content: 'รูปแบบเวลาไม่ถูกต้อง' });

      const game = await prisma.game.upsert({
        where: { code: gameCode },
        update: {},
        create: { code: gameCode, name: gameCode },
      });
      const boss = await prisma.boss.findFirst({ where: { gameId: game.id, name } });
      if (!boss) return await safeReply(i,{ content: `ไม่พบบอสชื่อ "${name}"` });

      // ✅ ถ้ามี fixedRule ใช้ cron คำนวณรอบถัดไปจาก “เวลาตาย”
      let next: Date | null = await getNextFixedSpawn(boss.id, deathLocal.toISOString());

      // ถ้าไม่มี fixed rule ค่อยใช้ +hours
      if (!next) {
        next = deathLocal.add(boss.respawnHours, 'hour').toDate();
      }

      await prisma.boss.update({
        where: { id: boss.id },
        data: { lastDeathAt: deathLocal.toDate(), nextSpawnAt: next },
      });

      await scheduleJobs(boss.id, boss.name, next.toISOString());
      await updateScheduleMessage(gameCode);

      return await safeReply(i,{
        content: `บันทึกตาย **${boss.name}** เวลา ${deathLocal.format('DD/MM/YY HH:mm')} แล้ว\nรอบเกิดถัดไป: ${dayjs(next).tz(TZ).format('DD/MM/YY HH:mm')}`,
        ephemeral: true,
      });
    }

    if (sub === 'reset') {
      // ✅ defer ไว้ก่อน ป้องกัน interaction timeout
      await safeDefer(i, false);

      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await safeReply(i,{ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์' });
      }
    
      const name = i.options.get('name', true).value as string;
      const game = await prisma.game.upsert({
        where: { code: gameCode },
        update: {},
        create: { code: gameCode, name: gameCode },
      });
    
      const boss = await prisma.boss.findFirst({
        where: { gameId: game.id, name },
      });
      if (!boss) {
        return await safeReply(i,{ content: `ไม่พบบอสชื่อ "${name}" ในเกม ${gameCode}` });
      }
    
      // ลบงานแจ้งเตือน/สแปวนที่ตั้งไว้ของบอสนี้
      await cancelJobsForBoss(boss.id).catch(e => console.warn('cancelJobsForBoss error', e));
    
      // รีเซ็ตเวลาบอส
      await prisma.boss.update({
        where: { id: boss.id },
        data: { lastDeathAt: null, nextSpawnAt: null },
      });
    
      // อัปเดตตารางในแชนแนล
      await updateScheduleMessage(gameCode);
    
      return await safeReply(i,{ content: `รีเซ็ตเวลา **${boss.name}** แล้ว`, ephemeral: false });
    }
    
    if (sub === 'reset-all') {
      // ✅ defer ไว้ก่อน ป้องกัน interaction timeout
      await safeDefer(i, false);

      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
        return await safeReply(i,{ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์' });
    
      const game = await prisma.game.findUnique({ where: { code: gameCode } });
      if (game) {
          await prisma.boss.updateMany({ where: { gameId: game.id }, data: { lastDeathAt: null, nextSpawnAt: null } });
      }
      await updateScheduleMessage(gameCode);
      return await safeReply(i,{ content: 'รีเซ็ตเวลาบอสทั้งหมดแล้ว' });
    }
    
    if (sub === 'table') {
      // ✅ defer ไว้ก่อน ป้องกัน interaction timeout
      await safeDefer(i, false);

      await updateScheduleMessage(gameCode);
      return await safeReply(i,{ content: 'อัปเดตตารางแล้ว', ephemeral: false });
    }
  }