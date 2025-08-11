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
    const fileList = document.getElementById('fileList');

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

// 사용자 파일 목록 로드
async function loadUserFiles() {
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

            updateFileList();
            // 파일 로드 완료
        }
    } catch (error) {
        console.error('파일 목록 로드 오류:', error);
    }
}

// 다중 파일 처리
function handleMultipleFiles(files) {
    showUploadModal(files);
}

// 파일 처리 시작
export async function processFiles() {
    const files = window.pendingFiles;
    if (!files) return;

    const languageSelects = document.querySelectorAll('.language-select');
    
    // 파일들을 순차적으로 처리
    for (let index = 0; index < files.length; index++) {
        const file = files[index];
        const language = languageSelects[index].value;
        
        // 업로드 모달에서 설정된 OCR 옵션과 텍스트 검사 결과 사용
        const hasText = file.hasText !== undefined ? file.hasText : false;
        const useOcr = file.useOcr !== undefined ? file.useOcr : !hasText;
        
        await addFileToQueue(file, language, hasText, useOcr);
    }

    closeUploadModal();
    startBackgroundProcessing();

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
async function addFileToQueue(file, language = 'ko', hasText = null, useOcr = null) {
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
        useOcr: useOcr    // 업로드 모달에서 전달받은 값 사용
    };

    console.log(`✅ 새 파일 큐에 추가 - ID: ${fileItem.id}, 이름: ${fileItem.name}, 텍스트: ${hasText}, OCR: ${useOcr}`);
    fileQueue.push(fileItem);
    updateFileList();
    
    return fileItem;
}

// 파일 목록 업데이트
function updateFileList() {
    const fileList = document.getElementById('fileList');
    if (!fileList) return;

    if (fileQueue.length === 0) {
        fileList.innerHTML = `
            <div class="empty-state">
                <div style="font-size: 3rem; margin-bottom: 1rem;">📁</div>
                <h3>업로드된 파일이 없습니다</h3>
                <p style="margin-bottom: 1.5rem;">PDF 파일을 선택하거나 드래그해주세요.</p>
                <button onclick="document.getElementById('fileInput').click()">
                    파일 선택하기
                </button>
            </div>
        `;
        return;
    }

    const totalFiles = fileQueue.length;
    const completedFiles = fileQueue.filter(f => f.status === 'completed').length;
    const processingFiles = fileQueue.filter(f => f.status === 'processing').length;
    const errorFiles = fileQueue.filter(f => f.status === 'error').length;
    const waitingFiles = fileQueue.filter(f => f.status === 'waiting').length;

    fileList.innerHTML = `
        <div class="file-progress-summary">
            <div class="progress-row">
                <span>📊 전체 파일</span>
                <span><strong>${totalFiles}개</strong></span>
            </div>
            <div class="progress-row">
                <span>✅ 완료</span>
                <span style="color: #10b981;"><strong>${completedFiles}개</strong></span>
            </div>
            ${processingFiles > 0 ? `
            <div class="progress-row">
                <span>🔄 처리중</span>
                <span style="color: #f59e0b;"><strong>${processingFiles}개</strong></span>
            </div>` : ''}
            ${waitingFiles > 0 ? `
            <div class="progress-row">
                <span>⏳ 대기중</span>
                <span style="color: #2563eb;"><strong>${waitingFiles}개</strong></span>
            </div>` : ''}
            ${errorFiles > 0 ? `
            <div class="progress-row">
                <span>❌ 오류</span>
                <span style="color: #ef4444;"><strong>${errorFiles}개</strong></span>
            </div>` : ''}
        </div>
        ${fileQueue.map(file => {
            const isActive = file.id === currentFileId;
            const canSelect = file.status === 'completed';

            const statusEmoji = {
                'checking': '🔍',
                'waiting': '⏳',
                'processing': '🔄',
                'completed': '✅',
                'error': '❌',
                'cancelled': '🚫'
            };

            return `
                <div class="file-item ${file.status} ${isActive ? 'active' : ''}" 
                     data-file-id="${file.id}"
                     ${canSelect ? `onclick="window.fileManager.selectFile('${file.id}')"` : ''}
                     style="cursor: ${canSelect ? 'pointer' : 'default'};">
                    <div class="file-header">
                        <div class="file-main-info">
                            <div class="file-name">${file.name}</div>
                            <div class="file-meta">
                                ${file.file_size ? formatFileSize(file.file_size) : ''} 
                                ${file.language ? `• ${getLanguageName(file.language)}` : ''}
                                ${file.segments && file.segments.length ? ` • ${file.segments.length}개 영역` : ''}
                            </div>
                            <div class="file-status ${file.status}">
                                ${statusEmoji[file.status] || '📄'} ${getStatusText(file.status)}
                            </div>
                        </div>
                        <div class="file-actions">
                            ${file.status === 'processing' || file.status === 'waiting' ? 
                                `<button class="file-cancel-btn" onclick="event.stopPropagation(); window.fileManager.cancelFile('${file.id}')" title="처리 중단하고 삭제">×</button>` : ''}
                            ${file.status === 'completed' || file.status === 'error' || file.status === 'cancelled' ?
                                `<button class="file-delete-btn" onclick="event.stopPropagation(); window.fileManager.deleteFile('${file.id}')" title="파일 삭제">×</button>` : ''}
                        </div>
                    </div>
                    ${file.error ? `<div style="font-size: 11px; color: #ef4444; margin-top: 0.5rem; padding: 0.5rem; background: rgba(239, 68, 68, 0.1); border-radius: 6px;">❌ ${file.error}</div>` : ''}
                </div>`;
        }).join('')}
    `;
}

