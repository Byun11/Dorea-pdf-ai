/* =====================================================
   Dorea Main Controller - Module Orchestration
   ===================================================== */

import * as Utils from './modules/utils.js';
import * as UI from './modules/ui.js';
import * as PDFViewer from './modules/pdfViewer.js';
import * as SegmentManager from './modules/segmentManager.js';
import * as FileManager from './modules/fileManager.js';
import * as Chat from './modules/chat.js';
import * as OllamaManager from './modules/ollamaManager.js';
import * as ShortcutManager from './modules/shortcutManager.js';
import './modules/folderTreeManager.js'; // 글로벌 객체로 등록됨
import './modules/ragSourcesManager.js'; // RAG 출처 매니저 (글로벌로 등록됨)
import { knowledgeManager } from './modules/knowledgeManager.js';

// 페이지 로드시 초기화
window.addEventListener('DOMContentLoaded', async () => {
    const token = localStorage.getItem('token');
    if (!token) {
        window.location.href = '/login';
        return;
    }

    // JWT 토큰 검증 및 사용자 정보 로드
    await verifyTokenAndLoadUser(token);
    
    // Dorea 애플리케이션 시작
    
    // 저장된 글자 크기 복원
    Utils.restoreFontSize();
    
    // 모든 모듈 초기화
    initializeModules();
    
    // 모듈 간 이벤트 연결
    setupModuleIntegration();
    
    // 랜딩 오버레이 드래그앤드롭 이벤트 설정
    setupLandingOverlayEvents();
    
    // 초기 상태에서 AI 패널 숨김 (HTML에서 이미 hidden 클래스로 설정되어 있음)
    
    // 네비게이션 탭 이벤트 리스너 설정
    setupNavigationTabs();
    
    // Dorea 모듈화된 시스템 로드 완료
});

// 모든 모듈 초기화
function initializeModules() {
    UI.init();
    PDFViewer.init();
    SegmentManager.init();
    FileManager.init();
    Chat.init();
    OllamaManager.init();
    ShortcutManager.init();
    
    // Chat 모듈 추가 초기화 (RAG 모드 등)
    if (window.initializeChat) {
        window.initializeChat();
    }
    
    // 폴더 트리 매니저 초기화 (기존 파일 매니저 이후)
    if (window.folderTreeManager) {
        window.folderTreeManager.init();
    }
}

