/* =====================================================
   Dorea UI Module - User Interface Management
   ===================================================== */

import { showNotification, formatFileSize, fetchApi } from './utils.js';
import { updateZoomControlsPosition } from './pdfViewer.js';

// PDF.js 동적 import (클라이언트 사이드 텍스트 검사용)
let pdfjsLib = null;
async function loadPdfJs() {
    if (!pdfjsLib) {
        try {
            pdfjsLib = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.min.mjs');
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.0.379/pdf.worker.min.mjs';
        } catch (error) {
            console.error('PDF.js 로드 실패:', error);
        }
    }
    return pdfjsLib;
}

// UI 상태 변수
let sidebarCollapsed = false;
let isResizing = false;
let startX = 0;
let startWidth = 420;
const minWidth = 120; // PDF 비율 최소값 대폭 하향 조정 (20%까지)
const maxWidth = 800;

// UI 초기화
export function init() {
    initializeTheme();
    initializeResize();
    restoreSidebarState();
    restorePanelWidth();
}

// 테마 초기화
export function initializeTheme() {
    const savedTheme = localStorage.getItem('theme') || 'light';
    document.documentElement.setAttribute('data-theme', savedTheme);

    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
        toggleBtn.textContent = savedTheme === 'dark' ? '☀️ 라이트' : '🌙 다크';
    }
}

// 다크모드 토글 기능
export function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);

    const toggleBtn = document.getElementById('themeToggle');
    if (toggleBtn) {
        toggleBtn.textContent = newTheme === 'dark' ? '☀️ 라이트모드' : '🌙 다크모드';
    }

    document.body.style.transition = 'all 0.3s ease';
    setTimeout(() => {
        document.body.style.transition = '';
    }, 300);
}

// 사이드바 토글 기능
export function toggleSidebar() {
    const sidebar = document.querySelector('.sidebar');
    const body = document.body;
    
    sidebarCollapsed = !sidebarCollapsed;
    
    if (sidebarCollapsed) {
        sidebar.classList.add('collapsed');
        body.classList.add('sidebar-collapsed');
    } else {
        sidebar.classList.remove('collapsed');
        body.classList.remove('sidebar-collapsed');
    }
    
    // 상태 저장
    localStorage.setItem('sidebarCollapsed', sidebarCollapsed);
    
    // PDF 리사이즈 이벤트 발생
    const event = new CustomEvent('sidebarToggled');
    document.dispatchEvent(event);
}

// 사이드바 상태 복원
export function restoreSidebarState() {
    const saved = localStorage.getItem('sidebarCollapsed');
    if (saved === 'true') {
        sidebarCollapsed = true;
        const sidebar = document.querySelector('.sidebar');
        const body = document.body;
        if (sidebar && body) {
            sidebar.classList.add('collapsed');
            body.classList.add('sidebar-collapsed');
        }
    }
}

// 패널 리사이즈 기능 초기화
export function initializeResize() {
    const resizeHandle = document.getElementById('resizeHandle');
    if (!resizeHandle) return;
    
    resizeHandle.addEventListener('mousedown', startResize);
    resizeHandle.addEventListener('touchstart', startResizeTouch, { passive: false });
    
    document.addEventListener('mousemove', doResize);
    document.addEventListener('mouseup', stopResize);
    document.addEventListener('touchmove', doResizeTouch, { passive: false });
    document.addEventListener('touchend', stopResize);
}

function startResize(e) {
    isResizing = true;
    startX = e.clientX;
    startWidth = document.getElementById('aiPanel').offsetWidth;
    document.body.classList.add('resizing');
    document.getElementById('resizeHandle').classList.add('dragging');
    e.preventDefault();
}

function startResizeTouch(e) {
    isResizing = true;
    startX = e.touches[0].clientX;
    startWidth = document.getElementById('aiPanel').offsetWidth;
    document.body.classList.add('resizing');
    document.getElementById('resizeHandle').classList.add('dragging');
    e.preventDefault();
}

function doResize(e) {
    if (!isResizing) return;
    
    const currentX = e.clientX;
    const diffX = startX - currentX;
    const newWidth = Math.min(Math.max(startWidth + diffX, minWidth), maxWidth);
    
    const aiPanel = document.getElementById('aiPanel');
    if (aiPanel) {
        aiPanel.style.flex = `0 0 ${newWidth}px`;
        localStorage.setItem('aiPanelWidth', newWidth);
        // 줌 컨트롤 위치 즉시 업데이트
        requestAnimationFrame(() => {
            updateZoomControlsPosition();
        });
        
        // PDF 및 세그먼트 위치 재조정을 위해 현재 뷰 다시 렌더링
        if (window.pdfViewer && window.pdfViewer.rerenderCurrentView) {
            // 즉시 레이아웃 업데이트를 위한 requestAnimationFrame 사용
            requestAnimationFrame(() => {
                window.pdfViewer.rerenderCurrentView();
                // 세그먼트 동기화 즉시 실행
                triggerSegmentResync();
            });
        }
    }
}

