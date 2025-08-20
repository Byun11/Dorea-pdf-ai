/* =====================================================
   Dorea File Manager Module - File Upload & Queue Management
   ===================================================== */

import { fetchApi, showNotification, formatFileSize, getLanguageName, getStatusText } from './utils.js';
import { showUploadModal, closeUploadModal } from './ui.js';

// 동적 API URL 설정 (현재 호스트 기준)
const API_URL = window.location.origin;

// 파일 관리 변수
let fileQueue = [];
let currentFileId = null;
let processingQueue = false;
let processingControllers = new Map(); // 파일 처리 취소용 AbortController

// 파일 매니저 초기화
export function init() {
    setupFileEventListeners();
    loadUserFiles();
}

// 파일 이벤트 리스너 설정
function setupFileEventListeners() {
    const uploadZone = document.getElementById('uploadZone');
    const fileInput = document.getElementById('fileInput');
    const sidebar = document.querySelector('.sidebar');

    if (uploadZone) {
        uploadZone.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadZone.classList.add('dragover');
        });

        uploadZone.addEventListener('dragleave', () => {
            uploadZone.classList.remove('dragover');
        });

        uploadZone.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadZone.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
            if (files.length > 0) {
                handleMultipleFiles(files);
            }
        });
    }

    // 사이드바에 드래그 앤 드롭 기능 추가
    if (sidebar) {
        sidebar.addEventListener('dragover', (e) => {
            e.preventDefault();
            sidebar.classList.add('dragover');
        });

        sidebar.addEventListener('dragleave', (e) => {
            // 사이드바 영역을 완전히 벗어났을 때만 dragover 클래스 제거
            if (!sidebar.contains(e.relatedTarget)) {
                sidebar.classList.remove('dragover');
            }
        });

        sidebar.addEventListener('drop', (e) => {
            e.preventDefault();
            sidebar.classList.remove('dragover');
            const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
            if (files.length > 0) {
                handleMultipleFiles(files);
            }
        });
    }

    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const files = Array.from(e.target.files);
            if (files.length > 0) {
                handleMultipleFiles(files);
            }
        });
    }
}

// 사용자 파일 목록 로드 (폴더 트리 매니저로 위임)
async function loadUserFiles() {
    // 폴더 트리 매니저가 있으면 해당 매니저 사용
    if (window.folderTreeManager) {
        await window.folderTreeManager.loadFolderTree();
        return;
    }
    
    // 폴백: 기존 방식으로 파일 목록 로드
    const token = localStorage.getItem('token');
    if (!token) return;

    try {
        const response = await fetchApi('/files');

        if (response.ok) {
            const data = await response.json();

            fileQueue = data.files.map(file => ({
                id: file.id,
                file: null,
                name: file.filename,
                language: file.language,
                status: file.status,
                segments: file.segments_data || [],
                error: file.error_message,
                file_size: file.file_size,
                created_at: file.created_at
            }));

            
            // waiting 상태 파일들이 있으면 자동으로 처리 시작
            const waitingFiles = fileQueue.filter(f => f.status === 'waiting');
            if (waitingFiles.length > 0) {
                console.log(`📋 ${waitingFiles.length}개의 대기 중인 파일 발견, 처리 시작`);
                startBackgroundProcessing();
            }
        }
    } catch (error) {
        console.error('파일 목록 로드 오류:', error);
    }
}

// 다중 파일 처리
export function handleMultipleFiles(files) {
    console.log('📂 다중 파일 처리 시작:', files.length + '개');
    showUploadModal(files);
}

// 파일 처리 시작
export async function processFiles() {
    const files = window.pendingFiles;
    if (!files) return;

    const languageSelects = document.querySelectorAll('.language-select');
    const folderSelect = document.getElementById('uploadFolderSelect');
    const selectedFolderId = folderSelect ? folderSelect.value : null;
    
    // 파일들을 순차적으로 처리
    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const language = languageSelects[index].value;
        
        // 업로드 모달에서 설정된 OCR 옵션과 텍스트 검사 결과 사용
        const hasText = file.hasText !== undefined ? file.hasText : false;
        const useOcr = file.useOcr !== undefined ? file.useOcr : !hasText;
        
        await addFileToQueue(file, language, hasText, useOcr, selectedFolderId);
    }

    closeUploadModal();
    startBackgroundProcessing();
    
    // 폴더 트리 새로고침 (클라이언트 큐 파일들 즉시 표시)
    if (window.folderTreeManager && window.folderTreeManager.loadFolderTree) {
        await window.folderTreeManager.loadFolderTree();
        console.log(`📁 파일 업로드 후 폴더 트리 새로고침`);
    }

    showNotification(`${files.length}개 파일이 백그라운드에서 처리됩니다.`);
}