// 모듈 간 연결 설정
function setupModuleIntegration() {
    // 파일 로드 이벤트 처리
    document.addEventListener('fileLoaded', async (event) => {
        const { fileId, fileName, pdfData, segments } = event.detail;
        
        try {
            // 랜딩 오버레이 숨기기
            hideLandingOverlay();
            
            // AI 패널 보이기 (처리된 파일 클릭시에만)
            showAIPanel();
            
            // PDF 뷰어에 문서 로드
            const pdfDoc = await PDFViewer.loadPdf(pdfData);
            
            // 세그먼트 매니저에 세그먼트 데이터 설정
            SegmentManager.setSegments(segments);
            
            // 첫 페이지 렌더링 (기존 업로드 존은 이미 제거됨)
            await PDFViewer.renderPage(1);
            
            // 파일 통합 로드 완료
            
        } catch (error) {
            console.error('파일 로드 중 오류:', error);
            Utils.showNotification(`파일 로드 실패: ${error.message}`, 'error');
        }
    });
    
    // 파일 업로드 완료 이벤트 처리 (폴더 트리 새로고침)
    document.addEventListener('fileUploaded', async () => {
        if (window.folderTreeManager) {
            await window.folderTreeManager.loadFolderTree();
        }
    });
    
    // 파일 삭제 이벤트 처리
    document.addEventListener('fileDeleted', async (event) => {
        console.log('🗑️ 파일 삭제 이벤트 처리 시작');
        
        // PDF 뷰어 초기화 및 렌더링 세션 무효화
        if (window.PDFViewer && typeof PDFViewer.hideViewer === 'function') {
            PDFViewer.hideViewer();
        }
        
        // 전역 렌더링 정리 (pdfViewer.js의 전역 함수 호출)
        if (window.pdfForceClean && typeof window.pdfForceClean === 'function') {
            window.pdfForceClean();
        }
        
        // 세그먼트 선택 해제
        SegmentManager.clearAllSegments();
        SegmentManager.setSegments([]);
        
        // AI 패널 숨기기
        hideAIPanel();
        console.log('💬 AI 패널 숨김 완료');
        
        // 폴더 트리 새로고침
        if (window.folderTreeManager) {
            await window.folderTreeManager.loadFolderTree();
        }
        
        // 기존 업로드 존은 이미 제거됨 (랜딩 오버레이로 대체)
        
        // PDF 컨테이너 내 모든 PDF 뷰어 관련 요소들 완전 정리
        const pdfContainer = document.getElementById('pdfContainer');
        if (pdfContainer) {
            // PDF 뷰어 관련 모든 요소들 숨기기
            const elementsToHide = [
                '.pdf-viewer',
                '.zoom-controls', 
                '.page-controls',
                '.view-settings',
                '.segment-overlay',
                'canvas'
            ];
            
            elementsToHide.forEach(selector => {
                const elements = pdfContainer.querySelectorAll(selector);
                elements.forEach(element => {
                    element.style.display = 'none';
                    element.style.visibility = 'hidden';
                });
            });
            
            console.log('🧹 PDF 뷰어 관련 요소들 모두 정리됨');
        }
        
        // 전체 문서에서도 PDF 뷰어 관련 요소들 정리 (body 레벨)
        const globalElementsToHide = document.querySelectorAll('.zoom-controls, .page-controls, .view-settings');
        globalElementsToHide.forEach(element => {
            element.style.display = 'none';
            element.style.visibility = 'hidden';
        });
        
        // 랜딩 오버레이 다시 보이기
        showLandingOverlay();
        
        console.log('✅ 파일 삭제 - 모든 모듈 초기화 완료');
    });
    
    // 페이지 렌더링 완료 후 세그먼트 오버레이 업데이트는 
    // segmentManager.js에서 이미 처리됨 (pageRendered 이벤트)
    
    // 빠른 액션 트리거는 chat.js에서 이미 처리됨
    
    // 모듈 간 연결 설정 완료
}

// AI 패널 표시/숨김 제어 함수
function showAIPanel() {
    const aiPanel = document.getElementById('aiPanel');
    if (aiPanel) {
        aiPanel.classList.remove('hidden');
    }
}

function hideAIPanel() {
    const aiPanel = document.getElementById('aiPanel');
    if (aiPanel) {
        aiPanel.classList.add('hidden');
    }
}

// 랜딩 오버레이 이벤트 설정
function setupLandingOverlayEvents() {
    const landingOverlay = document.getElementById('landingOverlay');
    const uploadArea = document.querySelector('.upload-area');
    
    if (landingOverlay && uploadArea) {
        // 드래그앤드롭 이벤트 설정
        landingOverlay.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--primary)';
            uploadArea.style.background = 'var(--bg-tertiary)';
            uploadArea.style.transform = 'translateY(-2px)';
        });

        landingOverlay.addEventListener('dragleave', (e) => {
            if (!landingOverlay.contains(e.relatedTarget)) {
                uploadArea.style.borderColor = 'var(--border-secondary)';
                uploadArea.style.background = 'var(--bg-secondary)';
                uploadArea.style.transform = 'translateY(0)';
            }
        });

        landingOverlay.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'var(--border-secondary)';
            uploadArea.style.background = 'var(--bg-secondary)';
            uploadArea.style.transform = 'translateY(0)';
            
            const files = Array.from(e.dataTransfer.files).filter(file => file.type === 'application/pdf');
            console.log('🎯 드래그앤드롭 파일들:', files);
            if (files.length > 0) {
                console.log('📂 PDF 파일들 감지됨, 업로드 모달 표시 시작');
                // 랜딩 오버레이는 숨기지 않고 모달만 표시
                FileManager.handleMultipleFiles(files);
            } else {
                console.log('❌ PDF 파일이 없음');
            }
        });
    }
}

// 랜딩 오버레이 숨기기
function hideLandingOverlay() {
    const landingOverlay = document.getElementById('landingOverlay');
    if (landingOverlay) {
        landingOverlay.classList.add('hidden');
        landingOverlay.style.display = 'none'; // 즉시 사라지도록 수정
        console.log('📄 랜딩 오버레이 숨김');
    }
}

