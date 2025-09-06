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

// ธงภายในเพื่อกันเรียกซ้ำ แม้ i.deferred/i.replied จะยังไม่อัปเดต
const ACK = Symbol('acknowledged');
function isAck(i: ChatInputCommandInteraction) {
  return i.deferred || i.replied || (i as any)[ACK];
}
function markAck(i: ChatInputCommandInteraction) {
  (i as any)[ACK] = true;
}

function isAlreadyAckError(e: unknown) {
  return typeof e === 'object' && e !== null && (e as any).code === 40060;
}

/** defer แบบปลอดภัย: ถ้าเคย defer/reply แล้วจะไม่ทำซ้ำ และไม่โยน error */
export async function safeDefer(
  i: ChatInputCommandInteraction,
  ephemeral = false
): Promise<boolean> {
  if (isAck(i)) return false;
  try {
    await i.deferReply({ ephemeral });
    markAck(i);
    return true;
  } catch (e) {
    // ถ้าโดน 40060 แปลว่าเคย ack ไปแล้ว -> เงียบไว้
    if (isAlreadyAckError(e)) return false;
    // error อื่น ๆ ให้โยนกลับเพื่อจะได้เห็นบั๊กจริง
    throw e;
  }
}

/** ตอบกลับหนึ่งครั้งให้จบ ใช้ได้ทั้งก่อน/หลัง defer หรือหลัง reply */
export async function safeReply(
  i: ChatInputCommandInteraction,
  options: Replyable
) {
  try {
    if (i.deferred) {
      const r = await i.editReply(options as InteractionEditReplyOptions);
      markAck(i);
      return r;
    }
    if (i.replied || (i as any)[ACK]) {
      const r = await i.followUp(options as InteractionReplyOptions);
      markAck(i);
      return r;
    }
    const r = await i.reply(options as InteractionReplyOptions);
    markAck(i);
    return r;
  } catch (e) {
    // ถ้า reply ล้มเหลวเพราะ 40060 ให้ fallback เป็น followUp/edit
    if (isAlreadyAckError(e)) {
      try {
        if (i.deferred) {
          const r = await i.editReply(options as InteractionEditReplyOptions);
          markAck(i);
          return r;
        }
        const r = await i.followUp(options as InteractionReplyOptions);
        markAck(i);
        return r;
      } catch {
        // กลั้น error ครั้งที่สองไว้ไม่ให้โปรเจกต์พังกลางทาง
      }
    }
    throw e;
  }
}

/** ส่งข้อความเพิ่มเติมหลังจากเคยตอบแล้ว */
export async function safeFollowUp(
  i: ChatInputCommandInteraction,
  options: Replyable
) {
  if (i.deferred || i.replied || (i as any)[ACK]) {
    return i.followUp(options as InteractionReplyOptions);
  }
  // ยังไม่เคยตอบเลย -> ให้เป็น reply ครั้งแรก
  const r = await i.reply(options as InteractionReplyOptions);
  markAck(i);
  return r;
}