# FastAPI 관련 imports
from fastapi import FastAPI, File, UploadFile, HTTPException, Form, Header, Depends
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

# 데이터 모델 및 검증
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.sql import func

# 내부 모듈
from database import get_db, PDFFile, ChatSession, ChatMessage, UserSettings, User, hash_api_key, create_database
from auth import verify_api_key, create_openai_client, get_current_user, authenticate_user, create_access_token, get_password_hash

# 외부 라이브러리
import httpx
import shutil
import os
import json
from openai import OpenAI
from typing import List, Dict, Any, Optional
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
import uuid
import re
# PDF 텍스트 검사는 클라이언트에서 PDF.js로 처리


# UUID 검증 함수
def is_valid_uuid(uuid_to_test, version=4):
    try:
        uuid_obj = uuid.UUID(uuid_to_test, version=version)
        return str(uuid_obj) == uuid_to_test
    except ValueError:
        return False


# PDF 텍스트 검사는 클라이언트에서 처리 (PDF.js 사용)


# OpenAI API 키 설정
# HURIDOCS Docker API URL
#DOCKER_API_URL = "http://localhost:8001"
DOCKER_API_URL = "http://huridocs:5060"

# OLLAMA API URL
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://ollama:11434")

# FastAPI 앱 생성
app = FastAPI(title="PDF AI 분석 시스템")
create_database()


# 현재 파일 위치를 기준으로 static 디렉토리 절대 경로 계산
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

# PDF 텍스트 검사 함수
def check_pdf_has_text(file_path: str) -> dict:
    """PDF 파일에 텍스트가 있는지 검사"""
    try:
        doc = fitz.open(file_path)
        total_text_length = 0
        total_pages = len(doc)
        
        for page_num in range(min(3, total_pages)):  # 처음 3페이지만 검사
            page = doc[page_num]
            text = page.get_text().strip()
            total_text_length += len(text)
        
        doc.close()
        
        # 텍스트 임계값 설정 (페이지당 평균 50자 이상이면 텍스트 PDF로 판단)
        threshold = 50 * min(3, total_pages)
        has_text = total_text_length > threshold
        
        return {
            "has_text": has_text,
            "text_length": total_text_length,
            "pages_checked": min(3, total_pages),
            "confidence": "high" if total_text_length > threshold * 2 else "medium" if has_text else "low"
        }
    
    except Exception as e:
        print(f"❌ PDF 텍스트 검사 오류: {e}")
        return {
            "has_text": False,
            "text_length": 0,
            "pages_checked": 0,
            "confidence": "error"
        }

# UUID 검증 함수
def is_valid_uuid(uuid_string: str) -> bool:
    """UUID 형식 검증"""
    try:
        uuid_obj = uuid.UUID(uuid_string, version=4)
        return str(uuid_obj) == uuid_string
    except ValueError:
        return False

# 요청 모델 정의
# 기존 요청 모델들 교체
class ApiKeyRequest(BaseModel):
    api_key: str

class TextRequest(BaseModel):
    text: str

class QueryRequest(BaseModel):
    text: str
    query: str

class VisionRequest(BaseModel):
    image: str
    query: str

class ChatMessageRequest(BaseModel):
    content: str
    selected_segments: list = None

class ModelDeleteRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    model_name: str

class UserSettingsRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    selected_model_provider: str
    selected_ollama_model: str = None

# JWT 인증 관련 Pydantic 모델
class UserRegisterRequest(BaseModel):
    username: str
    email: str
    password: str

class UserLoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str

class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    api_key: Optional[str] = None
    created_at: str

class UserApiKeyUpdateRequest(BaseModel):
    api_key: str

class ModelDownloadRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    model_name: str

# 멀티모달 지원 여부 캐시
multimodal_support_cache = {}

# 1x1 픽셀 투명 PNG 이미지 (base64)
TINY_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII="

async def check_ollama_model_multimodal_support(model_name: str) -> bool:
    """실제 테스트 요청으로 Ollama 모델의 멀티모달 지원 여부 확인"""
    # 캐시에서 확인
    if model_name in multimodal_support_cache:
        return multimodal_support_cache[model_name]
    
    try:
        # 작은 더미 이미지로 테스트 요청
        payload = {
            "model": model_name,
            "messages": [
                {"role": "user", "content": "What is in this image?", "images": [TINY_IMAGE_BASE64]}
            ],
            "stream": False
        }
        
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.post(f"{OLLAMA_API_URL}/api/chat", json=payload)
            
            if response.status_code == 200:
                # 성공하면 멀티모달 지원
                multimodal_support_cache[model_name] = True
                return True
            else:
                # 에러 응답 내용 자세히 확인
                try:
                    error_data = response.json()
                    error_msg = error_data.get("error", "Unknown error")
                    print(f"🔍 멀티모달 테스트 ({model_name}): {response.status_code} - {error_msg}")
                    print(f"🔍 전체 오류 응답: {error_data}")
                    
                    # 다양한 에러 메시지 패턴 확인
                    error_lower = error_msg.lower()
                    if any(keyword in error_lower for keyword in ["image", "vision", "multimodal", "support"]):
                        multimodal_support_cache[model_name] = False
                        return False
                except Exception as parse_error:
                    print(f"🔍 멀티모달 테스트 ({model_name}): {response.status_code} - 응답 파싱 실패: {parse_error}")
                    print(f"🔍 원본 응답 텍스트: {response.text}")
        
        # 기타 에러는 미지원으로 처리
        multimodal_support_cache[model_name] = False
        return False
        
    except Exception as e:
        print(f"🔍 멀티모달 지원 테스트 예외 ({model_name}): {e}")
        multimodal_support_cache[model_name] = False
        return False

# 기존 엔드포인트들 위에 추가

@app.get("/", response_class=HTMLResponse)
async def root():
    """랜딩 페이지 (로그인 전)"""
    return FileResponse(STATIC_DIR / 'landing.html')

@app.get("/login", response_class=HTMLResponse)
async def login():
    """로그인 페이지"""
    return FileResponse(STATIC_DIR / 'login.html')

@app.get("/register", response_class=HTMLResponse)
async def register():
    """회원가입 페이지"""
    return FileResponse(STATIC_DIR / 'register.html')

@app.get("/app", response_class=HTMLResponse) 
async def main_app():
    """메인 앱 (로그인 후)"""
    return FileResponse(STATIC_DIR / 'index.html')

# 기존 엔드포인트들 위에 추가
@app.post("/auth/verify-key")
async def verify_api_key_endpoint(request: ApiKeyRequest):
    """API 키 유효성 검사"""
    try:
        is_valid = await verify_api_key(request.api_key)
        if is_valid:
            return {"message": "API 키가 유효합니다", "valid": True}
        else:
            raise HTTPException(status_code=400, detail="유효하지 않은 API 키입니다")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# JWT 인증 엔드포인트
