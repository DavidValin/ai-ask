# ai-ask

* Talks to and Listen ai agents from your terminal as simple as possible.
* Allows you to enter prompt input directly inline in the terminal, or reading from a text file
* Saves code files created by ai agents into files.

![ai ask screenshot](https://github.com/DavidValin/ai-ask/raw/main/ai-ask-screenshot.jpg)

### Commands:

* `ask <prompt to ask ai agent>` Ask an inline prompt and get the output text in screen and audio playback
* `ask -f <prompt_file>` Ask something using file prompt and get the output text in screen and audio playback
* `ask -f <prompt_file> -s` Ask something using file prompt, save the output (prompt, input and generated files) and get the output text in screen and playback
* `ask voices` Get a list of all available voices in all languages
* `ask voices <lang>` Get a list of all available voices in specific language (en, es, de, ...)

If you want to `stop playing` the voice, press `escape`. The text will continue to be generated.

### Sample prompts

There are few sample prompt files you can try with:

* `ask -f ./sample_prompts/todo-generation.txt -s`
* `ask -f ./sample_prompts/code-generation/model-entity.txt -s`
* `ask -f ./sample_prompts/code-generation/fix-function.txt -s`
* `ask -f ./sample_prompts/code-generation/fix-poc.txt -s`

### Setup instructions:

Install and run ollama:
> ```docker run -d --restart unless-stopped -v ollama:/root/.ollama -p 11434:11434 --name ollama ollama/ollama```

Install and run openTTS:
> ```docker run -d --restart unless-stopped -it -p 5500:5500 --name opentts synesthesiam/opentts:en --no-espeak```

Install `speaker` npm module globally:
> ```npm install -g speaker```

Make 'speaker' global module importable from 'ask' command:
> ```export NODE_PATH=$(npm root -g)```

Build and install agent client:
> ```make```

This will install a command called `ask` in /usr/local/bin/ask

By default services are assumed to run in localhost. If you run the services on a different machine, customize the env vars:

In your .bashrc file:

```
export ASK_OLLAMA_BASEURL=http://localhost:11434
export ASK_OPENTTS_BASEURL=http://localhost:5500
export ASK_DEFAULT_VOICE=coqui-tts:en_vctk#13
export ASK_LLM_MODEL=llama3
```

or before the ask as:
> ```ASK_DEFAULT_VOICE=coqui-tts:en_vctk#1 ask tell me nice story```


### (optional) MTLs

If you have an mtls server that acts as a proxy to your ollama and opentts services you can use the MTLs options (in your .bashrc); example::

```
export ASK_MTLS=true
export ASK_MTLS_CA=/home/myuser/.ask/certs/ca.crt
export ASK_MTLS_CERT_KEY=/home/myuser/.ask/certs/client.key
export ASK_MTLS_CERT=/home/myuser/.ask/certs/client.crt
export ASK_OLLAMA_BASEURL=http://localhost:11434/ollama
export ASK_OPENTTS_BASEURL=http://localhost:5500/opentts
export ASK_DEFAULT_VOICE=coqui-tts:en_vctk#1
export ASK_LLM_MODEL=llama3
```