// 백그라운드 처리 시작
function startBackgroundProcessing() {
    if (!processingQueue) {
        processNextFile();
    }
}

// UUID 검증 함수
function isValidUUID(uuid) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}


// 파일을 큐에 추가 (업로드 모달에서 미리 검사된 정보 사용)
async function addFileToQueue(file, language = 'ko', hasText = null, useOcr = null, folderId = null) {
    const generatedId = crypto.randomUUID();
    
    // UUID 검증
    if (!isValidUUID(generatedId)) {
        console.error('❌ 유효하지 않은 UUID 생성:', generatedId);
        showNotification('UUID 생성 오류가 발생했습니다.', 'error');
        return null;
    }

    const fileItem = {
        id: generatedId,
        file: file,
        name: file.name,
        language: language,
        status: 'waiting', // 업로드 모달에서 이미 검사했으므로 바로 대기상태
        segments: null,
        pdfDoc: null,
        error: null,
        hasText: hasText, // 업로드 모달에서 전달받은 값 사용
        useOcr: useOcr,   // 업로드 모달에서 전달받은 값 사용
        folderId: folderId, // 선택된 폴더 ID
        isNewFile: true    // 새 파일 플래그 (서버 DB에 아직 없음)
    };

    console.log(`✅ 새 파일 큐에 추가 - ID: ${fileItem.id}, 이름: ${fileItem.name}, 텍스트: ${hasText}, OCR: ${useOcr}`);
    fileQueue.push(fileItem);
    
    return fileItem;
}


// 파일 선택
export async function selectFile(fileId) {
    // 먼저 fileQueue에서 찾기
    let fileItem = fileQueue.find(f => f.id === fileId);
    
    // fileQueue에 없으면 데이터베이스에서 직접 가져오기
    if (!fileItem) {
        try {
            const response = await fetchApi(`/files/${fileId}`);
            if (response.ok) {
                const data = await response.json();
                const file = data.file;
                
                // 임시 fileItem 생성
                fileItem = {
                    id: file.id,
                    name: file.filename,
                    status: file.status,
                    error: file.error_message
                };
            } else {
                console.error('파일을 찾을 수 없습니다:', fileId);
                showNotification('파일을 찾을 수 없습니다.', 'error');
                return;
            }
        } catch (error) {
            console.error('파일 로드 오류:', error);
            showNotification('파일 로드 중 오류가 발생했습니다.', 'error');
            return;
        }
    }

    if (fileItem.status === 'completed') {
        await loadFileFromDatabase(fileId, fileItem);
    } else if (fileItem.status === 'processing') {
        showNotification(`${fileItem.name}이 아직 처리 중입니다.`, 'warning');
    } else if (fileItem.status === 'error' || fileItem.status === 'failed') {
        showNotification(`${fileItem.name} 처리 중 오류가 발생했습니다: ${fileItem.error}`, 'error');
    } else {
        showNotification(`${fileItem.name}이 처리 대기 중입니다.`, 'info');
    }
}

// 데이터베이스에서 파일 로드
async function loadFileFromDatabase(fileId, fileItem) {
    try {
        showNotification('파일 로딩 중...', 'info');

        const response = await fetchApi(`/files/${fileId}`);
        const data = await response.json();
        const file = data.file;

        const pdfResponse = await fetchApi(`/files/${fileId}/pdf`);
        const pdfArrayBuffer = await pdfResponse.arrayBuffer();

        // 파일 로드 완료 이벤트 발생
        const event = new CustomEvent('fileLoaded', {
            detail: {
                fileId,
                fileName: file.filename,
                pdfData: pdfArrayBuffer,
                segments: file.segments_data || []
            }
        });
        document.dispatchEvent(event);

        currentFileId = fileId;
        showNotification(`${file.filename} 로드 완료!`, 'success');

        // 파일 완전 로드 완료

    } catch (error) {
        console.error('파일 로드 오류:', error);
        showNotification(`파일 로드 실패: ${error.message}`, 'error');
    }
}

