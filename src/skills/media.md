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
- **Reactions**: Use liberally for emotions (Shock, Joy, Disgust).
- **Vibes**: Use for setting scenes ("cyberpunk city rain").
- **Limit**: One image per message. Don't spam.
