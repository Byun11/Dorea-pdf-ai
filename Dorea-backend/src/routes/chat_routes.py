"""
==========================================
Chat Management Routes Module
==========================================

채팅 관리 관련 모든 라우트를 처리하는 모듈입니다.

기능:
- 채팅 세션 관리 (생성, 조회, 삭제, 이름 변경)
- 채팅 메시지 관리 (조회, 저장)
- 파일별 채팅 세션 조회

Author: Dorea Team  
Last Updated: 2024-08-22
"""

# FastAPI 관련 imports
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import Optional
import uuid

# 내부 모듈 imports  
from database import get_db, User, PDFFile, ChatSession, ChatMessage
from auth import get_current_user

# Pydantic 모델 imports
from pydantic import BaseModel

# ==========================================
# Pydantic 모델 정의 
# ==========================================

class ChatMessageRequest(BaseModel):
    """채팅 메시지 요청 모델"""
    content: str
    selected_segments: list = None

class ChatSessionRenameRequest(BaseModel):
    """채팅 세션 이름 변경 요청 모델"""
    session_name: str

# ==========================================
# 유틸리티 함수
# ==========================================

def is_valid_uuid(uuid_string: str) -> bool:
    """UUID 형식 검증"""
    try:
        uuid_obj = uuid.UUID(uuid_string, version=4)
        return str(uuid_obj) == uuid_string
    except ValueError:
        return False

# ==========================================
# 라우터 설정
# ==========================================

router = APIRouter(prefix="/api", tags=["Chat"])

# ==========================================
# 채팅 관리 라우트 
# ==========================================
# 채팅 세션 관련 API들
@router.get("/files/{file_id}/chats")
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

@router.post("/files/{file_id}/chats")
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

@router.delete("/chats/{session_id}")
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


@router.get("/chats/{session_id}/messages")
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

@router.post("/chats/{session_id}/messages")
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
    db.commit()
    db.refresh(message)
    
    # 세션 업데이트 시간 갱신
    session.updated_at = func.now()
    db.commit()
    
    return {"message": "메시지가 저장되었습니다", "message_id": message.id}

@router.put("/chats/{session_id}/name")
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