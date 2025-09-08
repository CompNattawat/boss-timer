// src/services/guild.service.ts
import { ENV } from '../lib/env.js';
import { prisma } from '../lib/prisma.js';

/** สร้างหรือดึงระเบียนกิลด์ (platform+externalId เป็น unique) */
export async function ensureGuild(discordGuildId: string) {
    const existing = await prisma.guild.findUnique({
      where: { platform_externalId: { platform: 'discord', externalId: discordGuildId } },
    });
    if (existing) return existing;
  
    const game = await prisma.game.findUnique({ where: { code: ENV.DEFAULT_GAME_CODE } });
    if (!game) throw new Error(`DEFAULT_GAME_CODE "${ENV.DEFAULT_GAME_CODE}" not found`);
  
    return prisma.guild.create({
      data: { platform: 'discord', externalId: discordGuildId, gameId: game.id },
    });
  }
  
  export async function attachGameByCode(discordGuildId: string, gameCode: string) {
    const game = await prisma.game.findUnique({ where: { code: gameCode } });
    if (!game) throw new Error(`Game code "${gameCode}" not found`);
    await ensureGuild(discordGuildId);
    return prisma.guild.update({
      where: { platform_externalId: { platform: 'discord', externalId: discordGuildId } },
      data: { gameId: game.id },
    });
  }
  
  export async function getGuildOrThrow(discordGuildId: string) {
    const g = await prisma.guild.findUnique({
      where: { platform_externalId: { platform: 'discord', externalId: discordGuildId } },
    });
    if (!g) throw new Error(`Guild ${discordGuildId} not found`);
    return g;
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
export async function setScheduleChannel(discordGuildId: string, channelId: string) {
    await ensureGuild(discordGuildId);
    return prisma.guild.update({
      where: { platform_externalId: { platform: 'discord', externalId: discordGuildId } },
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