// auth.js - 단순화된 JWT 로그인 시스템

document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Dorea Login 페이지 시작');
    
    // JWT 토큰 확인 먼저
    const token = localStorage.getItem('token');
    if (token) {
        // JWT 토큰이 있으면 앱으로 리다이렉트
        window.location.href = '/app';
        return;
    }
    
    // 폼 제출 이벤트 리스너 설정
    setupFormEventListeners();
    
    // 키보드 이벤트 리스너 설정
    setupKeyboardEventListeners();
    
    console.log('✅ 단순화된 JWT 로그인 시스템 로드 완료');
});

// 폼 이벤트 리스너 설정
function setupFormEventListeners() {
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const username = document.getElementById('username').value.trim();
            const password = document.getElementById('password').value.trim();
            
            if (!username || !password) {
                showError('사용자 이름과 비밀번호를 입력해주세요.');
                return;
            }
            
            await handleUserLogin(username, password);
        });
    }
}

// 사용자 로그인 처리
async function handleUserLogin(username, password) {
    setLoading(true);
    hideError();
    
    try {
        const response = await fetch('/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                username: username,
                password: password
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            // JWT 토큰 저장
            localStorage.setItem('token', result.access_token);
            
            showSuccess('로그인 성공! 앱으로 이동합니다...');
            
            setTimeout(() => {
                window.location.href = '/app';
            }, 1000);
        } else {
            showError(result.detail || '로그인에 실패했습니다.');
        }
    } catch (error) {
        console.error('로그인 오류:', error);
        showError('네트워크 오류가 발생했습니다.');
    } finally {
        setLoading(false);
    }
}

// 키보드 이벤트 리스너 설정
function setupKeyboardEventListeners() {
    const passwordInput = document.getElementById('password');
    if (passwordInput) {
        passwordInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const loginForm = document.getElementById('loginForm');
                if (loginForm) {
                    loginForm.dispatchEvent(new Event('submit'));
                }
            }
        });
    }
}

// UI 헬퍼 함수들
function setLoading(isLoading) {
    const loadingIndicator = document.getElementById('loadingIndicator');
    const loginBtn = document.getElementById('loginBtn');
    
    if (isLoading) {
        loadingIndicator.style.display = 'flex';
        loginBtn.disabled = true;
        loginBtn.textContent = '처리 중...';
    } else {
        loadingIndicator.style.display = 'none';
        loginBtn.disabled = false;
        loginBtn.textContent = '로그인';
    }
}

function showError(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
}

function showSuccess(message) {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.textContent = message;
    errorMessage.style.display = 'block';
    errorMessage.style.background = '#f0fdf4';
    errorMessage.style.color = '#166534';
    errorMessage.style.borderColor = '#bbf7d0';
}

function hideError() {
    const errorMessage = document.getElementById('errorMessage');
    errorMessage.style.display = 'none';
}