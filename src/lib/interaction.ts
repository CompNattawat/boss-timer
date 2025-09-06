// src/lib/interaction.ts
import {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  InteractionEditReplyOptions,
  MessagePayload,
} from 'discord.js';

type Replyable =
  | string
  | MessagePayload
  | (InteractionReplyOptions & InteractionEditReplyOptions);

/** defer แบบปลอดภัย: ถ้าเคย defer/reply แล้วจะไม่ทำซ้ำ และไม่โยน error */
export async function safeDefer(
  i: ChatInputCommandInteraction,
  ephemeral = false
): Promise<boolean> {
  if (i.deferred || i.replied) return false;
  try {
    await i.deferReply({ ephemeral });
    return true;
  } catch (e: any) {
    // ถ้า interaction ถูก acknowledge ไปแล้ว ก็ถือว่า defer ไม่จำเป็น
    return false;
  }
}

/** ตอบกลับแบบเดียว ใช้ได้ทั้งก่อน/หลัง defer และหลัง reply */
export async function safeReply(
  i: ChatInputCommandInteraction,
  options: Replyable
) {
  // ถ้าเคย defer ให้แก้ไขข้อความที่ defer ไว้
  if (i.deferred) {
    return i.editReply(options as InteractionEditReplyOptions);
  }
  // ถ้าเคย reply ไปแล้ว ให้ตามด้วย followUp
  if (i.replied) {
    return i.followUp(options as InteractionReplyOptions);
  }
  // ยังไม่เคยตอบเลย -> reply ปกติ
  return i.reply(options as InteractionReplyOptions);
}

/** ส่งต่อข้อความเพิ่มเติมอย่างปลอดภัย (หลัง reply/defer แล้ว) */
export async function safeFollowUp(
  i: ChatInputCommandInteraction,
  options: Replyable
) {
  if (i.deferred || i.replied) {
    return i.followUp(options as InteractionReplyOptions);
  }
  return i.reply(options as InteractionReplyOptions);
}