# database.py - SQLite 데이터베이스 모델

from sqlalchemy import create_engine, Column, Integer, String, DateTime, Text, JSON, ForeignKey, Boolean
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, relationship
from sqlalchemy.sql import func
from datetime import datetime
import hashlib
import os

# 데이터베이스 설정
# Docker 환경에서는 /app/DATABASE, 로컬에서는 상위 디렉토리의 DATABASE 사용
if os.path.exists("/app/DATABASE"):
    # Docker 환경
    DB_DIR = "/app/DATABASE"
else:
    # 로컬 환경 - 상위 디렉토리의 DATABASE 폴더 사용
    DB_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "DATABASE")

os.makedirs(DB_DIR, exist_ok=True)
DATABASE_URL = f"sqlite:///{os.path.join(DB_DIR, 'pdf_ai_system.db')}"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# 사용자 모델 - JWT 인증용
class User(Base):
    __tablename__ = "users"
    
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(255), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    api_key = Column(String(255), unique=True, nullable=True)  # OpenAI API 키 (선택사항)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # 관계 설정
    files = relationship("PDFFile", back_populates="user", cascade="all, delete-orphan")
    chat_sessions = relationship("ChatSession", back_populates="user", cascade="all, delete-orphan")

# PDF 파일 모델
class PDFFile(Base):
    __tablename__ = "files"
    
    id = Column(String(36), primary_key=True, index=True)  # UUID 사용
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # 사용자 FK
    api_key_hash = Column(String(64), nullable=True, index=True)  # 마이그레이션 호환성을 위해 임시 유지
    filename = Column(String(255), nullable=False)  # 원본 파일명
    file_path = Column(String(500), nullable=False)  # 저장 경로
    file_size = Column(Integer, nullable=False)  # 바이트 단위
    language = Column(String(10), default="ko")  # OCR 처리 언어
    
    # 처리 상태
    status = Column(String(20), default="waiting")  # waiting, processing, completed, error, cancelled
    error_message = Column(Text, nullable=True)
    
    # 메타데이터
    segments_data = Column(JSON, nullable=True)  # 세그먼트 정보 JSON 저장
    
    # 타임스탬프
    created_at = Column(DateTime, default=func.now())
    processed_at = Column(DateTime, nullable=True)
    
    # 관계 설정
    user = relationship("User", back_populates="files")
    chat_sessions = relationship("ChatSession", back_populates="file", cascade="all, delete-orphan")

# 채팅 세션 모델
class ChatSession(Base):
    __tablename__ = "chat_sessions"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # 사용자 FK
    api_key_hash = Column(String(64), nullable=True, index=True)  # 마이그레이션 호환성을 위해 임시 유지
    file_id = Column(String(36), ForeignKey("files.id"), nullable=False)
    session_name = Column(String(200), nullable=True)  # 사용자가 지정한 세션 이름
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # 관계 설정
    user = relationship("User", back_populates="chat_sessions")
    file = relationship("PDFFile", back_populates="chat_sessions")
    messages = relationship("ChatMessage", back_populates="session", cascade="all, delete-orphan")

# 채팅 메시지 모델
class ChatMessage(Base):
    __tablename__ = "chat_messages"
    
    id = Column(Integer, primary_key=True, index=True)
    session_id = Column(Integer, ForeignKey("chat_sessions.id"), nullable=False)
    content = Column(Text, nullable=False)
    is_user = Column(Boolean, nullable=False)  # True: 사용자 메시지, False: AI 응답
    
    # 세그먼트 관련 정보 (사용자 메시지의 경우)
    selected_segments = Column(JSON, nullable=True)  # 선택된 세그먼트 정보
    
    # API 관련 정보 (AI 응답의 경우)
    api_type = Column(String(20), nullable=True)  # ask, vision, translate, summarize 등
    
    # 타임스탬프
    created_at = Column(DateTime, default=func.now())
    
    # 관계 설정
    session = relationship("ChatSession", back_populates="messages")

# 사용자 설정 모델
class UserSettings(Base):
    __tablename__ = "user_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, unique=True, index=True)  # 사용자 FK
    api_key_hash = Column(String(64), nullable=True, index=True)  # 마이그레이션 호환성을 위해 임시 유지
    
    # 모델 설정
    selected_model_provider = Column(String(20), default="gpt")  # 'gpt' 또는 'ollama'
    selected_ollama_model = Column(String(100), nullable=True)  # Ollama 모델 이름 (예: 'llama3:latest')
    
    # 타임스탬프
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # 관계 설정
    user = relationship("User")

# 유틸리티 함수들
def hash_api_key(api_key: str) -> str:
    """API 키를 SHA256으로 해시화"""
    return hashlib.sha256(api_key.encode()).hexdigest()

def create_database():
    """데이터베이스 테이블 생성"""
    Base.metadata.create_all(bind=engine)
    print("데이터베이스 테이블이 생성되었습니다.")

def get_db():
    """데이터베이스 세션 의존성"""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# 초기화 실행
if __name__ == "__main__":
    create_database()
    print("데이터베이스 설정이 완료되었습니다!")