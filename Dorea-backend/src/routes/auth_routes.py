"""
==========================================
Authentication Routes Module
==========================================

사용자 인증 관련 모든 라우트를 처리하는 모듈입니다.

기능:
- 페이지 라우트 (랜딩, 로그인, 회원가입, 메인 앱)
- API 인증 (회원가입, 로그인, 사용자 정보 조회)
- API 키 관리 (검증, 업데이트)

Author: Dorea Team
Last Updated: 2024-08-22
"""

# FastAPI 관련 imports
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import HTMLResponse
from sqlalchemy.orm import Session
from datetime import timedelta
from pathlib import Path

# 내부 모듈 imports
from database import get_db, User
from auth import verify_api_key, get_current_user, authenticate_user, create_access_token, get_password_hash

# Pydantic 모델 imports (backend.py에서 이동 예정)
from pydantic import BaseModel
from typing import Optional

# ==========================================
# Pydantic 모델 정의
# ==========================================

class ApiKeyRequest(BaseModel):
    """API 키 검증 요청 모델"""
    api_key: str

class UserRegisterRequest(BaseModel):
    """사용자 회원가입 요청 모델"""
    username: str
    email: str
    password: str

class UserLoginRequest(BaseModel):
    """사용자 로그인 요청 모델"""
    username: str
    password: str

class TokenResponse(BaseModel):
    """JWT 토큰 응답 모델"""
    access_token: str
    token_type: str

class RegisterResponse(BaseModel):
    """회원가입 응답 모델"""
    message: str
    username: str

class UserResponse(BaseModel):
    """사용자 정보 응답 모델"""
    id: int
    username: str
    email: str
    api_key: Optional[str] = None
    created_at: str

class UserApiKeyUpdateRequest(BaseModel):
    """사용자 API 키 업데이트 요청 모델"""
    api_key: str

# ==========================================
# 라우터 설정
# ==========================================

# API 라우터 생성
router = APIRouter()

# Static 디렉토리 경로 (backend.py에서 가져옴)
STATIC_DIR = Path(__file__).parent.parent / "static"

# ==========================================
# 페이지 라우트 (HTML 반환)
# ==========================================

@router.get("/", response_class=HTMLResponse)
async def root():
    """
    랜딩 페이지 (로그인 전)
    
    Returns:
        HTMLResponse: landing.html 파일 내용
        
    Raises:
        HTTPException: 파일이 존재하지 않을 경우 404 에러
    """
    html_file = STATIC_DIR / 'landing.html'
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    else:
        raise HTTPException(status_code=404, detail="Landing page not found")

@router.get("/login", response_class=HTMLResponse)
async def login():
    """
    로그인 페이지
    
    Returns:
        HTMLResponse: login.html 파일 내용
        
    Raises:
        HTTPException: 파일이 존재하지 않을 경우 404 에러
    """
    html_file = STATIC_DIR / 'login.html'
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    else:
        raise HTTPException(status_code=404, detail="Login page not found")

@router.get("/register", response_class=HTMLResponse)
async def register():
    """
    회원가입 페이지
    
    Returns:
        HTMLResponse: register.html 파일 내용
        
    Raises:
        HTTPException: 파일이 존재하지 않을 경우 404 에러
    """
    html_file = STATIC_DIR / 'register.html'
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    else:
        raise HTTPException(status_code=404, detail="Register page not found")

@router.get("/app", response_class=HTMLResponse) 
async def main_app():
    """
    메인 앱 페이지 (로그인 후)
    
    Returns:
        HTMLResponse: index.html 파일 내용
        
    Raises:
        HTTPException: 파일이 존재하지 않을 경우 404 에러
    """
    html_file = STATIC_DIR / 'index.html'
    if html_file.exists():
        return HTMLResponse(content=html_file.read_text(encoding='utf-8'))
    else:
        raise HTTPException(status_code=404, detail="Main app page not found")

# ==========================================
# API 키 관련 라우트
# ==========================================

@router.post("/api/auth/verify-key")
async def verify_api_key_endpoint(request: ApiKeyRequest):
    """
    API 키 유효성 검사
    
    Args:
        request (ApiKeyRequest): API 키가 포함된 요청 데이터
        
    Returns:
        dict: 검증 결과 메시지와 유효성 플래그
        
    Raises:
        HTTPException: API 키가 유효하지 않을 경우 400 에러
    """
    try:
        is_valid = verify_api_key(request.api_key)
        if is_valid:
            return {"message": "API 키가 유효합니다", "valid": True}
        else:
            raise HTTPException(status_code=400, detail="유효하지 않은 API 키입니다")
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ==========================================
# 사용자 인증 라우트
# ==========================================

@router.post("/api/auth/register", response_model=RegisterResponse)
async def register_user(request: UserRegisterRequest, db: Session = Depends(get_db)):
    """
    사용자 회원가입
    
    Args:
        request (UserRegisterRequest): 회원가입 요청 데이터 (username, email, password)
        db (Session): 데이터베이스 세션
        
    Returns:
        RegisterResponse: 회원가입 성공 메시지와 사용자명
        
    Raises:
        HTTPException: 
            - 사용자명 중복 시 400 에러
            - 이메일 중복 시 400 에러
    """
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
    
    return {"message": "회원가입이 완료되었습니다", "username": new_user.username}

@router.post("/api/auth/login", response_model=TokenResponse)
async def login_user(request: UserLoginRequest, db: Session = Depends(get_db)):
    """
    사용자 로그인
    
    Args:
        request (UserLoginRequest): 로그인 요청 데이터 (username, password)
        db (Session): 데이터베이스 세션
        
    Returns:
        TokenResponse: JWT 액세스 토큰과 토큰 타입
        
    Raises:
        HTTPException: 인증 실패 시 401 에러
    """
    user = authenticate_user(db, request.username, request.password)
    if not user:
        raise HTTPException(
            status_code=401,
            detail="잘못된 사용자 이름 또는 비밀번호입니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # JWT 토큰 생성 (24시간 유효)
    access_token_expires = timedelta(hours=24)
    access_token = create_access_token(
        data={"sub": user.username}, expires_delta=access_token_expires
    )
    
    return {"access_token": access_token, "token_type": "bearer"}

# ==========================================
# 사용자 정보 관리 라우트
# ==========================================

@router.get("/api/me", response_model=UserResponse)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    현재 인증된 사용자 정보 조회
    
    Args:
        current_user (User): JWT 토큰으로 인증된 현재 사용자
        
    Returns:
        UserResponse: 사용자 정보 (ID, username, email, API 키, 가입일)
    """
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        api_key=current_user.api_key,
        created_at=current_user.created_at.isoformat()
    )

@router.put("/api/me/api-key")
async def update_user_api_key(
    request: UserApiKeyUpdateRequest, 
    current_user: User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    """
    사용자 API 키 업데이트
    
    Args:
        request (UserApiKeyUpdateRequest): 새로운 API 키
        current_user (User): JWT 토큰으로 인증된 현재 사용자
        db (Session): 데이터베이스 세션
        
    Returns:
        dict: 업데이트 성공 메시지와 설정 정보
        
    Raises:
        HTTPException: API 키가 유효하지 않을 경우 400 에러
    """
    # API 키 유효성 검사
    is_valid = verify_api_key(request.api_key)
    if not is_valid:
        raise HTTPException(status_code=400, detail="유효하지 않은 API 키입니다")
    
    # 사용자 API 키 업데이트
    current_user.api_key = request.api_key
    db.commit()
    
    return {
        "message": "설정이 저장되었습니다", 
        "selected_model_provider": "gpt", 
        "selected_ollama_model": None
    }