# knowledge_routes.py - RAG 지식 관리 API 라우터

from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel
from typing import List, Dict, Optional, Any
import logging

from auth import get_current_user
from knowledge_manager import knowledge_manager

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/knowledge", tags=["knowledge"])

# Pydantic 모델들
class EmbeddingSettingsRequest(BaseModel):
    model: str  # 'ollama' or 'openai'
    ollama_model: Optional[str] = None
    openai_model: Optional[str] = None

class EmbeddingSettingsResponse(BaseModel):
    provider: str
    model_name: str
    updated_at: str

class EmbeddingTestRequest(BaseModel):
    provider: str
    model: str

class EmbeddingTestResponse(BaseModel):
    success: bool
    message: str

class FileEmbeddingResponse(BaseModel):
    file_id: str
    filename: str
    status: str
    total_chunks: int
    completed_chunks: int
    progress: float
    provider: Optional[str]
    model_name: Optional[str]
    created_at: str
    updated_at: str
    error_message: Optional[str]

class CreateEmbeddingRequest(BaseModel):
    filename: str

class SearchRequest(BaseModel):
    query: str
    top_k: Optional[int] = 5
    file_id: Optional[str] = None  # 특정 파일로 검색 제한

class SearchResult(BaseModel):
    text: str
    distance: float
    metadata: Dict[str, Any]
    id: str

class SearchResponse(BaseModel):
    results: List[SearchResult]
    total: int

