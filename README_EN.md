<div align="center">
  <img src="assets/images/logo.png" alt="Dorea Logo" width="100"/>
  <h1>Dorea PDF AI</h1>
  <p>
    <strong>PDF Document Analysis & AI Conversation System</strong>
  </p>
  <p>
    <img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg">
    <img alt="Docker" src="https://img.shields.io/badge/docker-%230db7ed.svg?logo=docker&logoColor=white">
    <img alt="Python" src="https://img.shields.io/badge/python-3.9+-3670A0?logo=python&logoColor=ffdd54">
  </p>
</div>

## Language / 언어
- [한국어 🇰🇷](README.md) (Korean Version)
- [English 🇺🇸](#english-version) (English Version)

## English Version

## Overview

**RAG(Retrieval Augmented Generation) based PDF Document Analysis System**

Upload PDFs to automatically analyze layouts and click specific sections to have accurate AI conversations based on that content.

<div align="center">

### Demo Video

[![Demo Video](https://img.youtube.com/vi/xEo9D5tuc4E/0.jpg)](https://youtu.be/xEo9D5tuc4E)

*Voice: Generated using ElevenLabs (https://elevenlabs.io)*

</div>

<table>
<tr>
<td width="50%" align="center">

### Main Interface
<img src="assets/images/preview-main.png" alt="Main Interface" width="400"/>

</td>
<td width="50%" align="center">

### AI Chat Interface
<img src="assets/images/preview-chat.png" alt="AI Chat" width="400"/>

</td>
</tr>
</table>

## Key Features

- **Automatic PDF Layout Analysis**: Automatically distinguish tables, images, and text areas
- **Multi-language OCR Support**: Text extraction for Korean, English, Japanese, Chinese
- **RAG-based Document Conversation**: Accurate AI responses based on document content
- **Interactive UI**: Start AI conversations about specific sections by clicking
- **Multiple LLM Support**: Choose between OpenAI GPT and local LLM (Ollama)
- **Real-time Streaming**: View responses in real-time
- **Conversation History Management**: Automatically save all conversations

## 🚀 Quick Installation Guide

### Step 1: Install Docker

#### Windows Users
1. Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/)
2. Reboot after installation
3. Launch Docker Desktop and wait for startup completion

### Step 2: Download Source Code
```bash
git clone https://github.com/Byun11/Dorea-pdf-ai.git
cd Dorea-pdf-ai
```

### Step 3: Run the Application

#### 🟢 Easiest Method (Recommended)
```bash
# Windows Users - Choose from 4 options
Dorea.bat
  # 1. Standard execution (requires internet)
  # 2. GPU acceleration (requires internet) 
  # 3. Local Ollama integration (intranet/offline required)
  # 4. GPU + Local Ollama integration (intranet/offline required)

# Mac/Linux Users  
docker compose up --build
```

> **💡 Note**: First run may take 5-10 minutes due to Docker image downloads.

#### Access the Application
- Open web browser and go to **http://localhost:8000**
- Drag and drop PDF files to upload
- After document analysis completes, click on areas to start AI conversations!

### System Requirements
- **Memory**: 8GB or more (16GB recommended)
- **Disk**: 25GB or more free space
- **Network**: Internet connection (for initial image downloads)

### Shutdown
```bash
# Press Ctrl+C then
docker compose down
```

---

## 🔧 Advanced Settings (Optional)

<details>
<summary>For GPU acceleration, local models, and other additional options</summary>

### Various Execution Options

#### Source Build Version (For Developers)
```bash
# 1. Standard execution
docker compose up --build   

# 2. GPU acceleration support 
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build

# 3. Local Ollama integration
docker compose -f docker-compose.yml -f docker-compose.local-ollama.yml up --build

# 4. GPU + Local Ollama integration
docker compose -f docker-compose.yml -f docker-compose.gpu.yml -f docker-compose.local-ollama.yml up --build
```

#### Pre-built Image Version (For Deployment - Same as Dorea.bat)
```bash
# 5. Standard execution (requires internet)
docker compose -f docker-compose.hub.yml up

# 6. GPU acceleration (requires internet)
docker compose -f docker-compose.hub.yml -f docker-compose.gpu.yml up

# 7. Local Ollama integration (intranet/offline required)
docker compose -f docker-compose.hub.yml -f docker-compose.local-ollama.yml up

# 8. GPU + Local Ollama integration (intranet/offline required)
docker compose -f docker-compose.hub.yml -f docker-compose.gpu.yml -f docker-compose.local-ollama.yml up
```

> **💡 Note**: 
> - **Requires Internet**: Downloads images from Docker Hub
> - **Intranet/Offline**: Local Ollama server must be running on port 11434

### Check Logs
```bash
# All services logs
docker compose logs -f

# Individual service logs
docker compose logs -f pdf-ai
docker compose logs -f huridocs
docker compose logs -f ollama
```

</details>

## 🎯 How to Use

1. **File Upload**: Drag and drop PDFs to upload
2. **Automatic Analysis**: Automatically analyze tables, images, and text areas in documents
3. **AI Conversation**: Click desired areas to start AI conversations based on that content
4. **Conversation History**: All conversations are automatically saved

## License

Apache License 2.0

### Used Open Source

- **[HURIDOCS](https://github.com/huridocs/pdf-document-layout-analysis)** - PDF Layout Analysis (Apache 2.0)
- **[Ollama](https://github.com/ollama/ollama)** - LLM Inference Engine (MIT)
- **[FastAPI](https://github.com/tiangolo/fastapi)** - Web Framework (MIT)

### Related Projects

- **[BlueSkyNova](https://github.com/KISTI-AI-Platform-Team/BlueSkyNova)** - KISTI AI Platform Team Official Repository
- **[SpectraBench](https://github.com/gwleee/SpectraBench)** - LLM Benchmarking Scheduling System
- **[KONI](https://github.com/KISTI-AI/KONI)** - KISTI Science and Technology Information Specialized Language Model
- **[KISTI-MCP](https://github.com/KISTI-AI/KISTI-MCP)** - KISTI Model Context Protocol Server

## Support

- Bug Reports: [GitHub Issues](https://github.com/Byun11/Dorea-pdf-ai/issues)
- Email: [9722jayon@gmail.com](mailto:9722jayon@gmail.com)

## Developers

- **Jaeyeon Byun**: [9722jayon@gmail.com](mailto:9722jayon@gmail.com)
- **Yong Lee**: [ryonglee@kisti.re.kr](mailto:ryonglee@kisti.re.kr)

---

<div align="center">
  <img src="assets/images/AIlogo.png" alt="KISTI AI Platform Team" width="40"/>
  <br>
  <strong>KISTI Large-scale AI Research Center / AI Platform Team</strong>
  <br>
  <sub>© 2025 KISTI Large-scale AI Research Center / AI Platform Team. All rights reserved.</sub>
</div>