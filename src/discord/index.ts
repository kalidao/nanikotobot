import { config } from "dotenv";
import { getReply, handlePageSummary } from "@/commands/reply";
import { addToNani } from "@/memory/utils";
import { createMessageToSave } from "@/telegram/utils";
import { Client, GatewayIntentBits, Message } from "discord.js";
import {
  ChatCompletionRequestMessage,
  ChatCompletionRequestMessageRoleEnum,
} from "openai";
import { isDev } from "@/index.ts";
import { getPageSummary } from "@/commands/web";

config();

const isProposal = (message: Message) => {
    return message.content.startsWith("!propose");
}

const validate = (message: Message) => {
    if (message.author.bot) return false;
    if (message.content.startsWith(".")) return false;
    return true;
}


const handleDiscordReply = async (message: Message) => {
  console.info(`[discord] ${message.author.username}: ${message.content}`)
  const pageSummary = await handlePageSummary(message.content);

  await addToNani(
      createMessageToSave({
          author: message.author.username,
          message: message.content,
      }),
      "discord"
  );
  
  const messages = await message.channel.messages.fetch({ limit: 2 });
  const messageChain: ChatCompletionRequestMessage[] = [
      ...messages.values(),
  ]
      .map((message) => {
          return {
              name: message.author.username,
              content: message.content,
              role: message.author.bot
              ? "assistant"
              : ("user" as ChatCompletionRequestMessageRoleEnum),
          };
      })
      .reverse();

  const response = await getReply({
      platform: "discord",
      messages: [...messageChain],
      soup: pageSummary ? pageSummary : undefined,  
  });

  const replied = await message.channel.send(response);
  await addToNani(
      createMessageToSave({
          author: replied.author.username,
          message: response,
      }),
      "discord"
  );
}

interface Infer {
    content: string;
    confidence: number;
}

interface Vote {
    // assumption:
    // - 1 vote per address
    // - 1 address per discord user
    // - All discord users are in the coop
    vote: boolean;
    userId: string; // discord user id 
    inferences: Infer[]; // inferred preference based on each message sent
}

interface Proposal {
    title: string;
    author: string;
    timestamp: number;
    address: string;
    chainId: number;
    tokenId: number;
    votes: Vote[];
}

const handleNewProposal = async (message: Message) => {
    // extract the proposal
    const title = message.content.split("!propose")[1].trim();

    // save the proposal to the redis with the title, author, timestamp
    // assuming coop for now, but can add token weight later
    // const proposal: Proposal = {
    //     title,
    //     author: message.author.username,
    //     timestamp: getTimestampAt(0),
    //     address: NANI_DAO_ADDRESS,
    //     chainId: 1,
    //     tokenId: 0,
    //     votes: [],
    // }
    // const tx = 
    message.channel.send(`Proposal "${title}" created! (NOT IMPLEMENTED)`);
}

const handleVote = async (message: Message) => {
    // extract the vote 
    const vote = message.content.startsWith("👍") ? true : false;

    message.channel.send(`Vote "${vote}" created! (NOT IMPLEMENTED)`);
}

export function initDiscord() {
  const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
  const client: Client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });

  client.once("ready", () => {
    console.log("Bot is ready!");
  });

  client.on("messageCreate", async (message: Message) => {
    try {
      if (!validate(message)) return;

      const DEV_CHANNEL_ID = process.env.DEV_CHANNEL_ID;
      if (!DEV_CHANNEL_ID) throw new Error("DEV_CHANNEL_ID not set");

      if (isDev) {
        if (message.channel.id == DEV_CHANNEL_ID) {
            if (isProposal(message)) {
                handleNewProposal(message);
            } else {
                handleDiscordReply(message);
            }
        }
        return 
      } else if (message.channel.id == DEV_CHANNEL_ID) {
        return
      }

      const PROPOSAL_CHANNEL_ID = process.env.PROPOSAL_CHANNEL_ID;
      if (!PROPOSAL_CHANNEL_ID) throw new Error("PROPOSAL_CHANNEL_ID not set");

      if (message.channel.id == PROPOSAL_CHANNEL_ID) {
        if (message.content.startsWith("!propose")) {
            handleNewProposal(message);
        } else {
            handleVote(message);
        }
      } else {
        handleDiscordReply(message);
      }
    } catch (e) {
      console.error(e);
      await message.channel.send("💔 @nerderlyne");
    }
  });

  client.login(DISCORD_TOKEN);
}
