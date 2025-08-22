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
Last Updated: 2024-08-22
"""

# FastAPI 관련 imports
from fastapi import APIRouter, HTTPException, Depends, File, UploadFile, Form
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
from database import get_db, User, PDFFile, ChatSession, ChatMessage
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
# 라우터 설정
# ==========================================

router = APIRouter(prefix="/api", tags=["Files"])

# ==========================================
# 파일 관리 라우트 
# ==========================================

@router.get("/files")
async def get_files(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """사용자의 파일 목록 조회 (폴더별 트리 구조로 변경됨 - /folders 사용 권장)"""
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
            "folder_id": file.folder_id,  # 폴더 정보 추가
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
            "folder_id": file.folder_id,  # 폴더 정보 추가
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
    

@router.get("/files/{file_id}/pdf")
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
@router.post("/check-pdf-text")
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



@router.post("/segments")
async def process_segments(
    file: UploadFile = File(...), 
    language: str = Form("ko"),
    file_id: str = Form(...),  # UUID 받기
    use_ocr: bool = Form(False),  # OCR 사용 여부 (기본값: False)
    folder_id: Optional[str] = Form(None),  # 폴더 ID (선택사항)
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
            # 재처리 가능한 상태 (failed, error, completed, waiting, processing)인지 확인
            if existing_file.status not in ['failed', 'error', 'completed', 'waiting', 'processing']:
                print(f"⚠️ 재처리 불가능한 상태 - 파일 ID: {file_id}, 상태: {existing_file.status}")
                raise HTTPException(status_code=400, detail="처리 중인 파일은 재처리할 수 없습니다")
            
            # 재처리 허용 - 기존 파일 삭제하고 새로 생성
            print(f"🔄 재처리 허용 - 파일 ID: {file_id}, 기존 상태: {existing_file.status}")
            db.delete(existing_file)
            db.commit()
        
        # 2. DB에 파일 정보 저장 (UUID 사용)
        # 폴더 ID 처리
        folder_id_int = None
        if folder_id and folder_id.strip():
            try:
                folder_id_int = int(folder_id)
                print(f"📁 폴더 ID 설정: {folder_id_int}")
            except ValueError:
                print(f"⚠️ 잘못된 폴더 ID 형식: {folder_id}")
        
        db_file = PDFFile(
            id=file_id,  # UUID 직접 사용
            user_id=current_user.id,
            filename=file.filename,
            file_path="",  # 나중에 업데이트
            file_size=0,   # 나중에 업데이트
            language=language,
            use_ocr=use_ocr,  # OCR 설정 저장
            folder_id=folder_id_int,  # 폴더 ID 설정
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
@router.post("/files/{file_id}/cancel")
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


# 파일 상태 업데이트 API (재처리 시 사용)
@router.put("/files/{file_id}/status")
async def update_file_status(
    file_id: str,
    status_data: dict,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """파일 상태 업데이트 (재처리용)"""
    try:
        # 파일 존재 및 권한 확인
        file = db.query(PDFFile).filter(
            PDFFile.id == file_id,
            PDFFile.user_id == current_user.id
        ).first()
        if not file:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
        
        new_status = status_data.get('status')
        if new_status not in ['waiting', 'processing', 'completed', 'error', 'failed']:
            raise HTTPException(status_code=400, detail="유효하지 않은 상태입니다.")
        
        # 상태 업데이트
        file.status = new_status
        if new_status == 'waiting':
            file.error_message = None
            file.processed_at = None
        
        db.commit()
        
        return {"message": f"파일 상태가 {new_status}로 변경되었습니다."}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"상태 업데이트 중 오류가 발생했습니다: {str(e)}")

# 파일 재시도 API (재처리는 클라이언트에서 통합 처리)
@router.post("/files/{file_id}/retry")
async def retry_file(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """실패한 파일을 재시도"""
    try:
        # 파일 존재 및 권한 확인
        file = db.query(PDFFile).filter(
            PDFFile.id == file_id,
            PDFFile.user_id == current_user.id
        ).first()
        if not file:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
        
        if file.status not in ['error', 'failed']:
            raise HTTPException(status_code=400, detail="실패한 파일만 재시도할 수 있습니다.")
        
        # 파일 상태를 waiting으로 변경
        file.status = 'waiting'
        file.error_message = None
        file.processed_at = None
        
        db.commit()
        
        return {"message": f"파일 '{file.filename}'이 재시도 대기열에 추가되었습니다."}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"파일 재시도 중 오류가 발생했습니다: {str(e)}")

@router.post("/files/{file_id}/cancel-processing")
async def cancel_processing(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """파일 처리 중단 (waiting -> failed 상태로 변경)"""
    try:
        # 파일 존재 및 권한 확인
        file = db.query(PDFFile).filter(
            PDFFile.id == file_id,
            PDFFile.user_id == current_user.id
        ).first()
        if not file:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
        
        if file.status != 'waiting':
            raise HTTPException(status_code=400, detail="대기 중인 파일만 중단할 수 있습니다.")
        
        # 파일 상태를 failed로 변경
        file.status = 'failed'
        file.error_message = '사용자에 의해 처리가 중단되었습니다.'
        file.processed_at = None
        
        db.commit()
        
        return {"message": f"파일 '{file.filename}' 처리가 중단되었습니다."}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"파일 처리 중단 중 오류가 발생했습니다: {str(e)}")

@router.delete("/files/{file_id}")
async def delete_file_api(
    file_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """파일 삭제"""
    try:
        # 파일 존재 및 권한 확인
        file = db.query(PDFFile).filter(
            PDFFile.id == file_id,
            PDFFile.user_id == current_user.id
        ).first()
        if not file:
            raise HTTPException(status_code=404, detail="파일을 찾을 수 없습니다.")
        
        # 관련 채팅 세션들도 삭제
        chat_sessions = db.query(ChatSession).filter(ChatSession.file_id == file_id).all()
        for session in chat_sessions:
            # 채팅 메시지들 삭제
            db.query(ChatMessage).filter(ChatMessage.session_id == session.id).delete()
            # 채팅 세션 삭제
            db.delete(session)
        
        # 실제 파일 삭제 (파일 시스템에서)
        try:
            import os
            if file.file_path and os.path.exists(file.file_path):
                os.remove(file.file_path)
        except Exception as e:
            print(f"파일 시스템에서 파일 삭제 실패: {e}")
        
        # 데이터베이스에서 파일 기록 삭제
        db.delete(file)
        db.commit()
        
        return {"message": f"파일 '{file.filename}'이 성공적으로 삭제되었습니다."}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"파일 삭제 중 오류가 발생했습니다: {str(e)}")
