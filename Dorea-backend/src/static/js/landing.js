/* =====================================================
   Dorea Landing Main Controller - Module Orchestration
   ===================================================== */

import { startDemoAnimation } from './modules/landingAnimation.js';
import { setupSmoothScroll } from './modules/utils.js';

// 페이지 로드시 모든 기능 초기화
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Dorea Landing 페이지 시작');
    
    // 부드러운 스크롤 설정
    setupSmoothScroll();
    
    // 데모 애니메이션 시작 (3초 후)
    setTimeout(startDemoAnimation, 3000);
    
    console.log('✅ Landing 모듈화된 시스템 로드 완료');
});