@router.post("/settings")
async def save_embedding_settings(
    request: EmbeddingSettingsRequest,
    current_user = Depends(get_current_user)
):
    """임베딩 설정 저장"""
    try:
        user_id = current_user.id
        
        # 모델명 결정
        if request.model == 'ollama':
            if not request.ollama_model:
                raise HTTPException(
                    status_code=400,
                    detail="Ollama 모델명이 필요합니다"
                )
            model_name = request.ollama_model
        elif request.model == 'openai':
            if not request.openai_model:
                raise HTTPException(
                    status_code=400,
                    detail="OpenAI 모델명이 필요합니다"
                )
            model_name = request.openai_model
        else:
            raise HTTPException(
                status_code=400,
                detail="지원하지 않는 모델 타입입니다"
            )
        
        # 설정 저장
        success = await knowledge_manager.save_user_settings(
            user_id, request.model, model_name
        )
        
        if success:
            return {"message": "설정이 저장되었습니다"}
        else:
            raise HTTPException(
                status_code=500,
                detail="설정 저장에 실패했습니다"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"설정 저장 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )

@router.get("/settings")
async def get_embedding_settings(
    current_user = Depends(get_current_user)
):
    """임베딩 설정 조회"""
    try:
        user_id = current_user.id
        settings = await knowledge_manager.get_user_settings(user_id)
        
        if settings:
            return {
                "provider": settings['provider'],
                "model_name": settings['model_name'],
                "updated_at": settings['updated_at'].isoformat(),
                "configured": True
            }
        else:
            return {
                "provider": None,
                "model_name": None,
                "updated_at": None,
                "configured": False
            }
            
    except Exception as e:
        logger.error(f"설정 조회 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )

@router.post("/test-embedding-model")
async def test_embedding_model(
    request: EmbeddingTestRequest,
    current_user = Depends(get_current_user)
) -> EmbeddingTestResponse:
    """임베딩 모델 테스트"""
    try:
        user_id = current_user.id
        success, message = await knowledge_manager.test_embedding_model(
            request.provider, request.model, user_id
        )
        
        return EmbeddingTestResponse(
            success=success,
            message=message
        )
        
    except Exception as e:
        logger.error(f"모델 테스트 중 오류: {e}")
        return EmbeddingTestResponse(
            success=False,
            message=f"테스트 중 오류가 발생했습니다: {str(e)}"
        )

@router.get("/embeddings")
async def get_user_embeddings(
    current_user = Depends(get_current_user)
) -> Dict[str, List[FileEmbeddingResponse]]:
    """사용자의 모든 파일 임베딩 상태 조회"""
    try:
        user_id = current_user.id
        embeddings = await knowledge_manager.get_user_embeddings(user_id)
        
        embedding_responses = []
        for embedding in embeddings:
            response = FileEmbeddingResponse(
                file_id=embedding['file_id'],
                filename=embedding['filename'],
                status=embedding['status'],
                total_chunks=embedding['total_chunks'],
                completed_chunks=embedding['completed_chunks'],
                progress=embedding['progress'],
                provider=embedding.get('provider'),
                model_name=embedding.get('model_name'),
                created_at=embedding['created_at'].isoformat(),
                updated_at=embedding['updated_at'].isoformat(),
                error_message=embedding.get('error_message')
            )
            embedding_responses.append(response)
        
        return {"embeddings": embedding_responses}
        
    except Exception as e:
        logger.error(f"임베딩 목록 조회 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )

@router.post("/embeddings/{file_id}")
async def create_file_embedding(
    file_id: str,
    request: CreateEmbeddingRequest,
    current_user = Depends(get_current_user)
):
    """파일의 임베딩 생성"""
    try:
        user_id = current_user.id
        
        # 파일 존재 확인 (segments 파일 기준)
        from pathlib import Path
        base_path = Path("/app/DATABASE/files/users") / str(user_id) / file_id
        segments_files = list(base_path.glob("segments_*.json"))
        
        if not segments_files:
            raise HTTPException(
                status_code=404,
                detail="처리된 PDF 파일을 찾을 수 없습니다"
            )
        
        # 임베딩 생성 시작
        success = await knowledge_manager.create_file_embedding(
            user_id, file_id, request.filename
        )
        
        if success:
            return {"message": "임베딩 생성이 시작되었습니다"}
        else:
            raise HTTPException(
                status_code=500,
                detail="임베딩 생성에 실패했습니다"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"임베딩 생성 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )

@router.get("/embeddings/{file_id}")
async def get_file_embedding_status(
    file_id: str,
    current_user = Depends(get_current_user)
) -> Optional[FileEmbeddingResponse]:
    """파일의 임베딩 상태 조회"""
    try:
        user_id = current_user.id
        embedding = await knowledge_manager.get_file_embedding_status(user_id, file_id)
        
        if embedding:
            return FileEmbeddingResponse(
                file_id=embedding['file_id'],
                filename=embedding['filename'],
                status=embedding['status'],
                total_chunks=embedding['total_chunks'],
                completed_chunks=embedding['completed_chunks'],
                progress=embedding['progress'],
                provider=embedding.get('provider'),
                model_name=embedding.get('model_name'),
                created_at=embedding['created_at'].isoformat(),
                updated_at=embedding['updated_at'].isoformat(),
                error_message=embedding.get('error_message')
            )
        else:
            return None
            
    except Exception as e:
        logger.error(f"임베딩 상태 조회 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )

@router.delete("/embeddings/{file_id}")
async def delete_file_embedding(
    file_id: str,
    current_user = Depends(get_current_user)
):
    """파일의 임베딩 삭제"""
    try:
        user_id = current_user.id
        
        success = await knowledge_manager.delete_file_embedding(user_id, file_id)
        
        if success:
            return {"message": "임베딩이 삭제되었습니다"}
        else:
            raise HTTPException(
                status_code=500,
                detail="임베딩 삭제에 실패했습니다"
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"임베딩 삭제 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )

@router.post("/embeddings/{file_id}/cancel")
async def cancel_file_embedding(
    file_id: str,
    current_user = Depends(get_current_user)
):
    """파일의 임베딩 처리 취소"""
    try:
        user_id = current_user.id
        
        success = await knowledge_manager.cancel_file_embedding(user_id, file_id)
        
        if success:
            return {"message": "임베딩 처리가 취소되었습니다"}
        else:
            raise HTTPException(
                status_code=400,
                detail="임베딩 취소에 실패했습니다. 처리 중인 상태가 아니거나 이미 완료되었을 수 있습니다."
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"임베딩 취소 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )

@router.post("/reembed-inconsistent")
async def reembed_inconsistent_files(
    current_user = Depends(get_current_user)
):
    """모델 불일치 파일들 재임베딩"""
    try:
        user_id = current_user.id
        result = await knowledge_manager.reembed_inconsistent_files(user_id)
        
        if result["success"]:
            return result
        else:
            raise HTTPException(
                status_code=400,
                detail=result["message"]
            )
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"재임베딩 요청 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )

@router.post("/search")
async def search_documents(
    request: SearchRequest,
    current_user = Depends(get_current_user)
) -> SearchResponse:
    """문서 벡터 검색"""
    try:
        user_id = current_user.id
        
        # 쿼리 검증
        if not request.query.strip():
            raise HTTPException(
                status_code=400,
                detail="검색 쿼리가 비어있습니다"
            )
        
        # 벡터 검색 수행 (선택적으로 특정 파일로 제한)
        logger.info(f"🔍 벡터 검색 요청: user_id={user_id}, query='{request.query}', file_id={request.file_id}")
        results = await knowledge_manager.search_similar_documents(
            user_id, request.query, request.top_k, request.file_id
        )
        logger.info(f"🔍 벡터 검색 결과: {len(results)}개 문서 발견")
        
        # 결과 포맷팅
        search_results = []
        for result in results:
            search_result = SearchResult(
                text=result['text'],
                distance=result['distance'],
                metadata=result['metadata'],
                id=result['id']
            )
            search_results.append(search_result)
        
        return SearchResponse(
            results=search_results,
            total=len(search_results)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"문서 검색 중 오류: {e}")
        raise HTTPException(
            status_code=500,
            detail="서버 내부 오류가 발생했습니다"
        )


# 헬스체크 엔드포인트
@router.get("/health")
async def knowledge_health_check():
    """지식 관리 시스템 상태 확인"""
    try:
        # ChromaDB 연결 확인
        collections = knowledge_manager.chroma_client.list_collections()
        
        return {
            "status": "healthy",
            "chroma_collections": len(collections),
            "message": "지식 관리 시스템이 정상 작동 중입니다"
        }
        
    except Exception as e:
        logger.error(f"헬스체크 실패: {e}")
        raise HTTPException(
            status_code=503,
            detail="지식 관리 시스템에 문제가 있습니다"
        )