function doResizeTouch(e) {
    if (!isResizing) return;
    
    const currentX = e.touches[0].clientX;
    const diffX = startX - currentX;
    const newWidth = Math.min(Math.max(startWidth + diffX, minWidth), maxWidth);
    
    const aiPanel = document.getElementById('aiPanel');
    if (aiPanel) {
        aiPanel.style.flex = `0 0 ${newWidth}px`;
        localStorage.setItem('aiPanelWidth', newWidth);
        // 줌 컨트롤 위치 즉시 업데이트
        requestAnimationFrame(() => {
            updateZoomControlsPosition();
        });
        
        // PDF 및 세그먼트 위치 재조정을 위해 현재 뷰 다시 렌더링
        if (window.pdfViewer && window.pdfViewer.rerenderCurrentView) {
            // 즉시 레이아웃 업데이트를 위한 requestAnimationFrame 사용
            requestAnimationFrame(() => {
                window.pdfViewer.rerenderCurrentView();
                // 세그먼트 동기화 즉시 실행
                triggerSegmentResync();
            });
        }
    }
    e.preventDefault();
}

function stopResize() {
    isResizing = false;
    document.body.classList.remove('resizing');
    const resizeHandle = document.getElementById('resizeHandle');
    if (resizeHandle) {
        resizeHandle.classList.remove('dragging');
    }
}

// 저장된 너비 복원
export function restorePanelWidth() {
    const savedWidth = localStorage.getItem('aiPanelWidth');
    if (savedWidth) {
        const width = Math.min(Math.max(parseInt(savedWidth), minWidth), maxWidth);
        const aiPanel = document.getElementById('aiPanel');
        if (aiPanel) {
            aiPanel.style.flex = `0 0 ${width}px`;
        }
    }
}

// 모달 관리
export function showModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'block';
    }
}

export function hideModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.style.display = 'none';
    }
}

// 기존 업로드 모달 함수들 제거됨 - 새로운 클라이언트 PDF 검사 기능으로 교체

// 로그인 페이지 UI 함수들
export function showLoading(show) {
    const loading = document.getElementById('loadingIndicator');
    const form = document.getElementById('loginForm');

    if (loading && form) {
        if (show) {
            loading.style.display = 'flex';
            form.style.display = 'none';
        } else {
            loading.style.display = 'none';
            form.style.display = 'flex';
        }
    }
}

export function showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    const apiKeyInput = document.getElementById('apiKey');
    
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
    }

    // 입력 필드에 에러 스타일 추가
    if (apiKeyInput) {
        apiKeyInput.style.borderColor = '#dc2626';
        setTimeout(() => {
            apiKeyInput.style.borderColor = '#d1d5db';
        }, 3000);
    }
}

export function hideError() {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
        errorDiv.style.display = 'none';
    }
}

export function showSuccess() {
    const loginBtn = document.getElementById('loginBtn');
    if (loginBtn) {
        loginBtn.innerHTML = '✓ 로그인 성공! 이동 중...';
        loginBtn.disabled = true;
        loginBtn.classList.add('success-state');
    }
}

