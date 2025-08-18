# knowledge_manager.py - RAG 임베딩 및 지식 관리 시스템

import json
import os
import logging
import asyncio
from datetime import datetime
from typing import List, Dict, Optional, Any, Tuple
from pathlib import Path

import chromadb
from chromadb.config import Settings
import httpx
import openai

# 기존 데이터베이스 모델 import
from database import SessionLocal, EmbeddingSettings, FileEmbedding, User

# 로깅 설정
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class KnowledgeManager:
    """RAG 지식 관리 시스템"""
    
    def __init__(self, chroma_path: str = "/app/DATABASE/chroma_db"):
        self.chroma_path = chroma_path
        
        # 기존 데이터베이스 세션 사용
        self.db = SessionLocal()
        
        # ChromaDB 클라이언트 초기화 (벡터 저장소로만 사용)
        self.chroma_client = chromadb.PersistentClient(
            path=chroma_path,
            settings=Settings(anonymized_telemetry=False)
        )
        
        # HTTP 클라이언트 (Ollama용)
        self.http_client = httpx.AsyncClient(timeout=30.0)
        
    async def get_user_settings(self, user_id: int) -> Optional[Dict]:
        """사용자 임베딩 설정 조회"""
        settings = self.db.query(EmbeddingSettings).filter_by(user_id=user_id).first()
        if settings:
            return {
                'provider': settings.provider,
                'model_name': settings.model_name,
                'updated_at': settings.updated_at
            }
        return None
    
    async def _get_user_openai_key(self, user_id: int) -> Optional[str]:
        """사용자의 OpenAI API 키 조회"""
        if not user_id:
            return None
            
        user = self.db.query(User).filter_by(id=user_id).first()
        if user and user.api_key:
            return user.api_key
        return None
    
    async def save_user_settings(self, user_id: int, provider: str, model_name: str) -> bool:
        """사용자 임베딩 설정 저장"""
        try:
            settings = self.db.query(EmbeddingSettings).filter_by(user_id=user_id).first()
            
            if settings:
                settings.provider = provider
                settings.model_name = model_name
                settings.updated_at = datetime.utcnow()
            else:
                settings = EmbeddingSettings(
                    user_id=user_id,
                    provider=provider,
                    model_name=model_name
                )
                self.db.add(settings)
            
            self.db.commit()
            logger.info(f"사용자 {user_id} 임베딩 설정 저장: {provider}/{model_name}")
            return True
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"설정 저장 실패: {e}")
            return False
    
    async def test_embedding_model(self, provider: str, model_name: str, user_id: int = None) -> Tuple[bool, str]:
        """임베딩 모델 테스트"""
        test_text = "This is a test sentence for embedding."
        
        try:
            if provider == 'ollama':
                return await self._test_ollama_embedding(model_name, test_text)
            elif provider == 'openai':
                return await self._test_openai_embedding(model_name, test_text, user_id)
            else:
                return False, f"지원하지 않는 provider: {provider}"
                
        except Exception as e:
            logger.error(f"모델 테스트 실패: {e}")
            return False, str(e)
    
    async def _test_ollama_embedding(self, model_name: str, text: str) -> Tuple[bool, str]:
        """Ollama 임베딩 모델 테스트"""
        try:
            url = "http://ollama:11434/api/embeddings"
            payload = {
                "model": model_name,
                "prompt": text
            }
            
            response = await self.http_client.post(url, json=payload)
            
            if response.status_code == 200:
                result = response.json()
                embedding = result.get('embedding')
                if embedding and len(embedding) > 0:
                    return True, f"모델 테스트 성공: {len(embedding)}차원 벡터 생성"
                else:
                    return False, "임베딩 벡터가 비어있습니다"
            else:
                error_msg = response.text
                return False, f"Ollama 요청 실패 (status: {response.status_code}): {error_msg}"
                
        except httpx.ConnectError:
            return False, "Ollama 서버에 연결할 수 없습니다"
        except Exception as e:
            return False, f"Ollama 테스트 중 오류: {str(e)}"
    
    async def _test_openai_embedding(self, model_name: str, text: str, user_id: int = None) -> Tuple[bool, str]:
        """OpenAI 임베딩 모델 테스트"""
        try:
            # 사용자 DB에서 API 키 가져오기
            api_key = await self._get_user_openai_key(user_id) if user_id else os.getenv('OPENAI_API_KEY')
            if not api_key:
                return False, "OpenAI API 키가 설정되지 않았습니다. 시스템 설정에서 OpenAI API 키를 입력해주세요."
            
            client = openai.OpenAI(api_key=api_key)
            response = client.embeddings.create(
                model=model_name,
                input=text
            )
            
            embedding = response.data[0].embedding
            if embedding and len(embedding) > 0:
                return True, f"모델 테스트 성공: {len(embedding)}차원 벡터 생성"
            else:
                return False, "임베딩 벡터가 비어있습니다"
                
        except openai.AuthenticationError:
            return False, "OpenAI API 키가 유효하지 않습니다"
        except openai.NotFoundError:
            return False, f"모델 '{model_name}'을 찾을 수 없습니다"
        except Exception as e:
            return False, f"OpenAI 테스트 중 오류: {str(e)}"
    
    async def get_file_embedding_status(self, user_id: int, file_id: str) -> Optional[Dict]:
        """파일의 임베딩 상태 조회"""
        embedding = self.db.query(FileEmbedding).filter_by(
            user_id=user_id, file_id=file_id
        ).first()
        
        if embedding:
            return {
                'file_id': embedding.file_id,
                'filename': embedding.filename,
                'status': embedding.status,
                'total_chunks': embedding.total_chunks,
                'completed_chunks': embedding.completed_chunks,
                'provider': embedding.provider,
                'model_name': embedding.model_name,
                'created_at': embedding.created_at,
                'updated_at': embedding.updated_at,
                'error_message': embedding.error_message,
                'progress': round((embedding.completed_chunks / embedding.total_chunks * 100) 
                                if embedding.total_chunks > 0 else 0, 1)
            }
        return None
    
    async def get_user_embeddings(self, user_id: int) -> List[Dict]:
        """사용자의 모든 파일 임베딩 상태 조회"""
        embeddings = self.db.query(FileEmbedding).filter_by(user_id=user_id).all()
        
        result = []
        for embedding in embeddings:
            progress = round((embedding.completed_chunks / embedding.total_chunks * 100) 
                           if embedding.total_chunks > 0 else 0, 1)
            
            result.append({
                'file_id': embedding.file_id,
                'filename': embedding.filename,
                'status': embedding.status,
                'total_chunks': embedding.total_chunks,
                'completed_chunks': embedding.completed_chunks,
                'provider': embedding.provider,
                'model_name': embedding.model_name,
                'progress': progress,
                'created_at': embedding.created_at,
                'updated_at': embedding.updated_at,
                'error_message': embedding.error_message
            })
        
        return result
    
    def _load_segments_file(self, user_id: int, file_id: str) -> Optional[List[Dict]]:
        """segments.json 파일 로드"""
        base_path = Path("/app/DATABASE/files/users") / str(user_id) / file_id
        
        # segments 파일 찾기
        segments_files = list(base_path.glob("segments_*.json"))
        if not segments_files:
            logger.error(f"segments 파일을 찾을 수 없습니다: {base_path}")
            return None
        
        segments_file = segments_files[0]  # 첫 번째 파일 사용
        
        try:
            with open(segments_file, 'r', encoding='utf-8') as f:
                segments = json.load(f)
            
            logger.info(f"segments 파일 로드 성공: {segments_file}, {len(segments)}개 세그먼트")
            return segments
            
        except Exception as e:
            logger.error(f"segments 파일 로드 실패: {e}")
            return None
    
    def _filter_valid_segments(self, segments: List[Dict]) -> List[Dict]:
        """임베딩할 유효한 세그먼트 필터링"""
        valid_segments = []
        
        for segment in segments:
            # 빈 텍스트나 헤더/푸터 제외
            if (segment.get('text', '').strip() and 
                segment.get('type') not in ['Page header', 'Page footer']):
                valid_segments.append(segment)
        
        logger.info(f"유효한 세그먼트: {len(valid_segments)}개 (전체: {len(segments)}개)")
        return valid_segments
    
    async def create_file_embedding(self, user_id: int, file_id: str, filename: str) -> bool:
        """파일의 임베딩 생성"""
        try:
            # 사용자 설정 확인
            settings = await self.get_user_settings(user_id)
            if not settings:
                logger.error(f"사용자 {user_id}의 임베딩 설정이 없습니다")
                return False
            
            # segments 파일 로드
            segments = self._load_segments_file(user_id, file_id)
            if not segments:
                return False
            
            # 유효한 세그먼트 필터링
            valid_segments = self._filter_valid_segments(segments)
            if not valid_segments:
                logger.error("임베딩할 유효한 세그먼트가 없습니다")
                return False
            
            # 파일 임베딩 상태 초기화
            await self._init_file_embedding_status(
                user_id, file_id, filename, len(valid_segments), 
                settings['provider'], settings['model_name']
            )
            
            # 백그라운드에서 임베딩 처리
            asyncio.create_task(self._process_embeddings_background(
                user_id, file_id, valid_segments, settings
            ))
            
            return True
            
        except Exception as e:
            logger.error(f"임베딩 생성 실패: {e}")
            await self._update_embedding_status(file_id, 'failed', error_message=str(e))
            return False
    
    async def _init_file_embedding_status(self, user_id: int, file_id: str, filename: str, 
                                        total_chunks: int, provider: str, model_name: str):
        """파일 임베딩 상태 초기화"""
        try:
            # 기존 레코드 삭제 (재생성하는 경우)
            existing = self.db.query(FileEmbedding).filter_by(
                user_id=user_id, file_id=file_id
            ).first()
            
            if existing:
                self.db.delete(existing)
            
            # 새 레코드 생성
            file_embedding = FileEmbedding(
                file_id=file_id,
                user_id=user_id,
                filename=filename,
                status='processing',
                total_chunks=total_chunks,
                completed_chunks=0,
                provider=provider,
                model_name=model_name
            )
            
            self.db.add(file_embedding)
            self.db.commit()
            
            logger.info(f"파일 임베딩 상태 초기화: {file_id}, {total_chunks}개 청크")
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"임베딩 상태 초기화 실패: {e}")
            raise
    
    async def _process_embeddings_background(self, user_id: int, file_id: str, 
                                           segments: List[Dict], settings: Dict):
        """백그라운드에서 임베딩 처리"""
        try:
            logger.info(f"임베딩 처리 시작: {file_id}, {len(segments)}개 세그먼트")
            
            # ChromaDB 컬렉션 준비
            collection_name = f"user_{user_id}_documents"
            collection = self._get_or_create_collection(collection_name)
            
            # 기존 임베딩 삭제 (재생성하는 경우)
            await self._delete_file_chunks_from_chroma(collection, file_id)
            
            provider = settings['provider']
            model_name = settings['model_name']
            
            # 배치 크기 설정 (OpenAI rate limit 고려)
            batch_size = 100 if provider == 'openai' else 20  # OpenAI는 더 큰 배치 허용
            
            for batch_start in range(0, len(segments), batch_size):
                batch_end = min(batch_start + batch_size, len(segments))
                batch_segments = segments[batch_start:batch_end]
                
                try:
                    # 배치 임베딩 생성
                    batch_texts = [segment['text'] for segment in batch_segments]
                    batch_embeddings = await self._generate_batch_embeddings(
                        provider, model_name, batch_texts, user_id
                    )
                    
                    if batch_embeddings and len(batch_embeddings) == len(batch_segments):
                        # ChromaDB에 배치로 저장
                        chunk_ids = []
                        documents = []
                        embeddings = []
                        metadatas = []
                        
                        for i, (segment, embedding_vector) in enumerate(zip(batch_segments, batch_embeddings)):
                            if embedding_vector:
                                chunk_idx = batch_start + i
                                chunk_ids.append(f"{file_id}_{chunk_idx}")
                                documents.append(segment['text'])
                                embeddings.append(embedding_vector)
                                metadatas.append({
                                    'file_id': file_id,
                                    'user_id': str(user_id),
                                    'chunk_index': chunk_idx,
                                    'segment_type': segment.get('type', 'text'),
                                    'page_number': int(segment.get('page_number', 1)),
                                    'page_left': float(segment.get('left', 0)),
                                    'page_top': float(segment.get('top', 0)),
                                    'text_length': len(segment['text'])
                                })
                        
                        if chunk_ids:
                            collection.add(
                                embeddings=embeddings,
                                documents=documents,
                                ids=chunk_ids,
                                metadatas=metadatas
                            )
                        
                        # 진행률 업데이트
                        await self._update_embedding_progress(file_id, batch_end)
                        
                        logger.info(f"배치 {batch_start+1}-{batch_end}/{len(segments)} 임베딩 완료: {file_id}")
                    
                except Exception as e:
                    logger.error(f"배치 {batch_start}-{batch_end} 임베딩 실패: {e}")
                    continue
                
                # 배치 간 대기 (rate limiting 방지)
                if provider == 'openai':
                    await asyncio.sleep(1)  # OpenAI rate limit 방지
                else:
                    await asyncio.sleep(0.1)  # Ollama는 짧게
            
            # 완료 상태로 업데이트
            await self._update_embedding_status(file_id, 'completed')
            logger.info(f"파일 임베딩 완료: {file_id}")
            
        except Exception as e:
            logger.error(f"백그라운드 임베딩 처리 실패: {e}")
            await self._update_embedding_status(file_id, 'failed', error_message=str(e))
    
    async def _update_embedding_progress(self, file_id: str, completed_chunks: int):
        """임베딩 진행률 업데이트"""
        try:
            file_embedding = self.db.query(FileEmbedding).filter_by(file_id=file_id).first()
            if file_embedding:
                file_embedding.completed_chunks = completed_chunks
                file_embedding.progress = (completed_chunks / file_embedding.total_chunks) * 100
                file_embedding.updated_at = datetime.utcnow()
                self.db.commit()
                
                logger.info(f"진행률 업데이트: {file_id} - {completed_chunks}/{file_embedding.total_chunks} ({file_embedding.progress:.1f}%)")
                
        except Exception as e:
            self.db.rollback()
            logger.error(f"진행률 업데이트 실패: {e}")

    async def _update_embedding_status(self, file_id: str, status: str, error_message: str = None):
        """임베딩 상태 업데이트"""
        try:
            file_embedding = self.db.query(FileEmbedding).filter_by(file_id=file_id).first()
            if file_embedding:
                file_embedding.status = status
                file_embedding.updated_at = datetime.utcnow()
                
                if error_message:
                    file_embedding.error_message = error_message
                
                # 완료 시 진행률을 100%로 설정
                if status == 'completed':
                    file_embedding.completed_chunks = file_embedding.total_chunks
                    file_embedding.progress = 100.0
                
                self.db.commit()
                logger.info(f"상태 업데이트: {file_id} -> {status}")
                
        except Exception as e:
            self.db.rollback()
            logger.error(f"상태 업데이트 실패: {e}")

    def _get_or_create_collection(self, collection_name: str):
        """ChromaDB 컬렉션 가져오기 또는 생성"""
        try:
            collection = self.chroma_client.get_collection(collection_name)
        except Exception:
            collection = self.chroma_client.create_collection(
                name=collection_name,
                metadata={"description": f"Document embeddings for {collection_name}"}
            )
        return collection
    
    async def _generate_batch_embeddings(self, provider: str, model_name: str, 
                                       texts: List[str], user_id: int) -> Optional[List[List[float]]]:
        """배치 텍스트 임베딩 생성"""
        try:
            if provider == 'ollama':
                return await self._generate_ollama_batch_embeddings(model_name, texts)
            elif provider == 'openai':
                return await self._generate_openai_batch_embeddings(model_name, texts, user_id)
            else:
                logger.error(f"지원하지 않는 provider: {provider}")
                return None
                
        except Exception as e:
            logger.error(f"배치 임베딩 생성 실패: {e}")
            return None

    async def _generate_embedding(self, provider: str, model_name: str, 
                                text: str, user_id: int) -> Optional[List[float]]:
        """단일 텍스트 임베딩 생성 (호환성 유지)"""
        try:
            batch_result = await self._generate_batch_embeddings(provider, model_name, [text], user_id)
            return batch_result[0] if batch_result and len(batch_result) > 0 else None
                
        except Exception as e:
            logger.error(f"임베딩 생성 실패: {e}")
            return None
    
    async def _generate_ollama_embedding(self, model_name: str, text: str) -> Optional[List[float]]:
        """Ollama로 임베딩 생성"""
        try:
            url = "http://ollama:11434/api/embeddings"
            payload = {
                "model": model_name,
                "prompt": text
            }
            
            response = await self.http_client.post(url, json=payload)
            
            if response.status_code == 200:
                result = response.json()
                return result.get('embedding')
            else:
                logger.error(f"Ollama 임베딩 생성 실패: {response.status_code} - {response.text}")
                return None
                
        except Exception as e:
            logger.error(f"Ollama 임베딩 생성 중 오류: {e}")
            return None
    
    async def _generate_openai_batch_embeddings(self, model_name: str, texts: List[str], user_id: int) -> Optional[List[List[float]]]:
        """OpenAI로 배치 임베딩 생성"""
        try:
            # 사용자 DB에서 API 키 가져오기
            api_key = await self._get_user_openai_key(user_id)
            if not api_key:
                logger.error("OpenAI API 키가 설정되지 않았습니다")
                return None
            
            client = openai.OpenAI(api_key=api_key)
            response = client.embeddings.create(
                model=model_name,
                input=texts  # 리스트로 전달하면 배치 처리
            )
            
            # 결과를 리스트로 변환
            embeddings = [data.embedding for data in response.data]
            return embeddings
            
        except Exception as e:
            logger.error(f"OpenAI 배치 임베딩 생성 중 오류: {e}")
            return None

    async def _generate_ollama_batch_embeddings(self, model_name: str, texts: List[str]) -> Optional[List[List[float]]]:
        """Ollama로 배치 임베딩 생성 (하나씩 처리, rate limit 고려)"""
        try:
            embeddings = []
            url = "http://ollama:11434/api/embeddings"
            
            for text in texts:
                payload = {
                    "model": model_name,
                    "prompt": text
                }
                
                response = await self.http_client.post(url, json=payload)
                
                if response.status_code == 200:
                    result = response.json()
                    embedding = result.get('embedding')
                    if embedding:
                        embeddings.append(embedding)
                    else:
                        logger.error(f"Ollama 임베딩 결과가 비어있습니다: {text[:50]}")
                        embeddings.append(None)
                else:
                    logger.error(f"Ollama 임베딩 생성 실패: {response.status_code} - {response.text}")
                    embeddings.append(None)
                
                # Ollama rate limit 방지
                await asyncio.sleep(0.1)
            
            # None이 아닌 결과만 반환
            valid_embeddings = [emb for emb in embeddings if emb is not None]
            return valid_embeddings if valid_embeddings else None
            
        except Exception as e:
            logger.error(f"Ollama 배치 임베딩 생성 중 오류: {e}")
            return None

    async def _generate_openai_embedding(self, model_name: str, text: str, user_id: int) -> Optional[List[float]]:
        """OpenAI로 단일 임베딩 생성 (호환성 유지)"""
        try:
            batch_result = await self._generate_openai_batch_embeddings(model_name, [text], user_id)
            return batch_result[0] if batch_result and len(batch_result) > 0 else None
            
        except Exception as e:
            logger.error(f"OpenAI 임베딩 생성 중 오류: {e}")
            return None
    
    async def _update_embedding_progress(self, file_id: str, completed_chunks: int):
        """임베딩 진행률 업데이트"""
        try:
            file_embedding = self.db.query(FileEmbedding).filter_by(file_id=file_id).first()
            if file_embedding:
                file_embedding.completed_chunks = completed_chunks
                file_embedding.updated_at = datetime.utcnow()
                self.db.commit()
                
        except Exception as e:
            self.db.rollback()
            logger.error(f"진행률 업데이트 실패: {e}")
    
    async def _update_embedding_status(self, file_id: str, status: str, error_message: str = None):
        """임베딩 상태 업데이트"""
        try:
            file_embedding = self.db.query(FileEmbedding).filter_by(file_id=file_id).first()
            if file_embedding:
                file_embedding.status = status
                file_embedding.updated_at = datetime.utcnow()
                if error_message:
                    file_embedding.error_message = error_message
                self.db.commit()
                
        except Exception as e:
            self.db.rollback()
            logger.error(f"상태 업데이트 실패: {e}")
    
    async def cancel_file_embedding(self, user_id: int, file_id: str) -> bool:
        """파일의 임베딩 처리 취소"""
        try:
            # 임베딩 상태를 취소로 변경
            file_embedding = self.db.query(FileEmbedding).filter_by(
                user_id=user_id, file_id=file_id
            ).first()
            
            if not file_embedding:
                logger.error(f"임베딩 정보를 찾을 수 없습니다: {file_id}")
                return False
            
            if file_embedding.status not in ['processing']:
                logger.error(f"취소할 수 없는 상태입니다: {file_embedding.status}")
                return False
            
            # 상태를 취소로 변경
            file_embedding.status = 'cancelled'
            file_embedding.updated_at = datetime.utcnow()
            file_embedding.error_message = '사용자에 의해 취소됨'
            self.db.commit()
            
            # ChromaDB에서도 부분 데이터 삭제
            collection_name = f"user_{user_id}_documents"
            try:
                collection = self.chroma_client.get_collection(collection_name)
                await self._delete_file_chunks_from_chroma(collection, file_id)
            except Exception as e:
                logger.warning(f"ChromaDB 정리 실패 (무시): {e}")
            
            logger.info(f"임베딩 취소 완료: {file_id}")
            return True
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"임베딩 취소 실패: {e}")
            return False
    
    async def _delete_file_chunks_from_chroma(self, collection, file_id: str):
        """ChromaDB에서 파일의 기존 청크들 삭제"""
        try:
            # 파일과 관련된 모든 임베딩 조회
            results = collection.get(where={"file_id": file_id})
            
            if results['ids']:
                # 기존 임베딩 삭제
                collection.delete(ids=results['ids'])
                logger.info(f"기존 임베딩 삭제: {file_id}, {len(results['ids'])}개")
                
        except Exception as e:
            logger.error(f"기존 임베딩 삭제 실패: {e}")
    
    async def delete_file_embedding(self, user_id: int, file_id: str) -> bool:
        """파일의 임베딩 삭제"""
        try:
            # ChromaDB에서 삭제
            collection_name = f"user_{user_id}_documents"
            try:
                collection = self.chroma_client.get_collection(collection_name)
                await self._delete_file_chunks_from_chroma(collection, file_id)
            except Exception as e:
                logger.warning(f"ChromaDB 삭제 실패 (무시): {e}")
            
            # SQL 테이블에서 삭제
            self.db.query(FileEmbedding).filter_by(
                user_id=user_id, file_id=file_id
            ).delete()
            
            self.db.commit()
            
            logger.info(f"파일 임베딩 삭제 완료: {file_id}")
            return True
            
        except Exception as e:
            self.db.rollback()
            logger.error(f"파일 임베딩 삭제 실패: {e}")
            return False
    
    async def search_similar_documents(self, user_id: int, query: str, 
                                     top_k: int = 5) -> List[Dict]:
        """유사 문서 검색"""
        try:
            # 사용자 설정 확인
            settings = await self.get_user_settings(user_id)
            if not settings:
                logger.error(f"사용자 {user_id}의 임베딩 설정이 없습니다")
                return []
            
            # 쿼리 임베딩 생성
            query_embedding = await self._generate_embedding(
                settings['provider'], settings['model_name'], query, user_id
            )
            
            if not query_embedding:
                logger.error("쿼리 임베딩 생성 실패")
                return []
            
            # ChromaDB에서 검색
            collection_name = f"user_{user_id}_documents"
            try:
                collection = self.chroma_client.get_collection(collection_name)
            except Exception:
                logger.warning(f"컬렉션을 찾을 수 없습니다: {collection_name}")
                return []
            
            results = collection.query(
                query_embeddings=[query_embedding],
                n_results=top_k
            )
            
            # 결과 포맷팅
            similar_docs = []
            
            if results['documents'] and results['documents'][0]:
                for i in range(len(results['documents'][0])):
                    doc = {
                        'text': results['documents'][0][i],
                        'distance': results['distances'][0][i],
                        'metadata': results['metadatas'][0][i] if results['metadatas'] else {},
                        'id': results['ids'][0][i]
                    }
                    similar_docs.append(doc)
            
            logger.info(f"유사 문서 검색 완료: {len(similar_docs)}개 결과")
            return similar_docs
            
        except Exception as e:
            logger.error(f"문서 검색 실패: {e}")
            return []
    
    def close(self):
        """리소스 정리"""
        if hasattr(self, 'db'):
            self.db.close()
        if hasattr(self, 'http_client'):
            asyncio.create_task(self.http_client.aclose())

# 전역 인스턴스
knowledge_manager = KnowledgeManager()