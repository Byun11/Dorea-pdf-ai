FROM python:3.9-slim

# 시스템 패키지 설치
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

# 작업 디렉토리 설정
WORKDIR /app

# Python 패키지 설치
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# 전체 앱 코드 복사
COPY src/ /app/src/

# static 파일들의 권한 설정 및 확인
RUN chmod -R 755 /app/src/static && \
    ls -la /app/src/static && \
    ls -la /app/src/static/css && \
    ls -la /app/src/static/js

# 정적 파일/템프 등 포함 가능성 있음
RUN mkdir -p /app/src/temp

# 실행 디렉토리 설정
WORKDIR /app/src

# 포트 노출
EXPOSE 8000

# 헬스체크
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:8000/health || exit 1

# FastAPI 실행 (개발 환경: --reload 포함)
CMD ["uvicorn", "backend:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