// 리사이즈 시 세그먼트 동기화 강제 실행 함수
function triggerSegmentResync() {
    // 현재 뷰 모드에 따라 세그먼트 재동기화
    const pdfViewer = window.pdfViewer;
    if (!pdfViewer || !pdfViewer.getPdfDoc()) return;
    
    const viewMode = pdfViewer.getViewMode();
    const currentPage = pdfViewer.getCurrentPage();
    const currentScale = pdfViewer.getCurrentScale();
    const pdfDoc = pdfViewer.getPdfDoc();

    if (viewMode === 'continuous') {
        // 연속 스크롤 모드: 모든 페이지 세그먼트 재계산
        const pageContainers = document.querySelectorAll('.pdf-page-container');
        pageContainers.forEach(container => {
            const pageNum = parseInt(container.dataset.pageNumber);
            if (pageNum && pdfDoc) {
                pdfDoc.getPage(pageNum).then(page => {
                    const viewport = page.getViewport({ scale: currentScale });
                    const event = new CustomEvent('pageRendered', {
                        detail: { 
                            viewport, 
                            pageNum: pageNum,
                            overlayId: `segmentOverlay${pageNum}`,
                            viewMode: 'continuous'
                        }
                    });
                    document.dispatchEvent(event);
                });
            }
        });
    } else if (viewMode === 'single') {
        // 단일 페이지: 현재 페이지 세그먼트 재계산
        if (pdfDoc && currentPage) {
            pdfDoc.getPage(currentPage).then(page => {
                const viewport = page.getViewport({ scale: currentScale });
                const event = new CustomEvent('pageRendered', {
                    detail: { viewport, pageNum: currentPage }
                });
                document.dispatchEvent(event);
            });
        }
    } else if (viewMode === 'dual') {
        // 듀얼 페이지: 현재 두 페이지 세그먼트 재계산
        if (pdfDoc && currentPage) {
            [currentPage, currentPage + 1].forEach(pageNum => {
                if (pageNum <= pdfDoc.numPages) {
                    pdfDoc.getPage(pageNum).then(page => {
                        const viewport = page.getViewport({ scale: currentScale });
                        const overlayId = pageNum === currentPage ? 'segmentOverlay1' : 'segmentOverlay2';
                        const event = new CustomEvent('pageRendered', {
                            detail: { 
                                viewport, 
                                pageNum: pageNum,
                                overlayId,
                                viewMode: 'dual'
                            }
                        });
                        document.dispatchEvent(event);
                    });
                }
            });
        }
    }
}

// 언어 일괄 설정 기능
export function applyBulkLanguage() {
    const bulkLanguageSelect = document.getElementById('bulkLanguageSelect');
    const selectedLanguage = bulkLanguageSelect.value;
    
    if (!selectedLanguage) {
        showNotification('언어를 선택해주세요.', 'warning');
        return;
    }
    
    // 모든 파일 리스트의 언어 셀렉트 박스를 찾아서 설정
    const fileLanguageSelects = document.querySelectorAll('.file-language-select, select[id*="language"]');
    let updatedCount = 0;
    
    fileLanguageSelects.forEach(select => {
        if (select.value !== selectedLanguage) {
            select.value = selectedLanguage;
            updatedCount++;
            
            // 변경 이벤트 발생시키기 (다른 로직이 의존할 수 있음)
            const changeEvent = new Event('change', { bubbles: true });
            select.dispatchEvent(changeEvent);
        }
    });
    
    // 업로드 파일 리스트에서도 설정 (업로드 모달용)
    const uploadFileItems = document.querySelectorAll('.upload-file-item select');
    uploadFileItems.forEach(select => {
        if (select.value !== selectedLanguage) {
            select.value = selectedLanguage;
            updatedCount++;
            
            // 변경 이벤트 발생
            const changeEvent = new Event('change', { bubbles: true });
            select.dispatchEvent(changeEvent);
        }
    });
    
    const languageNames = {
        'ko': '한국어',
        'en': 'English', 
        'ja': '日本語',
        'zh': '中文',
        'es': 'Español',
        'fr': 'Français', 
        'de': 'Deutsch',
        'ru': 'Русский',
        'it': 'Italiano',
        'pt': 'Português',
        'ar': 'العربية',
        'hi': 'हिन्दी'
    };
    
    if (updatedCount > 0) {
        showNotification(`${updatedCount}개 파일의 언어가 ${languageNames[selectedLanguage]}로 설정되었습니다.`, 'success');
    } else {
        showNotification('설정할 파일이 없거나 이미 모든 파일이 해당 언어로 설정되어 있습니다.', 'info');
    }
    
    // 셀렉트 박스 초기화
    bulkLanguageSelect.value = '';
}


// 백업용 애니메이션 함수들 (기존 코드와의 호환성)
export function showUploadModalAnimated(files) {
    showUploadModal(files);
}

export function closeUploadModalAnimated() {
    closeUploadModal();
}

// ============================================
// 업로드 모달 관리
// ============================================

