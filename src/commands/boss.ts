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
    .addSubcommand(sc => sc.setName('death')
      .setDescription('บันทึกเวลาตาย (เวลาไทย) เช่น "07:26" หรือ "07:26 02/09/25"')
      .addStringOption(o => o.setName('name').setDescription('ชื่อบอส').setRequired(true))
      .addStringOption(o => o.setName('time').setDescription('HH:mm [DD/MM/YY]').setRequired(true))
      .addStringOption(o => o.setName('game').setDescription('โค้ดเกม'))
    )
    .addSubcommand(sc => sc.setName('reset-all').setDescription('รีเซ็ตเวลาบอสทั้งหมด'))
    .addSubcommand(sc => sc.setName('table').setDescription('อัปเดตตารางบอสในแชนแนล'));
  
  export async function execute(i: ChatInputCommandInteraction) {
    const sub = i.options.getSubcommand();
    const gameCode = (i.options.get('game')?.value as string | undefined) ?? 'L9';
  
    if (sub === 'add') {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
        return i.reply({ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์', ephemeral: true });
  
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
      return i.reply({ content: `เพิ่ม/อัปเดตบอส **${name}** (${hours}ชม.) แล้ว`, ephemeral: true });
    }
  
    if (sub === 'death') {
      const name = i.options.get('name', true).value as string;
      const timeText = i.options.get('time', true).value as string;
  
      const now = dayjs().tz(TZ);
      const [hm, dmy = now.format('DD/MM/YY')] = timeText.trim().split(/\s+/);
      const deathLocal = dayjs.tz(`${dmy} ${hm}`, 'DD/MM/YY HH:mm', TZ);
      if (!deathLocal.isValid())
        return i.reply({ content: 'รูปแบบเวลาไม่ถูกต้อง', ephemeral: true });
  
      const game = await prisma.game.upsert({
        where: { code: gameCode },
        update: {},
        create: { code: gameCode, name: gameCode },
      });
      const boss = await prisma.boss.findFirst({ where: { gameId: game.id, name } });
      if (!boss) return i.reply({ content: `ไม่พบบอสชื่อ "${name}"`, ephemeral: true });
  
      const next = deathLocal.add(boss.respawnHours, 'hour').toDate();
      await prisma.boss.update({
        where: { id: boss.id },
        data: { lastDeathAt: deathLocal.toDate(), nextSpawnAt: next },
      });
      await scheduleJobs(boss.id, boss.name, next.toISOString());
      await updateScheduleMessage(gameCode);
      return i.reply({ content: `บันทึกตาย **${name}** เวลา ${deathLocal.format('DD/MM/YY HH:mm')} แล้ว`, ephemeral: true });
    }
  
    if (sub === 'reset-all') {
      if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild))
        return i.reply({ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์', ephemeral: true });
  
      const game = await prisma.game.findUnique({ where: { code: gameCode } });
      if (game) {
        await prisma.boss.updateMany({ where: { gameId: game.id }, data: { lastDeathAt: null, nextSpawnAt: null } });
      }
      await updateScheduleMessage(gameCode);
      return i.reply({ content: 'รีเซ็ตเวลาบอสทั้งหมดแล้ว', ephemeral: true });
    }
  
    if (sub === 'table') {
      await updateScheduleMessage(gameCode);
      return i.reply({ content: 'อัปเดตตารางแล้ว', ephemeral: true });
    }
  }