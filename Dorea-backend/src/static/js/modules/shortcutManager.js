/* =====================================================
   Dorea Shortcut Manager Module - Keyboard Shortcuts
   ===================================================== */

// 키보드 단축키 매니저 초기화
export function init() {
    document.addEventListener('keydown', handleKeyboardShortcuts);
    // 키보드 단축키 매니저 초기화 완료
}

// 키보드 단축키 처리
function handleKeyboardShortcuts(e) {
    // Ctrl+B 또는 Cmd+B로 사이드바 토글
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
        e.preventDefault();
        if (window.toggleSidebar) {
            window.toggleSidebar();
        }
    }
    
    // Ctrl+/ 또는 Cmd+/로 도움말 표시 (추후 구현)
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
        e.preventDefault();
        showShortcutHelp();
    }
    
    // ESC로 모달 닫기
    if (e.key === 'Escape') {
        closeActiveModals();
    }
    
    // Ctrl+Enter 또는 Cmd+Enter로 메시지 전송 (채팅 입력창에 포커스된 경우)
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        const chatInput = document.getElementById('chatInput');
        if (document.activeElement === chatInput && chatInput.value.trim()) {
            e.preventDefault();
            if (window.chatManager && window.chatManager.sendMessage) {
                window.chatManager.sendMessage();
            }
        }
    }
    
    // PDF 뷰어 단축키 (PDF가 로드된 경우에만)
    if (isPdfLoaded()) {
        // 좌우 화살표로 페이지 이동
        if (e.key === 'ArrowLeft' && !isInputFocused()) {
            e.preventDefault();
            if (window.pdfViewer && window.pdfViewer.previousPage) {
                window.pdfViewer.previousPage();
            }
        }
        
        if (e.key === 'ArrowRight' && !isInputFocused()) {
            e.preventDefault();
            if (window.pdfViewer && window.pdfViewer.nextPage) {
                window.pdfViewer.nextPage();
            }
        }
        
        // + / - 키로 줌
        if (e.key === '=' || e.key === '+') {
            if (!isInputFocused()) {
                e.preventDefault();
                if (window.pdfViewer && window.pdfViewer.zoomIn) {
                    window.pdfViewer.zoomIn();
                }
            }
        }
        
        if (e.key === '-' || e.key === '_') {
            if (!isInputFocused()) {
                e.preventDefault();
                if (window.pdfViewer && window.pdfViewer.zoomOut) {
                    window.pdfViewer.zoomOut();
                }
            }
        }
        
        // 0 키로 원본 크기
        if (e.key === '0' && !isInputFocused()) {
            e.preventDefault();
            if (window.pdfViewer && window.pdfViewer.resetZoom) {
                window.pdfViewer.resetZoom();
            }
        }
        
        // F 키로 너비 맞춤
        if (e.key === 'f' && !isInputFocused()) {
            e.preventDefault();
            if (window.pdfViewer && window.pdfViewer.fitToWidth) {
                window.pdfViewer.fitToWidth();
            }
        }
    }
}