@app.post("/auth/register", response_model=TokenResponse)
async def register_user(request: UserRegisterRequest, db: Session = Depends(get_db)):
    """사용자 회원가입"""
    # 사용자 이름 중복 확인
    existing_user = db.query(User).filter(User.username == request.username).first()
    if existing_user:
        raise HTTPException(status_code=400, detail="이미 존재하는 사용자 이름입니다")
    
    # 이메일 중복 확인
    existing_email = db.query(User).filter(User.email == request.email).first()
    if existing_email:
        raise HTTPException(status_code=400, detail="이미 존재하는 이메일입니다")
    
    # 새 사용자 생성
    hashed_password = get_password_hash(request.password)
    new_user = User(
        username=request.username,
        email=request.email,
        hashed_password=hashed_password,
        api_key=None  # 회원가입 시에는 API 키 없음
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # JWT 토큰 생성
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": new_user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@app.post("/auth/login", response_model=TokenResponse)
async def login_user(request: UserLoginRequest, db: Session = Depends(get_db)):
    """사용자 로그인"""
    user = authenticate_user(db, request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="잘못된 사용자 이름 또는 비밀번호입니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    access_token_expires = timedelta(minutes=30)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

@app.get("/api/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """현재 인증된 사용자 정보 조회"""
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        api_key=current_user.api_key,
        created_at=current_user.created_at.isoformat()
    )

@app.put("/api/me/api-key")
async def update_user_api_key(request: UserApiKeyUpdateRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """사용자 API 키 업데이트"""
    # API 키 유효성 검사
    is_valid = await verify_api_key(request.api_key)
    if not is_valid:
        raise HTTPException(status_code=400, detail="유효하지 않은 API 키입니다")
    
    current_user.api_key = request.api_key
    db.commit()
    
    return {"message": "API 키가 성공적으로 업데이트되었습니다"}

# backend.py에 추가할 코드들

from fastapi.responses import StreamingResponse
import json
from typing import List, Dict, Any

# === GPT 스트리밍 응답 ===

class MultiSegmentRequest(BaseModel):
    segments: List[Dict[str, Any]]
    query: str
    conversation_history: List[Dict[str, str]] = []  # role, content 쌍의 리스트


@app.post("/gpt/stream")
async def stream_gpt_response(
    request: QueryRequest, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """AI 응답을 실제 스트리밍으로 반환 - GPT/Ollama 분기 지원"""
    
    # 🔥 사용자 AI 설정을 미리 조회  
    try:
        provider, ollama_model = await get_user_ai_provider_by_user(current_user, db)
    except:
        provider, ollama_model = "gpt", None
    
    # GPT 사용 시에만 API 키 확인
    if provider == "gpt" and not current_user.api_key:
        raise HTTPException(
            status_code=400, 
            detail="GPT 사용을 위해서는 OpenAI API 키가 필요합니다. 설정 페이지에서 API 키를 등록해주세요."
        )
    
    def generate_stream():  # 🔥 일반 def로 변경하되 내부에서 async 처리
        try:
            # 🔥 asyncio loop를 항상 미리 생성
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            if request.text:
                query = f"""다음 내용을 참고해서 질문에 답해줘:

텍스트:
{request.text}

질문:
{request.query}
"""
            else:
                query = request.query
            
            messages = [
                {
                    "role": "system",
                    "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 한국어로 자세하고 정확하게 답변해주세요."
                },
                {
                    "role": "user",
                    "content": query
                }
            ]
            
            # 🔥 즉시 시작 신호
            yield f"data: {json.dumps({'type': 'start', 'provider': provider})}\n\n"
            
            if provider == "ollama" and ollama_model:
                # Ollama API 호출 - 동기 방식으로 처리
                try:
                    ollama_response = loop.run_until_complete(call_ollama_api(ollama_model, messages, stream=True))
                    
                    # Ollama 스트리밍 응답 처리 - 동기 방식
                    for line_bytes in ollama_response.iter_lines():
                        if line_bytes:
                            try:
                                line = line_bytes.decode('utf-8') if isinstance(line_bytes, bytes) else line_bytes
                                data = json.loads(line)
                                if "message" in data and "content" in data["message"]:
                                    content = data["message"]["content"]
                                    if content:
                                        yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"
                                
                                if data.get("done", False):
                                    break
                            except json.JSONDecodeError:
                                continue
                                
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'error': f'Ollama 오류: {str(e)}'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"  # 에러 시에도 done 신호 전송
                    return
            else:
                # GPT API 호출 (기본값)
                client = create_openai_client(current_user.api_key)
                
                stream = client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=1000,
                    temperature=0.7,
                    stream=True
                )
                
                # 각 청크를 받는 즉시 yield
                for chunk in stream:
                    if chunk.choices[0].delta.content is not None:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"
            
            # 완료 신호
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no"
        }
    )

@app.post("/gpt/vision-stream")
async def stream_vision_response(
    request: VisionRequest,
    current_user: User = Depends(get_current_user)
):
    """Vision API 응답을 실제 스트리밍으로 반환"""
    
    # API 키 확인
    if not current_user.api_key:
        raise HTTPException(
            status_code=400, 
            detail="API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 등록해주세요."
        )
    
    def generate_stream():  # 🔥 async def 대신 def 사용!
        try:
            client = create_openai_client(current_user.api_key)
            
            base64_image = request.image
            if "base64," in base64_image:
                base64_image = base64_image.split("base64,")[1]
            
            messages = [
                {
                    "role": "system",
                    "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 한국어로 자세하고 정확하게 답변해주세요."
                },
                {
                    "role": "user",
                    "content": [
                        {"type": "text", "text": request.query},
                        {
                            "type": "image_url",
                            "image_url": {"url": f"data:image/png;base64,{base64_image}"}
                        }
                    ]
                }
            ]
            
            yield f"data: {json.dumps({'type': 'start'})}\n\n"
            
            stream = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=1000,
                temperature=0.7,
                stream=True
            )
            
            for chunk in stream:
                if chunk.choices[0].delta.content is not None:
                    content = chunk.choices[0].delta.content
                    yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no"
        }
    )

# === 멀티 세그먼트 처리 ===

@app.post("/gpt/multi-segment")
async def analyze_multi_segments(
    request: MultiSegmentRequest,
    current_user: User = Depends(get_current_user)
):
    """다중 세그먼트 분석"""
    # API 키 확인
    if not current_user.api_key:
        raise HTTPException(
            status_code=400, 
            detail="API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 등록해주세요."
        )
        
    try:
        client = create_openai_client(current_user.api_key)
        
        # 세그먼트들을 분석해서 메시지 구성
        content_parts = []
        has_images = False
        
        # 텍스트 세그먼트들 먼저 처리
        text_context = f"사용자 질문: {request.query}\n\n"
        text_context += f"다음 {len(request.segments)}개 영역을 종합하여 답변해주세요:\n\n"
        
        for i, segment in enumerate(request.segments):
            if segment['type'] == 'text':
                text_context += f"[영역 {i+1}] 페이지 {segment.get('page', '?')}:\n"
                text_context += f"{segment['content']}\n\n"
            elif segment['type'] == 'image':
                has_images = True
                text_context += f"[영역 {i+1}] 페이지 {segment.get('page', '?')}: {segment.get('description', '이미지')}\n\n"
        
        if has_images:
            # 이미지가 있으면 Vision API 사용
            content_parts.append({"type": "text", "text": text_context})
            
            # 이미지들 추가
            for segment in request.segments:
                if segment['type'] == 'image' and segment.get('content'):
                    image_data = segment['content']
                    if "base64," in image_data:
                        image_data = image_data.split("base64,")[1]
                    
                    content_parts.append({
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{image_data}"}
                    })
            
            messages = [
                {
                    "role": "system",
                    "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 텍스트와 이미지를 종합하여 한국어로 자세하고 정확하게 답변해주세요."
                },
                {
                    "role": "user",
                    "content": content_parts
                }
            ]
            
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=1500,
                temperature=0.7
            )
        else:
            # 텍스트만 있으면 일반 GPT 사용
            messages = [
                {
                    "role": "system",
                    "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 한국어로 자세하고 정확하게 답변해주세요."
                },
                {
                    "role": "user",
                    "content": text_context
                }
            ]
            
            response = client.chat.completions.create(
                model="gpt-4o",
                messages=messages,
                max_tokens=1500,
                temperature=0.7
            )
        
        return {"result": response.choices[0].message.content.strip()}
        
    except Exception as e:
        pass  # 로그 제거
        raise HTTPException(status_code=500, detail=f"멀티 세그먼트 분석 오류: {str(e)}")

@app.post("/gpt/multi-segment-stream")
async def stream_multi_segment_response(
    request: MultiSegmentRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """다중 세그먼트 분석을 실제 스트리밍으로 반환 - GPT/Ollama 분기 지원"""
    
    # 🔥 사용자 AI 설정을 미리 조회  
    try:
        provider, ollama_model = await get_user_ai_provider_by_user(current_user, db)
    except:
        provider, ollama_model = "gpt", None

    # GPT 사용 시에만 API 키 확인
    if provider == "gpt" and not current_user.api_key:
        raise HTTPException(
            status_code=400, 
            detail="GPT 사용을 위해서는 OpenAI API 키가 필요합니다. 설정 페이지에서 API 키를 등록해주세요."
        )
    
    
    def generate_stream():  # 🔥 일반 def로 변경하되 내부에서 async 처리
        try:
            # 🔥 asyncio loop를 항상 미리 생성
            import asyncio
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
            # 컨텍스트 구성
            content_parts = []
            has_images = False
            image_data_list = []  # Ollama용 이미지 데이터 리스트
            
            text_context = f"## 현재 사용자 질문 (최우선):\n{request.query}\n\n"
            text_context += f"## 참고할 문서 영역 ({len(request.segments)}개):\n"
            
            for i, segment in enumerate(request.segments):
                if segment['type'] == 'text':
                    text_context += f"[영역 {i+1}] 페이지 {segment.get('page', '?')}:\n"
                    text_context += f"{segment['content']}\n\n"
                elif segment['type'] == 'image':
                    has_images = True
                    text_context += f"[영역 {i+1}] 페이지 {segment.get('page', '?')}: {segment.get('description', '이미지')}\n\n"
                    # Ollama용 이미지 데이터 추출 (base64) - GPT와 동일하게 'content' 필드 사용
                    if 'content' in segment and segment['content']:
                        image_data = segment['content']
                        # 데이터 URL 형식(e.g., "data:image/png;base64,iVBOR...")인 경우 순수 base64 데이터만 추출
                        if "base64," in image_data:
                            image_data = image_data.split("base64,")[1]
                        image_data_list.append(image_data)
            
            # 🔥 즉시 시작 신호 (어떤 제공자인지 알려줌)
            yield f"data: {json.dumps({'type': 'start', 'provider': provider})}\n\n"
            
            # 이미지가 있을 때 Ollama 모델의 멀티모달 지원 여부 확인
            if has_images and provider == "ollama":
                # 캐시에 없는 경우에만 테스트 중 메시지 표시
                if ollama_model not in multimodal_support_cache:
                    yield f"data: {json.dumps({'type': 'info', 'message': f'모델 {ollama_model}의 멀티모달 지원 여부를 확인하는 중...'})}\n\n"
                
                multimodal_support = loop.run_until_complete(check_ollama_model_multimodal_support(ollama_model))
                if not multimodal_support:
                    error_msg = f'선택된 모델 {ollama_model}은 이미지/표를 처리할 수 없습니다. GPT 모델을 사용하거나 멀티모달 모델을 다운로드해주세요.'
                    yield f"data: {json.dumps({'type': 'error', 'error': error_msg})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"  # 클라이언트 대기 방지를 위해 done 신호 전송
                    return
                else:
                    yield f"data: {json.dumps({'type': 'info', 'message': f'✅ 멀티모달 모델 {ollama_model}을 사용하여 이미지를 분석합니다.'})}\n\n"
            
            if provider == "ollama" and ollama_model:
                # Ollama API 호출 (텍스트 및 이미지 지원)
                try:
                    # 메시지 배열 구성 (시스템 메시지 + 대화 히스토리 + 현재 질문)
                    messages = [
                        {
                            "role": "system",
                            "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 사용자의 현재 질문에 집중하여 정확하게 답변해주세요. 과거 대화는 참고만 하고, 현재 요청된 작업(요약, 번역, 분석 등)을 우선적으로 수행하세요."
                        }
                    ]
                    
                    # 대화 히스토리 추가
                    if request.conversation_history:
                        for msg in request.conversation_history:
                            messages.append({
                                "role": msg.get("role", "user"),
                                "content": msg.get("content", "")
                            })
                    
                    # 현재 질문 추가
                    messages.append({
                        "role": "user",
                        "content": text_context
                    })
                    
                    # 이미지가 있으면 전달, 없으면 None
                    images_to_send = image_data_list if has_images else None
                    print(f"🔍 이미지 전송 디버그: has_images={has_images}, 이미지 개수={len(image_data_list) if image_data_list else 0}")
                    if images_to_send and len(images_to_send) > 0:
                        print(f"🔍 첫 번째 이미지 데이터 길이: {len(images_to_send[0])}")
                    
                    ollama_response = loop.run_until_complete(call_ollama_api(ollama_model, messages, stream=True, images=images_to_send))
                    
                    # Ollama 스트리밍 응답 처리 - 동기 방식
                    for line_bytes in ollama_response.iter_lines():
                        if line_bytes:
                            try:
                                line = line_bytes.decode('utf-8') if isinstance(line_bytes, bytes) else line_bytes
                                data = json.loads(line)
                                if "message" in data and "content" in data["message"]:
                                    content = data["message"]["content"]
                                    if content:
                                        yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"
                                
                                if data.get("done", False):
                                    break
                            except json.JSONDecodeError:
                                continue
                                
                except Exception as e:
                    yield f"data: {json.dumps({'type': 'error', 'error': f'Ollama 오류: {str(e)}'})}\n\n"
                    yield f"data: {json.dumps({'type': 'done'})}\n\n"  # 에러 시에도 done 신호 전송
                    return
            else:
                # GPT API 호출 (기본값 또는 이미지 포함)
                client = create_openai_client(current_user.api_key)
                
                if has_images:
                    content_parts.append({"type": "text", "text": text_context})
                    
                    for segment in request.segments:
                        if segment['type'] == 'image' and segment.get('content'):
                            image_data = segment['content']
                            if "base64," in image_data:
                                image_data = image_data.split("base64,")[1]
                            
                            content_parts.append({
                                "type": "image_url",
                                "image_url": {"url": f"data:image/png;base64,{image_data}"}
                            })
                    
                    # 메시지 배열 구성 (시스템 메시지 + 대화 히스토리 + 현재 질문)
                    messages = [
                        {
                            "role": "system",
                            "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 텍스트와 이미지를 종합하여 한국어로 자세하고 정확하게 답변해주세요."
                        }
                    ]
                    
                    # 대화 히스토리 추가
                    if request.conversation_history:
                        for msg in request.conversation_history:
                            messages.append({
                                "role": msg.get("role", "user"),
                                "content": msg.get("content", "")
                            })
                    
                    # 현재 질문 추가
                    messages.append({
                        "role": "user",
                        "content": content_parts
                    })
                else:
                    # 메시지 배열 구성 (시스템 메시지 + 대화 히스토리 + 현재 질문)
                    messages = [
                        {
                            "role": "system",
                            "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 사용자의 현재 질문에 집중하여 한국어로 정확하게 답변해주세요. 과거 대화는 참고만 하고, 현재 요청된 작업(요약, 번역, 분석 등)을 우선적으로 수행하세요."
                        }
                    ]
                    
                    # 대화 히스토리 추가
                    if request.conversation_history:
                        for msg in request.conversation_history:
                            messages.append({
                                "role": msg.get("role", "user"),
                                "content": msg.get("content", "")
                            })
                    
                    # 현재 질문 추가
                    messages.append({
                        "role": "user",
                        "content": text_context
                    })
                
                
                stream = client.chat.completions.create(
                    model="gpt-4o",
                    messages=messages,
                    max_tokens=1500,
                    temperature=0.7,
                    stream=True
                )
                
                for chunk in stream:
                    if chunk.choices[0].delta.content is not None:
                        content = chunk.choices[0].delta.content
                        yield f"data: {json.dumps({'type': 'chunk', 'content': content})}\n\n"
            
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no"
        }
    )
# 기존 send_openai_query 함수를 이것으로 교체
async def send_openai_query(query: str, api_key: str, base64_image: Optional[str] = None):
    try:
        client = create_openai_client(current_user.api_key)
        
        messages = [
            {
                "role": "system",
                "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 한국어로 자세하고 정확하게 답변해주세요."
            }
        ]
        
        if base64_image:
            # 🆕 base64 이미지 정리 - dataURL 헤더 제거
            if base64_image.startswith('data:image'):
                base64_image = base64_image.split(',')[1]
            
            messages.append({
                "role": "user",
                "content": [
                    {"type": "text", "text": query},
                    {
                        "type": "image_url",
                        "image_url": {"url": f"data:image/png;base64,{base64_image}"}
                    }
                ]
            })
            model = "gpt-4o"
        else:
            messages.append({
                "role": "user", 
                "content": query
            })
            model = "gpt-4o"
        
        response = client.chat.completions.create(
            model=model,
            messages=messages,
            max_tokens=1000,
            temperature=0.7
        )
        
        return {"result": response.choices[0].message.content.strip()}
        
    except Exception as e:
        pass  # 로그 제거
        raise HTTPException(status_code=500, detail=f"OpenAI API 오류: {str(e)}")

# AI 질문 응답 (GPT/Ollama 분기 지원)
@app.post("/gpt/ask")
async def ask_gpt(
    request: QueryRequest, 
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """AI에게 질문하기 - GPT/Ollama 분기 지원"""
    
    # API 키 확인
    if not current_user.api_key:
        raise HTTPException(
            status_code=400, 
            detail="API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 등록해주세요."
        )
    
    try:
        # 사용자 AI 설정 조회
        provider, ollama_model = await get_user_ai_provider_by_user(current_user, db)
        
        if request.text:
            query = f"""다음 내용을 참고해서 질문에 답해줘:

텍스트:
{request.text}

질문:
{request.query}
"""
        else:
            query = request.query
        
        messages = [
            {
                "role": "system",
                "content": "당신은 PDF 문서 분석을 도와주는 AI 어시스턴트입니다. 한국어로 자세하고 정확하게 답변해주세요."
            },
            {
                "role": "user",
                "content": query
            }
        ]
        
        if provider == "ollama" and ollama_model:
            # Ollama API 호출
            result = await call_ollama_api(ollama_model, messages, stream=False)
            return result
        else:
            # GPT API 호출 (기본값)
            return await send_openai_query(query, api_key)
            
    except Exception as e:
        pass  # 로그 제거
        raise HTTPException(status_code=500, detail=f"AI 질문 처리 오류: {str(e)}")


# OCR 처리 엔드포인트
@app.post("/ocr")
async def process_ocr(file: UploadFile = File(...)):
    """PDF 파일을 OCR 처리하여 텍스트가 추출된 PDF 반환"""
    try:
        # 임시 파일 저장
        temp_path = FILES_DIR / f"upload_{file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # HURIDOCS API로 OCR 요청
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
            with open(temp_path, "rb") as f:
                files = {"file": (file.filename, f, "application/pdf")}
                data = {"language": "en"}  # 언어 코드: en, ko 등 (ISO 639-1 형식)
                
                # 요청 실행
                response = await client.post(
                    f"{DOCKER_API_URL}/ocr",
                    files=files,
                    data=data
                )
            
            if response.status_code != 200:
                error_msg = f"OCR 처리 중 오류가 발생했습니다. 상태 코드: {response.status_code}"
                if response.content:
                    error_msg += f", 응답: {response.content.decode('utf-8', errors='ignore')}"
                raise HTTPException(status_code=500, detail=error_msg)
            
            # 처리된 파일 저장
            ocr_path = FILES_DIR / f"ocr_{file.filename}"
            with open(ocr_path, "wb") as f:
                f.write(response.content)
            
            # 파일이 정상적으로 생성되었는지 확인
            if not ocr_path.exists() or ocr_path.stat().st_size == 0:
                raise HTTPException(status_code=500, detail="OCR 처리된 파일이 생성되지 않았습니다.")
            
            return FileResponse(str(ocr_path), media_type="application/pdf", filename=f"ocr_{file.filename}")
    
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"HURIDOCS API 요청 오류: {str(e)}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="OCR 처리 시간이 초과되었습니다.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR 처리 중 오류가 발생했습니다: {str(e)}")

# 시각화 처리 엔드포인트
@app.post("/visualize")
async def process_visualize(file: UploadFile = File(...)):
    """PDF 파일을 VGT로 처리하여 바운딩 박스가 표시된 PDF 반환"""
    try:
        # 임시 파일 저장
        temp_path = FILES_DIR / f"upload_{file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        # OCR 처리 (필요한 경우)
        ocr_path = FILES_DIR / f"ocr_{file.filename}"
        if not ocr_path.exists():
            async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
                with open(temp_path, "rb") as f:
                    response = await client.post(
                        f"{DOCKER_API_URL}/ocr",
                        files={"file": (file.filename, f, "application/pdf")},
                        data={"language": "en"}
                    )
                
                if response.status_code != 200:
                    error_msg = f"OCR 처리 중 오류가 발생했습니다. 상태 코드: {response.status_code}"
                    if response.content:
                        error_msg += f", 응답: {response.content.decode('utf-8', errors='ignore')}"
                    raise HTTPException(status_code=500, detail=error_msg)
                
                # 처리된 파일 저장
                with open(ocr_path, "wb") as f:
                    f.write(response.content)
        
        # VGT 시각화 요청
        async with httpx.AsyncClient(timeout=httpx.Timeout(1200.0)) as client:  # VGT는 더 오래 걸릴 수 있음
            with open(ocr_path, "rb") as f:
                response = await client.post(
                    f"{DOCKER_API_URL}/visualize",
                    files={"file": (file.filename, f, "application/pdf")},
                    # fast=true를 제외하여 VGT 모델 사용
                )
            
            if response.status_code != 200:
                error_msg = f"시각화 처리 중 오류가 발생했습니다. 상태 코드: {response.status_code}"
                if response.content:
                    error_msg += f", 응답: {response.content.decode('utf-8', errors='ignore')}"
                raise HTTPException(status_code=500, detail=error_msg)
            
            # 처리된 파일 저장
            vgt_path = FILES_DIR / f"vgt_{file.filename}"
            with open(vgt_path, "wb") as f:
                f.write(response.content)
            
            # 파일이 정상적으로 생성되었는지 확인
            if not vgt_path.exists() or vgt_path.stat().st_size == 0:
                raise HTTPException(status_code=500, detail="시각화 처리된 파일이 생성되지 않았습니다.")
            
            return FileResponse(str(vgt_path), media_type="application/pdf", filename=f"vgt_{file.filename}")
    
    except httpx.RequestError as e:
        raise HTTPException(status_code=500, detail=f"HURIDOCS API 요청 오류: {str(e)}")
    except httpx.TimeoutException:
        raise HTTPException(status_code=504, detail="시각화 처리 시간이 초과되었습니다.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"시각화 처리 중 오류가 발생했습니다: {str(e)}")




# backend.py에 추가할 파일 관리 API들

@app.get("/files")
async def get_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자의 파일 목록 조회"""
    # JWT 인증된 사용자의 파일만 조회
    files = db.query(PDFFile).filter(
        PDFFile.user_id == current_user.id
    ).order_by(PDFFile.created_at.desc()).all()
    
    # 응답 형식 변환
    file_list = []
    for file in files:
        file_data = {
            "id": file.id,
            "filename": file.filename,
            "file_size": file.file_size,
            "language": file.language,
            "status": file.status,
            "error_message": file.error_message,
            "segments_count": len(file.segments_data) if file.segments_data else 0,
            "created_at": file.created_at.isoformat() if file.created_at else None,
            "processed_at": file.processed_at.isoformat() if file.processed_at else None
        }
        file_list.append(file_data)
    
    return {"files": file_list}

@app.get("/files/{file_id}")
async def get_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """특정 파일 정보 조회"""
    # UUID 형식 검증
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
    # 파일 조회 (소유권 확인)
    file = db.query(PDFFile).filter(
        PDFFile.id == file_id,
        PDFFile.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    return {
        "file": {
            "id": file.id,
            "filename": file.filename,
            "file_size": file.file_size,
            "language": file.language,
            "use_ocr": file.use_ocr,  # OCR 설정 추가
            "status": file.status,
            "error_message": file.error_message,
            "segments_data": file.segments_data,
            "created_at": file.created_at.isoformat() if file.created_at else None,
            "processed_at": file.processed_at.isoformat() if file.processed_at else None
        }
    }

@app.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """파일 삭제 (DB + 물리 파일)"""
    # UUID 형식 검증
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
    # 파일 조회 (소유권 확인)
    file = db.query(PDFFile).filter(
        PDFFile.id == file_id,
        PDFFile.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    try:
        # 1. 관련 채팅 세션들 삭제 (CASCADE로 메시지도 함께 삭제됨)
        chat_sessions = db.query(ChatSession).filter(ChatSession.file_id == file_id).all()
        for session in chat_sessions:
            db.delete(session)
        
        # 2. 물리 파일들 삭제
        file_dir = FILES_DIR / str(current_user.id) / str(file_id)
        if file_dir.exists():
            import shutil
            shutil.rmtree(file_dir)
            print(f"✅ 물리 파일 디렉토리 삭제: {file_dir}")
        
        # 3. DB에서 파일 레코드 삭제
        db.delete(file)
        db.commit()
        
        return {"message": "파일이 성공적으로 삭제되었습니다", "file_id": file_id}
        
    except Exception as e:
        db.rollback()
        print(f"❌ 파일 삭제 오류: {e}")
        raise HTTPException(status_code=500, detail=f"파일 삭제 중 오류: {str(e)}")
    

@app.get("/files/{file_id}/pdf")
async def get_pdf_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PDF 파일 다운로드"""
    # UUID 형식 검증
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
    # 파일 조회 (소유권 확인)
    file = db.query(PDFFile).filter(
        PDFFile.id == file_id,
        PDFFile.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    # OCR 처리된 파일 경로
    file_dir = FILES_DIR / str(current_user.id) / str(file_id)
    ocr_path = file_dir / f"ocr_{file.filename}"
    original_path = file_dir / f"original_{file.filename}"
    
    # OCR 파일이 있으면 OCR 파일, 없으면 원본 파일 반환
    if ocr_path.exists():
        return FileResponse(str(ocr_path), media_type="application/pdf", filename=file.filename)
    elif original_path.exists():
        return FileResponse(str(original_path), media_type="application/pdf", filename=file.filename)
    else:
        raise HTTPException(status_code=404, detail="PDF 파일을 찾을 수 없습니다")
    
@app.delete("/user-data")
async def delete_user_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자 데이터 전체 삭제 (모든 파일 + 채팅)"""
    try:
        # 1. 모든 파일 조회
        files = db.query(PDFFile).filter(PDFFile.user_id == current_user.id).all()
        
        # 2. 각 파일의 채팅 세션들 삭제
        for file in files:
            chat_sessions = db.query(ChatSession).filter(ChatSession.file_id == file.id).all()
            for session in chat_sessions:
                db.delete(session)
        
        # 3. 모든 파일 레코드 삭제
        for file in files:
            db.delete(file)
        
        # 4. 사용자 폴더 전체 삭제
        user_dir = FILES_DIR / str(current_user.id)
        if user_dir.exists():
            import shutil
            shutil.rmtree(user_dir)
            print(f"✅ 사용자 폴더 전체 삭제: {user_dir}")
        
        db.commit()
        
        return {
            "message": "사용자 데이터가 모두 삭제되었습니다", 
            "deleted_files": len(files)
        }
        
    except Exception as e:
        db.rollback()
        print(f"❌ 사용자 데이터 삭제 오류: {e}")
        raise HTTPException(status_code=500, detail=f"데이터 삭제 중 오류: {str(e)}")


# PDF 텍스트 검사 API
@app.post("/check-pdf-text")
async def check_pdf_text_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """업로드된 PDF 파일에 텍스트가 있는지 검사"""
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다")
    
    try:
        # 임시 파일로 저장
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        # 텍스트 검사
        result = check_pdf_has_text(temp_path)
        
        # 임시 파일 삭제
        os.unlink(temp_path)
        
        return {
            "filename": file.filename,
            "file_size": len(content),
            **result
        }
        
    except Exception as e:
        print(f"❌ PDF 텍스트 검사 API 오류: {e}")
        if 'temp_path' in locals() and os.path.exists(temp_path):
            os.unlink(temp_path)
        raise HTTPException(status_code=500, detail=f"PDF 텍스트 검사 실패: {str(e)}")

# backend.py 파일에 추가할 헬스체크 엔드포인트

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

# 세그먼트 정보 추출 엔드포인트
# 기존 @app.post("/segments") 함수 전체를 이것으로 교체# 기존 segments 함수를 이것으로 전체 교체
# backend.py - segments 함수를 이것으로 전체 교체

@app.post("/segments")
async def process_segments(
    file: UploadFile = File(...), 
    language: str = Form("ko"),
    file_id: str = Form(...),  # UUID 받기
    use_ocr: bool = Form(False),  # OCR 사용 여부 (기본값: False)
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PDF 파일에서 세그먼트 정보(JSON) 추출 + DB 저장"""
    
    db_file = None
    try:
        # 1. UUID 형식 검증
        if not is_valid_uuid(file_id):
            print(f"❌ 잘못된 UUID 형식: {file_id}")
            raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
        
        # 2. 기존 파일 확인 (중복 처리 방지)
        existing_file = db.query(PDFFile).filter(
            PDFFile.id == file_id,
            PDFFile.user_id == current_user.id
        ).first()
        
        if existing_file:
            # 재처리 가능한 상태 (failed, error)인지 확인
            if existing_file.status not in ['failed', 'error']:
                print(f"⚠️ 재처리 불가능한 상태 - 파일 ID: {file_id}, 상태: {existing_file.status}")
                raise HTTPException(status_code=400, detail="이미 처리 중이거나 완료된 파일입니다")
            
            # 재처리 허용 - 기존 파일 삭제하고 새로 생성
            print(f"🔄 재처리 허용 - 파일 ID: {file_id}, 기존 상태: {existing_file.status}")
            db.delete(existing_file)
            db.commit()
        
        # 2. DB에 파일 정보 저장 (UUID 사용)
        db_file = PDFFile(
            id=file_id,  # UUID 직접 사용
            user_id=current_user.id,
            filename=file.filename,
            file_path="",  # 나중에 업데이트
            file_size=0,   # 나중에 업데이트
            language=language,
            use_ocr=use_ocr,  # OCR 설정 저장
            status="processing"
        )
        
        try:
            db.add(db_file)
            db.commit()
            # refresh 제거 - 새로 생성한 객체는 refresh 불필요
        except Exception as db_error:
            db.rollback()
            print(f"❌ DB 저장 오류: {db_error}")
            raise HTTPException(status_code=500, detail=f"데이터베이스 저장 실패: {str(db_error)}")
        
        print(f"✅ DB에 파일 정보 저장 완료: ID={db_file.id}")
        
        # 2. 파일 저장 경로 설정 (사용자별 폴더)
        file_dir = FILES_DIR / str(current_user.id) / str(db_file.id)
        file_dir.mkdir(parents=True, exist_ok=True)
        
        temp_path = file_dir / f"original_{file.filename}"
        
        # 3. 실제 파일 저장
        file_content = await file.read()
        with open(temp_path, "wb") as buffer:
            buffer.write(file_content)
        
        # 4. DB 업데이트 (파일 경로, 크기)
        db_file.file_path = str(temp_path)
        db_file.file_size = len(file_content)
        db.commit()
        
        print(f"✅ 파일 저장 완료: {temp_path}")
        
        # 5. OCR 처리 여부에 따른 분기
        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
            if use_ocr:
                # 5-1. OCR 처리 후 세그먼트 추출
                print("🔍 OCR 분석 모드로 처리 중...")
                ocr_path = file_dir / f"ocr_{file.filename}"
                
                with open(temp_path, "rb") as f:
                    response = await client.post(
                        f"{DOCKER_API_URL}/ocr",
                        files={"file": (file.filename, f, "application/pdf")},
                        data={"language": language}
                    )
                
                if response.status_code != 200:
                    raise Exception(f"OCR 처리 실패: {response.status_code}")
                
                # OCR 파일 저장
                with open(ocr_path, "wb") as f:
                    f.write(response.content)
                
                print(f"✅ OCR 처리 완료: {ocr_path}")
                
                # OCR된 파일로 세그먼트 추출
                with open(ocr_path, "rb") as f:
                    segments_response = await client.post(
                        f"{DOCKER_API_URL}/",
                        files={"file": (file.filename, f, "application/pdf")},
                        data={"fast": "false"}
                    )
            else:
                # 5-2. OCR 없이 직접 세그먼트 추출
                print("⚡ 빠른 분석 모드로 처리 중...")
                
                # 원본 파일로 바로 세그먼트 추출
                with open(temp_path, "rb") as f:
                    segments_response = await client.post(
                        f"{DOCKER_API_URL}/",
                        files={"file": (file.filename, f, "application/pdf")},
                        data={"fast": "false"}
                    )
            
            # 6. 세그먼트 처리 (공통)
            formatted_segments = []
            if segments_response.status_code == 200:
                segments_data = segments_response.json()
                
                for segment in segments_data:
                    formatted_segment = {
                        "type": segment.get("type", "text"),
                        "text": segment.get("text", ""),
                        "page_number": segment.get("page_number", 1),
                        "left": segment.get("left", 0),
                        "top": segment.get("top", 0),
                        "width": segment.get("width", 0),
                        "height": segment.get("height", 0),
                        "page_width": segment.get("page_width", 1),
                        "page_height": segment.get("page_height", 1)
                    }
                    formatted_segments.append(formatted_segment)
                
                # 세그먼트 JSON 파일 저장
                segments_path = file_dir / f"segments_{file.filename}.json"
                with open(segments_path, "w", encoding="utf-8") as f:
                    json.dump(formatted_segments, f, ensure_ascii=False, indent=2)
                
                print(f"✅ 세그먼트 추출 완료: {len(formatted_segments)}개")
            
            # 7. DB 최종 업데이트 (완료 상태)
            db_file.status = "completed"
            db_file.processed_at = func.now()
            db_file.segments_data = formatted_segments
            db.commit()
            
            # 8. 첫 번째 채팅 세션 자동 생성
            try:
                first_session = ChatSession(
                    user_id=current_user.id,
                    file_id=db_file.id,
                    session_name=f"{file.filename} 채팅"
                )
                db.add(first_session)
                db.commit()
                db.refresh(first_session)
                print(f"✅ 첫 번째 채팅 세션 자동 생성: {first_session.id}")
            except Exception as session_error:
                print(f"⚠️ 세션 생성 오류 (파일 처리는 성공): {session_error}")
            
            return {
                "file_id": db_file.id,  # 이미 UUID
                "message": "처리 완료",
                "segments": formatted_segments,
                "use_ocr": use_ocr  # OCR 사용 여부도 응답에 포함
            }
    
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 전체 처리 오류: {e}")
        # 처리 실패 시 DB 업데이트
        if db_file:
            try:
                db_file.status = "failed"
                db.commit()
            except:
                db.rollback()
        raise HTTPException(status_code=500, detail=f"처리 중 오류: {str(e)}")

# 파일 처리 취소 엔드포인트
@app.post("/files/{file_id}/cancel")
async def cancel_file_processing(
    file_id: str,  # UUID 받기
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """파일 처리 취소"""
    # UUID 형식 검증
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
    try:
        # DB에서 파일 찾기
        db_file = db.query(PDFFile).filter(
            PDFFile.id == file_id,
            PDFFile.user_id == current_user.id
        ).first()
        
        if not db_file:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
        
        # 상태를 취소로 변경
        db_file.status = "cancelled"
        db_file.error_message = "사용자가 취소했습니다"
        db.commit()
        
        # 임시 파일들 정리
        import shutil
        file_dir = FILES_DIR / str(current_user.id) / str(file_id)
        if file_dir.exists():
            try:
                shutil.rmtree(file_dir)
                print(f"✅ 취소된 파일 디렉토리 정리: {file_dir}")
            except Exception as e:
                print(f"⚠️ 파일 정리 오류: {e}")
        
        return {"message": "파일 처리가 취소되었습니다", "file_id": file_id}
        
    except HTTPException:
        raise
    except Exception as e:
        print(f"❌ 취소 처리 오류: {e}")
        raise HTTPException(status_code=500, detail=f"취소 처리 중 오류: {str(e)}")






@app.post("/gpt/vision")
async def vision_analysis(request: VisionRequest, current_user: User = Depends(get_current_user)):
    """이미지를 GPT Vision으로 분석"""
    
    # API 키 확인
    if not current_user.api_key:
        raise HTTPException(
            status_code=400, 
            detail="API 키가 설정되지 않았습니다. 설정 페이지에서 API 키를 등록해주세요."
        )
    
    try:
        print(f"🔍 Vision 요청 받음")
        print(f"📝 Query: {request.query}")
        print(f"🖼️ 이미지 데이터 길이: {len(request.image) if request.image else 0}")
        
        # 🆕 이미지 크기 체크
        if len(request.image) > 100000:  # 100KB 제한
            print(f"⚠️ 이미지가 너무 큼: {len(request.image)} bytes")
            raise HTTPException(status_code=400, detail="이미지 크기가 너무 큽니다. 더 작은 영역을 선택해주세요.")
        
        # dataURL 형식에서 base64 추출
        base64_image = request.image
        if "base64," in base64_image:
            base64_image = base64_image.split("base64,")[1]
            print(f"✅ Base64 추출 완료, 길이: {len(base64_image)}")
        
        result = await send_openai_query(request.query, api_key, base64_image)
        print(f"✅ OpenAI 응답 받음")
        
        return result
        
    except Exception as e:
        print(f"❌ Vision API 에러: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Vision API 오류: {str(e)}")
    
# 채팅 세션 관련 API들
@app.get("/files/{file_id}/chats")
async def get_chat_sessions(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """파일의 채팅 세션 목록 조회"""
    # UUID 형식 검증
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
    # 파일 소유권 확인
    file = db.query(PDFFile).filter(
        PDFFile.id == file_id,
        PDFFile.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    # 채팅 세션들 조회
    sessions = db.query(ChatSession).filter(
        ChatSession.file_id == file_id,
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.updated_at.desc()).all()
    
    return {"sessions": sessions}

@app.post("/files/{file_id}/chats")
async def create_chat_session(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """새 채팅 세션 생성"""
    # UUID 형식 검증
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
    # 파일 소유권 확인
    file = db.query(PDFFile).filter(
        PDFFile.id == file_id,
        PDFFile.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    # 새 세션 생성
    session = ChatSession(
        user_id=current_user.id,
        file_id=file_id,
        session_name=f"{file.filename} 채팅"
    )
    
    db.add(session)
    db.commit()
    db.refresh(session)
    
    return {"session": session}

@app.get("/chats/{session_id}/messages")
async def get_chat_messages(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채팅 메시지들 조회"""
    # 세션 소유권 확인
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="채팅 세션을 찾을 수 없습니다")
    
    # 메시지들 조회
    messages = db.query(ChatMessage).filter(
        ChatMessage.session_id == session_id
    ).order_by(ChatMessage.created_at.asc()).all()
    
    return {"messages": messages}

@app.post("/chats/{session_id}/messages")
async def save_chat_message(
    session_id: int,
    message_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채팅 메시지 저장"""
    # 세션 소유권 확인
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="채팅 세션을 찾을 수 없습니다")
    
    # 메시지 저장
    message = ChatMessage(
        session_id=session_id,
        content=message_data.get('content', ''),
        is_user=message_data.get('is_user', True),
        selected_segments=message_data.get('selected_segments'),
        api_type=message_data.get('api_type')
    )
    
    db.add(message)
    
    # 세션 업데이트 시간 갱신
    session.updated_at = func.now()
    
    try:
        db.commit()
        db.refresh(message)
        return {"message": "저장 완료", "message_id": message.id}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"저장 실패: {str(e)}")

@app.put("/chats/{session_id}/name")
async def rename_chat_session(
    session_id: int,
    request_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채팅 세션 이름 변경"""
    # 세션 소유권 확인
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="채팅 세션을 찾을 수 없습니다")
    
    # 이름 변경
    new_name = request_data.get('session_name', '').strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="세션 이름을 입력해주세요")
    
    session.session_name = new_name
    session.updated_at = func.now()
    db.commit()
    
    return {"message": "세션 이름이 변경되었습니다", "session_name": new_name}

@app.delete("/chats/{session_id}")
async def delete_chat_session(
    session_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """채팅 세션 삭제"""
    # 세션 소유권 확인
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id,
        ChatSession.user_id == current_user.id
    ).first()
    
    if not session:
        raise HTTPException(status_code=404, detail="채팅 세션을 찾을 수 없습니다")
    
    try:
        # 관련 메시지들이 CASCADE로 자동 삭제됨
        db.delete(session)
        db.commit()
        
        return {"message": "채팅 세션이 삭제되었습니다", "session_id": session_id}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"세션 삭제 중 오류: {str(e)}")


# === OLLAMA API 연동 및 사용자 설정 ===

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

@app.get("/api/settings")
async def get_user_settings(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """현재 사용자의 모델 설정 조회"""
    try:
        # 기존 설정 조회
        settings = db.query(UserSettings).filter(
            UserSettings.user_id == current_user.id
        ).first()
        
        if not settings:
            # 기본 설정 생성
            settings = UserSettings(
                user_id=current_user.id,
                selected_model_provider="gpt",
                selected_ollama_model=None
            )
            db.add(settings)
            db.commit()
            db.refresh(settings)
        
        return {
            "selected_model_provider": settings.selected_model_provider,
            "selected_ollama_model": settings.selected_ollama_model,
            "updated_at": settings.updated_at.isoformat() if settings.updated_at else None
        }
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"설정 조회 오류: {str(e)}")

@app.post("/api/settings")
async def update_user_settings(
    request: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자 모델 설정 저장/업데이트"""
    try:
        
        # 요청 데이터 검증
        model_provider = request.get("selected_model_provider", "gpt")
        ollama_model = request.get("selected_ollama_model")
        
        if model_provider not in ["gpt", "ollama"]:
            raise HTTPException(status_code=400, detail="모델 제공자는 'gpt' 또는 'ollama'여야 합니다")
        
        if model_provider == "ollama" and not ollama_model:
            raise HTTPException(status_code=400, detail="Ollama 모델이 선택되지 않았습니다")
        
        # 기존 설정 조회 또는 생성
        settings = db.query(UserSettings).filter(
            UserSettings.user_id == current_user.id
        ).first()
        
        if settings:
            # 기존 설정 업데이트
            settings.selected_model_provider = model_provider
            settings.selected_ollama_model = ollama_model if model_provider == "ollama" else None
            settings.updated_at = func.now()
        else:
            # 새 설정 생성
            settings = UserSettings(
                user_id=current_user.id,
                selected_model_provider=model_provider,
                selected_ollama_model=ollama_model if model_provider == "ollama" else None
            )
            db.add(settings)
        
        db.commit()
        db.refresh(settings)
        
        return {
            "message": "설정이 저장되었습니다",
            "selected_model_provider": settings.selected_model_provider,
            "selected_ollama_model": settings.selected_ollama_model
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"설정 저장 오류: {str(e)}")

@app.get("/api/models/local")
async def get_local_models(current_user: User = Depends(get_current_user)):
    """사용 가능한 로컬 Ollama 모델 목록 조회"""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(f"{OLLAMA_API_URL}/api/tags")
            
            if response.status_code == 200:
                data = response.json()
                models = []
                
                for model in data.get("models", []):
                    models.append({
                        "name": model.get("name", ""),
                        "size": model.get("size", 0),
                        "modified_at": model.get("modified_at", ""),
                        "digest": model.get("digest", "")
                    })
                
                return {"models": models, "total": len(models)}
            else:
                raise HTTPException(status_code=500, detail="Ollama 서비스 연결 실패")
                
    except httpx.RequestError as e:
        raise HTTPException(status_code=503, detail=f"Ollama 서비스에 연결할 수 없습니다: {str(e)}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"모델 목록 조회 오류: {str(e)}")

@app.post("/api/models/local/download")
async def download_model_stream(
    request: dict,
    current_user: User = Depends(get_current_user)
):
    """새 Ollama 모델 다운로드 - 스트리밍 진행률 지원"""
    
    model_name = request.get("model_name", "").strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="모델 이름을 입력해주세요")
    
    def generate_download_stream():
        try:
            import httpx
            
            with httpx.stream(
                'POST',
                f"{OLLAMA_API_URL}/api/pull",
                json={"name": model_name, "stream": True},
                headers={"Content-Type": "application/json"},
                timeout=600.0
            ) as response:
                
                if response.status_code != 200:
                    yield f"data: {json.dumps({'type': 'error', 'error': '모델 다운로드 시작 실패'})}\n\n"
                    return
                
                yield f"data: {json.dumps({'type': 'start', 'model': model_name})}\n\n"
                
                for line in response.iter_lines():
                    if line:
                        try:
                            data = json.loads(line)
                            
                            # 진행률 정보 추출
                            if 'status' in data:
                                status = data['status']
                                
                                if 'completed' in data and 'total' in data:
                                    completed = data['completed']
                                    total = data['total']
                                    percentage = int((completed / total) * 100) if total > 0 else 0
                                    
                                    progress_data = {
                                        'type': 'progress',
                                        'status': status,
                                        'completed': completed,
                                        'total': total,
                                        'percentage': percentage
                                    }
                                    yield f"data: {json.dumps(progress_data)}\n\n"
                                else:
                                    status_data = {
                                        'type': 'status',
                                        'status': status
                                    }
                                    yield f"data: {json.dumps(status_data)}\n\n"
                            
                            # 완료 확인
                            if data.get('status') == 'success' or 'error' not in data and len(line.strip()) == 0:
                                completion_message = f'모델 {model_name} 다운로드 완료'
                                yield f"data: {json.dumps({'type': 'done', 'message': completion_message})}\n\n"
                                break
                                
                        except json.JSONDecodeError:
                            continue
                            
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'error': str(e)})}\n\n"
    
    return StreamingResponse(
        generate_download_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no"
        }
    )

@app.delete("/api/models/local/delete")
async def delete_model(
    request: ModelDeleteRequest,
    current_user: User = Depends(get_current_user)
):
    """Ollama 모델 삭제"""
    
    model_name = request.model_name.strip()
    if not model_name:
        raise HTTPException(status_code=400, detail="모델 이름을 입력해주세요")
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.request(
                method="DELETE",
                url=f"{OLLAMA_API_URL}/api/delete",
                json={"name": model_name}
            )
            
            if response.status_code == 200:
                # 캐시에서도 제거
                if model_name in multimodal_support_cache:
                    del multimodal_support_cache[model_name]
                
                return {"message": f"모델 '{model_name}'이 성공적으로 삭제되었습니다"}
            else:
                error_msg = "모델 삭제 실패"
                try:
                    error_data = response.json()
                    if "error" in error_data:
                        error_msg = error_data["error"]
                except Exception as json_error:
                    # JSON 파싱 실패 시 원본 텍스트 사용
                    print(f"🔍 Ollama 응답 JSON 파싱 실패: {json_error}")
                    print(f"🔍 원본 응답 텍스트: {response.text}")
                    error_msg = f"모델 삭제 실패 (응답: {response.text[:200]})"
                
                raise HTTPException(status_code=response.status_code, detail=error_msg)
                
    except httpx.RequestError as e:
        print(f"🔍 Ollama 연결 오류: {e}")
        raise HTTPException(status_code=503, detail=f"Ollama 서비스에 연결할 수 없습니다: {str(e)}")
    except HTTPException:
        # HTTPException은 그대로 재발생
        raise
    except Exception as e:
        print(f"🔍 예상치 못한 모델 삭제 오류: {e}")
        raise HTTPException(status_code=500, detail=f"모델 삭제 오류: {str(e)}")

# 파일 처리 종료 시 임시 파일 정리
@app.on_event("shutdown")
def cleanup():
    """서버 종료 시 임시 파일 정리"""
    for file in FILES_DIR.glob("*"):
        file.unlink()
    FILES_DIR.rmdir()

# 개발 서버 실행
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)