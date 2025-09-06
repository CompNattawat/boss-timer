// src/services/guild.service.ts
import { prisma } from '../lib/prisma.js';

/** สร้างหรือดึงระเบียนกิลด์ (platform+externalId เป็น unique) */
export async function ensureGuild(guildId: string) {
  return prisma.guild.upsert({
    where: { platform_externalId: { platform: 'discord', externalId: guildId } },
    update: {},
    create: {
      platform: 'discord',
      externalId: guildId,
      gameId: '',
      scheduleChannelId: null,
      scheduleMessageId: null,
    },
  });
}

/** ดึงกิลด์ ถ้าไม่เจอให้คืน null (ไม่สร้างใหม่) */
export function getGuild(guildId: string) {
  return prisma.guild.findUnique({
    where: { platform_externalId: { platform: 'discord', externalId: guildId } },
  });
}

/** ดึงกิลด์แบบต้องมีเสมอ (ถ้าไม่มีก็สร้าง) */
export function getOrCreateGuild(guildId: string) {
  return ensureGuild(guildId);
}

/** ตั้งค่าช่องสำหรับโพสต์ตาราง และล้าง messageId เก่าเพื่อกันสับสน */
export async function setScheduleChannel(guildId: string, channelId: string) {
  const g = await ensureGuild(guildId);
  await prisma.guild.update({
    where: { id: g.id },
    data: { scheduleChannelId: channelId, scheduleMessageId: null },
  });
}

/** บันทึก message id ของตารางล่าสุด (ไว้แก้ไขทับ) */
export async function setScheduleMessage(guildId: string, messageId: string) {
  const g = await ensureGuild(guildId);
  await prisma.guild.update({
    where: { id: g.id },
    data: { scheduleMessageId: messageId },
  });
}

/** ล้าง message id (กรณีลบข้อความเดิม/หาไม่เจอ) */
export async function clearScheduleMessage(guildId: string) {
  const g = await ensureGuild(guildId);
  await prisma.guild.update({
    where: { id: g.id },
    data: { scheduleMessageId: null },
  });
}

/** คืนค่าเป้าหมายในการโพสต์ตาราง (ต้องตั้งช่องไว้แล้ว ไม่เช่นนั้นโยน error) */
export async function getScheduleTargetOrThrow(guildId: string) {
  const g = await ensureGuild(guildId);
  if (!g.scheduleChannelId) {
    throw new Error(`Guild ${guildId} ไม่มี scheduleChannelId`);
  }
  return { channelId: g.scheduleChannelId, messageId: g.scheduleMessageId ?? null };
}

/** อัปเดต gameId เริ่มต้นของกิลด์ (เผื่อใช้กับ /config game) */
export async function setGuildGame(guildId: string, gameId: string) {
  const g = await ensureGuild(guildId);
  await prisma.guild.update({
    where: { id: g.id },
    data: { gameId },
  });
}