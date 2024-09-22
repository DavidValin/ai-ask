all:
	@npm install
	@npx webpack
	@chmod +x build/ask
	@sudo cp build/ask /usr/local/bin/ask
	@if ! grep -q "export ASK_OLLAMA_HOST=" ~/.bashrc; then \
		echo "export ASK_OLLAMA_HOST=http://192.168.18.60:11434" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_OPENTTS_HOST=" ~/.bashrc; then \
		echo "export ASK_OPENTTS_HOST=http://192.168.18.60:5500" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_DEFAULT_VOICE=" ~/.bashrc; then \
		echo "export ASK_DEFAULT_VOICE=coqui-tts:en_vctk#13" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_USE_MTLS=" ~/.bashrc; then \
		echo "export ASK_USE_MTLS=false" >> ~/.bashrc; \
	fi
		@if ! grep -q "export ASK_MTLS_CERS_FOLDER=" ~/.bashrc; then \
		echo "export ASK_MTLS_CERS_FOLDER=false" >> ~/.bashrc; \
	fi
	@source ~/.bashrc
