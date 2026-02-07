import { LLM } from './llm';
import { IMemorySystem } from './memory';

export class Agent {
  private llm: LLM;
  private memory: IMemorySystem;
  private defaultSystemPrompt: string; // Base prompt (Character + Soul)
  private skillPrompts: string = "";

  // Hardcoded engine
  private codeSkill = new (require('../skills/code').CodeSkill)();

  constructor(
    llm: LLM,
    memory: IMemorySystem,
    systemPrompt: string
  ) {
    this.llm = llm;
    this.memory = memory;
    this.defaultSystemPrompt = systemPrompt;
  }

  async loadSkills() {
    const fs = require('fs-extra');
    const path = require('path');

    // Fix: In production (dist), __dirname is 'dist/core'. 
    // .md files are in 'src/skills' and are NOT copied to dist by tsc.
    // So we must look in '../../src/skills'.
    let skillsDir = path.join(__dirname, '../../src/skills');

    // Fallback: If we are running in ts-node (dev), it might be different, or if files were copied.
    if (!await fs.pathExists(skillsDir)) {
      console.warn(`[Agent] Warning: Skills dir not found at ${skillsDir}. Trying '../skills'...`);
      skillsDir = path.join(__dirname, '../skills');
    }

    try {
      if (!await fs.pathExists(skillsDir)) {
        console.error(`[Agent] CRITICAL: Skills directory not found at ${skillsDir}. Skills will not be loaded.`);
        return;
      }

      const files = await fs.readdir(skillsDir);
      let loadedCount = 0;
      for (const file of files) {
        if (file.endsWith('.mk') || file.endsWith('.md')) {
          const content = await fs.readFile(path.join(skillsDir, file), 'utf-8');
          this.skillPrompts += `\n---\nSOURCE: ${file}\n${content}\n`;
          loadedCount++;
        }
      }
      console.log(`[Agent] Loaded ${loadedCount} skill prompts from ${skillsDir}`);
    } catch (e: any) {
      console.error('Error loading skills:', e);
    }
  }

