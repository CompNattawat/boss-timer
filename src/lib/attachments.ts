// utils/attachments.ts
import type { ChatInputCommandInteraction, Attachment } from 'discord.js';

export function getAttachmentOption(
  i: ChatInputCommandInteraction,
  name: string,
  required = false
): Attachment | null {
  // ใช้ได้เมื่อ type ปัจจุบันรองรับ
  // @ts-ignore
  if (typeof i.options.getAttachment === 'function') {
    // @ts-ignore
    return i.options.getAttachment(name, required) ?? null;
  }

  // fallback: ดึงจาก option ดิบ
  const opt = i.options.get(name, required);
  if (!opt) return null;

  // บาง type ของ d.js เก่าจะเก็บไว้ที่ .attachment
  const anyOpt = opt as unknown as { attachment?: Attachment; value?: unknown };
  if (anyOpt.attachment) return anyOpt.attachment;

  // เผื่อบางกรณี value คือ Attachment
  if (anyOpt.value && typeof anyOpt.value === 'object') {
    return anyOpt.value as Attachment;
  }

  if (required) throw new Error(`Attachment option "${name}" is required`);
  return null;
}