// 파일 처리 취소 (바로 삭제)
export async function cancelFile(fileId) {
    const fileItem = fileQueue.find(f => f.id === fileId);
    if (!fileItem) return;

    if (!confirm(`"${fileItem.name}" 파일 처리를 중단하고 삭제하시겠습니까?`)) {
        return;
    }

    if (fileItem.status === 'processing') {
        // HTTP 요청 취소
        const controller = processingControllers.get(fileId);
        if (controller) {
            controller.abort();
        }
        
        // 백엔드에 삭제 요청 (처리 중단 + 완전 삭제)
        try {
            await fetchApi(`/files/${fileId}`, {
                method: 'DELETE'
            });
            
            // 큐에서 제거
            fileQueue = fileQueue.filter(f => f.id !== fileId);
            
            showNotification(`${fileItem.name} 처리를 중단하고 삭제했습니다.`, 'success');
            
        } catch (error) {
            console.error('처리 중인 파일 삭제 실패:', error);
            
            // 삭제 실패 시 취소 상태로 설정
            fileItem.status = 'cancelled';
            fileItem.error = '처리 중단됨 (삭제 실패)';
            
            showNotification(`${fileItem.name} 처리를 중단했지만 삭제 실패`, 'warning');
        }
        
    } else if (fileItem.status === 'waiting') {
        console.log(`⏸ 대기 중인 파일 중단: ${fileItem.name} (ID: ${fileId})`);
        
        // 백엔드 DB에서도 상태 업데이트
        try {
            const response = await fetchApi(`/files/${fileId}`, {
                method: 'DELETE'
            });
            console.log(`🗑️ 백엔드 파일 삭제 응답: ${response.status}`);
        } catch (error) {
            console.error('❌ 백엔드 파일 삭제 실패:', error);
        }
        
        // 큐에서 제거
        fileQueue = fileQueue.filter(f => f.id !== fileId);
        
        // 폴더 트리도 새로고침  
        if (window.folderTreeManager && window.folderTreeManager.loadFolderTree) {
            window.folderTreeManager.loadFolderTree();
        }
        
        showNotification(`${fileItem.name}을 대기 큐에서 삭제했습니다.`, 'success');
    }
}

