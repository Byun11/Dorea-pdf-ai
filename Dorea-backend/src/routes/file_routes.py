"""
==========================================
File Management Routes Module
==========================================

파일 관리 관련 모든 라우트를 처리하는 모듈입니다.

기능:
- 파일 목록 조회
- 파일 상세 정보 조회
- 파일 삭제
- PDF 파일 다운로드
- 파일 처리 상태 관리 (재시도, 취소, 상태 업데이트)
- 사용자 데이터 전체 삭제
- PDF 텍스트 검사
- 세그먼트 처리 (PDF 업로드 및 분석)

Author: Dorea Team  
Last Updated: 2024-08-24
"""

# FastAPI 관련 imports
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
from typing import Optional
from pathlib import Path
import tempfile
import os
import shutil
import json
import httpx
import uuid

# 내부 모듈 imports  
from database import get_db, User, PDFFile, ChatSession, ChatMessage, SessionLocal
from auth import get_current_user

# Pydantic 모델 imports
from pydantic import BaseModel

# ==========================================
# Pydantic 모델 정의 
# ==========================================

class FileMoveRequest(BaseModel):
    """파일 이동 요청 모델"""
    new_folder_id: Optional[int] = None

class FileStatusRequest(BaseModel):
    """파일 상태 업데이트 요청 모델"""
    status: str

# ==========================================
# 환경 설정
# ==========================================

# HURIDOCS API URL
DOCKER_API_URL = os.getenv("DOCKER_API_URL", "http://huridocs:5060")

# 파일 저장 경로
FILES_DIR = Path("/app/DATABASE/files/users")
FILES_DIR.mkdir(parents=True, exist_ok=True)

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

def check_pdf_has_text(file_path: str) -> dict:
    """PDF 파일에 텍스트가 있는지 검사"""
    try:
        import fitz  # PyMuPDF
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

# ==========================================
# 백그라운드 처리 함수
# ==========================================

async def trigger_processing_chain(db: Session, background_tasks: BackgroundTasks):
    """처리 중인 파일이 없으면, 대기 중인 다음 파일을 처리하도록 체인을 시작합니다."""
    is_processing = db.query(PDFFile).filter(PDFFile.status == 'processing').count() > 0
    if is_processing:
        print("🏃 이미 다른 파일이 처리 중입니다. 새로운 작업을 시작하지 않습니다.")
        return

    next_file = db.query(PDFFile).filter(PDFFile.status == 'waiting').order_by(PDFFile.created_at).first()
    if next_file:
        print(f"🔗 다음 파일 처리 체인 시작: {next_file.id}")
        background_tasks.add_task(process_pdf_file, file_id=next_file.id)

