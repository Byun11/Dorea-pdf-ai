<div align="center">
  <img src="assets/images/logo.png" alt="Dorea Logo" width="100"/>
  <h1>Dorea PDF AI</h1>
  <p>
    <strong>PDF 문서 분석 및 AI 대화 시스템</strong>
  </p>
  <p>
    <img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg">
    <img alt="Docker" src="https://img.shields.io/badge/docker-%230db7ed.svg?logo=docker&logoColor=white">
    <img alt="Python" src="https://img.shields.io/badge/python-3.9+-3670A0?logo=python&logoColor=ffdd54">
  </p>
</div>

## 개요

PDF를 업로드하면 자동으로 레이아웃을 분석하고, 문서의 특정 부분을 클릭하여 AI와 대화할 수 있는 시스템입니다.

<table>
<tr>
<td width="50%" align="center">

### 메인 화면
<img src="assets/images/preview-main.png" alt="메인 인터페이스" width="400"/>

</td>
<td width="50%" align="center">

### AI 채팅 화면
<img src="assets/images/preview-chat.png" alt="AI 채팅" width="400"/>

</td>
</tr>
</table>

## 주요 기능

- PDF 레이아웃 자동 분석 (표, 이미지, 텍스트 구분)
- 다국어 OCR 지원 (한국어, 영어, 일본어, 중국어)
- 문서 영역 클릭으로 AI 대화 시작
- OpenAI GPT 및 로컬 LLM(Ollama) 지원
- 실시간 스트리밍 응답
- 대화 기록 저장

## 설치 및 실행

### 시스템 요구사항
- Docker Desktop 4.0+
- 8GB+ RAM (16GB 권장)
- 10GB+ 디스크 공간

### Windows 원클릭 설치
```cmd
git clone https://github.com/Byun11/Dorea-pdf-ai.git
cd Dorea-pdf-ai
Dorea.bat
```

### Docker Compose 실행
```bash
# CPU 모드
docker compose up --build

# GPU 모드 (NVIDIA GPU 필요)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```

### 접속 주소
- 메인 앱: http://localhost:8000
- API 문서: http://localhost:8000/docs

## 시스템 구조

```
웹 프론트엔드 (8000) → FastAPI 백엔드 (8000) → HURIDOCS (8001) + Ollama (11434)
```

- **웹 프론트엔드**: HTML/CSS/JavaScript 기반 반응형 UI
- **FastAPI 백엔드**: 파일 업로드, 사용자 인증, API 서버
- **HURIDOCS**: PDF 레이아웃 분석 및 OCR 처리
- **Ollama**: 로컬 LLM 추론 엔진

## 사용 방법

1. 웹 브라우저에서 http://localhost:8000 접속
2. PDF 파일을 드래그 앤 드롭으로 업로드
3. 자동 분석 완료 후 문서 영역 클릭
4. AI와 대화 시작


### 로그 확인
```bash
# 전체 서비스 로그
docker compose logs -f

# 개별 서비스 로그
docker compose logs -f pdf-ai
docker compose logs -f huridocs
docker compose logs -f ollama
```

## 라이선스

Apache License 2.0

### 사용된 오픈소스

- **[HURIDOCS](https://github.com/huridocs/pdf-document-layout-analysis)** - PDF 레이아웃 분석 (Apache 2.0)
- **[Ollama](https://github.com/ollama/ollama)** - LLM 추론 엔진 (MIT)
- **[FastAPI](https://github.com/tiangolo/fastapi)** - 웹 프레임워크 (MIT)

### 관련 프로젝트

- **[SpectraBench](https://github.com/gwleee/SpectraBench)** - LLM 벤치마킹 스케줄링 시스템
- **[KONI](https://github.com/KISTI-AI/KONI)** - KISTI 과학기술정보 특화 언어모델
- **[KISTI-MCP](https://github.com/KISTI-AI/KISTI-MCP)** - KISTI Model Context Protocol 서버

## 지원

- 버그 리포트: [GitHub Issues](https://github.com/Byun11/Dorea-pdf-ai/issues)
- 이메일: [9722jayon@gmail.com](mailto:9722jayon@gmail.com)

---

<div align="center">
  <img src="assets/images/AIlogo.png" alt="KISTI AI Platform Team" width="40"/>
  <br>
  <strong>KISTI 초거대 AI 연구센터 / AI 플랫폼팀</strong>
  <br>
  <sub>© 2025 KISTI Large-scale AI Research Center / AI Platform Team. All rights reserved.</sub>
</div>