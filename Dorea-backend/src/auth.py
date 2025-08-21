# auth.py - 인증 시스템 (API 키 + JWT)

from fastapi import HTTPException, Depends, status, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
from openai import OpenAI
from passlib.context import CryptContext
from jose import JWTError, jwt
from datetime import datetime, timedelta
import os
from database import get_db, hash_api_key, User
from typing import Optional

def verify_api_key(api_key: str) -> bool:
    """OpenAI API 키 유효성 검사"""
    try:
        print(f"Creating OpenAI client with API key: {api_key[:10]}...")
        client = OpenAI(api_key=api_key)
        print("OpenAI client created successfully")
        # 간단한 요청으로 키 유효성 확인
        response = client.chat.completions.create(
            model="gpt-4o",
            messages=[{"role": "user", "content": "test"}],
            max_tokens=1
        )
        print("API 키 검증 성공")
        return True
    except Exception as e:
        print(f"API 키 검증 실패 상세 정보:")
        print(f"에러 타입: {type(e).__name__}")
        print(f"에러 메시지: {e}")
        import traceback
        print(f"스택 트레이스: {traceback.format_exc()}")
        return False

# 기존 API 키 인증 (하위 호환성)
async def get_current_api_key(authorization: Optional[str] = Header(None)) -> str:
    """헤더에서 API 키 추출 및 검증 (기존 시스템 호환성)"""
    if not authorization:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API 키가 필요합니다"
        )
    
    try:
        # Bearer 토큰 형식에서 API 키 추출
        if authorization.startswith("Bearer "):
            api_key = authorization[7:]
        else:
            api_key = authorization
            
        if not api_key:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 API 키 형식입니다"
            )
            
        return api_key
        
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="API 키 형식이 올바르지 않습니다"
        )

# 하이브리드 인증: 사용자 또는 API 키
async def get_current_user_or_api_key(user: Optional[User] = None, api_key: Optional[str] = None) -> tuple[Optional[User], Optional[str]]:
    """사용자 또는 API 키 인증 (둘 중 하나 사용 가능)"""
    return user, api_key

async def get_api_key_hash(api_key: str = Depends(get_current_api_key)) -> str:
    """API 키를 해시로 변환하여 반환 (기존 시스템 호환성)"""
    return hash_api_key(api_key)

def create_openai_client(api_key: str) -> OpenAI:
    """OpenAI 클라이언트 생성"""
    return OpenAI(api_key=api_key)

# JWT 설정
SECRET_KEY = "dorea-pdf-ai-secret-key-2024"  # 실제 운영에서는 환경변수로 관리
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30

# 비밀번호 해싱 설정
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

# JWT Bearer 토큰 스키마
security = HTTPBearer()

# 비밀번호 해싱 유틸리티
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """비밀번호 검증"""
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """비밀번호 해싱"""
    return pwd_context.hash(password)

# JWT 토큰 유틸리티
def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """JWT 액세스 토큰 생성"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(hours=24)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def verify_token(token: str) -> dict:
    """JWT 토큰 검증 및 페이로드 반환"""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if username is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="유효하지 않은 토큰입니다",
                headers={"WWW-Authenticate": "Bearer"},
            )
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="유효하지 않은 토큰입니다",
            headers={"WWW-Authenticate": "Bearer"},
        )

# 사용자 인증 의존성
async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security), db: Session = Depends(get_db)) -> User:
    """현재 인증된 사용자 반환"""
    payload = verify_token(credentials.credentials)
    username = payload.get("sub")
    
    user = db.query(User).filter(User.username == username).first()
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="사용자를 찾을 수 없습니다",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return user

# 사용자 인증 (로그인)
def authenticate_user(db: Session, username: str, password: str) -> Optional[User]:
    """사용자 이름과 비밀번호로 사용자 인증"""
    user = db.query(User).filter(User.username == username).first()
    if not user:
        return None
    if not verify_password(password, user.hashed_password):
        return None
    return user