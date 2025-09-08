// src/commands/bulk-times.ts
import {
    SlashCommandBuilder,
    ChatInputCommandInteraction,
    PermissionFlagsBits,
  } from 'discord.js';
  import dayjs from 'dayjs';
  import tz from 'dayjs/plugin/timezone.js';
  import utc from 'dayjs/plugin/utc.js';
  import { prisma } from '../lib/prisma.js';
  import { safeDefer, safeReply } from '../lib/interaction.js';
  import { scheduleJobs } from '../services/schedule.service.js';
  import cronParser from 'cron-parser';
  dayjs.extend(utc); dayjs.extend(tz);
  
  const DEFAULT_TZ = 'Asia/Bangkok';

  // helpers
const optStr = (i: ChatInputCommandInteraction, name: string, required = false) =>
(i.options.get(name, required)?.value as string | undefined);

const optAttachment = (i: ChatInputCommandInteraction, name: string, required = false) =>
(i.options.get(name, required)?.attachment as import('discord.js').Attachment | undefined);

  
  export const data = new SlashCommandBuilder()
    .setName('bulk-times')
    .setDescription('อัปเดตเวลาตาย/เวลาเกิด/รีเซ็ต หลายรายการจากไฟล์')
    .addStringOption(o =>
      o.setName('mode')
       .setDescription('apply = เขียนจริง, dry-run = พรีวิว')
       .setRequired(true)
       .addChoices(
         { name: 'apply', value: 'apply' },
         { name: 'dry-run', value: 'dry-run' },
       )
    )
    .addAttachmentOption(o =>
      o.setName('file')
       .setDescription('ไฟล์ .json หรือ .csv')
       .setRequired(true)
    )
    .addStringOption(o =>
        o.setName('game').setDescription('รหัสเกม (ค่าเริ่มต้นตาม ENV)').setRequired(false)
      )
    .addStringOption(o =>
      o.setName('tz')
       .setDescription('เช่น Asia/Bangkok (ค่าดีฟอลต์)')
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild);
  
  type Row = {
    action: 'death' | 'spawn' | 'reset';
    name: string;
    time?: string;        // optional for reset
    game?: string;        // ถ้าไม่ใส่ จะ fallback ENV/ดีฟอลต์
  };
  
  export async function execute(i: ChatInputCommandInteraction) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
        return await safeReply(i,{ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์' });
    }

    await safeDefer(i, true);

    // อ่านออปชัน
    const mode = (optStr(i, 'mode', true) as 'apply' | 'dry-run');
    // @ts-ignore (รองรับทั้ง type เก่า/ใหม่)
    const zone = optStr(i, 'tz') ?? 'Asia/Bangkok';
    const att  = optAttachment(i, 'file', true)!;
  
    // ดาวน์โหลดไฟล์จาก URL ของ Discord
    const res = await fetch(att.url);
    const text = await res.text();
  
    // แปลงไฟล์เป็น rows
    const rows = att.name?.toLowerCase().endsWith('.json')
      ? (JSON.parse(text) as Row[])
      : parseCsv(text);
  
    // ประมวลผล
    const results = await processRows(rows, { apply: mode === 'apply', tz: zone });
  
    // สรุปผล
    const header = mode === 'apply' ? '🛠️ เขียนข้อมูลจริงแล้ว' : '🧪 Dry-run (ไม่เขียนลงฐานข้อมูล)';
    const report =
      `${header}\n` +
      `ทั้งหมด: ${results.total} แถว\n` +
      `สำเร็จ: ${results.ok} | ล้มเหลว: ${results.fail}\n` +
      (results.skipped ? `ข้าม: ${results.skipped}\n` : '') +
      (results.unknownNames.length ? `\nไม่พบบอส: ${results.unknownNames.slice(0, 20).join(', ')}${results.unknownNames.length > 20 ? ' ...' : ''}\n` : '') +
      (results.errors.length ? `\nข้อผิดพลาด:\n- ${results.errors.slice(0, 5).join('\n- ')}${results.errors.length > 5 ? '\n...' : ''}` : '');
  
    await safeReply(i, { content: report });
  }
  
  /* -------------------------- core logic --------------------------- */
  
  function parseCsv(text: string): Row[] {
    const clean = text.replace(/^\uFEFF/, ''); // strip BOM
    const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
    const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  
    const lines = clean.trim().split(/\r?\n/);
    const head = (lines.shift() ?? '')
      .split(delim)
      .map(s => s.trim().toLowerCase());
  
    const idx = (k: string) => head.indexOf(k);
    const rows: Row[] = [];
  
    for (const raw of lines) {
      const ln = raw.trim();
      if (!ln) continue;
  
      // บรรทัดที่มีแต่ตัวคั่น เช่น ",,," หรือ ";;;"
      if (/^([,;]\s*)+$/.test(ln)) continue;
  
      const cols = ln.split(delim).map(s => s.trim());
      const action = cols[idx('action')]?.toLowerCase() as Row['action'] | undefined;
      const name   = cols[idx('name')] || undefined;
      const time   = cols[idx('time')] || undefined;
      const game   = cols[idx('game')] || undefined;
  
      if (!action || !['death','spawn','reset'].includes(action)) continue;
      if (!name) continue; // ต้องมีชื่อ
  
      rows.push({ action, name, time, game });
    }
    return rows;
  }
  
  async function processRows(
    rows: Row[],
    opts: { apply: boolean; tz: string }
  ) {
    let ok = 0, fail = 0, skipped = 0;
    const unknownNames: string[] = [];
    const errors: string[] = [];
  
    // เตรียม cache เกม + บอส
    const gameCache = new Map<string, { id: string }>();
    const bossCache = new Map<string, { id: string; name: string; respawnHours: number | null }>();
  
    const getGame = async (code: string) => {
      const k = code || 'L9';
      if (!gameCache.has(k)) {
        const g = await prisma.game.findUnique({ where: { code: k } });
        if (g) gameCache.set(k, { id: g.id });
      }
      return gameCache.get(k) || null;
    };
  
    const findBoss = async (gameCode: string, name?: string) => {
      if (!name) return null; // สำคัญ!
    
      const key = `${gameCode}::${name}`;
      if (bossCache.has(key)) return bossCache.get(key)!;
    
      const g = await getGame(gameCode);
      if (!g) return null;
    
      const where: any = { gameId: g.id, OR: [{ name }, { alias: { has: name } }] };
      const b = await prisma.boss.findFirst({ where });
      if (!b) return null;
    
      const rec = { id: b.id, name: b.name, respawnHours: b.respawnHours };
      bossCache.set(key, rec);
      return rec;
    };
  
    const tx: any[] = [];
  
    for (const r of rows) {
      try {
        const gameCode = r.game || 'L9';
    
        // validate ขั้นพื้นฐาน
        if (!r.name) { skipped++; continue; }
        if (r.action !== 'reset' && !r.time) { skipped++; continue; }
    
        const boss = await findBoss(gameCode, r.name);
        if (!boss) { unknownNames.push(`${r.name}(${gameCode})`); fail++; continue; }
    
        if (r.action === 'reset') {
          if (opts.apply) {
            tx.push(prisma.boss.update({
              where: { id: boss.id },
              data: { lastDeathAt: null, nextSpawnAt: null },
            }));
          }
          ok++; continue;
        }
    
        const parsed = parseWhen(r.time!, opts.tz);
        if (!parsed) { fail++; errors.push(`time ไม่ถูกต้อง: "${r.time}" (${r.name})`); continue; }
    
        if (r.action === 'death') {
          const next = await calcNextFromDeath(boss.id, boss.respawnHours, parsed, opts.tz);
          if (opts.apply) {
            tx.push(prisma.boss.update({
              where: { id: boss.id },
              data: { lastDeathAt: parsed.toDate(), nextSpawnAt: next?.toDate() || null },
            }));
            if (next) tx.push(scheduleJobs(boss.id, boss.name, next.toISOString()));
          }
          ok++; continue;
        }
    
        if (r.action === 'spawn') {
          if (opts.apply) {
            tx.push(prisma.boss.update({
              where: { id: boss.id },
              data: { nextSpawnAt: parsed.toDate() },
            }));
            tx.push(scheduleJobs(boss.id, boss.name, parsed.toISOString()));
          }
          ok++; continue;
        }
    
        skipped++;
      } catch (e: any) {
        fail++; errors.push(e?.message ?? String(e));
      }
    }
  
    if (opts.apply && tx.length) {
      await prisma.$transaction(tx);
    }
  
    return { total: rows.length, ok, fail, skipped, unknownNames, errors };
  }

  function parseWhen(text: string, tz: string) {
    const s = text.trim();
  
    // HH:mm => วันนี้
    if (/^\d{1,2}:\d{2}$/.test(s)) {
      const today = dayjs().tz(tz).format('DD/MM/YY');
      const d = dayjs.tz(`${today} ${s}`, 'DD/MM/YY HH:mm', tz);
      return d.isValid() ? d : null;
    }
  
    // ลอง parse แบบ DD/MM/YY HH:mm
    let d = dayjs.tz(s, 'DD/MM/YY HH:mm', tz);
    if (d.isValid()) return d;
  
    // ลอง parse แบบ DD/MM/YYYY HH:mm
    d = dayjs.tz(s, 'DD/MM/YYYY HH:mm', tz);
    if (d.isValid()) return d;
  
    return null;
  }
  
  // ถ้าเป็น daily (มี respawnHours) => next = death + hours
  // ถ้าบอสมี fixed rules => next = รอบ cron ถัดจากเวลาตาย
  async function calcNextFromDeath(
    bossId: string,
    respawnHours: number | null,
    deathAt: dayjs.Dayjs,
    tz: string
  ) {
    // fixed?
    const rules = await prisma.fixedRule.findMany({ where: { bossId, enabled: true } });
    if (rules.length) {
      let nearest: Date | null = null;
      for (const r of rules) {
        try {
          const it = cronParser.parseExpression(r.cron, { tz: r.tz || tz, currentDate: deathAt.toDate() });
          const n = it.next().toDate();
          if (!nearest || n < nearest) nearest = n;
        } catch { /* ignore invalid cron */ }
      }
      return nearest ? dayjs(nearest) : null;
    }
    // daily
    return respawnHours != null ? deathAt.add(respawnHours, 'hour') : null;
  }