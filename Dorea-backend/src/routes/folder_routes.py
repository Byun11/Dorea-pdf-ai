"""
==========================================
Folder Management Routes Module
==========================================

폴더 관리 관련 모든 라우트를 처리하는 모듈입니다.

기능:
- 폴더 트리 조회
- 폴더 생성, 수정, 삭제
- 파일 이동

Author: Dorea Team  
Last Updated: 2024-08-22
"""

# FastAPI 관련 imports
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from typing import Optional
import shutil
from pathlib import Path

# 내부 모듈 imports  
from database import get_db, User, Folder, PDFFile, ChatSession, get_user_files_tree
from auth import get_current_user

# Pydantic 모델 imports (backend.py에서 복사 예정)
from pydantic import BaseModel

# file_routes.py와 동일한 경로 설정
FILES_DIR = Path("/app/DATABASE/files/users")

# ==========================================
# Pydantic 모델 정의 
# ==========================================

class FolderCreateRequest(BaseModel):
    """폴더 생성 요청 모델"""
    name: str
    parent_id: Optional[int] = None
    description: Optional[str] = None

class FolderUpdateRequest(BaseModel):
    """폴더 수정 요청 모델"""
    name: str
    description: Optional[str] = None

class FolderResponse(BaseModel):
    """폴더 응답 모델"""
    id: int
    name: str
    parent_id: Optional[int]
    description: Optional[str]
    created_at: str
    updated_at: str
    type: str = "folder"

class FileMoveRequest(BaseModel):
    """파일 이동 요청 모델"""
    new_folder_id: Optional[int] = None

# ==========================================
# 라우터 설정
# ==========================================

router = APIRouter(prefix="/api", tags=["Folders"])

# ==========================================
# 폴더 관리 라우트 
# ==========================================

# TODO: backend.py에서 다음 함수들을 복사해서 여기에 붙여넣기:

