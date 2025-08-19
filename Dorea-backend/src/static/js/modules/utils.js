/* =====================================================
   Dorea Utils Module - Common Utilities
   ===================================================== */

// 동적 API URL 설정 (현재 호스트 기준)
const API_URL = window.location.origin;

// API 호출 래퍼
export async function fetchApi(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    
    // 기본 헤더 설정
    const defaultHeaders = {
        'Authorization': `Bearer ${token}`
    };
    
    // FormData가 아닌 경우에만 Content-Type 추가
    if (!(options.body instanceof FormData)) {
        defaultHeaders['Content-Type'] = 'application/json';
    }
    
    const finalHeaders = {
        ...defaultHeaders,
        ...options.headers
    };
    
    const response = await fetch(`${API_URL}${endpoint}`, {
        ...options,
        headers: finalHeaders
    });
    
    if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Network error' }));
        throw new Error(error.detail || `HTTP ${response.status}`);
    }
    
    return response;
}

// 알림 표시 함수
export function showNotification(message, type = 'info') {
    console.log('showNotification 호출됨:', message, type); // 디버깅
    
    const existingNotifications = document.querySelectorAll('.notification');
    existingNotifications.forEach(notif => notif.remove());

    const notification = document.createElement('div');
    notification.className = `notification ${type}`;

    const icons = {
        'info': 'ℹ️',
        'success': '✅',
        'warning': '⚠️',
        'error': '❌'
    };

    notification.innerHTML = `
        <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="font-size: 14px;">${icons[type] || icons.info}</span>
            <span style="font-size: 13px;">${message}</span>
        </div>
    `;
    
    // body에 추가해서 항상 보이도록
    document.body.appendChild(notification);
    console.log('body에 알림 추가됨'); // 디버깅
    
    console.log('알림 스타일 적용 후:', notification.style.cssText); // 디버깅

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }, 4000);
}

// 현재 시간 반환
export function getCurrentTime() {
    return new Date().toLocaleTimeString('ko-KR', {
        hour: '2-digit',
        minute: '2-digit'
    });
}

// 파일 크기 포맷팅
export function formatFileSize(bytes) {
    if (!bytes) return '';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
}

// 언어 코드를 언어 이름으로 변환
export function getLanguageName(code) {
    const languages = {
        'ko': '한국어',
        'en': 'English',
        'ja': '日本語',
        'zh': '中文',
        'fr': 'Français',
        'de': 'Deutsch',
        'es': 'Español'
    };
    return languages[code] || code;
}

// 상태 텍스트 반환
export function getStatusText(status) {
    const statusMap = {
        'checking': '텍스트 검사 중...',
        'waiting': '대기중',
        'processing': '처리중...',
        'completed': '완료',
        'error': '오류',
        'failed': '실패',
        'cancelled': '취소됨'
    };
    return statusMap[status] || status;
}

// 부드러운 스크롤 함수 (landing 페이지용)
export function setupSmoothScroll() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}

// 디바운스 함수
export function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// 쓰로틀 함수
export function throttle(func, limit) {
    let inThrottle;
    return function(...args) {
        if (!inThrottle) {
            func.apply(this, args);
            inThrottle = true;
            setTimeout(() => inThrottle = false, limit);
        }
    };
}

// 로그아웃 함수
export function logout() {
    localStorage.removeItem('token');
    window.location.href = '/login';
}

// API 키 검증
export async function verifyApiKeyOnLoad(apiKey) {
    try {
        const response = await fetch(`${API_URL}/auth/verify-key`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ api_key: apiKey })
        });

        if (!response.ok) {
            localStorage.removeItem('token');
            window.location.href = '/login';
        }
    } catch (error) {
        console.error('API 키 검증 오류:', error);
    }
}

// 글자 크기 조정 관련 변수 및 함수
let currentFontSizeLevel = 0; // -2~2 범위 (기본값 0)
const FONT_SIZE_LEVELS = [0.8, 0.9, 1.0, 1.1, 1.2]; // 배수

// 글자 크기 조정 함수
export function adjustFontSize(delta) {
    currentFontSizeLevel = Math.max(-2, Math.min(2, currentFontSizeLevel + delta));
    const multiplier = FONT_SIZE_LEVELS[currentFontSizeLevel + 2];
    
    // 채팅 메시지들의 글자 크기 조정
    const messageContents = document.querySelectorAll('.message-content');
    messageContents.forEach(content => {
        content.style.fontSize = `${16 * multiplier}px`; /* 기본 16px로 증가 */
    });
    
    // 채팅 입력창 글자 크기도 조정
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.style.fontSize = `${18 * multiplier}px`; /* 기본 18px로 증가 */
    }
    
    // 현재 글자 크기 레벨 저장
    localStorage.setItem('fontSizeLevel', currentFontSizeLevel.toString());
    
    // 피드백 표시
    const sizeTexts = ['매우 작게', '작게', '기본', '크게', '매우 크게'];
    showNotification(`글자 크기: ${sizeTexts[currentFontSizeLevel + 2]}`, 'info');
}

// 페이지 로드시 저장된 글자 크기 복원
export function restoreFontSize() {
    const savedLevel = localStorage.getItem('fontSizeLevel');
    if (savedLevel) {
        currentFontSizeLevel = parseInt(savedLevel);
        const multiplier = FONT_SIZE_LEVELS[currentFontSizeLevel + 2];
        
        // CSS 커스텀 속성으로 글자 크기 설정
        document.documentElement.style.setProperty('--chat-font-size', `${16 * multiplier}px`);
        document.documentElement.style.setProperty('--input-font-size', `${18 * multiplier}px`);
    }
}

// 전역 함수로 등록 (HTML onclick에서 사용하기 위해)
window.adjustFontSize = adjustFontSize;
window.logout = logout;