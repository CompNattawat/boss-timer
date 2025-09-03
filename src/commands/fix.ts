import {
    ChatInputCommandInteraction,
    SlashCommandBuilder,
    PermissionFlagsBits,
  } from 'discord.js';
  import { prisma } from '../lib/prisma.js';
  
  export const data = new SlashCommandBuilder()
    .setName('fix')
    .setDescription('จัดการบอสแบบเกิดตามเวลาคงที่')
    .addSubcommand(sc => sc.setName('add')
      .setDescription('เพิ่มกติกา fixed-time')
      .addStringOption(o => o.setName('name').setDescription('ชื่อบอส').setRequired(true))
      .addStringOption(o => o.setName('cron').setDescription('cron เช่น "0 20 * * 3"').setRequired(true))
      .addStringOption(o => o.setName('game').setDescription('โค้ดเกม เช่น L9'))
    )
    .addSubcommand(sc => sc.setName('list')
      .setDescription('รายการกติกา fixed-time ทั้งหมด')
      .addStringOption(o => o.setName('game').setDescription('โค้ดเกม เช่น L9'))
    )
    .addSubcommand(sc => sc.setName('remove')
      .setDescription('ลบกติกา fixed-time')
      .addStringOption(o => o.setName('id').setDescription('FixedRule ID').setRequired(true))
    )
    .addSubcommand(sc => sc.setName('toggle')
      .setDescription('เปิด/ปิดกติกา fixed-time')
      .addStringOption(o => o.setName('id').setDescription('FixedRule ID').setRequired(true))
      .addBooleanOption(o => o.setName('enabled').setDescription('true=เปิด, false=ปิด').setRequired(true))
    );
  
  export async function execute(i: ChatInputCommandInteraction) {
    const sub = i.options.getSubcommand();
    const gameCode = (i.options.get('game')?.value as string | undefined) ?? 'L9';
  
    if (!i.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return i.reply({ content: 'ต้องเป็นแอดมินเซิร์ฟเวอร์', ephemeral: true });
    }
  
    if (sub === 'add') {
      const name = i.options.get('name', true).value as string;
      const cron = i.options.get('cron', true).value as string;
  
      const game = await prisma.game.upsert({
        where: { code: gameCode },
        update: {},
        create: { code: gameCode, name: gameCode },
      });
      const boss = await prisma.boss.findFirst({ where: { gameId: game.id, name } });
      if (!boss)
        return i.reply({ content: `ไม่พบบอส "${name}" ในเกม ${gameCode}`, ephemeral: true });
  
      const rule = await prisma.fixedRule.create({
        data: { gameId: game.id, bossId: boss.id, cron, tz: 'Asia/Bangkok', enabled: true },
      });
      return i.reply({ content: `เพิ่ม fixed-time #${rule.id} สำหรับ **${name}**: \`${cron}\``, ephemeral: true });
    }
  
    if (sub === 'list') {
      const game = await prisma.game.findUnique({ where: { code: gameCode } });
      if (!game) return i.reply({ content: `ไม่พบเกม ${gameCode}`, ephemeral: true });
  
      const rules = await prisma.fixedRule.findMany({
        where: { gameId: game.id },
        include: { boss: true },
        orderBy: { createdAt: 'desc' },
      });
      if (rules.length === 0) return i.reply({ content: 'ยังไม่มีกติกา fixed-time', ephemeral: true });
  
      const lines = rules.map((r: { id: any; enabled: any; boss: { name: any; }; cron: any; nextPreparedAt: any; }) =>
        `#${r.id} • ${r.enabled ? '✅' : '⛔️'} **${r.boss.name}** • \`${r.cron}\` • nextPreparedAt: ${r.nextPreparedAt ?? '—'}`
      );
      return i.reply({ content: lines.join('\n'), ephemeral: true });
    }
  
    if (sub === 'remove') {
      const id = i.options.get('id', true).value as string;
      await prisma.fixedRule.delete({ where: { id } }).catch(() => null);
      return i.reply({ content: `ลบ fixed-time #${id} แล้ว`, ephemeral: true });
    }
  
    if (sub === 'toggle') {
      const id = i.options.get('id', true).value as string;
      const enabled = i.options.get('enabled', true).value as boolean;
      await prisma.fixedRule.update({ where: { id }, data: { enabled } }).catch(() => null);
      return i.reply({ content: `${enabled ? 'เปิด' : 'ปิด'} fixed-time #${id} แล้ว`, ephemeral: true });
    }
  }