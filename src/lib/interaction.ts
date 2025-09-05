// lib/interaction.ts
import {
    ChatInputCommandInteraction,
    MessageFlags,
    InteractionReplyOptions,
    InteractionEditReplyOptions,
  } from 'discord.js';
  
  export async function safeDefer(i: ChatInputCommandInteraction, ephemeral = false) {
    if (!i.deferred && !i.replied) {
      await i.deferReply({
        // ใช้ flags เฉพาะตอน defer เท่านั้น
        flags: ephemeral ? MessageFlags.Ephemeral : undefined,
      });
    }
  }
  
  // ตัด fields ที่ editReply รับไม่ได้
  function toEditOptions(opts: InteractionReplyOptions | InteractionEditReplyOptions): InteractionEditReplyOptions {
    const { ephemeral, flags, ...rest } = opts as any;
    return rest as InteractionEditReplyOptions;
  }
  
  export async function safeReply(
    i: ChatInputCommandInteraction,
    opts: InteractionReplyOptions | InteractionEditReplyOptions
  ) {
    try {
      if (i.deferred) {
        // editReply ต้องไม่มี ephemeral/flags
        return await i.editReply(toEditOptions(opts));
      }
      if (i.replied) {
        // followUp รับแบบเดียวกับ reply ได้
        return await i.followUp(opts as InteractionReplyOptions);
      }
      return await i.reply(opts as InteractionReplyOptions);
    } catch (e) {
      console.error('safeReply error:', e);
      // fallback เผื่อเจอ race เล็ก ๆ
      try {
        if (!i.replied) return await i.reply(opts as InteractionReplyOptions);
        return await i.followUp(opts as InteractionReplyOptions);
      } catch (e2) {
        console.error('safeReply fallback error:', e2);
      }
    }
  }