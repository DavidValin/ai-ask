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
const Speaker = require('speaker');
const wavDecoder = require('wav-decoder');
const readline = require('readline');
const shortUuid = require('short-uuid');
const SeqPromiseQueue = require('./seq_promise_queue');
const fetchMTLs = require("./mtls-client");

if (process.argv[2] === '-h' || process.argv[2] === '--help') {
  console.log("\n");
  console.log(`'ask' version ${require("../package.json").version} help:`);
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

const useMTLS = process.env.ASK_MTLS || false;
const mtlsCertKey = process.env.ASK_MTLS_CERT_KEY || false;
const mtlsCert = process.env.ASK_MTLS_CERT || false;
const mtlsCa = process.env.ASK_MTLS_CA || false;
let key, cert, ca;

// check for correct argv
if (process.argv.length < 3) {
  process.stdout.write("\nerror :: say something to reach me\n\n");
  process.exit(-1);
}
if (useMTLS) {
  // console.log('info :: ASK_MTLS_CERT_KEY: ', process.env.ASK_MTLS_CERT_KEY);
  // console.log('info :: ASK_MTLS_CERT: ', process.env.ASK_MTLS_CERT);
  // console.log('info :: ASK_MTLS_CA: ', process.env.ASK_MTLS_CA);

  if ((!mtlsCertKey || !mtlsCert || !mtlsCa)) {
    console.log("\nYou have set ASK_MTLS to use mTLS");
    console.log("You missed the full paths to your certificates in the next env. vars:\n  ASK_MTLS_CERT_KEY or ASK_MTLS_CERT or ASK_MTLS_CA");
    console.log("\n Please define them. Exiting...\n");
    process.exit(-1);
  }

  try {
    key = fs.readFileSync(mtlsCertKey);
    cert = fs.readFileSync(mtlsCert);
    ca = fs.readFileSync(mtlsCa);
    
  } catch(e) {
    console.log(e);
    console.log("\n Error loading certificates. Exiting...\n");
    process.exit(-1);
  }
}

const date = new Date();
const formattedDate = date.toISOString().split('T')[0];
const formattedTime = date.toISOString().split('T')[1].split('.')[0];
const generationId = `${formattedDate}_${formattedTime}_${shortUuid.generate().slice(0, 5)}`;

const openttsBaseUrl = process.env.ASK_OPENTTS_BASEURL || 'http://localhost:5500';
const ollamaBaseUrl = process.env.ASK_OLLAMA_BASEURL || 'http://localhost:11434';
const defaultVoiceName = process.env.ASK_DEFAULT_VOICE || 'coqui-tts:en_ljspeech';
const llmModelName = process.env.ASK_LLM_MODEL || 'llama3:70b';
const outputFolder = path.join(process.cwd(), 'ai_output');

const audioChunksQueue = new SeqPromiseQueue();
const audioPlaybackQueue = new SeqPromiseQueue();

let shouldPlay = true;
let speaker = null;
let prompt = '';
let saveResponseFiles = false;

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
      shouldPlay = false;
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

let fullResponse = '';
let buffer = '';
let plainBuffer = '';
let jsonParts = [];
let newPhrases = [];
let audioChunks = [];
let lastAudioPlayback = Promise.resolve();

// Ask something and get the reply
(
  async () => {
    prompt = prompt != '' ? prompt : process.argv.slice(2, process.argv.length).join(' ');
    console.from
    // console.time('info :: getResponse(prompt)');
    const stream = await getResponse(prompt);
    // console.timeEnd('info :: getResponse(prompt)');

    const reader = stream.getReader();

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      buffer += value;
      jsonParts = buffer.split('\n');
      buffer = '';
      jsonParts.forEach(part => {
        try {
          jsonPart = JSON.parse(part);
          plainBuffer = `${plainBuffer}${jsonPart.message.content}`;
          process.stdout.write(jsonPart.message.content);
          fullResponse += jsonPart.message.content;
        } catch(e) {
          buffer += part; // try next time (incomplete json here)
        }
      });

      newPhrases = plainBuffer.split(".");
      
      // TTY mode
      for (let i = 0; i < newPhrases.length-1; i++) {
        // make each line a different phrase to help speech
        const phrase = newPhrases[i].split("\n").join('.'); 
        // console.log('\n - new phrase: ', phrase);
        const trimmedPhrase = phrase.trim();
        if (trimmedPhrase.length > 0) {
          // add of a queue of sequential promises that resolve in order...
          audioChunksQueue.add(
            // start fetching wav for phrase
            async () => {
              try {
                // get audio in wav from the phrase
                audioChunks = await getAudioSpeech(`${trimmedPhrase}.`); // add a dot for the speech to properly stop
                return audioChunks;
              } catch(e) { console.log(e); return Promise.reject(e) }
            },
            // done fetch wav, start playing
            async (audioChunks) => {
              lastAudioPlayback = audioPlaybackQueue.add(
                async () => {
                  return shouldPlay ? playWavBuffer(audioChunks) : Promise.resolve();
                }
              );
              return lastAudioPlayback;
            }
          );
        }
      }

      if (newPhrases.length > 0) {
        plainBuffer = newPhrases.pop();
      }
    }

    reader.releaseLock();

    audioChunksQueue.add(
      // start fetching wav for phrase
      async () => {
        try {
          // get audio in wav from the phrase
          audioChunks = await getAudioSpeech(plainBuffer); // add a dot for the speech to properly stop
          return audioChunks;
        } catch(e) { console.log(e); return Promise.reject(e) }
      },
      // done fetch wav, start playing
      async (audioChunks) => {
        lastAudioPlayback = audioPlaybackQueue.add(
          async () => {
            return shouldPlay ? playWavBuffer(audioChunks) : Promise.resolve();
          }
        );
        return lastAudioPlayback;
      }
    );

    await audioChunksQueue.getQueue() && await audioPlaybackQueue.getQueue();

    process.stdout.write("\n\n");
    speaker && speaker.end();

    if (saveResponseFiles) {
      const matches = Array.from(fullResponse.matchAll(
        /^```(.*)\n?([\s\S]*?)```$/gm
      ));
      // console.log('info :: file matches: ');
      // console.log(matches);

      if (matches) {
        let i=1;
        console.log("\n\n");

        for (const match of matches) {
          // console.log('info :: matched file: ', match);
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

async function getResponse(prompt) {
  const message = { role: 'user', content: prompt };

  return fetchMTLs(`${ollamaBaseUrl}/api/chat`, {
    method: 'POST',
    useMTLS: ollamaBaseUrl.includes("localhost") ? false : useMTLS,
    key,
    cert,
    ca,
    body: {
      model: llmModelName,
      messages: [message],
      stream: true
    },
    stream: true
  });
}

/**
 * Retrieves the speech in wav format for a give text using a voice
 * 
 * @param {string} text Text text to get a speech in wav
 */
async function openTTS(text, voiceName = defaultVoiceName) { // sounds cool: coqui-tts:en_vctk#11
  try {
    return fetchMTLs(
      `${openttsBaseUrl}/api/tts?voice=${encodeURIComponent(voiceName)}&text=${encodeURIComponent(text)}&cache=true"`,
      {
        useMTLS: openttsBaseUrl.includes("localhost") ? false : useMTLS,
        key,
        cert,
        ca,
        stream: true
      }
    );
  } catch(e) {
    // console.log(e);
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

  if (phrase ==='') {
    return Promise.resolve([]);
  }

  // console.log("info :: phrase: ", cleanPhrase);
  try {
    return new Promise(async (resolve, reject) => {
      if (cleanPhrase.length === 0) {
        resolve([]);
      }
      // console.log('info :: calling openTTS')
      const stream = await openTTS(cleanPhrase);
      const reader = stream.getReader();
  
      let done = false;
      const audioChunks = [];
    
      // Read chunks from the reader
      while (!done) {
        const { done: isDone, value } = await reader.read();
        if (isDone || !value) {
          done = true;
          resolve(audioChunks);
        } else {
          if (!value.every(byte => byte === 0x00)) {
            audioChunks.push(value); // Collect audio chunks
          }
          // process.stdout.write(Buffer.from(value));
          
        }
      }
    });
  } catch(e) {
    console.error(`error :: error processing a phrase`, e);
    reject(e);
  }
};

/**
 * Plays a wav chunk
 */
async function playWavBuffer(audioChunks) {
  isPlaying = true;

  return new Promise(
    async (resolve, reject) => {
      if (shouldPlay) {
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
            console.log('err: ', e);
            // speaker.end();
            // resolve(true);
          });
  
          speaker.on('finish', () => {
            // console.log('info :: finished playing audio.');
            isPlaying = false;
            resolve(true);
          });
        } catch (error) {
          console.error('error :: error decoding / playing audio:', error);
          isPlaying = false;
          reject(error);
        }
      }
    }
  );
}

async function getAvailableVoices(lang) {
  let response = await fetchMTLs(
    `${openttsBaseUrl}/api/voices${lang ? `?language=${lang}` : ''}`,
    {
      useMTLS: openttsBaseUrl.includes("localhost") ? false : useMTLS,
      key,
      cert,
      ca,
      stream: false
    }
  );
  const voices = Object.keys(response);
  console.log("\n Available voices: ");
  voices.forEach(voiceName => console.log(` - ${voiceName}`));
  console.log("\n");
}
