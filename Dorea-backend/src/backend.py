# FastAPI 관련 imports
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# 데이터 모델 및 검증
from pydantic import BaseModel
from sqlalchemy.orm import Session

# 내부 모듈
from database import create_database, User, UserSettings, hash_api_key, SessionLocal, PDFFile
from knowledge_routes import router as knowledge_router
from routes.auth_routes import router as auth_router
from routes.folder_routes import router as folder_router
from routes.file_routes import router as file_router
from routes.chat_routes import router as chat_router
from routes.ai_routes import router as ai_router
from routes.model_routes import router as model_router

# 외부 라이브러리
import httpx
import os
from typing import List, Dict, Any
from pathlib import Path
from datetime import datetime

# Environment variables
DOCKER_API_URL = "http://huridocs:5060"
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://ollama:11434")

# FastAPI 앱 생성
app = FastAPI(title="PDF AI 분석 시스템")
@app.on_event("startup")
def on_startup():
    """서버 시작 시 실행되는 이벤트"""
    create_database()
    
    # 처리 중 멈춘 파일 복구
    db = SessionLocal()
    try:
        stuck_files = db.query(PDFFile).filter(PDFFile.status == 'processing').all()
        if stuck_files:
            print(f"⚠️ 서버 시작: {len(stuck_files)}개의 멈춘 파일을 'failed' 상태로 변경합니다.")
            for file in stuck_files:
                file.status = 'failed'
                file.error_message = "서버가 처리 중 재시작되었습니다."
            db.commit()
        else:
            print("✅ 서버 시작: 멈춰있는 파일이 없습니다.")
        
        # 다음 처리 체인 시작 시도
        from routes.file_routes import trigger_processing_chain
        from fastapi import BackgroundTasks
        background_tasks = BackgroundTasks()
        trigger_processing_chain(db, background_tasks)

    except Exception as e:
        print(f"❌ 서버 시작 중 파일 상태 리셋 실패: {e}")
        db.rollback()
    finally:
        db.close()

# 라우터 등록
app.include_router(knowledge_router)
app.include_router(auth_router)
app.include_router(folder_router)
app.include_router(file_router)
app.include_router(chat_router)
app.include_router(ai_router)
app.include_router(model_router)


# Static files 설정
STATIC_DIR = Path(__file__).parent / "static"
print(f"✅ Static directory path: {STATIC_DIR}")
print(f"✅ Static directory exists: {STATIC_DIR.exists()}")
if STATIC_DIR.exists():
    print(f"✅ Static directory contents: {list(STATIC_DIR.iterdir())}")
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

# CORS 설정
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 실제 환경에서는 특정 도메인만 허용
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 파일 저장 경로
FILES_DIR = Path("/app/DATABASE/files/users")
FILES_DIR.mkdir(parents=True, exist_ok=True)

# Shared Pydantic models
class MultiSegmentRequest(BaseModel):
    """Multi-segment request model used by AI routes"""
    segments: List[Dict[str, Any]]
    query: str
    conversation_history: List[Dict[str, str]] = []  # role, content 쌍의 리스트

# Health check endpoint
@app.get("/health")
async def health_check():
    """헬스체크 엔드포인트"""
    try:
        # HURIDOCS API 연결 테스트
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(f"{DOCKER_API_URL}/")
            huridocs_status = "ok" if response.status_code == 200 else "error"
    except:
        huridocs_status = "error"
    
    return {
        "status": "healthy",
        "timestamp": datetime.now().isoformat(),
        "services": {
            "backend": "ok",
            "huridocs": huridocs_status,
            "database": "ok"
        }
    }

# Legacy user AI provider functions (kept for compatibility)
async def get_user_ai_provider(api_key: str, db: Session) -> tuple:
    """사용자의 AI 모델 설정 조회 (legacy)"""
    api_key_hash = hash_api_key(api_key)
    
    settings = db.query(UserSettings).filter(
        UserSettings.api_key_hash == api_key_hash
    ).first()
    
    if not settings:
        # 기본값 반환 (GPT)
        return "gpt", None
    
    return settings.selected_model_provider, settings.selected_ollama_model

async def get_user_ai_provider_by_user(user: User, db: Session) -> tuple:
    """JWT 사용자의 AI 모델 설정 조회 - user_id 기반으로 조회"""
    # 🔥 사용자 ID를 기반으로 설정 조회 (API 키와 독립적)
    settings = db.query(UserSettings).filter(
        UserSettings.user_id == user.id
    ).first()
    
    if not settings:
        # 기본값 반환 (GPT)
        return "gpt", None
    
    return settings.selected_model_provider, settings.selected_ollama_model

async def call_ollama_api(model_name: str, messages: list, stream: bool = False, images: list = None) -> dict:
    """Ollama API 호출 (멀티모달 지원)"""
    try:
        # Ollama API 메시지 형식으로 변환
        ollama_messages = []
        for msg in messages:
            if msg["role"] == "system":
                ollama_messages.append({"role": "system", "content": msg["content"]})
            elif msg["role"] == "user":
                user_message = {"role": "user", "content": msg["content"]}
                # 이미지가 있는 경우 추가
                if images:
                    user_message["images"] = images
                ollama_messages.append(user_message)
        
        payload = {
            "model": model_name,
            "messages": ollama_messages,
            "stream": stream,
            "options": {
                "keep_alive": "60s"  # 모델을 60초 동안 메모리에 유지 후 자동 해제
            }
        }
        
        async with httpx.AsyncClient(timeout=120.0) as client:
            response = await client.post(
                f"{OLLAMA_API_URL}/api/chat",
                json=payload,
                headers={"Content-Type": "application/json"}
            )
            
            if response.status_code == 200:
                if stream:
                    return response  # 스트리밍의 경우 응답 객체 자체를 반환
                else:
                    data = response.json()
                    return {"result": data.get("message", {}).get("content", "")}
            else:
                # API에서 받은 에러 메시지를 포함하여 예외 발생
                error_details = response.text
                raise Exception(f"Ollama API 오류: {response.status_code} - {error_details}")
                
    except Exception as e:
        raise Exception(f"Ollama 연결 오류: {str(e)}")

# 파일 처리 종료 시 임시 파일 정리
@app.on_event("shutdown")
def cleanup():
    """서버 종료 시 임시 파일 정리"""
    try:
        for file in FILES_DIR.glob("*"):
            if file.is_file():
                file.unlink()
            elif file.is_dir():
                # 디렉터리는 건드리지 않음 (사용자 데이터 보호)
                pass
    except Exception as e:
        print(f"Cleanup 오류 (무시됨): {e}")

# 개발 서버 실행
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)