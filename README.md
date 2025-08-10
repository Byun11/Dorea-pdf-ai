<div align="center">
  <img src="assets/images/logo.png" alt="Dorea Logo" width="100"/>
  <h1>Dorea PDF AI</h1>
  <p>
    <strong>지능형 PDF 문서 분석 플랫폼</strong>
  </p>
  <p>
    <img alt="License" src="https://img.shields.io/badge/license-Apache%202.0-blue.svg">
    <img alt="Docker" src="https://img.shields.io/badge/docker-%230db7ed.svg?logo=docker&logoColor=white">
    <img alt="Python" src="https://img.shields.io/badge/python-3.9+-3670A0?logo=python&logoColor=ffdd54">
  </p>
</div>

## 개요

Dorea PDF AI는 고급 레이아웃 분석, OCR 기술, 그리고 대화형 AI를 결합하여 PDF 문서와 상호작용하는 방식을 변화시킵니다. 문서의 원하는 부분을 클릭하고 내용에 대한 지능적인 대화를 시작해보세요.

### 메인 인터페이스
<div align="center">
  <img src="assets/images/preview-main.png" alt="Dorea Main Interface" width="800"/>
</div>

### AI 채팅 기능
<div align="center">
  <img src="assets/images/preview-chat.png" alt="Dorea Chat Feature" width="800"/>
</div>

## ✨ 주요 기능

### 📄 **문서 지능화**
- PDF 레이아웃 감지
- 다국어 OCR 지원  
- 스마트 콘텐츠 추출
- 표 및 이미지 인식

### 🤖 **AI 대화**
- OpenAI GPT 통합
- 로컬 LLM 지원 (Ollama)
- 대화형 문서 쿼리
- 실시간 응답 생성

## 🚀 빠른 시작

### 시스템 요구사항
- [Docker Desktop](https://docs.docker.com/get-docker/) 4.0+
- 8GB+ RAM (16GB 권장)
- 10GB+ 디스크 공간

### 설치 방법

#### 방법 1: 원클릭 설치 (Windows)
```cmd
git clone https://github.com/Byun11/Dorea-pdf-ai.git
cd Dorea-pdf-ai
Dorea.bat
```

#### 방법 2: Docker Compose
```bash
# 저장소 복제
git clone https://github.com/Byun11/Dorea-pdf-ai.git
cd Dorea-pdf-ai

# CPU 모드
docker compose up --build

# GPU 모드 (NVIDIA GPU 필요)
docker compose -f docker-compose.yml -f docker-compose.gpu.yml up --build
```


## 📚 사용법

1. **문서 업로드**: PDF를 인터페이스에 드래그 앤 드롭
2. **AI 분석**: 자동 레이아웃 및 콘텐츠 분석
3. **대화형 채팅**: 원하는 영역을 클릭하고 대화


## 📄 라이선스

이 프로젝트는 Apache License 2.0에 따라 라이선스가 부여됩니다. 자세한 내용은 [LICENSE.md](docs/LICENSE.md) 파일을 참조하세요.

## 🆘 지원

- 🐛 **버그 리포트**: [이슈 생성](https://github.com/Byun11/Dorea-pdf-ai/issues)
- 📧 **연락처**: [9722jayon@gmail.com](mailto:9722jayon@gmail.com)

---

<div align="center">
  <img src="assets/images/AIlogo.png" alt="KISTI AI Platform Team" width="40" style="margin-right: 10px;"/>
  <strong>KISTI 초거대 AI 연구센터 / AI 플랫폼팀에서 ❤️를 담아 제작</strong>
  <br>
  <sub>© 2025 KISTI Large-scale AI Research Center / AI Platform Team. All rights reserved.</sub>
</div>