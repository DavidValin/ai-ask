all:
	@echo "Installing dependencies..."
	@npm install
	@echo "Building 'ask' command..."
	@npx webpack
	@chmod +x build/ask
	@echo "Installing 'ask' command in '/usr/local/bin/ask...' path"
	@if [ -f "/usr/local/bin/ask" ]; then \
		read -p "An installation of '/usr/local/bin/ask' already exists. Do you want to overwrite it? (y/n): " response; \
		if [ "$$response" = "y" ] || [ "$$response" = "Y" ]; then \
			sudo cp build/ask /usr/local/bin/ask; \
			echo "'ask' command installed!"; \
		else \
			echo "Installation canceled!"; \
			exit 0; \
		fi; \
	else \
		sudo cp build/ask /usr/local/bin/ask; \
		echo "'ask' command installed!"; \
	fi
	@echo "Setting env vars in $HOME/.bashrc..."
	@if ! grep -q "export ASK_OLLAMA_BASEURL=" ~/.bashrc; then \
		echo "export ASK_OLLAMA_BASEURL=http://localhost:11434" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_OPENTTS_BASEURL=" ~/.bashrc; then \
		echo "export ASK_OPENTTS_BASEURL=http://localhost:5500" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_DEFAULT_VOICE=" ~/.bashrc; then \
		echo "export ASK_DEFAULT_VOICE=coqui-tts:en_vctk#13" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_LLM_MODEL=" ~/.bashrc; then \
		echo "export ASK_LLM_MODEL=llama3" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_MTLS=" ~/.bashrc; then \
		echo "export ASK_MTLS=false" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_MTLS_CERT_KEY=" ~/.bashrc; then \
		echo "export ASK_MTLS_CERT_KEY=false" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_MTLS_CERT=" ~/.bashrc; then \
		echo "export ASK_MTLS_CERT=false" >> ~/.bashrc; \
	fi
	@if ! grep -q "export ASK_MTLS_CA=" ~/.bashrc; then \
		echo "export ASK_MTLS_CA=false" >> ~/.bashrc; \
	fi
	@echo "Installation completed! start by typing: ask -h..."
	@source ~/.bashrc