async def process_pdf_file(file_id: str):
    """백그라운드에서 단일 PDF 파일을 처리하고, 완료되면 다음 체인을 호출합니다. (오류 처리 강화)"""
    db: Session = SessionLocal()
    background_tasks = BackgroundTasks()
    db_file = None
    try:
        # 파일을 다시 조회하여 세션에 연결
        db_file = db.query(PDFFile).filter(PDFFile.id == file_id).first()
        if not db_file or db_file.status != 'waiting':
            print(f"⚠️ 처리 중단: 파일 {file_id}을 찾을 수 없거나 'waiting' 상태가 아닙니다.")
            return

        db_file.status = 'processing'
        db.commit()

        file_dir = FILES_DIR / str(db_file.user_id) / str(db_file.id)
        original_path = file_dir / f"original_{db_file.filename}"
        if not original_path.exists():
            raise FileNotFoundError(f"원본 파일을 찾을 수 없습니다: {original_path}")

        async with httpx.AsyncClient(timeout=httpx.Timeout(600.0)) as client:
            segments_response = None
            if db_file.use_ocr:
                print(f"🔍 [File ID: {file_id}] OCR 분석 모드로 처리 중...")
                with open(original_path, "rb") as f:
                    ocr_response = await client.post(
                        f"{DOCKER_API_URL}/ocr",
                        files={"file": (db_file.filename, f, "application/pdf")},
                        data={"language": db_file.language}
                    )
                if ocr_response.status_code != 200:
                    raise Exception(f"OCR 처리 실패: {ocr_response.status_code} - {ocr_response.text}")
                
                ocr_content = ocr_response.content
                ocr_path = file_dir / f"ocr_{db_file.filename}"
                ocr_path.write_bytes(ocr_content)
                print(f"✅ [File ID: {file_id}] OCR 처리 완료 및 저장: {ocr_path}")
                
                with open(ocr_path, "rb") as f_ocr:
                    segments_response = await client.post(
                        f"{DOCKER_API_URL}/",
                        files={"file": (db_file.filename, f_ocr, "application/pdf")},
                        data={"fast": "false"}
                    )
            else:
                print(f"⚡ [File ID: {file_id}] 빠른 분석 모드로 처리 중...")
                with open(original_path, "rb") as f:
                    segments_response = await client.post(
                        f"{DOCKER_API_URL}/",
                        files={"file": (db_file.filename, f, "application/pdf")},
                        data={"fast": "false"}
                    )

            if segments_response and segments_response.status_code == 200:
                segments_data = segments_response.json()
                
                # 파일 이름에서 확장자 제거 후 .json 추가 (버그 수정)
                file_stem = Path(db_file.filename).stem
                segments_path = file_dir / f"segments_{file_stem}.json"
                with open(segments_path, "w", encoding="utf-8") as f:
                    json.dump(segments_data, f, ensure_ascii=False, indent=2)
                
                print(f"✅ [File ID: {file_id}] 세그먼트 추출 완료: {len(segments_data)}개")
                db_file.status = "completed"
                db_file.processed_at = func.now()
                db_file.segments_data = segments_data
                db.commit()
                
                try:
                    first_session = ChatSession(
                        user_id=db_file.user_id,
                        file_id=db_file.id,
                        session_name=f"{db_file.filename} 채팅"
                    )
                    db.add(first_session)
                    db.commit()
                    print(f"✅ [File ID: {file_id}] 첫 번째 채팅 세션 자동 생성 완료")
                except Exception as session_error:
                    print(f"⚠️ [File ID: {file_id}] 세션 생성 오류 (파일 처리는 성공): {session_error}")
            else:
                error_detail = segments_response.text if segments_response else "세그먼트 분석 서비스에서 응답이 없습니다."
                raise Exception(f"세그먼트 추출 실패: {error_detail}")

    except Exception as e:
        print(f"❌ [File ID: {file_id}] 전체 처리 오류: {e}")
        db.rollback() # 오류 발생 시 트랜잭션 롤백
        try:
            # 롤백 후 새로운 상태 커밋
            db_file = db.query(PDFFile).filter(PDFFile.id == file_id).first() # 세션에 객체 다시 연결
            if db_file:
                db_file.status = "failed"
                db_file.error_message = str(e)
                db.commit()
        except Exception as e2:
            print(f"❌ [File ID: {file_id}] 오류 상태 업데이트 실패: {e2}")
            db.rollback()
    finally:
        # 현재 작업이 끝나면, 다음 작업이 있는지 확인하고 체인을 시작
        await trigger_processing_chain(db, background_tasks)
        await background_tasks()
        db.close()

# ==========================================
# 라우터 설정
# ==========================================

router = APIRouter(prefix="/api", tags=["Files"])

# ==========================================
# 파일 관리 라우트 
# ==========================================

@router.post("/files/upload")
async def upload_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...), 
    language: str = Form("ko"),
    use_ocr: bool = Form(False),
    folder_id: Optional[str] = Form(None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    파일을 업로드하고 DB에 'waiting' 상태로 등록 후, 백그라운드 처리를 시작합니다.
    """
    # 1. DB에 파일 정보 저장
    folder_id_int = None
    if folder_id and folder_id.strip():
        try:
            folder_id_int = int(folder_id)
        except ValueError:
            print(f"⚠️ 잘못된 폴더 ID 형식: {folder_id}")

    db_file = PDFFile(
        id=str(uuid.uuid4()),  # 서버에서 UUID 생성
        user_id=current_user.id,
        filename=file.filename,
        file_path="",
        file_size=0,
        language=language,
        use_ocr=use_ocr,
        folder_id=folder_id_int,
        status="waiting"  # 초기 상태는 'waiting'
    )
    db.add(db_file)
    db.commit()
    db.refresh(db_file)
    
    print(f"📥 [File ID: {db_file.id}] 파일 등록 완료, 'waiting' 상태로 설정.")

    # 2. 디스크에 파일 저장
    try:
        file_dir = FILES_DIR / str(current_user.id) / str(db_file.id)
        file_dir.mkdir(parents=True, exist_ok=True)
        original_path = file_dir / f"original_{file.filename}"
        
        content = await file.read()
        original_path.write_bytes(content)

        # 3. 파일 경로 및 크기 DB 업데이트
        db_file.file_path = str(original_path)
        db_file.file_size = len(content)
        db.commit()
        db.refresh(db_file)
    except Exception as e:
        db_file.status = "failed"
        db_file.error_message = f"파일 저장 실패: {e}"
        db.commit()
        raise HTTPException(status_code=500, detail=f"파일을 디스크에 저장하는 중 오류 발생: {e}")

    # 4. 백그라운드 처리 체인 시작을 시도
    await trigger_processing_chain(db, background_tasks)
    await background_tasks()

    # 5. 즉시 클라이언트에 파일 정보 반환
    return db_file


@router.get("/files")
async def get_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자의 파일 목록 조회 (폴더별 트리 구조로 변경됨 - /folders 사용 권장)"""
    files = db.query(PDFFile).filter(
        PDFFile.user_id == current_user.id
    ).order_by(PDFFile.created_at.desc()).all()
    
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
            "folder_id": file.folder_id,
            "created_at": file.created_at.isoformat() if file.created_at else None,
            "processed_at": file.processed_at.isoformat() if file.processed_at else None
        }
        file_list.append(file_data)
    
    return {"files": file_list}