// 파일 삭제
export async function deleteFile(fileId) {
    const fileItem = fileQueue.find(f => f.id === fileId);
    if (!fileItem) return;

    if (!confirm(`"${fileItem.name}" 파일을 삭제하시겠습니까?\n관련 채팅도 모두 삭제됩니다.`)) {
        return;
    }

    try {
        const response = await fetchApi(`/files/${fileId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            fileQueue = fileQueue.filter(f => f.id !== fileId);

            if (currentFileId === fileId) {
                // 파일 삭제 이벤트 발생
                const event = new CustomEvent('fileDeleted', {
                    detail: { fileId }
                });
                document.dispatchEvent(event);
                
                currentFileId = null;
            }
            showNotification('파일이 삭제되었습니다.', 'success');
        } else {
            throw new Error('삭제 실패');
        }
    } catch (error) {
        console.error('파일 삭제 오류:', error);
        showNotification('파일 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// 다음 파일 처리
async function processNextFile() {
    const waitingFile = fileQueue.find(f => f.status === 'waiting');
    console.log(`🔍 [processNextFile] 대기 중인 파일 검색...`);
    console.log(`📋 [processNextFile] 전체 큐 상태:`, fileQueue.map(f => `${f.name}: ${f.status}`));
    
    if (!waitingFile) {
        console.log(`⏹️ [processNextFile] 대기 중인 파일 없음, 처리 종료`);
        processingQueue = false;
        return;
    }

    console.log(`🚀 [processNextFile] 처리 시작: ${waitingFile.name} (ID: ${waitingFile.id})`);
    console.log(`📄 [processNextFile] 파일 객체 존재:`, !!waitingFile.file);
    
    processingQueue = true;
    waitingFile.status = 'processing';
    
    // 폴더 트리도 즉시 업데이트 (waiting → processing)
    if (window.folderTreeManager && window.folderTreeManager.loadFolderTree) {
        await window.folderTreeManager.loadFolderTree();
    }
    
    // 기존 파일(재처리)인 경우에만 서버 DB 상태 업데이트
    if (!waitingFile.isNewFile) {
        try {
            const updateResponse = await fetchApi(`/api/files/${waitingFile.id}/status`, {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ status: 'processing' })
            });
            
            if (updateResponse.ok) {
                console.log(`✅ 서버 DB 상태를 processing으로 변경: ${waitingFile.id}`);
                // 폴더 트리 새로고침
                if (window.folderTreeManager && window.folderTreeManager.loadFolderTree) {
                    window.folderTreeManager.loadFolderTree();
                }
            }
        } catch (error) {
            console.warn('⚠️ 서버 상태 업데이트 실패:', error);
        }
    } else {
        console.log(`📁 새 파일 처리 시작 - 곧 폴더 트리에 표시됨: ${waitingFile.name}`);
    }

    // 파일 처리 시작

    try {
        const formData = new FormData();
        formData.append('file', waitingFile.file);
        formData.append('language', waitingFile.language);
        formData.append('file_id', waitingFile.id); // UUID 전송
        formData.append('use_ocr', (waitingFile.useOcr !== false).toString()); // OCR 사용 여부 (기본값: true, false일 때만 false)
        
        // 폴더 ID가 있으면 추가
        if (waitingFile.folderId) {
            formData.append('folder_id', waitingFile.folderId);
        }

        console.log(`📤 파일 처리 요청 전송 - ID: ${waitingFile.id}, 이름: ${waitingFile.name}, OCR: ${waitingFile.useOcr !== false ? 'ON' : 'OFF'}`);

        // 서버로 파일 업로드 및 처리 중
        const token = localStorage.getItem('token');
        
        // AbortController를 사용해 30분 타임아웃 설정
        const controller = new AbortController();
        processingControllers.set(waitingFile.id, controller); // 취소용 저장
        const timeoutId = setTimeout(() => controller.abort(), 30 * 60 * 1000); // 30분
        
        const response = await fetch(`${API_URL}/segments`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`
            },
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        processingControllers.delete(waitingFile.id); // 완료 후 정리

        console.log('📥 서버 응답:', response.status, response.statusText);

        if (response.ok) {
            const data = await response.json();
            console.log('✅ segments 응답 받음:', data);

            // 큐의 파일 정보 업데이트 (UUID는 변경 불필요)
            waitingFile.status = 'completed';
            waitingFile.segments = data.segments || [];
            waitingFile.file_size = waitingFile.file.size;
            waitingFile.isNewFile = false; // 처리 완료 후 새 파일 플래그 제거
            
            console.log(`✅ ${waitingFile.name} 처리 완료 - ${waitingFile.segments.length}개 세그먼트`);
            
            // 폴더 트리 즉시 새로고침 (새 파일이 폴더에 나타나도록)
            if (window.folderTreeManager && window.folderTreeManager.loadFolderTree) {
                await window.folderTreeManager.loadFolderTree();
            }
        } else {
            // 서버 에러 응답 처리 개선
            let errorMessage = '파일 처리 실패';
            try {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    console.log('🔍 서버 에러 응답:', errorData); // 디버깅용
                    if (errorData.detail && typeof errorData.detail === 'string') {
                        errorMessage = errorData.detail;
                    } else if (errorData.message && typeof errorData.message === 'string') {
                        errorMessage = errorData.message;
                    } else {
                        errorMessage = `HTTP ${response.status} 오류 (JSON 응답)`;
                    }
                } else {
                    // HTML 에러 페이지인 경우
                    const errorText = await response.text();
                    if (errorText.includes('Internal Server Error')) {
                        errorMessage = '서버 내부 오류가 발생했습니다';
                    } else if (errorText.includes('400')) {
                        errorMessage = '잘못된 요청입니다';
                    } else if (errorText.includes('404')) {
                        errorMessage = '요청한 리소스를 찾을 수 없습니다';
                    } else if (errorText.includes('413')) {
                        errorMessage = '파일 크기가 너무 큽니다';
                    } else if (errorText.includes('422')) {
                        errorMessage = '처리할 수 없는 파일입니다';
                    } else {
                        errorMessage = `HTTP ${response.status} 오류`;
                    }
                }
            } catch (parseError) {
                console.error('에러 응답 파싱 실패:', parseError);
                errorMessage = `HTTP ${response.status} 서버 오류`;
            }
            throw new Error(errorMessage);
        }
    } catch (error) {
        processingControllers.delete(waitingFile.id); // 에러 시에도 정리
        
        if (error.name === 'AbortError') {
            // 정상적인 사용자 취소 - 에러 로그 없이 조용히 처리
            console.log(`🚫 ${waitingFile.name} 처리가 사용자에 의해 취소됨`);
            
            // 이미 cancelFile()에서 삭제 처리했다면 큐에서 파일이 없을 수 있음
            const stillInQueue = fileQueue.find(f => f.id === waitingFile.id);
            if (stillInQueue) {
                stillInQueue.status = 'cancelled';
                stillInQueue.error = '처리가 취소되었습니다.';
            }
        } else {
            console.error(`❌ ${waitingFile.name} 처리 실패:`, error);
            waitingFile.status = 'error';
            
            // 에러 메시지를 안전하게 추출
            let errorMessage = '알 수 없는 오류가 발생했습니다';
            if (error && typeof error === 'object') {
                if (error.message && typeof error.message === 'string') {
                    errorMessage = error.message;
                } else if (error.toString && typeof error.toString === 'function') {
                    const errorStr = error.toString();
                    if (errorStr !== '[object Object]') {
                        errorMessage = errorStr;
                    }
                }
            } else if (typeof error === 'string') {
                errorMessage = error;
            }
            
            waitingFile.error = errorMessage;
        }
    }

    
    // 폴더 트리 새로고침 (성공/실패 관계없이)
    if (window.folderTreeManager && window.folderTreeManager.loadFolderTree) {
        await window.folderTreeManager.loadFolderTree();
    }

    // 다음 파일 처리
    setTimeout(() => {
        processNextFile();
    }, 500);
}

