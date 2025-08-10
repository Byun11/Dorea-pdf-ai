/* =====================================================
   Dorea Landing Animation Module - Demo Animations
   ===================================================== */

// Interactive Demo Animation
export function startDemoAnimation() {
    const typingIndicator = document.getElementById('typingIndicator');
    const demoChat = document.getElementById('demoChat');

    setTimeout(() => {
        typingIndicator.style.display = 'none';

        const aiResponse = document.createElement('div');
        aiResponse.className = 'chat-message ai';
        aiResponse.innerHTML = `
            선택하신 텍스트 영역을 요약해드릴게요:<br><br>
            📝 핵심 요약: 디지털 전환 가속화<br>
            🎯 주요 목표: 고객 경험 개선<br>
            ⏰ 예상 완료: 2025년 상반기
        `;

        demoChat.appendChild(aiResponse);

        // Auto scroll to bottom
        demoChat.scrollTop = demoChat.scrollHeight;

        // Restart animation after delay
        setTimeout(restartDemo, 5000);
    }, 3000);
}

export function restartDemo() {
    const demoChat = document.getElementById('demoChat');
    const typingIndicator = document.getElementById('typingIndicator');

    // Reset chat content
    demoChat.innerHTML = `
        <div class="chat-message user">
            이 차트 영역을 분석해주세요
        </div>
        <div class="chat-message ai">
            선택하신 차트를 분석해드릴게요!<br><br>
            📊 매출 추이 그래프 (2024년)<br>
            📈 3분기 대비 4분기 25% 성장<br>
            🎯 연간 목표 대비 108% 달성
        </div>
        <div class="chat-message user">
            5페이지 텍스트 부분을 요약해주세요
        </div>
        <div class="typing-indicator chat-message" id="typingIndicator">
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
            AI가 응답 중입니다...
        </div>
    `;

    setTimeout(startDemoAnimation, 2000);
}

// Export 함수들은 landing.js에서 import하여 사용됨