@router.get("/files/{file_id}")
async def get_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """특정 파일 정보 조회"""
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
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
            "use_ocr": file.use_ocr,
            "status": file.status,
            "error_message": file.error_message,
            "segments_data": file.segments_data,
            "folder_id": file.folder_id,
            "created_at": file.created_at.isoformat() if file.created_at else None,
            "processed_at": file.processed_at.isoformat() if file.processed_at else None
        }
    }

@router.delete("/files/{file_id}")
async def delete_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """파일 삭제 (DB + 물리 파일)"""
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
    file = db.query(PDFFile).filter(
        PDFFile.id == file_id,
        PDFFile.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    try:
        chat_sessions = db.query(ChatSession).filter(ChatSession.file_id == file_id).all()
        for session in chat_sessions:
            db.delete(session)
        
        file_dir = FILES_DIR / str(current_user.id) / str(file_id)
        if file_dir.exists():
            shutil.rmtree(file_dir)
            print(f"✅ 물리 파일 디렉토리 삭제: {file_dir}")
        
        db.delete(file)
        db.commit()
        
        return {"message": "파일이 성공적으로 삭제되었습니다", "file_id": file_id}
        
    except Exception as e:
        db.rollback()
        print(f"❌ 파일 삭제 오류: {e}")
        raise HTTPException(status_code=500, detail=f"파일 삭제 중 오류: {str(e)}")

@router.post("/files/{file_id}/retry")
async def retry_file_processing(
    file_id: str,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """실패한 파일 재처리"""
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")

    file = db.query(PDFFile).filter(PDFFile.id == file_id, PDFFile.user_id == current_user.id).first()
    if not file:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    if file.status not in ['failed', 'error', 'completed']:
        raise HTTPException(status_code=400, detail="재처리가 불가능한 파일 상태입니다.")

    # 재처리를 위해 물리적 파일이 존재하는지 확인
    file_path = FILES_DIR / str(current_user.id) / str(file.id) / f"original_{file.filename}"
    if not file_path.exists():
        raise HTTPException(status_code=400, detail="원본 파일을 찾을 수 없어 재처리할 수 없습니다. 파일을 다시 업로드해주세요.")

    file.status = 'waiting'
    file.error_message = None
    db.commit()

    # 처리 체인 시작을 시도
    await trigger_processing_chain(db, background_tasks)
    await background_tasks()
    print(f"🔄 [File ID: {file.id}] 파일 재처리 대기열에 추가됨.")

    return {"message": "파일 재처리가 대기열에 추가되었습니다.", "file_id": file.id}
    

@router.get("/files/{file_id}/pdf")
async def get_pdf_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """PDF 파일 다운로드"""
    if not is_valid_uuid(file_id):
        raise HTTPException(status_code=400, detail="잘못된 파일 ID 형식입니다")
    
    file = db.query(PDFFile).filter(
        PDFFile.id == file_id,
        PDFFile.user_id == current_user.id
    ).first()
    
    if not file:
        raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다")
    
    file_dir = FILES_DIR / str(current_user.id) / str(file_id)
    ocr_path = file_dir / f"ocr_{file.filename}"
    original_path = file_dir / f"original_{file.filename}"
    
    if ocr_path.exists():
        return FileResponse(path=str(ocr_path), media_type="application/pdf", filename=file.filename)
    elif original_path.exists():
        return FileResponse(path=str(original_path), media_type="application/pdf", filename=file.filename)
    else:
        raise HTTPException(status_code=404, detail="PDF 파일을 찾을 수 없습니다")
    
@router.delete("/user-data")
async def delete_user_data(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자 데이터 전체 삭제 (모든 파일 + 채팅)"""
    try:
        files = db.query(PDFFile).filter(PDFFile.user_id == current_user.id).all()
        
        for file in files:
            chat_sessions = db.query(ChatSession).filter(ChatSession.file_id == file.id).all()
            for session in chat_sessions:
                db.delete(session)
        
        for file in files:
            db.delete(file)
        
        user_dir = FILES_DIR / str(current_user.id)
        if user_dir.exists():
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
@router.post("/check-pdf-text")
async def check_pdf_text_endpoint(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user)
):
    """업로드된 PDF 파일에 텍스트가 있는지 검사"""
    
    if not file.filename.lower().endswith('.pdf'):
        raise HTTPException(status_code=400, detail="PDF 파일만 업로드 가능합니다")
    
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix='.pdf') as temp_file:
            content = await file.read()
            temp_file.write(content)
            temp_path = temp_file.name
        
        result = check_pdf_has_text(temp_path)
        
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