// 랜딩 오버레이 보이기 (홈으로 돌아갈 때)
function showLandingOverlay() {
    const landingOverlay = document.getElementById('landingOverlay');
    const landingContainer = document.querySelector('.landing-container');
    
    if (landingOverlay) {
        // display none 상태에서 복구
        landingOverlay.style.display = 'block';
        // 즉시 hidden 클래스 제거하여 opacity와 visibility 복구
        landingOverlay.classList.remove('hidden');
    }
    
    if (landingContainer) {
        // landing-container도 확실히 표시
        landingContainer.style.display = 'flex';
        landingContainer.style.visibility = 'visible';
        landingContainer.style.opacity = '1';
    }
}

// 로고 클릭시 홈으로 돌아가기
function goHome() {
    // 파일 삭제 이벤트를 발생시켜 기존 로직 재사용
    const event = new CustomEvent('fileDeleted');
    document.dispatchEvent(event);
    
    // 추가로 AI 패널 확실히 숨기기
    hideAIPanel();
    
    // 랜딩 오버레이 다시 보이기
    showLandingOverlay();
    
    console.log('🏠 홈 화면으로 돌아갔습니다');
}

// 글로벌 에러 핸들링
window.addEventListener('unhandledrejection', (event) => {
    console.error('처리되지 않은 Promise 거부:', event.reason);
    Utils.showNotification('예상치 못한 오류가 발생했습니다. 페이지를 새로고침해주세요.', 'error');
});

window.addEventListener('error', (event) => {
    console.error('JavaScript 오류:', event.error);
    Utils.showNotification('일시적인 오류가 발생했습니다.', 'error');
});

// HTML onclick에서 접근할 수 있도록 모든 필요한 함수를 글로벌에 노출
window.logout = Utils.logout;
window.toggleTheme = UI.toggleTheme;
window.toggleSidebar = UI.toggleSidebar;
window.openSettingsModal = OllamaManager.openSettingsModal;
window.closeSettingsModal = OllamaManager.closeSettingsModal;
window.processFiles = FileManager.processFiles;
window.goHome = goHome;

// 개별 함수들도 노출 (HTML에서 직접 호출)
window.fileManager = {
    selectFile: FileManager.selectFile,
    deleteFile: FileManager.deleteFile,
    cancelFile: FileManager.cancelFile,
    retryFile: FileManager.retryFile,
    getFileQueue: FileManager.getFileQueue,
    removeFromQueue: FileManager.removeFromQueue
};

// 세그먼트 관련 함수들 (일부는 직접 호출됨)
window.clearAllSegments = SegmentManager.clearAllSegments;
window.quickAction = SegmentManager.quickAction;
window.toggleImageMode = SegmentManager.toggleImageMode;

window.segmentManager = {
    removeSegment: SegmentManager.removeSegment,
    quickAction: SegmentManager.quickAction,
    getSelectedSegments: SegmentManager.getSelectedSegments,
    clearAllSegments: SegmentManager.clearAllSegments,
    getImageModeStatus: SegmentManager.getImageModeStatus,
    toggleImageMode: SegmentManager.toggleImageMode
};

// 채팅 관련 함수들 (일부는 직접 호출됨)
window.switchToSession = Chat.switchToSession;
window.newSession = Chat.newSession;
window.renameSession = Chat.renameSession;
window.deleteSession = Chat.deleteSession;
window.sendMessage = Chat.sendMessage;

window.chat = {
    sendMessage: Chat.sendMessage,
    sendMessageWithImage: Chat.sendMessageWithImage
};

window.chatManager = {
    switchToSession: Chat.switchToSession,
    newSession: Chat.newSession,
    renameSession: Chat.renameSession,
    deleteSession: Chat.deleteSession
};