@router.get("/folders")
async def get_folders_tree(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자의 폴더 트리 구조 및 파일 목록 조회"""
    try:
        tree = get_user_files_tree(db, current_user.id)
        return {"data": tree, "message": "폴더 트리를 성공적으로 조회했습니다."}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"폴더 트리 조회 중 오류가 발생했습니다: {str(e)}")

@router.post("/folders", response_model=FolderResponse)
async def create_folder(
    request: FolderCreateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """새 폴더 생성"""
    try:
        # 부모 폴더가 존재하는지 확인 (parent_id가 있는 경우)
        if request.parent_id:
            parent_folder = db.query(Folder).filter(
                Folder.id == request.parent_id,
                Folder.user_id == current_user.id
            ).first()
            if not parent_folder:
                raise HTTPException(status_code=404, detail="부모 폴더를 찾을 수 없습니다.")
        
        # 같은 레벨에 동일한 이름의 폴더가 있는지 확인
        existing_folder = db.query(Folder).filter(
            Folder.user_id == current_user.id,
            Folder.parent_id == request.parent_id,
            Folder.name == request.name
        ).first()
        if existing_folder:
            raise HTTPException(status_code=400, detail="같은 위치에 동일한 이름의 폴더가 이미 존재합니다.")
        
        # 새 폴더 생성
        new_folder = Folder(
            user_id=current_user.id,
            name=request.name,
            parent_id=request.parent_id,
            description=request.description
        )
        
        db.add(new_folder)
        db.commit()
        db.refresh(new_folder)
        
        return FolderResponse(
            id=new_folder.id,
            name=new_folder.name,
            parent_id=new_folder.parent_id,
            description=new_folder.description,
            created_at=new_folder.created_at.isoformat(),
            updated_at=new_folder.updated_at.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"폴더 생성 중 오류가 발생했습니다: {str(e)}")
    
@router.put("/folders/{folder_id}", response_model=FolderResponse)
async def update_folder(
    folder_id: int,
    request: FolderUpdateRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """폴더 정보 수정"""
    try:
        # 폴더 존재 및 권한 확인
        folder = db.query(Folder).filter(
            Folder.id == folder_id,
            Folder.user_id == current_user.id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")
        
        # 같은 레벨에 동일한 이름의 폴더가 있는지 확인 (현재 폴더 제외)
        existing_folder = db.query(Folder).filter(
            Folder.user_id == current_user.id,
            Folder.parent_id == folder.parent_id,
            Folder.name == request.name,
            Folder.id != folder_id
        ).first()
        if existing_folder:
            raise HTTPException(status_code=400, detail="같은 위치에 동일한 이름의 폴더가 이미 존재합니다.")
        
        # 폴더 정보 업데이트
        folder.name = request.name
        if request.description is not None:
            folder.description = request.description
        
        db.commit()
        db.refresh(folder)
        
        return FolderResponse(
            id=folder.id,
            name=folder.name,
            parent_id=folder.parent_id,
            description=folder.description,
            created_at=folder.created_at.isoformat(),
            updated_at=folder.updated_at.isoformat()
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"폴더 수정 중 오류가 발생했습니다: {str(e)}")

@router.delete("/folders/{folder_id}")
async def delete_folder(
    folder_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """폴더와 그 안의 모든 파일을 함께 삭제합니다."""
    try:
        # 폴더 존재 및 권한 확인
        folder = db.query(Folder).filter(
            Folder.id == folder_id,
            Folder.user_id == current_user.id
        ).first()
        if not folder:
            raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")
        
        # 하위 폴더가 있으면 삭제 방지 (기존 로직 유지)
        subfolders = db.query(Folder).filter(Folder.parent_id == folder_id).count()
        if subfolders > 0:
            raise HTTPException(status_code=400, detail="하위 폴더가 있는 폴더는 삭제할 수 없습니다. 먼저 하위 폴더를 비워주세요.")
        
        # 폴더 내 모든 파일 조회
        files_to_delete = db.query(PDFFile).filter(PDFFile.folder_id == folder_id).all()
        deleted_files_count = len(files_to_delete)

        for file in files_to_delete:
            # 1. 연결된 채팅 세션 삭제
            db.query(ChatSession).filter(ChatSession.file_id == file.id).delete(synchronize_session=False)
            
            # 2. 물리적 파일 디렉토리 삭제
            file_dir = FILES_DIR / str(current_user.id) / str(file.id)
            if file_dir.exists():
                shutil.rmtree(file_dir)
            
            # 3. 파일 DB 레코드 삭제
            db.delete(file)
        
        # 모든 파일 삭제 후 폴더 삭제
        db.delete(folder)
        db.commit()
        
        return {"message": f"폴더 '{folder.name}'와(과) 내부 파일 {deleted_files_count}개가 모두 삭제되었습니다."}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"폴더 삭제 중 오류가 발생했습니다: {str(e)}")

@router.patch("/files/{file_id}/move")
async def move_file(
    file_id: str,
    request: FileMoveRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """파일을 다른 폴더로 이동"""
    try:
        # 파일 존재 및 권한 확인
        file = db.query(PDFFile).filter(
            PDFFile.id == file_id,
            PDFFile.user_id == current_user.id
        ).first()
        if not file:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
        
        # 대상 폴더 확인 (new_folder_id가 None이 아닌 경우)
        if request.new_folder_id is not None:
            target_folder = db.query(Folder).filter(
                Folder.id == request.new_folder_id,
                Folder.user_id == current_user.id
            ).first()
            if not target_folder:
                raise HTTPException(status_code=404, detail="대상 폴더를 찾을 수 없습니다.")
        
        # 파일 이동
        old_folder_id = file.folder_id
        file.folder_id = request.new_folder_id
        
        db.commit()
        
        if request.new_folder_id is None:
            move_location = "루트"
        else:
            target_folder = db.query(Folder).filter(Folder.id == request.new_folder_id).first()
            move_location = f"'{target_folder.name}' 폴더"
        
        return {"message": f"파일 '{file.filename}'이 {move_location}로 이동되었습니다."}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"파일 이동 중 오류가 발생했습니다: {str(e)}")

