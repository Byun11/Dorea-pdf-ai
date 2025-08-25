/* =====================================================
   Dorea File Manager Module - Refactored for Server-Side Queue
   ===================================================== */

import { fetchApi, showNotification } from './utils.js';
import { showUploadModal, closeUploadModal } from './ui.js';

// API URL
const API_URL = window.location.origin;

// --- Polling-related variables ---
let isPolling = false;
let pollingIntervalId = null;

// --- Initialization ---
export function init() {
    setupFileEventListeners();
    // Initial load is handled by folderTreeManager, but we can start polling if needed.
    checkAndStartPolling(); 
}

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

    if (sidebar) {
        sidebar.addEventListener('dragover', (e) => {
            e.preventDefault();
            sidebar.classList.add('dragover');
        });

        sidebar.addEventListener('dragleave', (e) => {
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

// --- New Polling Logic ---

export async function checkAndStartPolling() {
    if (!window.folderTreeManager?.getAllFiles) return;

    const files = window.folderTreeManager.getAllFiles();
    const isPending = files.some(f => f.status === 'waiting' || f.status === 'processing');

    if (isPending && !isPolling) {
        startPolling();
    } else if (!isPending && isPolling) {
        stopPolling();
    }
}

function startPolling() {
    if (isPolling) return;
    console.log('📊 [Polling] Starting status polling every 5 seconds.');
    isPolling = true;
    fetchAndUpdateStatus(); // Initial fetch
    pollingIntervalId = setInterval(fetchAndUpdateStatus, 5000);
}

function stopPolling() {
    if (!isPolling) return;
    console.log('⏹️ [Polling] Stopping status polling.');
    clearInterval(pollingIntervalId);
    pollingIntervalId = null;
    isPolling = false;
}

async function fetchAndUpdateStatus() {
    console.log('🔄 [Polling] Fetching latest file statuses...');
    if (window.folderTreeManager?.loadFolderTree) {
        await window.folderTreeManager.loadFolderTree();
        // The check to stop polling is now inside loadFolderTree's completion
    } else {
        stopPolling();
    }
}

// --- Core Upload Logic (Refactored) ---

export function handleMultipleFiles(files) {
    console.log('📂 다중 파일 처리 시작:', files.length + '개');
    showUploadModal(files);
}

export async function processFiles() {
    const filesToUpload = window.pendingFiles;
    if (!filesToUpload || filesToUpload.length === 0) return;

    const languageSelects = document.querySelectorAll('.language-select');
    const folderSelect = document.getElementById('uploadFolderSelect');
    const selectedFolderId = folderSelect ? folderSelect.value : null;

    closeUploadModal();
    showNotification(`${filesToUpload.length}개 파일 업로드를 시작합니다...`, 'info');

    const uploadPromises = filesToUpload.map((file, index) => {
        const language = languageSelects[index].value;
        const useOcr = file.useOcr !== undefined ? file.useOcr : !file.hasText;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('language', language);
        formData.append('use_ocr', useOcr.toString());
        if (selectedFolderId) {
            formData.append('folder_id', selectedFolderId);
        }
        
        console.log(`📤 Uploading: ${file.name} (OCR: ${useOcr})`);
        return fetchApi('/files/upload', {
            method: 'POST',
            body: formData
        }, true); // true to skip json parsing for FormData
    });

    try {
        await Promise.all(uploadPromises);
        showNotification('모든 파일이 업로드 큐에 추가되었습니다.', 'success');
    } catch (error) {
        console.error('파일 업로드 중 오류 발생:', error);
        showNotification('일부 파일 업로드에 실패했습니다.', 'error');
    } finally {
        // DB에 정보가 반영될 시간을 주기 위해 약간의 딜레이 후 목록 갱신
        setTimeout(() => {
            if (window.folderTreeManager) {
                window.folderTreeManager.loadFolderTree();
            }
        }, 500); // 0.5초 지연
    }
}

// --- File Actions (Refactored) ---

export async function selectFile(fileId, fileName, fileStatus) {
    if (fileStatus === 'completed') {
        await loadFileFromDatabase(fileId, fileName);
    } else {
        showNotification(`'${fileName}' 파일은 아직 처리 중입니다 (상태: ${fileStatus}).`, 'info');
    }
}

async function loadFileFromDatabase(fileId, fileName) {
    try {
        showNotification('파일 로딩 중...', 'info');

        // 1. 파일 메타데이터(세그먼트 포함) 가져오기 (복원된 로직)
        const fileInfoResponse = await fetchApi(`/files/${fileId}`);
        if (!fileInfoResponse.ok) {
            throw new Error('파일 정보를 가져오는 데 실패했습니다.');
        }
        const fileInfoData = await fileInfoResponse.json();
        const segments = fileInfoData.file.segments_data || [];

        // 2. PDF 파일 자체 가져오기
        const pdfResponse = await fetchApi(`/files/${fileId}/pdf`);
        if (!pdfResponse.ok) {
            throw new Error('PDF 파일을 불러오는 데 실패했습니다.');
        }
        const pdfArrayBuffer = await pdfResponse.arrayBuffer();

        // 3. 세그먼트 데이터를 포함하여 이벤트 발생
        const event = new CustomEvent('fileLoaded', {
            detail: {
                fileId,
                fileName,
                pdfData: pdfArrayBuffer,
                segments: segments
            }
        });
        document.dispatchEvent(event);

        showNotification(`${fileName} 로드 완료!`, 'success');
    } catch (error) {
        console.error('파일 로드 오류:', error);
        showNotification(`파일 로드 실패: ${error.message}`, 'error');
    }
}

export async function deleteFile(fileId, fileName) {
    if (!confirm(`'${fileName}' 파일을 삭제하시겠습니까?
관련된 모든 채팅 기록도 함께 삭제됩니다.`)) {
        return;
    }

    try {
        const response = await fetchApi(`/files/${fileId}`, { method: 'DELETE' });
        if (response.ok) {
            showNotification(`'${fileName}' 파일이 삭제되었습니다.`, 'success');
            if (window.folderTreeManager) {
                await window.folderTreeManager.loadFolderTree();
            }
            const event = new CustomEvent('fileDeleted', { detail: { fileId } });
            document.dispatchEvent(event);
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || '삭제 실패');
        }
    } catch (error) {
        console.error('파일 삭제 오류:', error);
        showNotification(`파일 삭제 실패: ${error.message}`, 'error');
    }
}

export async function deleteFolder(folderId, folderName) {
    // 백엔드 로직: 폴더 안의 파일은 루트로 이동됩니다.
    if (!confirm(`'${folderName}' 폴더를 삭제하시겠습니까?
폴더 안의 모든 파일은 루트로 이동됩니다.`)) {
        return;
    }
    try {
        const response = await fetchApi(`/api/folders/${folderId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification(`'${folderName}' 폴더가 삭제되었습니다.`, 'success');
            if (window.folderTreeManager) {
                await window.folderTreeManager.loadFolderTree();
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || '폴더 삭제 실패');
        }
    } catch (error) {
        console.error('폴더 삭제 오류:', error);
        showNotification(`폴더 삭제 실패: ${error.message}`, 'error');
    }
}

export async function renameFolder(folderId, newName) {
    try {
        // 백엔드는 이 작업을 위해 PUT /api/folders/{folder_id}를 사용합니다.
        const response = await fetchApi(`/api/folders/${folderId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            // 백엔드 모델(FolderUpdateRequest)은 name과 description을 받습니다.
            body: JSON.stringify({ name: newName, description: '' })
        });

        if (response.ok) {
            showNotification('폴더 이름이 변경되었습니다.', 'success');
            return true;
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || '폴더 이름 변경 실패');
        }
    } catch (error) {
        console.error('폴더 이름 변경 오류:', error);
        showNotification(`이름 변경 실패: ${error.message}`, 'error');
        return false;
    }
}

export async function moveFile(fileId, newFolderId) {
    try {
        const response = await fetchApi(`/api/files/${fileId}/move`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ new_folder_id: newFolderId })
        });

        if (response.ok) {
            showNotification('파일이 이동되었습니다.', 'success');
            return true;
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || '파일 이동에 실패했습니다.');
        }
    } catch (error) {
        console.error('파일 이동 오류:', error);
        showNotification(`파일 이동 실패: ${error.message}`, 'error');
        return false;
    }
}

export async function retryFile(fileId, fileName) {
    console.log(`🔄 파일 재처리 요청: ${fileName} (ID: ${fileId})`);
    try {
        const response = await fetchApi(`/files/${fileId}/retry`, { method: 'POST' });
        if (response.ok) {
            showNotification(`'${fileName}' 파일의 재처리를 시작합니다.`, 'info');
            if (window.folderTreeManager) {
                await window.folderTreeManager.loadFolderTree();
            }
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || '재처리 요청 실패');
        }
    } catch (error) {
        console.error('파일 재처리 오류:', error);
        showNotification(`재처리 실패: ${error.message}`, 'error');
    }
}
