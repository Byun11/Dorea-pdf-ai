# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Dorea PDF AI is a comprehensive PDF document analysis system that combines document layout analysis, OCR, and GPT-powered summarization. The system consists of three main services running in Docker containers:

1. **Dorea Backend** (`Dorea-backend/`): FastAPI-based web application with user interface
2. **HURIDOCS Service**: PDF document layout analysis and processing engine (uses external Docker image)
3. **Ollama Service**: Local LLM service for AI processing

## Architecture

The system uses a microservices architecture with Docker containers:

- **pdf-ai** (port 8000): Main FastAPI backend with web UI, handles user requests, file uploads, and GPT integration
- **huridocs** (port 8001/5060): Document processing service for PDF layout analysis, OCR, and text extraction
- **ollama** (port 11434): Local LLM service for AI processing

Services communicate via HTTP APIs and are orchestrated using docker-compose.

## Common Commands

### Development & Running

```bash
# Start full system (CPU mode)
docker compose up --build

# Start with GPU support
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build

# Run using the Windows batch installer
./Dorea.bat

# Stop all services
docker compose down
```

### Backend Development

```bash
# Install backend dependencies (from Dorea-backend/ directory)
pip install -r requirements.txt

# Run backend server directly (from Dorea-backend/src/)
uvicorn backend:app --host 0.0.0.0 --port 8000 --reload

# Run backend with specific working directory
cd Dorea-backend && uvicorn src.backend:app --host 0.0.0.0 --port 8000 --reload
```

### Debugging and Logs

```bash
# View container logs
docker compose logs -f pdf-ai
docker compose logs -f huridocs
docker compose logs -f ollama

# View all service logs
docker compose logs -f

# Check container status
docker compose ps
```

## Key Components

### Backend Service (`Dorea-backend/src/`)
- `backend.py`: Main FastAPI application with PDF upload, processing, and GPT integration
- `auth.py`: API key authentication and OpenAI client management  
- `database.py`: SQLite database models for files, chat sessions, and messages
- `static/`: Web UI assets (HTML, CSS, JavaScript modules)
  - `js/modules/`: Modular JavaScript components (chat, fileManager, pdfViewer, segmentManager, ui, etc.)
  - `css/`: Organized stylesheets with base styles, components, and page-specific styles

### Frontend Architecture
The web UI uses a modular JavaScript architecture:
- **Modules** (`static/js/modules/`): Self-contained components with specific responsibilities
- **Event-driven**: Components communicate via custom events and DOM manipulation
- **No framework dependencies**: Pure JavaScript with modern ES6+ features

### CSS Organization
- **Base styles** (`css/base/`): Reset, variables, common utilities
- **Components** (`css/components/`): Reusable UI components (buttons, forms)
- **Pages** (`css/pages/`): Page-specific styling
- **Responsive design**: Mobile-first approach with CSS Grid/Flexbox

## Environment Variables

Key environment variables used in docker-compose:
- `DOCKER_API_URL`: HURIDOCS service URL (default: http://huridocs:5060)
- `OLLAMA_API_URL`: Ollama service URL (default: http://ollama:11434)
- `PYTHONUNBUFFERED=1`: For proper Python logging in containers

## Database

The system uses SQLite (`DATABASE/pdf_ai_system.db`) for:
- PDF file metadata and processing status
- User chat sessions and message history
- API key management and authentication

Database path is designed to be compatible between Docker and local environments.

## API Endpoints

### Main Backend (port 8000)
- `/`: Landing page and main application interface
- `/upload`: PDF upload and processing
- `/docs`: FastAPI documentation
- `/static`: Static assets (CSS, JS, images)

### HURIDOCS Service (port 8001)
- `/`: Service status and GPU availability
- `/info`: System information and versions
- POST `/`: PDF processing endpoint

### Ollama Service (port 11434)
- Standard Ollama API endpoints for LLM inference

## GPU Support

The system supports both CPU and GPU modes:
- `docker-compose.yml`: CPU-only mode with ollama GPU support
- `docker-compose.gpu.yml`: Override file adding GPU support to HURIDOCS service
- GPU configuration uses NVIDIA Container Toolkit

## File Structure and Data Flow

### PDF Processing Pipeline
1. **Upload**: PDF uploaded via web interface to FastAPI backend
2. **Storage**: Files stored in `DATABASE/files/users/{user_id}/{file_id}/` structure
3. **Analysis**: Backend sends PDF to HURIDOCS service for layout analysis
4. **Segmentation**: Document segments extracted and stored as JSON
5. **Chat Interface**: Users can click segments to start AI conversations
6. **LLM Processing**: Queries sent to either OpenAI GPT or local Ollama models

### Data Storage
- `DATABASE/files/`: User file storage organized by user ID and file ID
- Each processed PDF has: original file, OCR text, and segments JSON
- SQLite database tracks file metadata and processing status

## Dependencies

**Backend Service:**
- FastAPI 0.104.1, Uvicorn 0.24.0 (web framework)
- OpenAI 1.3.8 (GPT integration)
- SQLAlchemy 2.0.23 (database ORM)
- HTTPx 0.25.2 (async HTTP client for service communication)

**External Services:**
- HURIDOCS: Uses pre-built image `byunbyun/huridocs-sm120:updated` from Docker Hub
- Ollama: Uses official `ollama/ollama` image for local LLM inference

## Development Workflow

### Docker Images
- **huridocs**: Uses pre-built image `byunbyun/huridocs-sm120:updated` from Docker Hub
- **pdf-ai**: Uses locally built image from `Dorea-backend/Dockerfile`
- **ollama**: Uses official `ollama/ollama` image

### Volume Mounts
- `./DATABASE:/app/database`: Database and file storage persistence
- `./Dorea-backend/src:/app/src`: Source code hot-reloading during development
- `./ollama_data:/root/.ollama`: Ollama model storage

### Service Dependencies
- **pdf-ai** depends on both **huridocs** and **ollama**
- All services use the `pdf-network` bridge network for inter-service communication

## Troubleshooting

### Common Issues
- **Port conflicts**: Use `netstat -ano | findstr :<port>` to check port usage
- **Container startup failures**: Check logs with `docker compose logs <service>`
- **GPU not detected**: Verify NVIDIA drivers and Docker GPU support
- **Database path issues**: Ensure DATABASE directory exists and has proper permissions

### Performance Optimization
- **HURIDOCS**: Uses GPU acceleration for layout analysis and OCR when available
- **Memory management**: Large PDF processing may require increased container memory limits
- **Concurrent processing**: System handles multiple PDF uploads with async processing


## Gemini CLI 연동 가이드
### 목적
사용자가 「Gemini와 상의하면서 진행해줘」 (또는 유사한 표현)라고 지시할 경우, Claude는 이후 작업을 Gemini CLI와 협력하여 진행한다.
Gemini로부터 받은 응답은 그대로 보여주고, Claude의 해설이나 통합 설명을 덧붙여 두 에이전트의 지식을 결합한다.
---
### 트리거
- 정규표현식: `/Gemini.*상의하면서/`
- 예시:
- 「Gemini와 상의하면서 진행해줘」
- 「이건 Gemini랑 이야기하면서 하자」
---
### 기본 흐름
1. 프롬프트 생성*
Claude는 사용자의 요구사항을 하나의 텍스트로 정리해 환경 변수 `$PROMPT`에 저장한다.
2. Gemini CLI 호출
```bash
gemini <<EOF
$PROMPT
EOF