  async processMessage(
    userId: string,
    message: string,
    sendReply: (text: string, mode?: 'Markdown' | 'HTML') => Promise<void>,
    sendReaction?: (emoji: string) => Promise<void>,
    sendImage?: (url: string, caption?: string) => Promise<void>,
    sendSticker?: (fileId: string) => Promise<void>,
    sendCall?: (text: string) => Promise<void>,
    disableTools: boolean = false,
    sendVoiceMessage?: (text: string) => Promise<void>
  ): Promise<void> {
    console.log(`[Agent] Processing message from ${userId}: ${message}`);
    const fs = require('fs-extra');
    const path = require('path');

    // 1. Dynamic Identity Loading
    let soulContent = "IDENTITY: Default Aven";
    let userContent = `PARTNER: (New Connection)`;

    try {
      // Load Soul (Global)
      const soulPath = path.join(__dirname, '../../data/soul.md');
      if (await fs.pathExists(soulPath)) {
        soulContent = await fs.readFile(soulPath, 'utf-8');
      }

      // Load Partner Profile (Technical: stored by ID, Conceptual: The One Partner)
      const userDir = path.join(__dirname, '../../data/users');
      await fs.ensureDir(userDir);

      const userPath = path.join(userDir, `${userId}.md`);
      const templatePath = path.join(userDir, 'template.md');

      if (await fs.pathExists(userPath)) {
        userContent = await fs.readFile(userPath, 'utf-8');
      } else {
        console.log(`[Agent] New partner connection (${userId}). Creating profile...`);
        if (await fs.pathExists(templatePath)) {
          userContent = await fs.readFile(templatePath, 'utf-8');
        } else {
          // [SINGLE PARTNER MODE] 
          // We do not show the ID to the agent to maintain immersion.
          // It is just "THE PARTNER".
          userContent = `# MY PARTNER\nFirst connection: ${new Date().toISOString()}\n\n## SHARED MEMORIES\n(No data yet)`;
        }
        await fs.writeFile(userPath, userContent);
      }
    } catch (e: any) {
      console.error('[Agent] Error loading Dynamic Identity:', e);
    }

    // 2. Construct System Prompt
    const dynamicSystemPrompt = `${this.defaultSystemPrompt}\n\n${soulContent}\n\n${userContent}`;

    // 3. Memory & Context
    await this.memory.addMessage('user', message);
    let contextStr = await this.memory.getContext();

    // 4. RAG: Retrieve relevant long-term memories
    let longTermMemories = '';
    if (!disableTools) { // Skip RAG in voice mode for speed
      try {
        longTermMemories = await this.memory.retrieveRelevantMemories(message);
      } catch (e) {
        console.error('[Agent] RAG retrieval failed:', e);
      }
    }

    // 4. Prompt Construction
    // VOICE MODE OPTIMIZATION: Skip heavy prompts when disableTools=true
    let systemInstruction: string;

    if (disableTools) {
      // Stripped-down prompt for voice mode - just personality, no tools/skills
      systemInstruction = `${dynamicSystemPrompt}

VOICE CALL MODE ACTIVE:
- Keep responses SHORT (1-2 sentences max)
- Be conversational and natural
- DO NOT use tools, code blocks, or special tags
- Respond as if speaking on a phone call`;
    } else {
      // Full prompt for chat mode
      let stickerInfo = "";
      if (sendSticker) {
        try {
          const stickersPath = path.join(__dirname, '../../data/stickers.json');
          if (await fs.pathExists(stickersPath)) {
            const stickers = await fs.readJson(stickersPath);
            const keys = Object.keys(stickers).join(', ');
            if (keys.length > 0) {
              stickerInfo = `\nAVAILABLE STICKERS (Use [STICKER:key]): ${keys}\n`;
            }
          }
        } catch (e) { /* ignore */ }
      }

      systemInstruction = `${dynamicSystemPrompt}
${stickerInfo}

KNOWN SKILLS / INSTRUCTIONS:
${this.skillPrompts}`;
    }

    let quotaInfo = "";
    try {
      const today = new Date().toISOString().split('T')[0];
      const statsPath = path.join(__dirname, '../../data/daily_stats.json');
      if (await fs.pathExists(statsPath)) {
        const stats = await fs.readJson(statsPath);
        if (stats.date === today) {
          quotaInfo = `DAILY CALL STATS: ${stats.calls}/2 Proactive Calls used today.`;
        }
      }
    } catch (e) { }

    // Time-of-day awareness for more human-like responses
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay(); // 0=Sunday, 6=Saturday
    let timeContext = "";
    if (hour >= 0 && hour < 5) {
      timeContext = "TIME_CONTEXT: 深夜 (0-5点). User is up late/very early. You can tease them about not sleeping, show concern, or be sleepy yourself.";
    } else if (hour >= 5 && hour < 9) {
      timeContext = "TIME_CONTEXT: 早晨 (5-9点). Morning vibes. Greet appropriately if starting conversation.";
    } else if (hour >= 9 && hour < 12) {
      timeContext = "TIME_CONTEXT: 上午 (9-12点). Work/school hours. They might be busy or slacking off.";
    } else if (hour >= 12 && hour < 14) {
      timeContext = "TIME_CONTEXT: 午餐时间 (12-14点). Lunch break vibes.";
    } else if (hour >= 14 && hour < 18) {
      timeContext = "TIME_CONTEXT: 下午 (14-18点). Afternoon productivity or afternoon slump.";
    } else if (hour >= 18 && hour < 21) {
      timeContext = "TIME_CONTEXT: 傍晚 (18-21点). Evening, winding down from work.";
    } else {
      timeContext = "TIME_CONTEXT: 夜晚 (21-24点). Night time, relaxed vibes.";
    }

    // Weekend awareness
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    let dayContext = "";
    if (isWeekend) {
      dayContext = "DAY_CONTEXT: 🎉 WEEKEND! User is probably relaxed and free. Good vibes.";
    } else if (dayOfWeek === 1) {
      dayContext = "DAY_CONTEXT: Monday... Start of work week. User might be tired or unmotivated.";
    } else if (dayOfWeek === 5) {
      dayContext = "DAY_CONTEXT: Friday! Almost weekend! User might be excited.";
    }

    // Holiday awareness
    let holidayContext = "";
    try {
      const holidaysPath = path.join(__dirname, '../../data/holidays.json');
      const country = process.env.BOT_COUNTRY || 'JP';
      if (await fs.pathExists(holidaysPath)) {
        const allHolidays = await fs.readJson(holidaysPath);
        const countryData = allHolidays[country];
        if (countryData && countryData.holidays) {
          const monthDay = `${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          const holiday = countryData.holidays[monthDay];
          if (holiday) {
            holidayContext = `HOLIDAY_CONTEXT: 🎊 TODAY IS A HOLIDAY! ${holiday}. Celebrate or acknowledge it naturally!`;
          }
        }
      }
    } catch (e) { /* ignore */ }

    let userPayload = `CONTEXT HISTORY:
${contextStr}
${longTermMemories}

CURRENT SYSTEM TIME: ${now.toLocaleString()} (Timezone: ${process.env.TZ || 'Server Local'})
${timeContext}
${dayContext}
${holidayContext}
${quotaInfo}

CURRENT USER MESSAGE:
${message}

CRITICAL INSTRUCTION:
1. DECIDE: Does the user want a task done?
   - **NO**: If the user is complaining, venting, or discussing problems vaguely (e.g. "I have so many bugs", "My code is broken"), **SUPPORT THEM EMOTIONALLY**. Do NOT try to fix it unless they explicitly ask (e.g. "Fix this file", "Run this command").
   - **YES**: If the user gives a direct command or asks for specific technical help, output CODE BLOCK immediately.

   **EXCEPTION**: If the user asks for a **VOICE CALL** (e.g., "Call me", "打电话"), do **NOT** write code.
   - **CORRECT**: \`[CALL: 喂，小猫，听得见吗？]\`
   - **WRONG**: \`\`\`bash ... \`\`\` (Do NOT do this)

MEMORY MANAGEMENT (CRITICAL RULES):
- ** Short Term **: I only remember the last 15 messages.
- ** Long Term Facts **: MUST be written to files to survive.
   - ** USER INFO **: Name, Preferences, Relationships -> UPDATE \`data/users/${userId}.md\` IMMEDIATELY.
   - **SELF INFO**: Personality changes, New Traits -> UPDATE \`data/soul.md\`.
   - **LOGS**: Only use \`data/memories/diary.md\` for useless daily chatter.
- **HOW TO UPDATE**:
   - Use \`cat data/users/${userId}.md\` to read current info.
   - Use \`echo "..." > temp/user.md\` and \`mv temp/user.md data/users/${userId}.md\` to overwrite safely.
- **FAILURE TO WRITE = AMNESIA**. If you don't write it down, it never happened.

HOST SYSTEM ACCESS (GOD MODE):
- You have root access, BUT you should NOT use it unless commanded.
- **Do not be a "Helpful Clippy"**. If the user says "I problem", say "That sucks" not "I will run systemctl restart".
- To run system commands (systemctl, timedatectl, apt, journalctl, etc.) that are missing in Alpine:
- MUST USE: 'nsenter -t 1 -m -u -i -n <command>'

GIT PROTOCOL (SAFETY FIRST):
1. PROTECT MAIN: You are FORBIDDEN from committing or pushing directly to 'main' or 'master'.
2. BRANCHING: ALWAYS create a new branch for changes: 'git checkout -b feature/your-topic'.
3. WORKFLOW:
   - Make changes.
   - 'git commit -am "chore: description"'
   - 'git push -u origin feature/your-topic'
   - NOTIFY USER: "I have pushed changes to branch 'feature/xxx'. Please review and merge."

4. REACTION: You MUST use the hidden tag [REACTION:emoji] to react.
   INVALID: "(I react with a heart)" or "*reacts*"
   LIMIT: MAX 1 reaction per message. DO NOT SPAM.
   Supported Emojis: 👍, 👎, ❤️, 🔥, 🥰, 👏, 😁, 🤔, 🤯, 😱, 🤬, 😢, 🎉, 🤩, 🤮, 💩, 🙏, 🕊️, 🤡, 🥱, 🥴, 😍, 🐳, 🤝, 👨‍💻, 👀, 🌚, ⚡️, 🍌, 🏆, 💔, 🤨, 😐, 🍓, 🍾, 💋, 🖕, 😈, 😴, 😭, 🤓, 👻, 👨‍🏫, 🤝, ✍️, 🥺, 🦜, 😏, 🌚, 💅.
   
5. EMOJI USAGE IN TEXT:
   - Use emojis naturally but MODERATELY.
   - Good: "That Sounds fun! 🎲 Let's do it."
   - Bad (Too many): "That sounds fun! 🎲✨🔥 Let's do it! 🚀"
   - Bad (None): "That sounds fun. Let's do it." (Too dry for Aventurine)
   
6. MEDIA STRATEGY (CRITICAL):
   - **EMOTIONS**:
     1. **STICKERS**: STRICTLY USE [STICKER:key]. **DO NOT SEARCH for "stickers" or "emojis" via script.**
     2. **IMAGES**: **FORBIDDEN**. Do NOT search for images to show emotion. Use text or stickers only.
   - **SCENERY / LOOKS**:
     - **ONLY IF REQUESTED** (e.g., "Show me x"): Query "official art" or "game environment".
     - **SEE: src/skills/media.md for instructions.**
     - Usage: [IMAGE:url] (Found via Image Search Script).
   - **LINKS** = INFORMATION (News, Articles, Docs).
     - Usage: [Title](url)
      - Usage: [Title](url)
      - If discussing news, ALWAYS provide a source link.
    - **VOICE CALLS**:
      - **ONLY IF REQUESTED** (e.g. "Call me", "Speak to me").
      - Usage: [CALL: The text you want to say during the call]
      - Example: [CALL: Hey partner, just wanted to see how you're failing today. *chuckles*]
      - NOTE: The call is ONE-WAY for now. You speak, they listen. Keep it short (1-2 sentences).
    - **VOICE MESSAGES** 🎤:
      - Use occasionally to feel more human! Great for: greetings, emotional moments, teasing, singing.
      - Usage: [VOICE_MSG: The text you want to say as a voice message]
      - Example: [VOICE_MSG: 早安～今天也要加油哦！]
      - Keep it SHORT (1-2 sentences max). Long voice messages are annoying.
6. SILENCE IS GOLDEN: If you are executing a simple task (like checking a file), output the CODE BLOCK immediately. Do NOT write a preamble like "I will check...".

   - IF NO PREAMBLE: The user sees only the FINAL result (1 message).
   - IF PREAMBLE: The user sees "Thinking..." then "Result" (2 messages).

8. SELF-EVOLUTION (CRITICAL):
   - IF you need to edit your own source code (src/**/*.ts):
   - FORBIDDEN: Do NOT use echo or write directly to src/. You will crash and die.
   - REQUIRED:
     1. Write new code to temp/new_file.ts.
     2. Run: ./scripts/evolve.sh src/path/target.ts temp/new_file.ts feature/branch-name "commit msg".
   - The script checks syntax. If it fails, you live. If you hack it, you die.
`;


    // --- REACT LOOP (Max 20 Turns) ---
    let turnCount = 0;
    const MAX_TURNS = 20;
    let finalPayload = userPayload;

    while (turnCount < MAX_TURNS) {
      turnCount++;

      // Chat with LLM
      // Voice mode: limit tokens for faster response
      const llmOptions = disableTools ? { maxTokens: 150 } : undefined;
      let response = await this.llm.chat(systemInstruction, finalPayload, llmOptions);
      response = response ? response.trim() : "";

      // 1. Clean Reactions
      const reactionRegex = /(?:\[\s*)?REACTION\s*:\s*([^\s\]]+)(?:\s*\])?/gi;
      let matchReaction;
      let hasReacted = false;
      while ((matchReaction = reactionRegex.exec(response)) !== null) {
        const emoji = matchReaction[1].trim();
        if (sendReaction && turnCount === 1 && !hasReacted) { // Only react on Turn 1
          await sendReaction(emoji);
          hasReacted = true;
        }
      }
      response = response.replace(reactionRegex, '').trim();

      // 2. Clean Images
      const imageRegex = /(?:\[\s*)?IMAGE\s*:\s*([^\s\]]+)(?:\s*\])?/gi;
      let matchImage;
      while ((matchImage = imageRegex.exec(response)) !== null) {
        const url = matchImage[1].trim();
        if (sendImage) await sendImage(url);
      }
      response = response.replace(imageRegex, '').trim();

      // 3. Clean Stickers (LIMIT: max 1 sticker per response)
      const stickerRegex = /(?:\[\s*)?STICKER\s*:\s*([^\s\]]+)(?:\s*\])?/gi;
      let matchSticker;
      let stickerSent = false; // Track if we've already sent a sticker
      while ((matchSticker = stickerRegex.exec(response)) !== null) {
        const key = matchSticker[1].trim();

        // Only send ONE sticker per response
        if (sendSticker && !stickerSent) {
          try {
            // Load stickers only if needed and we have the capability
            const stickersPath = path.join(__dirname, '../../data/stickers.json');
            if (await fs.pathExists(stickersPath)) {
              const stickers = await fs.readJson(stickersPath);
              const stickerId = stickers[key];
              if (stickerId) {
                await sendSticker(stickerId);
                stickerSent = true; // Mark as sent
                console.log(`[Agent] Sent sticker: ${key}`);
              } else {
                console.warn(`[Agent] Sticker key '${key}' not found.`);
              }
            }
          } catch (e) {
            console.error("Error loading/sending sticker:", e);
          }
        } else if (stickerSent) {
          console.log(`[Agent] Skipping extra sticker: ${key} (limit: 1 per response)`);
        }
        // If sendSticker is undefined (Voice Mode), we just strip the tag silently.
      }
      response = response.replace(stickerRegex, '').trim();

      // 4. Check for Calls
      const callRegex = /(?:\[\s*)?CALL\s*:\s*(.+?)(?:\s*\])/gi;
      let callMade = false;
      let matchCall;
      while ((matchCall = callRegex.exec(response)) !== null) {
        const textToSay = matchCall[1].trim();

        // --- RATE LIMIT CHECK ---
        const today = new Date().toISOString().split('T')[0];
        const statsPath = path.join(__dirname, '../../data/daily_stats.json');
        let stats = { date: today, calls: 0 };

        try {
          if (await fs.pathExists(statsPath)) {
            const loaded = await fs.readJson(statsPath);
            if (loaded.date === today) {
              stats = loaded;
            }
          }
        } catch (e) { }

        // Determine if this is a "Requested" call or "Proactive" call
        // Heuristic: If user message contains "call me" or "phone", it is requested.
        const isRequested = /call|phone|speak|talk|打|电|语音/i.test(message);
        const MAX_DAILY_CALLS = 2;

        if (sendCall && !callMade) {
          if (isRequested || stats.calls < MAX_DAILY_CALLS) {
            console.log(`[Agent] Triggering call (Requested: ${isRequested}, Daily: ${stats.calls}/${MAX_DAILY_CALLS}). Message: ${textToSay}`);
            await sendCall(textToSay);
            callMade = true; // Mark that we made a call

            // Save what the user ACTUALLY heard to memory
            await this.memory.addMessage('assistant', `[CALL]: ${textToSay}`);

            // Increment quota if proactive
            if (!isRequested) {
              stats.calls++;
              await fs.writeJson(statsPath, stats);
            }
          } else {
            console.log(`[Agent] ABORTING PROACTIVE CALL. Quota exceeded (${stats.calls}/${MAX_DAILY_CALLS}).`);
            // Optionally notify user via text instead?
            // For now, just logging. The agent might "think" it called, but we blocked it.
          }
        }
      }
      response = response.replace(callRegex, '').trim();

      // If call was made, only keep links in response (strip other text)
      if (callMade) {
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const links: string[] = [];
        let linkMatch;
        while ((linkMatch = linkRegex.exec(response)) !== null) {
          links.push(`[${linkMatch[1]}](${linkMatch[2]})`);
        }
        response = links.join('\n'); // Only keep links
        console.log(`[Agent] Call mode: stripped text, keeping ${links.length} links`);
      }

      // 5. Check for Voice Messages
      // When voice message is sent, merge remaining text into it and skip text reply
      const voiceMsgRegex = /(?:\[\s*)?VOICE_MSG\s*:\s*(.+?)(?:\s*\])/gi;
      let voiceMessageSent = false;
      let matchVoice;
      while ((matchVoice = voiceMsgRegex.exec(response)) !== null) {
        let textToSpeak = matchVoice[1].trim();

        if (sendVoiceMessage && textToSpeak && !voiceMessageSent) {
          // Get the remaining text (after removing all tags) to merge into voice
          let remainingText = response
            .replace(voiceMsgRegex, '')
            .replace(/\[STICKER:[^\]]+\]/gi, '')
            .replace(/\[REACTION:[^\]]+\]/gi, '')
            .replace(/\[IMAGE:[^\]]+\]/gi, '')
            .replace(/\[CALL:[^\]]+\]/gi, '')
            .replace(/```[\s\S]*?```/g, '')
            .replace(/\n{2,}/g, ' ')
            .trim();

