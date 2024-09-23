#!/usr/bin/env node

// ---------------------------------------
// author:    David Valin
//            <hola@davidvalin.com>
//            www.davidvalin.com/dev
// ---------------------------------------
// license:   Apache 2.0
// ---------------------------------------

const fs = require("fs");
const path = require("path");
const https = require('https');
const { Ollama } = require('ollama');
const Speaker = require('speaker');
const wavDecoder = require('wav-decoder');
const readline = require('readline');
const shortUuid = require('short-uuid');
const SeqPromiseQueue = require('./seq_promise_queue');

// check for correct argv
if (process.argv.length < 3) {
  process.stdout.write("\nerror :: say something to reach me\n\n");
  return
}

const date = new Date();
const formattedDate = date.toISOString().split('T')[0];
const formattedTime = date.toISOString().split('T')[1].split('.')[0];
const generationId = `${formattedDate}__${formattedTime}__${shortUuid.generate().slice(0, 5)}`;

const openTTSHost = process.env.ASK_OPENTTS_HOST || 'http://localhost:5500';
const ollamaHost = process.env.ASK_OLLAMA_HOST || 'http://localhost:11434';
const defaultVoiceName = process.env.ASK_DEFAULT_VOICE || 'coqui-tts:en_ljspeech';
const useMTLS = process.env.ASK_USE_MTLS || false;
const outputFolder = path.join(process.cwd(), 'ai_output');

const audioChunksQueue = new SeqPromiseQueue();

let speaker = null;
let prompt = '';
let saveResponseFiles = false;

if (process.argv[2] === '-h' || process.argv[2] === '--help') {
  console.log("\n");
  console.log("ask -h                     :  Get this help");
  console.log("ask voices                 :  Returns the list of available voices");
  console.log("ask voices <lang>          :  Returns the list of available voices for specific language (en, es...)");
  console.log("ask <my prompt text>       :  Ask something to the ai agent inline and play and read answer");
  console.log("ask <my prompt text> -s    :  Ask something to the ai agent and save the output files\n");
  console.log("ask -f <prompt_file>       :  Ask something to the ai agent using input prompt file and play and read answer");
  console.log("ask -f <prompt_file> -s    :  Ask something to the ai agent using input prompt file, save output files and play and read answer");
  console.log("\n");
  return;
}

if (process.argv[2] === 'voices') {
  const lang = process.argv[3] || 'en';
  getAvailableVoices(lang);
  return;
} else if ((process.argv[2] === '-f' || process.argv[2] === '--file')) {
  try {
    prompt = fs.readFileSync(process.argv[3]).toString();
  } catch(e) {
    console.error(`error :: cannot open prompt file ${process.argv[3]}`);
  }
}

if (process.argv.some(item => item === '-s' || item === '--save')) {
  console.log('info :: save mode set');
  if (!fs.existsSync(outputFolder)) {
    fs.mkdirSync(outputFolder);
    // console.log(`info :: output folder '${outputFolder}' created.`);
  } else {
    // console.log(`info :: folder '${outputFolder}' already exists.`);
  }
  saveResponseFiles = true;
}

readline.emitKeypressEvents(process.stdin);
process.stdin.setRawMode(true); // be able to capture individual key presses

process.stdin.on('keypress', (str, key) => {
  // stop playing on scape
  if (key && key.name === 'escape') {
    if (speaker) {
      speaker.close();
      speaker.end();
    }
  }
  // make sure Ctrl+C works in raw mode
  if (key && key.ctrl && key.name === 'c') {
    process.exit();
  }
});

process.stdin.resume();

console.log(prompt);

const ollamaClient = new Ollama({
  host: ollamaHost
});

let fullResponse = '';
let buffer = '';
let newPhrases = [];
let audioChunks = [];

