"""
==========================================
Model & Settings Management Routes Module
==========================================

모델 및 설정 관리 관련 모든 라우트를 처리하는 모듈입니다.

기능:
- 사용자 AI 설정 관리 (GPT/Ollama 선택)
- Ollama 모델 관리 (목록, 다운로드, 삭제)
- 로컬 모델 정보 조회

Author: Dorea Team  
Last Updated: 2024-08-22
"""

# FastAPI 관련 imports
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session
from sqlalchemy.sql import func
import json
import httpx
import os

# 내부 모듈 imports  
from database import get_db, User, UserSettings
from auth import get_current_user

# Pydantic 모델 imports
from pydantic import BaseModel

# ==========================================
# Pydantic 모델 정의 
# ==========================================

class UserSettingsRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    selected_model_provider: str
    selected_ollama_model: str = None

class ModelDownloadRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    model_name: str

class ModelDeleteRequest(BaseModel):
    model_config = {"protected_namespaces": ()}
    
    model_name: str

# ==========================================
# 환경 설정
# ==========================================

# OLLAMA API URL
OLLAMA_API_URL = os.getenv("OLLAMA_API_URL", "http://ollama:11434")

# 멀티모달 지원 여부 캐시 (ai_routes와 공유)
multimodal_support_cache = {}

# ==========================================
# 라우터 설정
# ==========================================

router = APIRouter(prefix="/api", tags=["Models"])

# ==========================================
# 모델 및 설정 관리 라우트 
# ==========================================

@router.get("/settings")
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

@router.post("/settings")
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

@router.get("/models/local")
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

@router.post("/models/local/download")
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

@router.delete("/models/local/delete")
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

# TODO: backend.py에서 다음 함수들을 복사해서 여기에 붙여넣기:
# 1. @router.get("/settings") - get_user_settings
# 2. @router.post("/settings") - update_user_settings
# 3. @router.get("/models/local") - get_local_models
# 4. @router.post("/models/local/download") - download_model_stream
# 5. @router.delete("/models/local/delete") - delete_model

# 이 라우트들을 복사할 때:
# - @router.get, @router.post, @router.delete → @router.get, @router.post, @router.delete로 변경
# - "/"로 시작하는 경로에서 "/" 제거 (예: "/settings" → "/settings")