// 업로드 모달 표시
export function showUploadModal(files) {
    if (!files || files.length === 0) return;
    
    window.pendingFiles = files;
    const modal = document.getElementById('uploadModal');
    const fileList = document.getElementById('uploadFileList');
    
    if (!modal || !fileList) return;
    
    // 폴더 목록 로드
    loadFolderSelectOptions();
    
    // 파일 리스트 생성
    fileList.innerHTML = Array.from(files).map((file, index) => `
        <div class="upload-file-item" data-file-index="${index}">
            <div class="file-info">
                <div class="file-icon">PDF</div>
                <div class="file-details">
                    <div class="file-name">${file.name}</div>
                    <div class="file-size">${formatFileSize(file.size)}</div>
                    
                    <div class="text-check-status checking" id="textStatus-${index}">
                        🔍 PDF 텍스트 검사 중...
                    </div>
                    
                    <div class="ocr-option" id="ocrOption-${index}" style="display: none;">
                        <label class="ocr-checkbox">
                            <input type="checkbox" id="ocrCheck-${index}" onchange="updateOcrSetting(${index}, this.checked)">
                            <span id="ocrLabel-${index}">OCR 분석 (선택사항)</span>
                        </label>
                    </div>
                </div>
            </div>
            
            <select class="language-select" id="language-${index}">
                <option value="ko">한국어</option>
                <option value="en">English</option>
                <option value="ja">日本語</option>
                <option value="zh">中文</option>
                <option value="fr">Français</option>
                <option value="de">Deutsch</option>
                <option value="es">Español</option>
            </select>
        </div>
    `).join('');
    
    // 각 파일에 대해 텍스트 검사 시작
    Array.from(files).forEach((file, index) => {
        checkPdfTextClient(file, index);
    });
    
    // Gemini 조언: CSS 우선순위 문제 해결
    modal.style.setProperty('display', 'flex', 'important');
    modal.style.setProperty('position', 'fixed', 'important');
    modal.style.setProperty('top', '0', 'important');
    modal.style.setProperty('left', '0', 'important');
    modal.style.setProperty('right', '0', 'important');
    modal.style.setProperty('bottom', '0', 'important');
    modal.style.setProperty('z-index', '99999', 'important');
    modal.style.setProperty('background', 'rgba(0, 0, 0, 0.5)', 'important');
    modal.style.setProperty('align-items', 'center', 'important');
    modal.style.setProperty('justify-content', 'center', 'important');
    
    console.log('모달 강제 표시 완료');
}

// 업로드 모달 닫기
export function closeUploadModal() {
    const modal = document.getElementById('uploadModal');
    if (modal) {
        modal.style.display = 'none';
    }
    window.pendingFiles = null;
}

// 클라이언트 사이드 PDF 텍스트 검사
async function checkPdfTextClient(file, index) {
    const statusEl = document.getElementById(`textStatus-${index}`);
    const ocrOptionEl = document.getElementById(`ocrOption-${index}`);
    const ocrCheckEl = document.getElementById(`ocrCheck-${index}`);
    const ocrLabelEl = document.getElementById(`ocrLabel-${index}`);
    
    try {
        // PDF.js 로드
        const pdfjs = await loadPdfJs();
        if (!pdfjs) {
            throw new Error('PDF.js 로드 실패');
        }
        
        // PDF.js를 사용하여 클라이언트에서 텍스트 검사
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjs.getDocument(arrayBuffer).promise;
        
        let totalText = '';
        const maxPages = Math.min(3, pdf.numPages); // 최대 3페이지만 검사
        
        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            totalText += pageText;
        }
        
        const hasText = totalText.trim().length > 150; // 150자 이상이면 텍스트 있음
        
        // 파일 객체에 검사 결과 저장
        window.pendingFiles[index].hasText = hasText;
        window.pendingFiles[index].useOcr = !hasText; // 텍스트 없으면 OCR 기본 ON
        
        // UI 업데이트
        if (hasText) {
            statusEl.className = 'text-check-status has-text';
            statusEl.innerHTML = '✅ 텍스트 PDF 감지됨';
            
            ocrCheckEl.checked = false;
            ocrCheckEl.disabled = false;
            ocrLabelEl.textContent = 'OCR 분석 (선택사항)';
        } else {
            statusEl.className = 'text-check-status no-text';
            statusEl.innerHTML = '❌ 텍스트가 없어 OCR 분석이 필요합니다';
            
            ocrCheckEl.checked = true;
            ocrCheckEl.disabled = true;
            ocrLabelEl.textContent = 'OCR 분석 (필수)';
        }
        
        ocrOptionEl.style.display = 'flex';
        
    } catch (error) {
        console.error('PDF 텍스트 검사 오류:', error);
        statusEl.className = 'text-check-status no-text';
        statusEl.innerHTML = '⚠️ 검사 실패 - OCR 분석 권장';
        
        // 오류 시 OCR을 기본으로 설정
        window.pendingFiles[index].hasText = false;
        window.pendingFiles[index].useOcr = true;
        
        ocrCheckEl.checked = true;
        ocrCheckEl.disabled = false;
        ocrLabelEl.textContent = 'OCR 분석 (권장)';
        ocrOptionEl.style.display = 'flex';
    }
}