// Getters
export function getCurrentFileId() {
    return currentFileId;
}

export function getFileQueue() {
    return fileQueue;
}

// 큐에서 파일 강제 제거
export function removeFromQueue(fileId) {
    const beforeLength = fileQueue.length;
    fileQueue = fileQueue.filter(f => f.id !== fileId);
    const afterLength = fileQueue.length;
    
    if (beforeLength > afterLength) {
        console.log(`🗑️ 파일 큐에서 제거됨: ${fileId} (${beforeLength} → ${afterLength})`);
        return true;
    } else {
        console.log(`⚠️ 파일 큐에서 찾을 수 없음: ${fileId}`);
        return false;
    }
}


// 파일 재처리
export async function retryFile(fileId) {
    let fileItem = fileQueue.find(f => f.id === fileId);
    
    // fileQueue에 없으면 백엔드에서 파일 정보 가져와서 추가
    if (!fileItem) {
        console.log(`📥 fileQueue에 없는 파일, 백엔드에서 정보 가져오는 중: ${fileId}`);
        try {
            const response = await fetchApi(`/files/${fileId}`);
            if (response.ok) {
                const data = await response.json();
                const file = data.file;
                
                // fileQueue에 추가
                fileItem = {
                    id: file.id,
                    file: null, // 재처리 모드이므로 파일 객체 없음
                    name: file.filename,
                    language: file.language,
                    status: file.status,
                    segments: file.segments_data || [],
                    error: file.error_message,
                    file_size: file.file_size,
                    created_at: file.created_at,
                    useOcr: file.use_ocr
                };
                
                fileQueue.push(fileItem);
                console.log(`✅ 백엔드에서 파일 정보 가져와서 fileQueue에 추가: ${file.filename}`);
            } else {
                console.error('파일 정보를 가져올 수 없습니다:', response.status);
                showNotification('파일 정보를 가져올 수 없습니다.', 'error');
                return;
            }
        } catch (error) {
            console.error('파일 정보 로드 오류:', error);
            showNotification('파일 정보를 로드하는 중 오류가 발생했습니다.', 'error');
            return;
        }
    }
    
    // 재처리 가능한 상태 확인: error, failed, completed 모두 허용
    if (fileItem.status !== 'error' && fileItem.status !== 'failed' && fileItem.status !== 'completed') {
        console.log('재처리할 수 없는 파일 상태:', fileItem.status);
        showNotification('오류 상태 또는 완료된 파일만 재처리할 수 있습니다.', 'warning');
        return;
    }
    
    console.log(`🔄 파일 재처리 시작: ${fileItem.name}`);
    
    // 2. 백그라운드에서 파일 다운로드 (필요시)
    if (!fileItem.file) {
        console.log('📥 백그라운드에서 원본 파일 다운로드 중...');
        try {
            // 서버에서 PDF 파일 다운로드
            const response = await fetchApi(`/files/${fileItem.id}/pdf`);
            if (!response.ok) {
                throw new Error(`파일 다운로드 실패: ${response.status}`);
            }
            
            // Blob을 File 객체로 변환
            const blob = await response.blob();
            const file = new File([blob], fileItem.name, { type: 'application/pdf' });
            
            // fileItem에 File 객체 저장
            fileItem.file = file;
            console.log('✅ 백그라운드 파일 다운로드 완료:', file.name, `(${(file.size / 1024 / 1024).toFixed(2)}MB)`);
            
        } catch (error) {
            console.error('❌ 파일 다운로드 실패:', error);
            showNotification('원본 파일을 서버에서 가져올 수 없습니다. 파일을 다시 업로드해주세요.', 'error');
            return;
        }
    }
    
    // OCR 설정이 없는 경우 서버에서 원본 설정 가져오기
    if (fileItem.useOcr === undefined || fileItem.useOcr === null) {
        try {
            console.log('📥 서버에서 원본 OCR 설정 가져오는 중...');
            const response = await fetchApi(`/files/${fileItem.id}`);
            if (response.ok) {
                const data = await response.json();
                fileItem.useOcr = data.file.use_ocr; // 원본 OCR 설정 사용
                console.log(`✅ 원본 OCR 설정 적용: ${fileItem.useOcr}`);
            } else {
                fileItem.useOcr = true; // 기본값
                console.log('⚠️ 원본 설정을 가져올 수 없어 기본값 사용: OCR 활성화');
            }
        } catch (error) {
            fileItem.useOcr = true; // 기본값
            console.log('⚠️ OCR 설정 가져오기 실패, 기본값 사용:', error);
        }
    }
    
    // 상태 초기화 (처리 시작 직전까지는 대기 상태)
    fileItem.status = 'waiting';
    fileItem.error = null;
    fileItem.segments = null;
    fileItem.pdfDoc = null;
    
    // 파일 리스트 업데이트
    
    // 서버 DB 상태도 waiting으로 변경 (폴더 트리에서 waiting 상태 표시)
    try {
        const updateResponse = await fetchApi(`/api/files/${fileItem.id}/status`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ status: 'waiting' })
        });
        
        if (updateResponse.ok) {
            console.log(`✅ 서버 DB 상태를 waiting으로 변경: ${fileItem.id}`);
            // 폴더 트리 새로고침 (waiting 상태 표시)
            if (window.folderTreeManager && window.folderTreeManager.loadFolderTree) {
                window.folderTreeManager.loadFolderTree();
            }
        }
    } catch (error) {
        console.warn('⚠️ 서버 상태 업데이트 실패:', error);
    }
    
    // 처리 상태에 따른 알림
    if (processingQueue) {
        showNotification(`${fileItem.name}이 대기열에 추가되었습니다.`, 'info');
        console.log(`📋 ${fileItem.name}은 대기열에서 순서를 기다립니다 (현재 처리 중인 파일 있음)`);
    } else {
        showNotification(`${fileItem.name} 재처리를 시작합니다.`, 'info');
        console.log(`🚀 ${fileItem.name} 즉시 처리 시작`);
    }
    
    // 백그라운드 처리 시작 (이미 실행 중이 아니라면)
    if (!processingQueue) {
        startBackgroundProcessing();
    }
}

// Export 함수들은 index.js에서 글로벌로 노출됨