// register.js - 회원가입 페이지 JavaScript

document.addEventListener('DOMContentLoaded', function() {
    const registerForm = document.getElementById('registerForm');
    const registerBtn = document.getElementById('registerBtn');
    const loadingIndicator = document.getElementById('loadingIndicator');
    const errorMessage = document.getElementById('errorMessage');
    const successMessage = document.getElementById('successMessage');

    // 초기 상태 설정
    loadingIndicator.style.display = 'none';
    errorMessage.style.display = 'none';
    successMessage.style.display = 'none';

    registerForm.addEventListener('submit', async function(e) {
        e.preventDefault();
        
        const formData = new FormData(registerForm);
        const username = formData.get('username');
        const email = formData.get('email');
        const password = formData.get('password');
        const confirmPassword = formData.get('confirmPassword');

        // 클라이언트 측 유효성 검사
        if (!username || !email || !password || !confirmPassword) {
            showError('모든 필수 필드를 입력해주세요.');
            return;
        }

        if (password !== confirmPassword) {
            showError('비밀번호가 일치하지 않습니다.');
            return;
        }

        if (password.length < 6) {
            showError('비밀번호는 최소 6자 이상이어야 합니다.');
            return;
        }

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            showError('유효한 이메일 주소를 입력해주세요.');
            return;
        }

        // 로딩 상태 표시
        setLoading(true);
        hideMessages();

        try {
            const requestData = {
                username: username,
                email: email,
                password: password
            };

            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestData)
            });

            const result = await response.json();

            if (response.ok) {
                // 회원가입 성공
                showSuccess('회원가입이 완료되었습니다! 로그인 페이지로 이동합니다...');
                
                // 2초 후 로그인 페이지로 리다이렉트
                setTimeout(() => {
                    window.location.href = '/login';
                }, 2000);
            } else {
                // 회원가입 실패
                showError(result.detail || '회원가입에 실패했습니다.');
            }
        } catch (error) {
            console.error('회원가입 오류:', error);
            showError('네트워크 오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
        } finally {
            setLoading(false);
        }
    });

    function setLoading(isLoading) {
        if (isLoading) {
            loadingIndicator.style.display = 'flex';
            registerBtn.disabled = true;
            registerBtn.textContent = '처리 중...';
        } else {
            loadingIndicator.style.display = 'none';
            registerBtn.disabled = false;
            registerBtn.textContent = '회원가입';
        }
    }

    function showError(message) {
        errorMessage.textContent = message;
        errorMessage.style.display = 'block';
        successMessage.style.display = 'none';
    }

    function showSuccess(message) {
        successMessage.textContent = message;
        successMessage.style.display = 'block';
        errorMessage.style.display = 'none';
    }

    function hideMessages() {
        errorMessage.style.display = 'none';
        successMessage.style.display = 'none';
    }

    // 비밀번호 확인 실시간 검증
    const passwordField = document.getElementById('password');
    const confirmPasswordField = document.getElementById('confirmPassword');

    confirmPasswordField.addEventListener('input', function() {
        if (passwordField.value && confirmPasswordField.value) {
            if (passwordField.value !== confirmPasswordField.value) {
                confirmPasswordField.setCustomValidity('비밀번호가 일치하지 않습니다.');
            } else {
                confirmPasswordField.setCustomValidity('');
            }
        }
    });

    passwordField.addEventListener('input', function() {
        if (confirmPasswordField.value) {
            if (passwordField.value !== confirmPasswordField.value) {
                confirmPasswordField.setCustomValidity('비밀번호가 일치하지 않습니다.');
            } else {
                confirmPasswordField.setCustomValidity('');
            }
        }
    });
});