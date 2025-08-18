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
    folders = relationship("Folder", back_populates="user", cascade="all, delete-orphan")

# PDF 파일 모델
class PDFFile(Base):
    __tablename__ = "files"
    
    id = Column(String(36), primary_key=True, index=True)  # UUID 사용
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # 사용자 FK
    folder_id = Column(Integer, ForeignKey("folders.id"), nullable=True, index=True)  # 폴더 FK (NULL이면 루트)
    api_key_hash = Column(String(64), nullable=True, index=True)  # 마이그레이션 호환성을 위해 임시 유지
    filename = Column(String(255), nullable=False)  # 원본 파일명
    file_path = Column(String(500), nullable=False)  # 저장 경로
    file_size = Column(Integer, nullable=False)  # 바이트 단위
    language = Column(String(10), default="ko")  # OCR 처리 언어
    
    # 처리 상태
    status = Column(String(20), default="waiting")  # waiting, processing, completed, error, cancelled
    error_message = Column(Text, nullable=True)
    
    # OCR 설정
    use_ocr = Column(Boolean, default=True, nullable=False)  # OCR 사용 여부
    
    # 메타데이터
    segments_data = Column(JSON, nullable=True)  # 세그먼트 정보 JSON 저장
    
    # 타임스탬프
    created_at = Column(DateTime, default=func.now())
    processed_at = Column(DateTime, nullable=True)
    
    # 관계 설정
    user = relationship("User", back_populates="files")
    folder = relationship("Folder", back_populates="files")
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

# 폴더 모델
class Folder(Base):
    __tablename__ = "folders"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)  # 사용자 FK
    name = Column(String(255), nullable=False)  # 폴더 이름
    parent_id = Column(Integer, ForeignKey("folders.id"), nullable=True, index=True)  # 부모 폴더 FK (NULL이면 루트)
    
    # 메타데이터
    description = Column(Text, nullable=True)  # 폴더 설명 (선택사항)
    
    # 타임스탬프
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # 관계 설정
    user = relationship("User", back_populates="folders")
    parent = relationship("Folder", remote_side=[id], backref="children")  # 자기 참조
    files = relationship("PDFFile", back_populates="folder")
    
    def __repr__(self):
        return f"<Folder(id={self.id}, name='{self.name}', user_id={self.user_id}, parent_id={self.parent_id})>"

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

def get_folder_tree(db: SessionLocal, user_id: int, parent_id: int = None):
    """사용자의 폴더 트리 구조를 재귀적으로 가져옴"""
    folders = db.query(Folder).filter(
        Folder.user_id == user_id,
        Folder.parent_id == parent_id
    ).order_by(Folder.name).all()
    
    result = []
    for folder in folders:
        folder_data = {
            "id": folder.id,
            "name": folder.name,
            "parent_id": folder.parent_id,
            "created_at": folder.created_at.isoformat(),
            "updated_at": folder.updated_at.isoformat(),
            "type": "folder",
            "children": get_folder_tree(db, user_id, folder.id),
            "files": []
        }
        
        # 폴더 내 파일들 추가
        files = db.query(PDFFile).filter(
            PDFFile.user_id == user_id,
            PDFFile.folder_id == folder.id
        ).order_by(PDFFile.filename).all()
        
        for file in files:
            folder_data["files"].append({
                "id": file.id,
                "filename": file.filename,
                "file_size": file.file_size,
                "status": file.status,
                "language": file.language,
                "use_ocr": file.use_ocr,
                "created_at": file.created_at.isoformat(),
                "type": "file"
            })
        
        result.append(folder_data)
    
    return result

def get_user_files_tree(db: SessionLocal, user_id: int):
    """사용자의 전체 파일 트리 구조를 가져옴 (루트 파일 포함)"""
    # 폴더 트리 가져오기
    tree = get_folder_tree(db, user_id)
    
    # 루트 레벨 파일들 추가
    root_files = db.query(PDFFile).filter(
        PDFFile.user_id == user_id,
        PDFFile.folder_id.is_(None)
    ).order_by(PDFFile.filename).all()
    
    for file in root_files:
        tree.append({
            "id": file.id,
            "filename": file.filename,
            "file_size": file.file_size,
            "status": file.status,
            "language": file.language,
            "use_ocr": file.use_ocr,
            "created_at": file.created_at.isoformat(),
            "type": "file",
            "folder_id": None
        })
    
    return tree

def validate_folder_move(db: SessionLocal, folder_id: int, new_parent_id: int = None):
    """폴더 이동이 순환 참조를 만들지 않는지 검증"""
    if new_parent_id is None:
        return True
    
    if folder_id == new_parent_id:
        return False
    
    # 새 부모의 모든 상위 폴더들을 확인하여 순환 참조 검사
    current_parent_id = new_parent_id
    while current_parent_id:
        if current_parent_id == folder_id:
            return False
        
        parent_folder = db.query(Folder).filter(Folder.id == current_parent_id).first()
        if not parent_folder:
            break
        current_parent_id = parent_folder.parent_id
    
    return True

# === RAG 관련 모델들 ===

# RAG 임베딩 설정 모델
class EmbeddingSettings(Base):
    __tablename__ = "embedding_settings"
    
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    provider = Column(String(50), nullable=False)  # 'ollama' or 'openai'
    model_name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    
    # 관계 설정
    user = relationship("User")

# 파일별 임베딩 상태 모델
class FileEmbedding(Base):
    __tablename__ = "file_embeddings"
    
    file_id = Column(String(36), ForeignKey("files.id"), primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    filename = Column(String(255), nullable=False)
    status = Column(String(20), default='none')  # none, processing, completed, failed
    total_chunks = Column(Integer, default=0)
    completed_chunks = Column(Integer, default=0)
    provider = Column(String(50))
    model_name = Column(String(100))
    created_at = Column(DateTime, default=func.now())
    updated_at = Column(DateTime, default=func.now(), onupdate=func.now())
    error_message = Column(Text)
    
    # 관계 설정
    file = relationship("PDFFile")
    user = relationship("User")

# 초기화 실행
if __name__ == "__main__":
    create_database()
    print("데이터베이스 설정이 완료되었습니다!")