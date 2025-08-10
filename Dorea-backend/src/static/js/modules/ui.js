/* =====================================================
   Dorea UI Module - User Interface Management
   ===================================================== */

import { showNotification } from './utils.js';
import { updateZoomControlsPosition } from './pdfViewer.js';

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

// 업로드 모달 표시 (애니메이션 적용)
export function showUploadModal(files) {
    const uploadModal = document.getElementById('uploadModal');
    const uploadFileList = document.getElementById('uploadFileList');
    
    if (!uploadModal || !uploadFileList) return;
    
    uploadFileList.innerHTML = '';

    if (files && files.length > 0) {
        files.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'upload-file-item';
            fileItem.innerHTML = `
                <div class="file-info">
                    <div class="file-icon">📄</div>
                    <div class="file-details">
                        <h4>${file.name}</h4>
                        <div class="file-size">${formatFileSize(file.size)}</div>
                    </div>
                </div>
                <select class="language-select file-language-select" data-file-index="${index}">
                    <option value="ko">한국어</option>
                    <option value="en">English</option>
                    <option value="ja">日本語</option>
                    <option value="zh">中文</option>
                    <option value="fr">Français</option>
                    <option value="de">Deutsch</option>
                    <option value="es">Español</option>
                    <option value="ru">Русский</option>
                    <option value="it">Italiano</option>
                    <option value="pt">Português</option>
                    <option value="ar">العربية</option>
                    <option value="hi">हिन्दी</option>
                </select>
            `;
            uploadFileList.appendChild(fileItem);
        });
        window.pendingFiles = files;
    }

    // 간단히 표시
    uploadModal.style.display = 'flex';
}

// 업로드 모달 닫기
export function closeUploadModal() {
    const uploadModal = document.getElementById('uploadModal');
    if (uploadModal) {
        uploadModal.style.display = 'none';
    }
    window.pendingFiles = null;
}

// 파일 크기 포맷팅 (로컬 함수)
function formatFileSize(bytes) {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

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

// 글로벌 함수로 노출 (HTML에서 직접 호출용)
window.showUploadModal = showUploadModal;
window.closeUploadModal = closeUploadModal;
window.toggleSidebar = toggleSidebar;
window.toggleTheme = toggleTheme;
window.triggerSegmentResync = triggerSegmentResync;
window.applyBulkLanguage = applyBulkLanguage;
window.showUploadModalAnimated = showUploadModalAnimated;
window.closeUploadModalAnimated = closeUploadModalAnimated;