// OCR 설정 업데이트
function updateOcrSetting(index, useOcr) {
    if (window.pendingFiles && window.pendingFiles[index]) {
        window.pendingFiles[index].useOcr = useOcr;
        console.log(`파일 ${index} OCR 설정: ${useOcr ? 'ON' : 'OFF'}`);
    }
}

// formatFileSize는 utils.js에서 import함

// 글로벌 함수로 노출 (HTML에서 직접 호출용)
window.showUploadModal = showUploadModal;
window.closeUploadModal = closeUploadModal;
window.updateOcrSetting = updateOcrSetting;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;
window.triggerSegmentResync = triggerSegmentResync;
window.applyBulkLanguage = applyBulkLanguage;
window.showUploadModalAnimated = showUploadModalAnimated;
window.closeUploadModalAnimated = closeUploadModalAnimated;

// 폴더 선택 옵션 로드
async function loadFolderSelectOptions() {
    const folderSelect = document.getElementById('uploadFolderSelect');
    if (!folderSelect) return;
    
    try {
        const response = await fetchApi('/api/folders');
        if (response.ok) {
            const data = await response.json();
            const folders = data.data || [];
            
            // 폴더 옵션 생성 (계층 구조 표시)
            folderSelect.innerHTML = '<option value="">루트 (최상위)</option>';
            
            // 폴더를 트리 구조로 변환하여 표시
            const folderTree = buildFolderTree(folders);
            addFolderOptionsRecursive(folderSelect, folderTree, 0);
            
        } else {
            console.error('폴더 목록 로드 실패');
            folderSelect.innerHTML = '<option value="">루트 (최상위)</option>';
        }
    } catch (error) {
        console.error('폴더 목록 로드 오류:', error);
        folderSelect.innerHTML = '<option value="">루트 (최상위)</option>';
    }
}

// 폴더 트리 구조 빌드 (폴더 트리 매니저와 동일한 로직)
function buildFolderTree(folders) {
    const folderMap = new Map();
    const rootFolders = [];
    
    // 모든 폴더를 맵에 저장
    folders.forEach(folder => {
        folderMap.set(folder.id, { ...folder, children: [] });
    });
    
    // 부모-자식 관계 설정
    folders.forEach(folder => {
        const folderItem = folderMap.get(folder.id);
        if (folder.parent_id && folderMap.has(folder.parent_id)) {
            folderMap.get(folder.parent_id).children.push(folderItem);
        } else {
            rootFolders.push(folderItem);
        }
    });
    
    return rootFolders;
}

// 재귀적으로 폴더 옵션 추가
function addFolderOptionsRecursive(selectElement, folders, depth) {
    folders.forEach(folder => {
        const indent = '　'.repeat(depth); // 전각 공백으로 들여쓰기
        const option = document.createElement('option');
        option.value = folder.id;
        option.textContent = `${indent}📁 ${folder.name}`;
        selectElement.appendChild(option);
        
        // 자식 폴더들 재귀 처리
        if (folder.children && folder.children.length > 0) {
            addFolderOptionsRecursive(selectElement, folder.children, depth + 1);
        }
    });
}

// 업로드에서 새 폴더 생성
async function createFolderFromUpload() {
    const folderName = prompt('새 폴더 이름을 입력하세요:');
    if (!folderName || !folderName.trim()) return;
    
    try {
        const response = await fetchApi('/api/folders', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                name: folderName.trim(),
                parent_id: null, // 최상위에 생성
                description: ''
            })
        });
        
        if (response.ok) {
            const data = await response.json();
            
            // 폴더 목록 다시 로드
            await loadFolderSelectOptions();
            
            // 새로 생성된 폴더를 선택
            const folderSelect = document.getElementById('uploadFolderSelect');
            if (folderSelect) {
                folderSelect.value = data.id;
            }
            
            showNotification(`폴더 "${folderName}"가 생성되었습니다.`, 'success');
        } else {
            const errorData = await response.json();
            showNotification(`폴더 생성 실패: ${errorData.detail}`, 'error');
        }
    } catch (error) {
        console.error('폴더 생성 오류:', error);
        showNotification('폴더 생성 중 오류가 발생했습니다.', 'error');
    }
}

// 글로벌 함수로 노출
window.createFolderFromUpload = createFolderFromUpload;