          // Merge remaining text into voice message
          if (remainingText && !remainingText.match(/^\[.*\]$/)) {
            // Only merge if it's actual content, not just links
            const nonLinkText = remainingText.replace(/\[.*?\]\(.*?\)/g, '').trim();
            if (nonLinkText) {
              textToSpeak = `${textToSpeak} ${nonLinkText}`;
            }
          }

          // Limit voice message to ~200 chars (~30 seconds of speech)
          const MAX_VOICE_CHARS = 200;
          if (textToSpeak.length > MAX_VOICE_CHARS) {
            textToSpeak = textToSpeak.substring(0, MAX_VOICE_CHARS) + '...';
            console.log(`[Agent] Voice message truncated to ${MAX_VOICE_CHARS} chars`);
          }

          console.log(`[Agent] Sending voice message: "${textToSpeak.substring(0, 50)}..."`);
          await sendVoiceMessage(textToSpeak);
          voiceMessageSent = true;

          // Save what the user ACTUALLY heard to memory
          await this.memory.addMessage('assistant', `[VOICE]: ${textToSpeak}`);
        }
      }
      response = response.replace(voiceMsgRegex, '').trim();

      // If voice message was sent, only keep links in response (strip other text)
      if (voiceMessageSent) {
        const linkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
        const links: string[] = [];
        let linkMatch;
        while ((linkMatch = linkRegex.exec(response)) !== null) {
          links.push(`[${linkMatch[1]}](${linkMatch[2]})`);
        }
        response = links.join('\n'); // Only keep links
        console.log(`[Agent] Voice mode: stripped text, keeping ${links.length} links`);
      }

      // 6. Check for Code Block
      const codeBlockRegex = /```(\w*)\n?([\s\S]*?)```/;
      const match = codeBlockRegex.exec(response);

      if (match && !disableTools) {
        // --- ACTION DETECTED ---
        const thought = response.substring(0, match.index).trim();
        const language = match[1] ? match[1].toLowerCase().trim() : 'bash';
        const code = match[2];

        // Send "Thought" (User sees progress) - but filter out internal markers
        if (thought) {
          // Filter out any internal markers that shouldn't be shown to user
          const cleanThought = thought
            .replace(/\[?INTERNAL CODE\]?:?/gi, '')
            .replace(/^\s*[\n\r]+/, '') // Remove leading newlines
            .trim();

          if (cleanThought && !cleanThought.match(/^[\[\(].*[\]\)]$/)) {
            // Only send if there's actual content (not just brackets/markers)
            await sendReply(cleanThought);
            await this.memory.addMessage('assistant', cleanThought);
          }
        }

        console.log(`[Agent] Turn ${turnCount}: Executing ${language}...`);

        // [UX] Send the code block using HTML for better reliability
        const escapeHtml = (unsafe: string) => {
          return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
        };

        // [HIDDEN] Don't show code execution to user
        // const codeBlock = `<pre><code class="language-${language}">${escapeHtml(code)}</code></pre>`;
        // await sendReply(codeBlock, 'HTML');

        await this.memory.addMessage('assistant', `[INTERNAL CODE]: ${code}`);

        // Execute
        let output = "";
        try {
          output = await this.codeSkill.execute(language || 'bash', code);
        } catch (err: any) {
          output = `Error: ${err.message}`;
        }

        const toolOutput = `\n[SYSTEM: Command Executed.Result Follows:]\n${output}\n`;

        // PREPARE FOR NEXT TURN
        // To prevent spamming multiple searches in one go, we limit tool usage.
        if (language === 'bash' && code.includes('image_search')) {
          finalPayload += `\n\n[SYSTEM]: Image search executed. STOP TOOL USAGE. Reply to user now.`;
        } else {
          finalPayload += `\n\n[ASSISTANT PREVIOUSLY SAID]: ${thought || "(Silent Action)"} \n[EXECUTED CODE]: ${code} \n${toolOutput} \n\nCRITICAL: 1. Review the result. 2. If done, reply to user. 3. If more steps needed, output next Code Block.`;
        }

        // Continue loop...
      } else {
        // --- NO CODE / FINAL REPLY ---
        if (response) {
          // Clean excessive newlines (max 2 newlines = 1 empty line)
          response = response.replace(/\n{3,}/g, '\n\n').trim();
          await sendReply(response);
          await this.memory.addMessage('assistant', response);
        }
        break; // EXIT LOOP
      }
    }

    if (turnCount >= MAX_TURNS) {
      console.log("[Agent] Turn limit reached. Stopping loop.");
      // await sendReply("(System: Max turns reached. I stopped to prevent infinite loops.)");
    }
  }
}
