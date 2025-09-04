import type {
    ChatInputCommandInteraction,
    InteractionReplyOptions,
    InteractionEditReplyOptions,
  } from 'discord.js';
  
  function toEditOptions(opts: InteractionReplyOptions): InteractionEditReplyOptions {
    const { ephemeral, flags, ...rest } = opts as any;
    return rest as InteractionEditReplyOptions;
  }
  
  export async function safeDefer(i: ChatInputCommandInteraction, ephemeral = false) {
    if (!i.deferred && !i.replied) {
      await i.deferReply({ ephemeral });
    }
  }
  
  export async function safeReply(
    i: ChatInputCommandInteraction,
    options: InteractionReplyOptions
  ) {
    if (i.deferred) return i.editReply(toEditOptions(options));
    if (i.replied)  return i.followUp(options);
    return i.reply(options);
  }