// 도움말 모달 표시
function showShortcutHelp() {
    // 기존 도움말 모달이 있으면 제거
    const existingModal = document.getElementById('shortcutHelpModal');
    if (existingModal) {
        existingModal.remove();
    }
    
    const modal = document.createElement('div');
    modal.id = 'shortcutHelpModal';
    modal.className = 'modal';
    modal.style.display = 'block';
    
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 600px;">
            <div class="modal-header">
                <h2>⌨️ 키보드 단축키</h2>
                <button class="modal-close" onclick="document.getElementById('shortcutHelpModal').remove()">×</button>
            </div>
            <div class="modal-body">
                <div class="shortcut-section">
                    <h3>🔧 일반</h3>
                    <div class="shortcut-item">
                        <kbd>Ctrl</kbd> + <kbd>B</kbd>
                        <span>사이드바 토글</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl</kbd> + <kbd>/</kbd>
                        <span>단축키 도움말</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>ESC</kbd>
                        <span>모달 닫기</span>
                    </div>
                </div>
                
                <div class="shortcut-section">
                    <h3>💬 채팅</h3>
                    <div class="shortcut-item">
                        <kbd>Enter</kbd>
                        <span>메시지 전송</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Shift</kbd> + <kbd>Enter</kbd>
                        <span>줄바꿈</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl</kbd> + <kbd>Enter</kbd>
                        <span>강제 메시지 전송</span>
                    </div>
                </div>
                
                <div class="shortcut-section">
                    <h3>📄 PDF 뷰어</h3>
                    <div class="shortcut-item">
                        <kbd>←</kbd> / <kbd>→</kbd>
                        <span>페이지 이동</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>+</kbd> / <kbd>-</kbd>
                        <span>확대/축소</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>0</kbd>
                        <span>원본 크기</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>F</kbd>
                        <span>너비 맞춤</span>
                    </div>
                </div>
                
                <div class="shortcut-section">
                    <h3>🎯 세그먼트 선택</h3>
                    <div class="shortcut-item">
                        <kbd>클릭</kbd>
                        <span>단일 선택</span>
                    </div>
                    <div class="shortcut-item">
                        <kbd>Ctrl</kbd> + <kbd>클릭</kbd>
                        <span>다중 선택/해제</span>
                    </div>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(modal);
    
    // 모달 외부 클릭으로 닫기
    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            modal.remove();
        }
    });
}

// 활성 모달들 닫기
function closeActiveModals() {
    const modals = [
        'settingsModal',
        'uploadModal',
        'shortcutHelpModal'
    ];
    
    modals.forEach(modalId => {
        const modal = document.getElementById(modalId);
        if (modal && modal.style.display === 'block') {
            modal.style.display = 'none';
            // shortcutHelpModal은 동적으로 생성되므로 제거
            if (modalId === 'shortcutHelpModal') {
                modal.remove();
            }
        }
    });
}

// PDF 로드 상태 확인
function isPdfLoaded() {
    const pdfViewer = document.querySelector('.pdf-viewer');
    return pdfViewer && pdfViewer.style.display !== 'none';
}

// 입력 필드에 포커스된 상태 확인
function isInputFocused() {
    const activeElement = document.activeElement;
    return activeElement && (
        activeElement.tagName === 'INPUT' ||
        activeElement.tagName === 'TEXTAREA' ||
        activeElement.contentEditable === 'true'
    );
}

// CSS 스타일 추가 (단축키 도움말용)
function addShortcutStyles() {
    const existingStyle = document.getElementById('shortcut-styles');
    if (existingStyle) return;
    
    const style = document.createElement('style');
    style.id = 'shortcut-styles';
    style.textContent = `
        .shortcut-section {
            margin-bottom: 2rem;
        }
        
        .shortcut-section h3 {
            margin-bottom: 1rem;
            color: var(--text-primary);
            font-size: 1.1rem;
        }
        
        .shortcut-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 0.5rem 0;
            border-bottom: 1px solid var(--border-color);
        }
        
        .shortcut-item:last-child {
            border-bottom: none;
        }
        
        kbd {
            display: inline-block;
            padding: 0.2rem 0.4rem;
            font-size: 0.8rem;
            color: var(--text-primary);
            background-color: var(--bg-secondary);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            box-shadow: 0 1px 1px rgba(0, 0, 0, 0.1);
            font-family: monospace;
        }
        
        kbd + kbd {
            margin-left: 0.2rem;
        }
        
        .shortcut-item span {
            color: var(--text-secondary);
            font-size: 0.9rem;
        }
    `;
    
    document.head.appendChild(style);
}

// 초기화 시 스타일 추가
export function initStyles() {
    addShortcutStyles();
}

// 모듈 초기화 시 스타일도 함께 초기화
init();
initStyles();