// Ask something and get the reply
(
  async () => {
    prompt = prompt != '' ? prompt : process.argv.slice(2, process.argv.length).join(' ');
    const message = { role: 'user', content: prompt };
    const response = await ollamaClient.chat({
      model: 'llama3:70b',
      messages: [message],
      stream: true
    });

    // process.stdout.write("\n");
    // process.stdout.write("[AGENT]:" );
    for await (const part of response) {
      try {
        buffer += part.message.content;
        fullResponse += part.message.content;
        process.stdout.write(part.message.content);
        newPhrases = buffer.split(".");
        buffer = newPhrases.pop(); // Keep the last incomplete phrase in the buffer

        // TTY mode
        for (let i = 0; i < newPhrases.length; i++) {
          // make each line a different phrase to help speech
          const phrase = newPhrases[i].split("\n").join("."); 
          const trimmedPhrase = phrase.trim();
          if (trimmedPhrase.length > 0) {
            // add of a queue of sequential promises that resolve in order...
            audioChunksQueue.add(
              async () => {
                try {
                  // get audio in wav from the phrase
                  audioChunks = await getAudioSpeech(`${trimmedPhrase}.`); // add a dot for the speech to properly stop
                  return await playWavBuffer(audioChunks);
                } catch(e) { console.log(e); return Promise.reject(e) }
              }
            );
          }
        }
      } catch(e) {
          console.error(`error :: error processing response from ollama`, e);
      }
    }
    // dont forget the last part...
    await audioChunksQueue.add(
      async () => {
        try {
          // get audio in wav from the phrase
          audioChunks = await getAudioSpeech(buffer);
          return await playWavBuffer(audioChunks);
        } catch(e) { console.log(e); return Promise.reject(e) }
      }
    );

    process.stdout.write("\n\n");
    speaker.end();

    if (saveResponseFiles) {
      const matches = fullResponse.matchAll(
        /```(?:^(.+)\n)?([\s\S]+?)\n```\n/g
      );

      if (matches) {
        let i=1;
        console.log("\n\n");

        for (const match of matches) {
          const lang = match[1] || 'txt';
          const code = match[2];

          const fileName = `${generationId}.${i}.code.${lang}`;
          console.log(`info :: saved code file: ${fileName}`);
          fs.writeFileSync(`${outputFolder}/${fileName}`, code);
          i++;
        }
      }

      fs.writeFileSync(`${outputFolder}/${generationId}.prompt.txt`, prompt);
      fs.writeFileSync(`${outputFolder}/${generationId}.reply.txt`, fullResponse);
    }
    fullResponse = '';
    process.stdout.write("\n\n");
    process.exit();
  }
)();


/**
 * Retrieves the speech in wav format for a give text using a voice
 * 
 * @param {string} text Text text to get a speech in wav
 */
async function openTTS(text, voiceName = defaultVoiceName) { // sounds cool: coqui-tts:en_vctk#11
  try {
    const response = await fetch(
      `${openTTSHost}/api/tts?voice=${encodeURIComponent(voiceName)}&text=${encodeURIComponent(text)}&cache=true"`
    );
    if (!response.ok) {
      throw new Error(`Failed to fetch audio file: ${response.statusText} (status: ${response.status})`);
    }
    if (!response.headers.get('content-type').includes('audio/wav')) {
      throw new Error('Invalid audio format. Expected audio/wav.');
    }
    const reader = response.body.getReader();
  
    let done = false;
    const audioChunks = [];
  
    // Read chunks from the reader
    while (!done) {
      const { done: isDone, value } = await reader.read();
      if (isDone) {
        done = true;
      } else {
        // process.stdout.write(Buffer.from(value));
        audioChunks.push(value); // Collect audio chunks
      }
    }
  
    return audioChunks;
  } catch(e) {
    console.error('error :: error fetching the audio file:', e);
  }
}

/**
 * Get audio speech for a given phrase
 * 
 * @param {string} phrase The phrase to process
 */
async function getAudioSpeech(phrase) {
  cleanPhrase = phrase
    .replaceAll("\n", '')
    .replaceAll("**", '')
    .replaceAll("---", '');

  // console.log("info :: phrase: ", cleanPhrase);
  try {
    if (cleanPhrase.length > 1) {
      // console.log('info :: calling openTTS')
      const audioChunks = await openTTS(cleanPhrase);
      // console.log('info :: got new audio from openTTS');
      return audioChunks;
    }
  } catch(e) {
    console.error(`error :: error processing a phrase`, e);
  }
};

/**
 * Plays a wav chunk
 */
async function playWavBuffer(audioChunks) {
  isPlaying = true;

  return new Promise(
    async (resolve, reject) => {
      try {
        const audioBuffer = Buffer.concat(audioChunks);
        const decodedWav = await wavDecoder.decode(audioBuffer);

        // check if channelData exists
        if (!decodedWav.channelData || decodedWav.channelData.length === 0) {
          throw new Error("Decoded audio does not contain channel data.");
        }

        const { sampleRate, channelData } = decodedWav;
        const channels = channelData.length;

        // console.log(`info :: sample rate: ${sampleRate}, channels: ${channels}`);

        speaker = new Speaker({
          channels: channels,
          bitDepth: 16, // bit depth (assuming 16-bit PCM)
          sampleRate: sampleRate // sample rate from WAV file
        });

        // write the entire PCM buffer to the speaker
        speaker.write(audioBuffer);
        speaker.end();

        speaker.on('error', (e) => {
          // speaker.end();
        });

        speaker.on('finish', () => {
          // console.log('info :: finished playing audio.');
          isPlaying = false;
          resolve(true);
        });

      } catch (error) {
        console.error('error :: error decoding / playing audio:', error);
        isPlaying = false;
        speaker.end();
        reject(error);
      }
    }
  );
}

async function getAvailableVoices(lang) {
  const response = await fetch(`${openTTSHost}/api/voices${lang ? `?language=${lang}` : ''}`);
  const voices = Object.keys(await response.json());
  console.log("\n Available voices: ");
  voices.forEach(voiceName => console.log(` - ${voiceName}`));
  console.log("\n");
}
