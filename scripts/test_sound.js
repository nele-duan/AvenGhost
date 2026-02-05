
const { VoiceSystem } = require('../src/core/voice');
const dotenv = require('dotenv');
dotenv.config();

async function test() {
  console.log("Testing Voice System...");
  const voice = new VoiceSystem();

  try {
    // 1. Test Server Start
    console.log("Starting Server...");
    const url = await voice.startServer();
    console.log("Server URL:", url);

    // 2. Test TTS (Optional - comment out to skip cost)
    /*
    console.log("Generating Audio...");
    const file = await voice.generateSpeech("Hello! This is a test of the Aventurine voice system.");
    console.log("Audio generated:", file);
    */

    // 3. Test Call (Optional)
    /*
    console.log("Initiating Call...");
    const sid = await voice.makeCall("Hello partner. Can you hear me?");
    console.log("Call SID:", sid);
    */

    console.log("Test Complete. (Uncomment lines in scripts/test_sound.js to actually consume credits)");

    // Keep alive to serve file if testing call
    // setTimeout(() => process.exit(0), 60000); 

  } catch (e) {
    console.error("Test Failed:", e);
  }
}

test();