window.pdfViewer = {
    zoomIn: PDFViewer.zoomIn,
    zoomOut: PDFViewer.zoomOut,
    resetZoom: PDFViewer.resetZoom,
    fitToWidth: PDFViewer.fitToWidth,
    fitToHeight: PDFViewer.fitToHeight,
    nextPage: PDFViewer.nextPage,
    previousPage: PDFViewer.previousPage,
    goToPage: PDFViewer.goToPage,
    highlightSegmentText: PDFViewer.highlightSegmentText,
    clearHighlights: PDFViewer.clearHighlights,
    captureSegmentAsImage: PDFViewer.captureSegmentAsImage,
    captureCurrentView: PDFViewer.captureCurrentView,
    closeTempChat: PDFViewer.closeTempChat,
    sendImageQuery: PDFViewer.sendImageQuery,
    cancelCaptureMode: PDFViewer.cancelCaptureMode,
    getCurrentPage: PDFViewer.getCurrentPage,
    setViewMode: PDFViewer.setViewMode,
    toggleSegments: PDFViewer.toggleSegments,
    toggleViewSettings: PDFViewer.toggleViewSettings,
    updateZoomControlsPosition: PDFViewer.updateZoomControlsPosition
};

// Ollama 관련 함수들 (일부는 직접 호출됨)
window.selectProvider = OllamaManager.selectProvider;
window.pullModel = OllamaManager.pullModel;
window.deleteModel = OllamaManager.deleteModel;
window.saveModelSettings = OllamaManager.saveModelSettings;

window.ollamaManager = {
    selectProvider: OllamaManager.selectProvider,
    pullModel: OllamaManager.pullModel,
    deleteModel: OllamaManager.deleteModel,
    saveModelSettings: OllamaManager.saveModelSettings
};

// Knowledge Manager 함수들 (지식 관리 페이지용)
window.knowledgeManager = knowledgeManager;

// Dorea 모듈화 완료 - 모든 함수가 글로벌에 노출됨

// JWT 토큰 검증 및 사용자 정보 로드
async function verifyTokenAndLoadUser(token) {
    try {
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            console.log('✅ 사용자 정보 로드 완료:', user.username);
            
            // 설정 모달에 현재 API 키 상태 표시
            updateApiKeyUI(user.api_key);
        } else {
            console.error('❌ 사용자 정보 로드 실패');
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('❌ 네트워크 오류:', error);
        localStorage.removeItem('token');
        window.location.href = '/login';
    }
}

