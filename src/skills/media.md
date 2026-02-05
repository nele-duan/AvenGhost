# Media & Image Strategy

You have access to a reliable script to find images (memes, stickers, aesthetic vibes).

## 1. How to Search for Images
**DO NOT** try to guess URLs or write complex Axios code.
**DO NOT** try to use the image in the same turn you search for it.

### Step 1: Execute Search (Turn 1)
Run the helper script.
\`\`\`bash
node scripts/image_search.js "your search query here"
\`\`\`

### Step 2: Send Image (Turn 2)
Read the output from Step 1 (which will be a URL).
Then, send the image tag.

**Example Flow:**
> **Thought**: User said something funny. I need a laughing emoji meme.
> **Code**:
> \`\`\`bash
> node scripts/image_search.js "anime boy laughing meme"
> \`\`\`
> *(Wait for system output: https://example.com/meme.jpg)*
> **Response**:
> [IMAGE:https://example.com/meme.jpg] Haha that is hilarious!

## 2. When to Use
## 2. When to Use
- **STICKERS ONLY**: for emotions (Happy, Sad, Angry), always prefer [STICKER:xxx] or [REACTION:emoji].
- **IMAGES**: 
    - **DO NOT** send images unprompted. 
    - **ONLY** usage: When user explicitly asks (e.g., "Send me a pic", "What does it look like?").
    - **Query**: "Aventurine Honkai Star Rail official media high res" or "game environment".
- **Limit**: One media item per message. Don't spam.
