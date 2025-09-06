// src/commands/boss-bulk.ts
import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    AttachmentBuilder,
    PermissionFlagsBits,
  } from 'discord.js';
  import { prisma } from '../lib/prisma.js';
  import { safeDefer, safeReply } from '../lib/interaction.js';
  import { ENV } from '../lib/env.js';
import { getAttachmentOption } from '../lib/attachments.js';
  
  type Row = {
    action?: 'add'|'reset'|'delete';
    name: string;
    hours?: number;
    alias?: string[];   // optional
    game?: string;
  };
  
  export const data = new SlashCommandBuilder()
  .setName('bulk-boss')
  .setDescription('เพิ่ม/ลบ/รีเซ็ต บอสแบบอัพโหลดไฟล์ (CSV/JSON)')
  .addStringOption(o =>
    o.setName('mode')
     .setDescription('โหมดการทำงาน')
     .setRequired(true)
     .addChoices(
       { name: 'add-or-update', value: 'upsert' },
       { name: 'delete', value: 'delete' },
       { name: 'reset-times', value: 'reset' },
     )
  )
  .addAttachmentOption(o =>
    o.setName('file').setDescription('CSV/JSON').setRequired(true)
  )
  .addStringOption(o =>
    o.setName('game').setDescription('รหัสเกม (ค่าเริ่มต้นตาม ENV)').setRequired(false)
  );
  
  export async function execute(i: ChatInputCommandInteraction) {
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return await safeReply(i,{ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์' });
    }

    await safeDefer(i, true); // ทำงานนาน ใช้ ephemeral
  
    const mode = (i.options.get('mode')?.value as string | undefined) as Row['action'];
    const att = getAttachmentOption(i, 'file', true)!;
    const url = att.url;
  
    // ดึงไฟล์จาก URL ของ Discord (อนุญาตให้อ่าน)
    const res = await fetch(url);
    const text = await res.text();
  
    // parse
    let rows: Row[] = [];
    if (att.name.endsWith('.json')) {
      rows = JSON.parse(text);
    } else {
      rows = parseCsv(text);
    }
  
    // validate เบื้องต้น
    const result = { added: 0, updated: 0, reset: 0, deleted: 0, error: 0, logs: [] as string[] };
  
    for (const raw of rows) {
      const action = (mode ?? raw.action ?? 'add') as Row['action'];
      const name = (raw.name ?? '').trim();
      const gameCode = (raw.game ?? ENV.DEFAULT_GAME_CODE).trim();
      if (!action || !name) {
        result.error++; result.logs.push(`❌ missing action/name: ${JSON.stringify(raw)}`); continue;
      }
  
      try {
        const game = await prisma.game.upsert({
          where: { code: gameCode },
          update: {},
          create: { code: gameCode, name: gameCode },
        });
  
        if (action === 'add') {
          if (typeof raw.hours !== 'number') {
            result.error++; result.logs.push(`❌ ${name}: hours required`); continue;
          }
          const alias = Array.isArray(raw.alias) ? raw.alias : [];
  
          const before = await prisma.boss.findFirst({ where: { gameId: game.id, name } });
          await prisma.boss.upsert({
            where: { gameId_name: { gameId: game.id, name } },
            update: { respawnHours: raw.hours, alias },
            create: { gameId: game.id, name, respawnHours: raw.hours, alias },
          });
          if (before) result.updated++; else result.added++;
          result.logs.push(`✅ add/update: ${name} (${raw.hours}ชม.)`);
        }
  
        if (action === 'reset') {
          const boss = await prisma.boss.findFirst({ where: { gameId: game.id, name } });
          if (!boss) { result.logs.push(`ℹ️ not found (skip reset): ${name}`); continue; }
          await prisma.boss.update({
            where: { id: boss.id },
            data: { lastDeathAt: null, nextSpawnAt: null },
          });
          result.reset++; result.logs.push(`♻️ reset: ${name}`);
        }
  
        if (action === 'delete') {
          const boss = await prisma.boss.findFirst({ where: { gameId: game.id, name } });
          if (!boss) { result.logs.push(`ℹ️ not found (skip delete): ${name}`); continue; }
          // ลบ rule/ log ที่ผูกอยู่ด้วยถ้ามี (onDelete cascade แนะนำตั้งใน schema)
          await prisma.fixedRule.deleteMany({ where: { bossId: boss.id } });
          await prisma.boss.delete({ where: { id: boss.id } });
          result.deleted++; result.logs.push(`🗑️ delete: ${name}`);
        }
      } catch (e: any) {
        result.error++; result.logs.push(`❌ ${name}: ${e?.message ?? e}`);
      }
    }
  
    // สรุปผล (ยาวก็แนบไฟล์)
    const summary =
      `ผลลัพธ์ — add:${result.added} update:${result.updated} reset:${result.reset} delete:${result.deleted} error:${result.error}\n` +
      (result.logs.join('\n') || '(no logs)');
    if (summary.length <= 1900) {
      return safeReply(i, { content: '```\n' + summary + '\n```', flags: 1 << 6 }); // Ephemeral
    } else {
      const file = new AttachmentBuilder(Buffer.from(summary, 'utf8'), { name: 'bulk-result.txt' });
      return safeReply(i, { content: 'สรุปผลแนบไฟล์', files: [file], flags: 1 << 6 });
    }
  }
  
  // CSV parser เบา ๆ ไม่พึ่ง lib (รองรับ header)
  function parseCsv(text: string): Row[] {
    const lines = text.trim().split(/\r?\n/);
    if (lines.length === 0) return [];
    const header = lines[0].split(',').map(s => s.trim());
    const idx = (k: string) => header.findIndex(h => h.toLowerCase() === k);
    const out: Row[] = [];
    for (let n = 1; n < lines.length; n++) {
      const cells = splitCsvLine(lines[n]);
      const get = (k: string) => {
        const i = idx(k); return i >= 0 ? (cells[i] ?? '').trim() : '';
      };
      const aliasRaw = get('alias');
      out.push({
        action: (get('action') as any) || undefined,
        name: get('name'),
        hours: get('hours') ? Number(get('hours')) : undefined,
        alias: aliasRaw ? aliasRaw.split(/\s*,\s*/).filter(Boolean) : undefined,
        game: get('game') || undefined,
      });
    }
    return out;
  }
  function splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' ) {
        if (inQ && line[i+1] === '"') { cur += '"'; i++; }
        else { inQ = !inQ; }
      } else if (c === ',' && !inQ) {
        out.push(cur); cur = '';
      } else cur += c;
    }
    out.push(cur);
    return out;
  }