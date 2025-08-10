/* =====================================================
   Dorea Auth Manager Module - Authentication Logic
   ===================================================== */

// 동적 API URL 설정 (현재 호스트 기준)
const API_URL = window.location.origin;

// API 키 검증 함수
export async function verifyApiKey(apiKey, silent = false, callbacks = {}) {
    const { onLoadingStart, onLoadingEnd, onSuccess, onError, onHideError } = callbacks;
    
    if (!silent) {
        if (onLoadingStart) onLoadingStart();
        if (onHideError) onHideError();
    }

    try {
        const response = await fetch(`${API_URL}/auth/verify-key`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ api_key: apiKey })
        });

        if (response.ok) {
            // API 키 검증 성공
            localStorage.setItem('gptApiKey', apiKey);

            if (!silent) {
                if (onSuccess) onSuccess();
                // 성공 메시지 표시 후 메인 페이지로 이동
                setTimeout(() => {
                    window.location.href = '/app';
                }, 1500);
            } else {
                // 조용한 자동 로그인
                window.location.href = '/app';
            }
        } else {
            const error = await response.json();
            if (!silent && onError) {
                onError(error.detail || 'API 키가 유효하지 않습니다. 다시 확인해주세요.');
            }
        }
    } catch (error) {
        console.error('API 키 검증 오류:', error);
        if (!silent && onError) {
            onError('서버 연결에 실패했습니다. 잠시 후 다시 시도해주세요.');
        }
    } finally {
        if (!silent && onLoadingEnd) {
            onLoadingEnd();
        }
    }
}

// 자동 로그인 처리
export function handleAutoLogin() {
    const savedApiKey = localStorage.getItem('gptApiKey');
    if (savedApiKey) {
        const apiKeyInput = document.getElementById('apiKey');
        if (apiKeyInput) {
            apiKeyInput.value = savedApiKey;
        }
        // 자동 로그인 시도 (조용히)
        verifyApiKey(savedApiKey, true);
    }
}

// Export 함수들은 auth.js에서 import하여 사용됨