// 파일 선택
export async function selectFile(fileId) {
    const fileItem = fileQueue.find(f => f.id === fileId);
    if (!fileItem) {
        console.error('파일을 찾을 수 없습니다:', fileId);
        return;
    }

    if (fileItem.status === 'completed') {
        await loadFileFromDatabase(fileId, fileItem);
    } else if (fileItem.status === 'processing') {
        showNotification(`${fileItem.name}이 아직 처리 중입니다.`, 'warning');
    } else if (fileItem.status === 'error') {
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
        updateFileList();
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
            updateFileList();
            
            showNotification(`${fileItem.name} 처리를 중단하고 삭제했습니다.`, 'success');
            
        } catch (error) {
            console.error('처리 중인 파일 삭제 실패:', error);
            
            // 삭제 실패 시 취소 상태로 설정
            fileItem.status = 'cancelled';
            fileItem.error = '처리 중단됨 (삭제 실패)';
            updateFileList();
            
            showNotification(`${fileItem.name} 처리를 중단했지만 삭제 실패`, 'warning');
        }
        
    } else if (fileItem.status === 'waiting') {
        // 대기 중인 파일은 바로 큐에서 제거
        fileQueue = fileQueue.filter(f => f.id !== fileId);
        updateFileList();
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
            updateFileList();

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
    if (!waitingFile) {
        processingQueue = false;
        // 모든 파일 처리 완료
        return;
    }

    processingQueue = true;
    waitingFile.status = 'processing';
    updateFileList();

    // 파일 처리 시작

    try {
        const formData = new FormData();
        formData.append('file', waitingFile.file);
        formData.append('language', waitingFile.language);
        formData.append('file_id', waitingFile.id); // UUID 전송
        formData.append('use_ocr', waitingFile.useOcr.toString()); // OCR 사용 여부

        console.log(`📤 파일 처리 요청 전송 - ID: ${waitingFile.id}, 이름: ${waitingFile.name}, OCR: ${waitingFile.useOcr ? 'ON' : 'OFF'}`);

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
            
            console.log(`✅ ${waitingFile.name} 처리 완료 - ${waitingFile.segments.length}개 세그먼트`);
        } else {
            // 서버 에러 응답 처리 개선
            let errorMessage = '파일 처리 실패';
            try {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.detail || errorMessage;
                } else {
                    // HTML 에러 페이지인 경우
                    const errorText = await response.text();
                    if (errorText.includes('Internal Server Error')) {
                        errorMessage = '서버 내부 오류가 발생했습니다';
                    } else if (errorText.includes('400')) {
                        errorMessage = '잘못된 요청입니다';
                    } else {
                        errorMessage = `HTTP ${response.status} 오류`;
                    }
                }
            } catch (parseError) {
                console.error('에러 응답 파싱 실패:', parseError);
                errorMessage = `HTTP ${response.status} 오류 (응답 파싱 실패)`;
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
            waitingFile.error = error.message;
        }
    }

    updateFileList();

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


// Export 함수들은 index.js에서 글로벌로 노출됨

// HTML onclick에서 사용할 수 있도록 전역 함수로 등록
window.processFiles = processFiles;