// API 키 UI 업데이트
function updateApiKeyUI(apiKey) {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const apiKeyStatus = document.getElementById('apiKeyStatus');
    
    if (apiKey) {
        // 마스킹된 API 키 표시
        const maskedKey = `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
        apiKeyInput.placeholder = `현재 설정됨: ${maskedKey}`;
        apiKeyStatus.textContent = `✅ API 키가 설정되어 있습니다 (${maskedKey})`;
        apiKeyStatus.className = 'api-status success';
        apiKeyStatus.classList.remove('hidden');
        
        // 기존 키 알림 추가
        const apiKeyCard = document.querySelector('.api-key-card');
        if (apiKeyCard && !apiKeyCard.querySelector('.existing-key-notice')) {
            const notice = document.createElement('div');
            notice.className = 'existing-key-notice';
            notice.innerHTML = `
                <div style="
                    background: linear-gradient(135deg, rgba(16, 185, 129, 0.1) 0%, rgba(255, 255, 255, 0.8) 100%);
                    border: 1px solid rgba(16, 185, 129, 0.3);
                    border-radius: var(--radius-md);
                    padding: var(--space-3);
                    margin-bottom: var(--space-3);
                    display: flex;
                    align-items: center;
                    gap: var(--space-2);
                ">
                    <span style="font-size: 16px;">✅</span>
                    <div>
                        <div style="font-size: 12px; font-weight: 600; color: #059669;">기존 API 키가 설정되어 있습니다</div>
                        <div style="font-size: 11px; color: #065f46;">새 API 키를 입력하면 기존 키가 교체됩니다</div>
                    </div>
                </div>
            `;
            apiKeyCard.insertBefore(notice, apiKeyCard.querySelector('.api-key-form'));
        }
    } else {
        apiKeyInput.placeholder = 'sk-proj-...';
        apiKeyStatus.textContent = '⚠️ GPT 모델 사용을 위해 API 키를 설정해주세요';
        apiKeyStatus.className = 'api-status warning';
        apiKeyStatus.classList.remove('hidden');
        
        // 기존 키 알림 제거
        const existingNotice = document.querySelector('.existing-key-notice');
        if (existingNotice) {
            existingNotice.remove();
        }
    }
}

// API 키 저장 함수
async function saveApiKey() {
    const apiKeyInput = document.getElementById('apiKeyInput');
    const saveBtn = document.getElementById('saveApiKeyBtn');
    const statusDiv = document.getElementById('apiKeyStatus');
    const token = localStorage.getItem('token');
    
    const apiKey = apiKeyInput.value.trim();
    if (!apiKey) {
        showApiKeyStatus('API 키를 입력해주세요', 'error');
        return;
    }
    
    // 로딩 상태
    saveBtn.disabled = true;
    saveBtn.textContent = '저장 중...';
    
    try {
        const response = await fetch('/api/me/api-key', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({ api_key: apiKey })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showApiKeyStatus('✅ API 키가 성공적으로 저장되었습니다', 'success');
            apiKeyInput.value = '';
            
            // API 키 UI 업데이트 (마스킹된 키로)
            const maskedKey = `${apiKey.substring(0, 8)}...${apiKey.substring(apiKey.length - 4)}`;
            apiKeyInput.placeholder = `현재 설정됨: ${maskedKey}`;
            
            // 기존 키 알림 추가
            updateApiKeyUI(apiKey);
        } else {
            showApiKeyStatus(`❌ ${result.detail}`, 'error');
        }
    } catch (error) {
        console.error('API 키 저장 오류:', error);
        showApiKeyStatus('❌ 네트워크 오류가 발생했습니다', 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = '저장';
    }
}

// API 키 상태 메시지 표시
function showApiKeyStatus(message, type) {
    const statusDiv = document.getElementById('apiKeyStatus');
    statusDiv.textContent = message;
    statusDiv.classList.remove('hidden');
    
    // 기존 클래스 제거
    statusDiv.classList.remove('success', 'error', 'warning');
    
    if (type === 'success') {
        statusDiv.className = 'api-status success';
    } else if (type === 'error') {
        statusDiv.className = 'api-status error';
    } else {
        statusDiv.className = 'api-status warning';
    }
    
    // 3초 후 메시지 페이드아웃 (성공 메시지인 경우)
    if (type === 'success') {
        setTimeout(() => {
            statusDiv.style.opacity = '0.5';
            setTimeout(() => {
                statusDiv.classList.add('hidden');
                statusDiv.style.opacity = '1';
            }, 500);
        }, 3000);
    }
}

// 로그아웃 함수
function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
}

// GPT Provider 선택 (API 키 확인)
async function selectGptProvider() {
    try {
        const token = localStorage.getItem('token');
        const response = await fetch('/api/me', {
            headers: {
                'Authorization': `Bearer ${token}`
            }
        });
        
        if (response.ok) {
            const user = await response.json();
            
            if (!user.api_key) {
                // API 키가 없으면 설정 페이지의 API 키 입력 필드로 이동
                showApiKeyRequiredAlert();
            } else {
                // API 키가 있으면 GPT 모델 선택
                selectProvider('gpt');
            }
        }
    } catch (error) {
        console.error('사용자 정보 조회 오류:', error);
        showApiKeyRequiredAlert();
    }
}

// API 키 설정 안내 알림
function showApiKeyRequiredAlert() {
    // 설정 모달이 이미 열려있는지 확인
    const settingsModal = document.getElementById('settingsModal');
    if (settingsModal && settingsModal.style.display !== 'block') {
        // 설정 모달 열기
        openSettingsModal();
    }
    
    // API 키 입력 필드에 포커스
    setTimeout(() => {
        const apiKeyInput = document.getElementById('apiKeyInput');
        if (apiKeyInput) {
            apiKeyInput.focus();
            apiKeyInput.style.borderColor = '#f59e0b'; // 주황색 테두리
            apiKeyInput.placeholder = 'GPT 모델 사용을 위해 API 키를 입력하세요';
        }
        
        // 상태 메시지 표시
        showApiKeyStatus('⚠️ GPT 모델 사용을 위해서는 API 키가 필요합니다', 'warning');
    }, 100);
}

// 고급 옵션 토글 함수
function toggleAdvancedOptions() {
    const section = document.getElementById('advancedOptionsSection');
    const icon = document.getElementById('advancedOptionsIcon');
    
    if (section && icon) {
        const isExpanded = section.style.display !== 'none';
        
        if (isExpanded) {
            // 축소
            section.classList.remove('expanded');
            icon.classList.remove('rotated');
            
            setTimeout(() => {
                section.style.display = 'none';
            }, 300);
        } else {
            // 확장
            section.style.display = 'block';
            
            setTimeout(() => {
                section.classList.add('expanded');
                icon.classList.add('rotated');
            }, 10);
        }
    }
}

// 임베딩 관리 관련 함수들 (HTML onclick에서 사용)
window.embeddingToggleAdvancedOptions = () => {
    const section = document.getElementById('embeddingAdvancedOptionsSection');
    const icon = document.getElementById('embeddingAdvancedOptionsIcon');
    
    if (section && icon) {
        const isExpanded = section.style.display !== 'none';
        
        if (isExpanded) {
            // 축소
            section.classList.remove('expanded');
            icon.classList.remove('rotated');
            
            setTimeout(() => {
                section.style.display = 'none';
            }, 300);
        } else {
            // 확장
            section.style.display = 'block';
            
            setTimeout(() => {
                section.classList.add('expanded');
                icon.classList.add('rotated');
            }, 10);
        }
    }
};

// 임베딩 모델 다운로드 중단 함수
window.cancelEmbeddingModelDownload = () => {
    if (window.knowledgeManager) {
        window.knowledgeManager.cancelEmbeddingModelDownload();
    }
};

// ===== 페이지 전환 관리 =====

// 현재 뷰 상태
let currentView = 'chat';

// 네비게이션 탭 이벤트 리스너 설정
function setupNavigationTabs() {
    const navTabs = document.querySelectorAll('.nav-tab');
    
    navTabs.forEach(tab => {
        tab.addEventListener('click', (e) => {
            const view = e.currentTarget.dataset.view;
            if (view) {
                switchView(view);
            }
        });
    });
}

// 뷰 전환 함수 (전역으로 노출)
window.switchView = function(view) {
    if (currentView === view) return;
    
    console.log(`🔄 페이지 전환: ${currentView} → ${view}`);
    
    // 탭 버튼 상태 업데이트
    updateNavTabs(view);
    
    // 뷰 전환
    switch (view) {
        case 'chat':
            showChatView();
            break;
        case 'knowledge':
            showKnowledgeView();
            break;
    }
    
    currentView = view;
};

// 채팅 뷰 표시
function showChatView() {
    // 기존 컨테이너들 표시
    const container = document.querySelector('.container');
    const knowledgeContainer = document.getElementById('knowledgeContainer');
    
    if (container) container.style.display = 'flex';
    if (knowledgeContainer) knowledgeContainer.style.display = 'none';

    // PDF 로드 상태에 따라 컨트롤 바 표시/숨김
    if (PDFViewer.getPdfDoc()) {
        PDFViewer.showPdfControls();
    } else {
        PDFViewer.hidePdfControls();
    }
}

// 지식 관리 뷰 표시
async function showKnowledgeView() {
    // 기존 컨테이너들 숨기기
    const container = document.querySelector('.container');
    const knowledgeContainer = document.getElementById('knowledgeContainer');
    
    if (container) container.style.display = 'none';
    
    // 지식 관리 뷰 표시
    if (window.knowledgeManager) {
        await window.knowledgeManager.showKnowledgeView();
    }

    // 지식 뷰에서는 항상 PDF 컨트롤 바 숨김
    PDFViewer.hidePdfControls();
}

// 네비게이션 탭 상태 업데이트
function updateNavTabs(activeView) {
    const chatTab = document.getElementById('chatTab');
    const knowledgeTab = document.getElementById('knowledgeTab');
    
    if (chatTab && knowledgeTab) {
        chatTab.classList.toggle('active', activeView === 'chat');
        knowledgeTab.classList.toggle('active', activeView === 'knowledge');
    }
}


// HTML onclick에서 접근할 수 있도록 모든 필요한 함수를 글로벌에 노출
window.logout = Utils.logout;
window.toggleTheme = UI.toggleTheme;
window.toggleSidebar = UI.toggleSidebar;
window.openSettingsModal = OllamaManager.openSettingsModal;
window.closeSettingsModal = OllamaManager.closeSettingsModal;
window.processFiles = FileManager.processFiles;
window.goHome = goHome;

// Ollama 관련 함수들 (일부는 직접 호출됨)
window.selectProvider = OllamaManager.selectProvider;
window.pullModel = OllamaManager.pullModel;
window.deleteModel = OllamaManager.deleteModel;
window.saveModelSettings = OllamaManager.saveModelSettings;

// Knowledge Manager 함수들 (지식 관리 페이지용)
window.knowledgeManager = knowledgeManager;

// 개별 함수들도 노출 (HTML에서 직접 호출)
window.fileManager = {
    selectFile: FileManager.selectFile,
    deleteFile: FileManager.deleteFile,
    cancelFile: FileManager.cancelFile,
    retryFile: FileManager.retryFile,
    getFileQueue: FileManager.getFileQueue,
    removeFromQueue: FileManager.removeFromQueue
};

// 세그먼트 관련 함수들 (일부는 직접 호출됨)
window.clearAllSegments = SegmentManager.clearAllSegments;
window.quickAction = SegmentManager.quickAction;
window.toggleImageMode = SegmentManager.toggleImageMode;

window.segmentManager = {
    removeSegment: SegmentManager.removeSegment,
    quickAction: SegmentManager.quickAction,
    getSelectedSegments: SegmentManager.getSelectedSegments,
    clearAllSegments: SegmentManager.clearAllSegments,
    getImageModeStatus: SegmentManager.getImageModeStatus,
    toggleImageMode: SegmentManager.toggleImageMode
};

// 채팅 관련 함수들 (일부는 직접 호출됨)
window.switchToSession = Chat.switchToSession;
window.newSession = Chat.newSession;
window.renameSession = Chat.renameSession;
window.deleteSession = Chat.deleteSession;
window.sendMessage = Chat.sendMessage;

window.chat = {
    sendMessage: Chat.sendMessage,
    sendMessageWithImage: Chat.sendMessageWithImage
};

window.chatManager = {
    switchToSession: Chat.switchToSession,
    newSession: Chat.newSession,
    renameSession: Chat.renameSession,
    deleteSession: Chat.deleteSession
};

window.pdfViewer = {
    zoomIn: PDFViewer.zoomIn,
    zoomOut: PDFViewer.zoomOut,
    resetZoom: PDFViewer.resetZoom,
    fitToWidth: PDFViewer.fitToWidth,
    fitToHeight: PDFViewer.fitToHeight,
    nextPage: PDFViewer.nextPage,
    previousPage: PDFViewer.previousPage,
    goToPage: PDFViewer.goToPage,
    highlightSegmentText: PDFViewer.highlightSegmentText,
    clearHighlights: PDFViewer.clearHighlights,
    captureSegmentAsImage: PDFViewer.captureSegmentAsImage,
    captureCurrentView: PDFViewer.captureCurrentView,
    closeTempChat: PDFViewer.closeTempChat,
    sendImageQuery: PDFViewer.sendImageQuery,
    cancelCaptureMode: PDFViewer.cancelCaptureMode,
    getCurrentPage: PDFViewer.getCurrentPage,
    setViewMode: PDFViewer.setViewMode,
    toggleSegments: PDFViewer.toggleSegments,
    toggleViewSettings: PDFViewer.toggleViewSettings,
    updateZoomControlsPosition: PDFViewer.updateZoomControlsPosition
};

window.ollamaManager = {
    selectProvider: OllamaManager.selectProvider,
    pullModel: OllamaManager.pullModel,
    deleteModel: OllamaManager.deleteModel,
    saveModelSettings: OllamaManager.saveModelSettings
};

// 글로벌 함수로 노출
window.saveApiKey = saveApiKey;
window.logout = logout;
window.selectGptProvider = selectGptProvider;
window.toggleAdvancedOptions = toggleAdvancedOptions;