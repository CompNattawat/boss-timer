import {
  ChatInputCommandInteraction,
  InteractionReplyOptions,
  InteractionEditReplyOptions,
  MessagePayload,
  MessageFlags,
} from 'discord.js';

type Replyable =
  | string
  | MessagePayload
  | (InteractionReplyOptions & InteractionEditReplyOptions);

const ACK = Symbol('acknowledged');
const PENDING = Symbol('pending'); // กันกดพร้อมกัน 2 await

function isAck(i: ChatInputCommandInteraction) {
  return i.deferred || i.replied || (i as any)[ACK];
}
function markAck(i: ChatInputCommandInteraction) {
  (i as any)[ACK] = true;
}
function isAlreadyAckError(e: unknown) {
  return typeof e === 'object' && e !== null && (e as any).code === 40060;
}

// ---- helper: ผนวก flags ephemeral ถ้าขอแบบเก่า
function withFlags(
  options: Replyable,
  opts?: { ephemeral?: boolean }
): Replyable {
  if (typeof options === 'string' || options instanceof MessagePayload) return options;
  if (opts?.ephemeral && !options.flags) {
    return { ...options, flags: MessageFlags.Ephemeral as number };
  }
  return options;
}

/** defer แบบปลอดภัย (รองรับ opts.ephemeral -> flags) */
export async function safeDefer(
  i: ChatInputCommandInteraction,
  ephemeral = false
): Promise<boolean> {
  if (isAck(i)) return false;
  try {
    await i.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });
    markAck(i);
    return true;
  } catch (e) {
    if (isAlreadyAckError(e)) return false;
    throw e;
  }
}

/** ตอบกลับหนึ่งครั้งให้จบ ใช้ได้ทั้งก่อน/หลัง defer หรือหลัง reply */
export async function safeReply(
  i: ChatInputCommandInteraction,
  options: Replyable,
  opts?: { ephemeral?: boolean }
) {
  // กันเคสพิมพ์สั่งพร้อมกันหลาย await ในสาขาเดียว
  if ((i as any)[PENDING]) await (i as any)[PENDING];

  const payload = withFlags(options, opts);

  const run = async () => {
    if (i.deferred) {
      const r = await i.editReply(payload as InteractionEditReplyOptions);
      markAck(i);
      return r;
    }
    if (i.replied || (i as any)[ACK]) {
      const r = await i.followUp(payload as InteractionReplyOptions);
      markAck(i);
      return r;
    }
    const r = await i.reply(payload as InteractionReplyOptions);
    markAck(i);
    return r;
  };

  try {
    const p = run();
    (i as any)[PENDING] = p;
    const r = await p;
    (i as any)[PENDING] = null;
    return r;
  } catch (e) {
    (i as any)[PENDING] = null;
    if (isAlreadyAckError(e)) {
      try {
        if (i.deferred) {
          const r = await i.editReply(payload as InteractionEditReplyOptions);
          markAck(i);
          return r;
        }
        const r = await i.followUp(payload as InteractionReplyOptions);
        markAck(i);
        return r;
      } catch {}
    }
    throw e;
  }
}

/** ส่งข้อความเพิ่มเติมหลังจากเคยตอบแล้ว */
export async function safeFollowUp(
  i: ChatInputCommandInteraction,
  options: Replyable,
  opts?: { ephemeral?: boolean }
) {
  const payload = withFlags(options, opts);

  if (i.deferred || i.replied || (i as any)[ACK]) {
    return i.followUp(payload as InteractionReplyOptions);
  }
  const r = await i.reply(payload as InteractionReplyOptions);
  markAck(i);
  return r;
}