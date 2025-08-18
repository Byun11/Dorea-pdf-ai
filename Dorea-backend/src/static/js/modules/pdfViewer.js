/* =====================================================
   Dorea PDF Viewer Module - PDF Rendering & Controls
   ===================================================== */

import { showNotification } from './utils.js';

// PDF 뷰어 상태 변수
let pdfDoc = null;
let currentPage = 1;
let currentScale = 1.5;
let minScale = 0.2; // PDF 최소 줌 20%까지 축소 가능
let maxScale = 3.0;
let scaleStep = 0.1; // 줌 스텝을 더 작게 하여 세밀한 조정 가능
let autoFit = false;
let viewMode = 'continuous'; // 'single' | 'dual' | 'continuous'

// 렌더링 관리 변수
let activeRenderTasks = new Map(); // 페이지별 활성 렌더링 작업
let renderQueue = []; // 렌더링 대기열
let isRenderingBatch = false; // 배치 렌더링 중인지 확인

// 🚀 새로운 렌더링 큐 시스템 (기존 변수들과 병존)
class RenderQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.currentTask = null;
        this.maxConcurrentTasks = 2; // 동시 렌더링 최대 2개
    }
    
    addTask(pageNum, priority = 'normal', renderFn = null) {
        // 기존 동일 페이지 작업이 있으면 취소
        this.cancelPageTask(pageNum);
        
        const task = { 
            pageNum, 
            priority, 
            timestamp: Date.now(),
            renderFunction: renderFn
        };
        
        if (priority === 'urgent') {
            // 긴급 작업은 맨 앞에 (현재 보이는 페이지)
            this.queue.unshift(task);
        } else {
            this.queue.push(task);
        }
        
        this.processQueue();
        return task;
    }
    
    cancelPageTask(pageNum) {
        // 큐에서 해당 페이지 작업 제거
        this.queue = this.queue.filter(task => task.pageNum !== pageNum);
        
        // 기존 activeRenderTasks와 연동
        if (activeRenderTasks.has(pageNum)) {
            try {
                activeRenderTasks.get(pageNum).cancel();
            } catch (error) {
                // 이미 완료된 작업은 무시
            }
            activeRenderTasks.delete(pageNum);
        }
    }
    
    clearLowPriorityTasks() {
        // 사용자가 폭풍 스크롤할 때 대기중인 일반 작업들 모두 취소
        const urgentTasks = this.queue.filter(task => task.priority === 'urgent');
        const removedTasks = this.queue.filter(task => task.priority !== 'urgent');
        
        // 제거될 작업들의 렌더링 취소
        removedTasks.forEach(task => {
            if (activeRenderTasks.has(task.pageNum)) {
                try {
                    activeRenderTasks.get(task.pageNum).cancel();
                } catch (error) {
                    // 무시
                }
                activeRenderTasks.delete(task.pageNum);
            }
        });
        
        this.queue = urgentTasks;
        console.log(`🗑️ ${removedTasks.length}개 저우선순위 렌더링 작업 취소됨`);
    }
    
    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        
        while (this.queue.length > 0) {
            const task = this.queue.shift();
            
            try {
                this.currentTask = task;
                
                // 기존 렌더링 함수 활용 (안전성 보장)
                if (task.renderFunction) {
                    await task.renderFunction();
                } else {
                    // 기본 렌더링은 기존 함수 사용
                    await this.defaultRenderPage(task.pageNum);
                }
                
            } catch (error) {
                if (error.name !== 'RenderingCancelledException') {
                    console.error(`페이지 ${task.pageNum} 렌더링 오류:`, error);
                }
            } finally {
                this.currentTask = null;
            }
        }
        
        this.processing = false;
    }
    
    // 기존 renderPageWithZoom 함수를 래핑
    async defaultRenderPage(pageNum) {
        const viewer = document.querySelector('.pdf-viewer.continuous-scroll');
        if (!viewer) return;
        
        const container = viewer.querySelector(`[data-page-number="${pageNum}"]`);
        if (container) {
            await renderPageWithZoom(container);
        }
    }
    
    getStatus() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            currentTask: this.currentTask?.pageNum || null
        };
    }
}

// 전역 렌더링 큐 인스턴스 생성
const globalRenderQueue = new RenderQueue();

// 줌 디바운싱 변수 (기존 유지)
let zoomDebounceTimer = null;
let pendingScale = null;

// 🚀 통합 입력 디바운서 (기존 방식과 병존)
class InputDebouncer {
    constructor() {
        this.timers = new Map();
        this.pendingActions = new Map();
        this.lastActionTime = new Map();
    }
    
    debounce(actionType, fn, delay = 300, options = {}) {
        const now = Date.now();
        const lastTime = this.lastActionTime.get(actionType) || 0;
        
        // 연타 감지 (100ms 내 연속 호출)
        const isRapidFire = now - lastTime < 100;
        if (isRapidFire && options.rapidFireDelay) {
            delay = options.rapidFireDelay; // 연타시 더 긴 딜레이
        }
        
        this.lastActionTime.set(actionType, now);
        
        // 기존 타이머 취소
        if (this.timers.has(actionType)) {
            clearTimeout(this.timers.get(actionType));
        }
        
        // 즉시 실행 옵션 (사용자 피드백)
        if (options.immediate && fn.immediate) {
            fn.immediate();
        }
        
        // 마지막 액션 저장
        this.pendingActions.set(actionType, fn);
        
        // 새 타이머 설정
        const timer = setTimeout(() => {
            const pendingFn = this.pendingActions.get(actionType);
            if (pendingFn) {
                if (typeof pendingFn === 'function') {
                    pendingFn();
                } else if (pendingFn.final) {
                    pendingFn.final();
                }
                this.pendingActions.delete(actionType);
            }
            this.timers.delete(actionType);
        }, delay);
        
        this.timers.set(actionType, timer);
        
        return timer;
    }
    
    // 특정 액션 취소
    cancel(actionType) {
        if (this.timers.has(actionType)) {
            clearTimeout(this.timers.get(actionType));
            this.timers.delete(actionType);
        }
        this.pendingActions.delete(actionType);
    }
    
    // 모든 액션 취소
    cancelAll() {
        this.timers.forEach(timer => clearTimeout(timer));
        this.timers.clear();
        this.pendingActions.clear();
    }
    
    // 상태 확인
    isPending(actionType) {
        return this.timers.has(actionType);
    }
    
    getStatus() {
        return {
            activeTimers: Array.from(this.timers.keys()),
            pendingActions: Array.from(this.pendingActions.keys())
        };
    }
}

// 전역 디바운서 인스턴스
const globalDebouncer = new InputDebouncer();

// PDF.js 초기화
export function init() {
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@3.4.120/build/pdf.worker.min.js';
    }
    
    // 사이드바 토글 이벤트 리스너
    document.addEventListener('sidebarToggled', () => {
        setTimeout(() => {
            updateZoomControlsPosition();
            if (autoFit && pdfDoc) {
                fitToWidth();
            } else if (pdfDoc) {
                // autoFit이 아니어도 사이드바 토글로 레이아웃 변경시 세그먼트 재동기화 필요
                if (viewMode === 'continuous') {
                    // 연속스크롤은 그대로 두기
                    const event = new CustomEvent('sidebarLayoutChanged');
                    document.dispatchEvent(event);
                } else {
                    // 단일/듀얼 페이지는 연속스크롤 방식으로 재동기화
                    applyScaleToCurrentView();
                }
            }
        }, 300);
    });
    
    // 창 크기 변경 이벤트 리스너 (채팅방 크기 조절 감지)
    let resizeTimeout;
    window.addEventListener('resize', () => {
        if (resizeTimeout) clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (autoFit && pdfDoc) {
                fitToWidth();
            } else if (pdfDoc) {
                // autoFit이 아니어도 세그먼트 위치 재조정 필요
                if (viewMode === 'continuous') {
                    // 연속스크롤은 기존 방식 유지
                    rerenderCurrentView();
                } else {
                    // 단일/듀얼 페이지는 연속스크롤 방식으로 재동기화
                    applyScaleToCurrentView();
                }
            }
        }, 150);
    });
    
    // Shift+스크롤로 좌우 스크롤 기능
    document.addEventListener('wheel', (e) => {
        if (e.shiftKey && pdfDoc) {
            e.preventDefault();
            
            // 연속 스크롤 모드인 경우 viewer를 대상으로, 아니면 pdfContainer를 대상으로
            const continuousViewer = document.querySelector('.pdf-viewer.continuous-scroll');
            const targetElement = continuousViewer || document.getElementById('pdfContainer');
            
            if (targetElement) {
                // 스크롤 델타값에 따라 좌우 스크롤
                targetElement.scrollLeft += e.deltaY;
            }
        }
    }, { passive: false });
}

// PDF 문서 로드
export async function loadPdf(pdfArrayBuffer) {
    try {
        pdfDoc = await pdfjsLib.getDocument({ data: pdfArrayBuffer }).promise;
        currentPage = 1;
        currentScale = 1.0; // 원본 크기로 초기화
        autoFit = false;
        
        return pdfDoc;
    } catch (error) {
        console.error('PDF 로드 오류:', error);
        throw error;
    }
}

// 페이지 렌더링
export async function renderPage(pageNum, scale = currentScale) {
    if (!pdfDoc) return;

    currentPage = pageNum;
    currentScale = scale;

    try {
        if (viewMode === 'dual') {
            await renderDualPages(pageNum, scale);
        } else if (viewMode === 'continuous') {
            await renderContinuousPages(scale);
        } else {
            await renderSinglePage(pageNum, scale);
        }
    } catch (error) {
        console.error('페이지 렌더링 오류:', error);
        showNotification('페이지 렌더링에 실패했습니다.', 'error');
    }
}

// DOM 컨테이너 정리 함수
function clearPdfContainer() {
    const pdfContainer = document.getElementById('pdfContainer');
    if (pdfContainer) {
        // 컨트롤을 제외한 뷰어 영역만 정리
        const viewer = pdfContainer.querySelector('.pdf-viewer');
        if (viewer) {
            viewer.remove();
        }
        
        // 컨테이너 스타일 초기화 (연속 스크롤 모드에서 설정된 스타일 제거)
        pdfContainer.style.overflow = '';
        pdfContainer.style.padding = '';
        pdfContainer.style.display = '';
    }
    
    // 기존 툴바 제거 (PDF 컨테이너 내부 또는 body에서)
    const existingToolbar = pdfContainer.querySelector('.zoom-controls') || 
                          document.querySelector('.zoom-controls');
    if (existingToolbar) {
        // 이벤트 리스너 제거
        if (existingToolbar._updatePosition) {
            window.removeEventListener('resize', existingToolbar._updatePosition);
            window.removeEventListener('scroll', existingToolbar._updatePosition);
        }
        existingToolbar.remove();
    }
}

// 단일 페이지 렌더링
async function renderSinglePage(pageNum, scale) {
    try {
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale });

        const pdfContainer = document.getElementById('pdfContainer');
        if (!pdfContainer) {
            console.error('PDF 컨테이너를 찾을 수 없습니다.');
            return;
        }

        // 기존 뷰어 정리
        clearPdfContainer();
        
        // PDF 컨테이너 스크롤 설정 (연속스크롤 방식)
        pdfContainer.style.overflow = 'hidden';
        pdfContainer.style.padding = '0';
        pdfContainer.style.display = 'block';
        
        // 새로운 뷰어 생성 (연속스크롤 방식)
        const viewer = document.createElement('div');
        viewer.className = 'pdf-viewer single-page';
        viewer.style.position = 'absolute';
        viewer.style.top = '0';
        viewer.style.left = '0';
        viewer.style.right = '0';
        viewer.style.bottom = '0';
        viewer.style.overflowY = 'auto';
        viewer.style.overflowX = 'auto';
        viewer.style.display = 'flex';
        viewer.style.flexDirection = 'column';
        viewer.style.alignItems = 'center';
        viewer.style.gap = '20px';
        viewer.style.padding = '70px 20px 20px 20px'; // 상단 툴바 공간 확보
        viewer.style.background = 'var(--bg-tertiary, #f8f9fa)';

        // 페이지 컨테이너 생성 (연속스크롤 방식)
        const pageContainer = document.createElement('div');
        pageContainer.className = 'pdf-page-container';
        pageContainer.style.position = 'relative';
        pageContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        pageContainer.dataset.pageNumber = pageNum;

        // 캔버스 생성
        const canvas = document.createElement('canvas');
        canvas.id = 'pdfCanvas';
        canvas.setAttribute('data-page-number', pageNum);
        canvas.style.display = 'block';

        // 세그먼트 오버레이 생성 (연속스크롤과 완전 동일)
        const segmentOverlay = document.createElement('div');
        segmentOverlay.className = 'segment-overlay';
        segmentOverlay.id = 'segmentOverlay';
        segmentOverlay.style.position = 'absolute';
        segmentOverlay.style.top = '0';
        segmentOverlay.style.left = '0';
        segmentOverlay.style.pointerEvents = 'auto';

        pageContainer.appendChild(canvas);
        pageContainer.appendChild(segmentOverlay);
        viewer.appendChild(pageContainer);
        pdfContainer.appendChild(viewer);

        // 컨트롤 UI 추가 (전체 문서에 컨트롤이 없을 때만)
        if (!document.querySelector('.zoom-controls')) {
            addPdfControls();
        }

        // 세그먼트 오버레이 크기 설정 (연속스크롤과 동일)
        segmentOverlay.style.width = `${viewport.width}px`;
        segmentOverlay.style.height = `${viewport.height}px`;
        
        // 캔버스 null 체크 후 크기 설정
        if (canvas) {
            canvas.width = viewport.width;
            canvas.height = viewport.height;
        } else {
            throw new Error('캔버스 생성에 실패했습니다.');
        }

        const context = canvas.getContext('2d');
        if (!context) {
            throw new Error('캔버스 컨텍스트를 가져올 수 없습니다.');
        }
        
        await page.render({ canvasContext: context, viewport }).promise;

        // 세그먼트 오버레이 업데이트 이벤트 발생
        const event = new CustomEvent('pageRendered', {
            detail: { viewport, pageNum }
        });
        document.dispatchEvent(event);

        updateZoomDisplay();
        updatePageControls();

    } catch (error) {
        console.error('페이지 렌더링 오류:', error);
        showNotification('페이지 렌더링에 실패했습니다.', 'error');
    }
}

// 페이지와 래퍼를 받아 캔버스와 오버레이를 생성하는 헬퍼 함수
async function renderPageInWrapper(page, wrapper, canvasId, overlayId, scale) {
    const canvas = document.createElement('canvas');
    canvas.id = canvasId;
    canvas.setAttribute('data-page-number', page.pageNumber);
    canvas.style.display = 'block'; // 연속스크롤과 동일
    
    const overlay = document.createElement('div');
    overlay.className = 'segment-overlay';
    overlay.id = overlayId;
    // 연속스크롤과 동일하게 절대 위치 설정으로 PDF와 완전 일체화
    overlay.style.position = 'absolute';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.pointerEvents = 'auto';
    
    wrapper.appendChild(canvas);
    wrapper.appendChild(overlay);

    const viewport = page.getViewport({ scale });
    
    // null 체크 후 크기 설정
    if (canvas) {
        canvas.width = viewport.width;
        canvas.height = viewport.height;
    } else {
        throw new Error(`캔버스 ${canvasId} 생성에 실패했습니다.`);
    }
    
    // 오버레이 크기도 캔버스와 동기화
    overlay.style.width = `${viewport.width}px`;
    overlay.style.height = `${viewport.height}px`;

    const context = canvas.getContext('2d');
    if (!context) {
        throw new Error(`캔버스 ${canvasId} 컨텍스트를 가져올 수 없습니다.`);
    }
    
    await page.render({ canvasContext: context, viewport }).promise;
    
    // 해당 페이지의 세그먼트만 업데이트
    const event = new CustomEvent('pageRendered', {
        detail: { 
            viewport, 
            pageNum: page.pageNumber,
            overlayId,
            viewMode: 'dual'
        }
    });
    document.dispatchEvent(event);
    
    return { canvas, overlay, viewport };
}

// 듀얼 페이지 렌더링
async function renderDualPages(pageNum, scale) {
    try {
        const pdfContainer = document.getElementById('pdfContainer');
        if (!pdfContainer) {
            console.error('PDF 컨테이너를 찾을 수 없습니다.');
            return;
        }

        // 기존 뷰어 정리
        clearPdfContainer();
        
        // PDF 컨테이너 스크롤 설정 (연속스크롤 방식)
        pdfContainer.style.overflow = 'hidden';
        pdfContainer.style.padding = '0';
        pdfContainer.style.display = 'block';
        
        // 새로운 뷰어 생성 (연속스크롤 방식)
        const viewer = document.createElement('div');
        viewer.className = 'pdf-viewer dual-page';
        viewer.style.position = 'absolute';
        viewer.style.top = '0';
        viewer.style.left = '0';
        viewer.style.right = '0';
        viewer.style.bottom = '0';
        viewer.style.overflowY = 'auto';
        viewer.style.overflowX = 'auto';
        viewer.style.display = 'flex';
        viewer.style.flexDirection = 'row';
        viewer.style.alignItems = 'center';
        viewer.style.justifyContent = 'center';
        viewer.style.gap = '20px';
        viewer.style.padding = '70px 20px 20px 20px'; // 상단 툴바 공간 확보
        viewer.style.background = 'var(--bg-tertiary, #f8f9fa)';
        pdfContainer.appendChild(viewer);

        // 컨트롤 UI 추가 (전체 문서에 컨트롤이 없을 때만)
        if (!document.querySelector('.zoom-controls')) {
            addPdfControls();
        }

        // 페이지 1과 2를 각각 렌더링
        const page1 = await pdfDoc.getPage(pageNum);
        const pageNum2 = pageNum + 1;
        const page2 = (pageNum2 <= pdfDoc.numPages) ? await pdfDoc.getPage(pageNum2) : null;

        // 페이지 1 컨테이너 및 렌더링 (연속스크롤 방식)
        const page1Container = document.createElement('div');
        page1Container.className = 'pdf-page-container';
        page1Container.style.position = 'relative';
        page1Container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
        page1Container.dataset.pageNumber = pageNum;
        viewer.appendChild(page1Container);
        
        const result1 = await renderPageInWrapper(page1, page1Container, 'pdfCanvas1', 'segmentOverlay1', scale);

        // 페이지 2 컨테이너 및 렌더링 (존재하는 경우)
        let result2 = null;
        if (page2) {
            const page2Container = document.createElement('div');
            page2Container.className = 'pdf-page-container';
            page2Container.style.position = 'relative';
            page2Container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            page2Container.dataset.pageNumber = pageNum2;
            viewer.appendChild(page2Container);
            
            result2 = await renderPageInWrapper(page2, page2Container, 'pdfCanvas2', 'segmentOverlay2', scale);
        }

        // 연속스크롤 방식에서는 뷰어 크기 자동 조정

        updateZoomDisplay();
        updatePageControls();

    } catch (error) {
        console.error('듀얼 페이지 렌더링 오류:', error);
        showNotification('페이지 렌더링에 실패했습니다.', 'error');
    }
}

// 연속 스크롤 페이지 렌더링 (크롬 스타일)
async function renderContinuousPages(scale) {
    try {
        const pdfContainer = document.getElementById('pdfContainer');
        if (!pdfContainer) {
            console.error('PDF 컨테이너를 찾을 수 없습니다.');
            return;
        }

        // 기존 뷰어 정리
        clearPdfContainer();
        
        // PDF 컨테이너의 스크롤을 비활성화하고 뷰어가 전체를 차지하도록 설정
        pdfContainer.style.overflow = 'hidden';
        pdfContainer.style.padding = '0';
        pdfContainer.style.display = 'block';
        
        // 새로운 뷰어 생성
        const viewer = document.createElement('div');
        viewer.className = 'pdf-viewer continuous-scroll';
        viewer.style.position = 'absolute';
        viewer.style.top = '0';
        viewer.style.left = '0';
        viewer.style.right = '0';
        viewer.style.bottom = '0';
        viewer.style.overflowY = 'auto';
        viewer.style.overflowX = 'auto';
        viewer.style.display = 'flex';
        viewer.style.flexDirection = 'column';
        viewer.style.alignItems = 'center';
        viewer.style.gap = '20px';
        viewer.style.padding = '70px 20px 20px 20px'; // 상단 툴바 공간 확보
        viewer.style.background = 'var(--bg-tertiary, #f8f9fa)';
        
        pdfContainer.appendChild(viewer);

        // 컨트롤 UI 추가 (전체 문서에 컨트롤이 없을 때만)
        if (!document.querySelector('.zoom-controls')) {
            addPdfControls();
        }

        // 모든 페이지를 순차적으로 렌더링
        const totalPages = pdfDoc.numPages;
        const pageElements = [];
        
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale });

            // 페이지 컨테이너 생성
            const pageContainer = document.createElement('div');
            pageContainer.className = 'pdf-page-container';
            pageContainer.style.position = 'relative';
            pageContainer.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
            pageContainer.dataset.pageNumber = pageNum;

            // 캔버스 생성
            const canvas = document.createElement('canvas');
            canvas.id = `pdfCanvas${pageNum}`;
            canvas.setAttribute('data-page-number', pageNum);
            canvas.width = viewport.width;
            canvas.height = viewport.height;
            canvas.style.display = 'block';

            // 세그먼트 오버레이 생성
            const segmentOverlay = document.createElement('div');
            segmentOverlay.className = 'segment-overlay';
            segmentOverlay.id = `segmentOverlay${pageNum}`;
            segmentOverlay.style.position = 'absolute';
            segmentOverlay.style.top = '0';
            segmentOverlay.style.left = '0';
            segmentOverlay.style.width = `${viewport.width}px`;
            segmentOverlay.style.height = `${viewport.height}px`;
            segmentOverlay.style.pointerEvents = 'auto';

            pageContainer.appendChild(canvas);
            pageContainer.appendChild(segmentOverlay);
            viewer.appendChild(pageContainer);
            
            
            pageElements.push(pageContainer);

            // 페이지 렌더링
            const context = canvas.getContext('2d');
            if (!context) {
                throw new Error(`캔버스 ${pageNum} 컨텍스트를 가져올 수 없습니다.`);
            }
            
            await page.render({ canvasContext: context, viewport }).promise;

            // 세그먼트 오버레이 업데이트 이벤트 발생
            const event = new CustomEvent('pageRendered', {
                detail: { 
                    viewport, 
                    pageNum: pageNum,
                    overlayId: `segmentOverlay${pageNum}`,
                    viewMode: 'continuous'
                }
            });
            document.dispatchEvent(event);
        }

        // 현재 스케일 적용 (CSS transform 사용)
        if (currentScale !== 1.0) {
            applyContinuousZoom();
        }

        // 스크롤 이벤트 리스너 추가 (현재 페이지 추적)
        viewer.addEventListener('scroll', () => {
            updateCurrentPageFromScroll();
        });

        updateZoomDisplay();
        updatePageControls();

    } catch (error) {
        console.error('연속 스크롤 렌더링 오류:', error);
        showNotification('페이지 렌더링에 실패했습니다.', 'error');
    }
}

// 특정 페이지로 스크롤
function scrollToPage(pageNum) {
    const viewer = document.querySelector('.pdf-viewer.continuous-scroll');
    if (!viewer) return;
    
    const pageContainer = viewer.querySelector(`[data-page-number="${pageNum}"]`);
    if (pageContainer) {
        pageContainer.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'start',
            inline: 'center'
        });
    }
}

// 스크롤 위치에 따라 현재 페이지 업데이트
function updateCurrentPageFromScroll() {
    const viewer = document.querySelector('.pdf-viewer.continuous-scroll');
    if (!viewer) return;
    
    const viewerRect = viewer.getBoundingClientRect();
    const viewerCenter = viewerRect.top + viewerRect.height / 2;
    
    const pageContainers = viewer.querySelectorAll('.pdf-page-container');
    let closestPage = 1;
    let minDistance = Infinity;
    
    pageContainers.forEach(container => {
        const rect = container.getBoundingClientRect();
        const pageCenter = rect.top + rect.height / 2;
        const distance = Math.abs(pageCenter - viewerCenter);
        
        if (distance < minDistance) {
            minDistance = distance;
            closestPage = parseInt(container.dataset.pageNumber);
        }
    });
    
    if (closestPage !== currentPage) {
        currentPage = closestPage;
        updatePageControls();
    }
}

// PDF 컨트롤 UI 추가
// 세그먼트 표시 상태 변수 추가
let segmentsVisible = true;

function addPdfControls() {
    const pdfContainer = document.getElementById('pdfContainer');
    
    // PDF 컨테이너를 relative로 설정
    pdfContainer.style.position = 'relative';
    
    // 기존 컨트롤이 있으면 제거 (body 전체에서 찾기)
    const existingZoomControls = document.querySelector('.zoom-controls');
    if (existingZoomControls) existingZoomControls.remove();
    
    // PDF 컨테이너의 실제 위치와 크기 계산
    const pdfRect = pdfContainer.getBoundingClientRect();
    
    // 툴바 컨테이너 추가 (플로팅으로 PDF 영역 상단에 고정)
    const zoomControls = document.createElement('div');
    zoomControls.className = 'zoom-controls';
    zoomControls.style.position = 'fixed';
    // 초기 위치는 CSS 기본값 사용, updateToolbarPosition에서 조정
    zoomControls.style.top = `${pdfRect.top + 12}px`; // 플로팅 오프셋 추가
    zoomControls.style.left = `${pdfRect.left}px`;
    zoomControls.style.width = `${pdfRect.width}px`;
    zoomControls.style.minHeight = '44px'; // 슬림한 최소 높이
    zoomControls.style.height = 'auto'; // 줄바꿈 시 자동 확장
    zoomControls.style.zIndex = '1001';
    zoomControls.style.backgroundColor = 'rgba(255, 255, 255, 0.95)';
    zoomControls.style.border = '1px solid #e0e0e0';
    zoomControls.style.padding = '8px 16px'; // 위아래 살짝 증가
    zoomControls.style.backdropFilter = 'blur(20px)';
    zoomControls.style.display = 'flex';
    zoomControls.style.alignItems = 'center';
    zoomControls.style.justifyContent = 'space-between'; // 왼쪽-오른쪽 정렬
    zoomControls.style.fontSize = '14px';
    zoomControls.style.boxSizing = 'border-box';
    zoomControls.style.borderRadius = '16px'; // 둥근 모서리
    zoomControls.style.flexWrap = 'wrap'; // 줄바꿈 허용
    zoomControls.style.gap = '12px';
    zoomControls.innerHTML = `
        <div class="page-nav-group" style="display: flex; align-items: center; gap: 8px; flex-shrink: 0;">
            <button class="page-btn" ${currentPage <= 1 ? 'disabled' : ''} onclick="window.pdfViewer.previousPage()">◀</button>
            <span style="min-width: 60px; text-align: center; font-size: 13px; font-weight: 600;">
                <span id="pageCurrentInline">${currentPage}</span> / ${pdfDoc ? pdfDoc.numPages : 1}
            </span>
            <button class="page-btn" ${currentPage >= (pdfDoc ? pdfDoc.numPages : 1) ? 'disabled' : ''} onclick="window.pdfViewer.nextPage()">▶</button>
        </div>
        
        <div class="right-controls" style="display: flex; align-items: center; gap: 8px; margin-left: auto;">
            <div class="zoom-group" style="display: flex; align-items: center; gap: 8px;">
                <button class="zoom-btn" onclick="window.pdfViewer.zoomOut()">-</button>
                <span id="zoomLevel" style="min-width: 45px; text-align: center; font-size: 12px; font-weight: 600;">${Math.round(currentScale * 100)}%</span>
                <button class="zoom-btn" onclick="window.pdfViewer.zoomIn()">+</button>
            </div>
            
            <div class="fit-controls" style="display: flex; align-items: center; gap: 8px;">
                <button class="zoom-btn fit-btn" onclick="window.pdfViewer.fitToWidth()" title="너비 맞춤">↔</button>
                <button class="zoom-btn fit-btn" onclick="window.pdfViewer.fitToHeight()" title="높이 맞춤">↕</button>
                <div class="view-settings-dropdown" style="position: relative;">
                    <button class="zoom-btn settings-btn" id="settingsBtn" onclick="window.pdfViewer.toggleViewSettings()" title="뷰 설정">⚙️</button>
                    <div class="view-options-menu" id="viewOptionsMenu" style="display: none; position: absolute; top: 100%; right: 0; background: white; border: 1px solid #e0e0e0; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); z-index: 1002; min-width: 120px; margin-top: 4px;">
                        <button class="view-option-btn" onclick="window.pdfViewer.toggleSegments()" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; text-align: left; font-size: 13px; cursor: pointer; border-bottom: 1px solid #f0f0f0;" onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor=''">
                            <span>📝</span> 세그먼트
                        </button>
                        <button class="view-option-btn" onclick="window.pdfViewer.setViewMode('single')" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; text-align: left; font-size: 13px; cursor: pointer; border-bottom: 1px solid #f0f0f0;" onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor=''">
                            <span>1️⃣</span> 1페이지
                        </button>
                        <button class="view-option-btn" onclick="window.pdfViewer.setViewMode('dual')" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; text-align: left; font-size: 13px; cursor: pointer; border-bottom: 1px solid #f0f0f0;" onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor=''">
                            <span>2️⃣</span> 2페이지
                        </button>
                        <button class="view-option-btn" onclick="window.pdfViewer.setViewMode('continuous')" style="display: flex; align-items: center; gap: 8px; width: 100%; padding: 8px 12px; border: none; background: none; text-align: left; font-size: 13px; cursor: pointer;" onmouseover="this.style.backgroundColor='#f5f5f5'" onmouseout="this.style.backgroundColor=''">
                            <span>📜</span> 스크롤
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    // 창 크기 변경이나 스크롤 시 툴바 위치 업데이트
    const updateToolbarPosition = () => {
        const rect = pdfContainer.getBoundingClientRect();
        const viewportWidth = window.innerWidth;
        
        if (viewportWidth <= 1024) {
            // 태블릿/모바일: 고정된 플로팅 위치 사용 (CSS에서 처리)
            // CSS가 처리하도록 스타일 초기화
            zoomControls.style.top = '';
            zoomControls.style.left = '';
            zoomControls.style.right = '';
            zoomControls.style.width = '';
        } else {
            // 데스크톱: PDF 컨테이너 기준으로 플로팅
            const floatingOffset = 12; // 플로팅 오프셋
            const leftMargin = 24; // 좌우 여백
            zoomControls.style.top = `${rect.top + floatingOffset}px`;
            zoomControls.style.left = `${rect.left + leftMargin}px`;
            zoomControls.style.right = `${window.innerWidth - rect.right + leftMargin}px`;
            zoomControls.style.width = 'auto';
        }
    };
    
    // 툴바를 body에 추가 (플로팅)
    document.body.appendChild(zoomControls);
    
    // 초기 위치 업데이트 (미디어 쿼리 고려)
    setTimeout(() => updateToolbarPosition(), 0);
    
    // 리사이즈 및 스크롤 이벤트 리스너 추가
    window.addEventListener('resize', updateToolbarPosition);
    window.addEventListener('scroll', updateToolbarPosition);
    
    // 툴바에 업데이트 함수 저장 (나중에 제거할 때 사용)
    zoomControls._updatePosition = updateToolbarPosition;
    
    // 드롭다운 외부 클릭시 닫기 이벤트 추가
    setTimeout(() => {
        updateViewOptionsMenu();
        
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('viewOptionsMenu');
            const settingsBtn = document.getElementById('settingsBtn');
            if (dropdown && !dropdown.contains(e.target) && e.target !== settingsBtn) {
                dropdown.style.display = 'none';
            }
        });
    }, 0);
}

// 페이지 컨트롤 업데이트
function updatePageControls() {
    const pageCurrentInline = document.getElementById('pageCurrentInline');
    if (pageCurrentInline && pdfDoc) {
        pageCurrentInline.textContent = currentPage;
    }
    
    // 페이지 버튼 상태 업데이트
    const prevBtn = document.querySelector('.page-btn[onclick*="previousPage"]');
    const nextBtn = document.querySelector('.page-btn[onclick*="nextPage"]');
    
    if (prevBtn) {
        prevBtn.disabled = currentPage <= 1;
    }
    if (nextBtn) {
        nextBtn.disabled = currentPage >= (pdfDoc ? pdfDoc.numPages : 1);
    }
}

// 현재 뷰 상태에 맞춰 다시 렌더링하는 헬퍼 함수
export async function rerenderCurrentView() {
    if (!pdfDoc) return Promise.resolve();
    
    try {
        if (viewMode === 'single') {
            await renderSinglePage(currentPage, currentScale);
        } else if (viewMode === 'continuous') {
            await renderContinuousPages(currentScale);
        } else {
            await renderDualPages(currentPage, currentScale);
        }
        return Promise.resolve();
    } catch (error) {
        console.error('다시 렌더링 오류:', error);
        showNotification('화면 업데이트에 실패했습니다.', 'error');
        return Promise.reject(error);
    }
}

// 줌 기능들 - 개선된 디바운싱 적용 (한국인 연타 대응 + 기존 방식 병존)
export function zoomIn() {
    const newScale = Math.min(currentScale + scaleStep, maxScale);
    if (newScale !== currentScale) {
        autoFit = false;
        currentScale = newScale;
        pendingScale = newScale;
        
        // 🚀 새로운 디바운서 사용 (기존 방식도 유지)
        globalDebouncer.debounce('zoom', {
            immediate: () => {
                // UI 즉시 업데이트 (사용자 피드백)
                updateZoomDisplay();
            },
            final: () => {
                if (viewMode === 'continuous') {
                    // 렌더링 큐와 연동
                    globalRenderQueue.clearLowPriorityTasks();
                    applyContinuousZoom();
                } else {
                    // 단일/듀얼 페이지도 연속스크롤 방식 적용
                    applyScaleToCurrentView();
                }
                pendingScale = null;
            }
        }, 500, { 
            rapidFireDelay: 800, // 연타시 더 오래 기다림
            immediate: true 
        });
        
        // 기존 방식도 백업으로 유지
        clearTimeout(zoomDebounceTimer);
        zoomDebounceTimer = setTimeout(() => {
            if (pendingScale && !globalDebouncer.isPending('zoom')) {
                // 새 디바운서가 실패했을 때만 기존 방식 사용
                if (viewMode === 'continuous') {
                    applyContinuousZoom();
                } else {
                    applyScaleToCurrentView();
                }
                pendingScale = null;
            }
        }, 1000);
    }
}

export function zoomOut() {
    const newScale = Math.max(currentScale - scaleStep, minScale);
    if (newScale !== currentScale) {
        autoFit = false;
        currentScale = newScale;
        pendingScale = newScale;
        
        // 🚀 새로운 디바운서 사용 (zoomIn과 동일한 패턴)
        globalDebouncer.debounce('zoom', {
            immediate: () => {
                updateZoomDisplay();
            },
            final: () => {
                if (viewMode === 'continuous') {
                    globalRenderQueue.clearLowPriorityTasks();
                    applyContinuousZoom();
                } else {
                    applyScaleToCurrentView();
                }
                pendingScale = null;
            }
        }, 500, { 
            rapidFireDelay: 800,
            immediate: true 
        });
        
        // 기존 방식 백업
        clearTimeout(zoomDebounceTimer);
        zoomDebounceTimer = setTimeout(() => {
            if (pendingScale && !globalDebouncer.isPending('zoom')) {
                if (viewMode === 'continuous') {
                    applyContinuousZoom();
                } else {
                    applyScaleToCurrentView();
                }
                pendingScale = null;
            }
        }, 1000);
    }
}

export function resetZoom() {
    autoFit = false;
    currentScale = 1.0;
    if (viewMode === 'continuous') {
        applyContinuousZoom();
    } else {
        rerenderCurrentView();
    }
}

export function fitToHeight() {
    if (!pdfDoc) return;
    
    autoFit = true;
    const pdfContainer = document.getElementById('pdfContainer');
    const containerHeight = pdfContainer.clientHeight - 100; // 툴바 공간 확보
    
    pdfDoc.getPage(currentPage).then(page => {
        const viewport = page.getViewport({ scale: 1.0 });
        const scale = containerHeight / viewport.height;
        const clampedScale = Math.max(Math.min(scale, maxScale), minScale);
        
        currentScale = clampedScale;
        
        if (viewMode === 'continuous') {
            applyContinuousZoom().then(() => {
                triggerSegmentSync();
            });
        } else {
            rerenderCurrentView().then(() => {
                triggerSegmentSync();
            });
        }
    }).catch(error => {
        console.error('높이 맞춤 처리 중 오류:', error);
        showNotification('높이 맞춤 처리 중 오류가 발생했습니다.', 'error');
    });
}

// 연속 스크롤 모드에서 크롬 PDF처럼 실제 크기 변경으로 줌 적용 (개선된 큐 시스템 적용)
async function applyContinuousZoom() {
    const viewer = document.querySelector('.pdf-viewer.continuous-scroll');
    if (!viewer || !pdfDoc || isRenderingBatch) return Promise.resolve();

    // 🚀 새로운 렌더링 큐 시스템 사용
    try {
        // 기존 작업들 취소
        cancelAllRenderTasks();
        globalRenderQueue.clearLowPriorityTasks();
        
        isRenderingBatch = true;
        const pageContainers = viewer.querySelectorAll('.pdf-page-container');

        // 성능 향상: 보이는 페이지부터 우선 렌더링
        const visibleContainers = Array.from(pageContainers).filter(isContainerVisible);
        const hiddenContainers = Array.from(pageContainers).filter(container => !isContainerVisible(container));
        
        // 1단계: 보이는 페이지들을 긴급 작업으로 큐에 추가
        for (const container of visibleContainers) {
            const pageNum = parseInt(container.dataset.pageNumber);
            if (pageNum) {
                globalRenderQueue.addTask(pageNum, 'urgent', async () => {
                    await renderPageWithZoom(container);
                });
            }
        }
        
        // 2단계: 나머지 페이지들을 일반 작업으로 큐에 추가
        for (const container of hiddenContainers) {
            const pageNum = parseInt(container.dataset.pageNumber);
            if (pageNum && isRenderingBatch) {
                globalRenderQueue.addTask(pageNum, 'normal', async () => {
                    await renderPageWithZoom(container);
                });
            }
        }
        
        console.log(`📋 렌더링 큐 상태:`, globalRenderQueue.getStatus());
        return Promise.resolve();
        
    } catch (error) {
        console.error('연속 스크롤 줌 적용 중 오류:', error);
        
        // 새 시스템 실패시 기존 방식으로 fallback
        console.warn('기존 방식으로 fallback 실행');
        
        // 기존 로직 (백업)
        const pageContainers = viewer.querySelectorAll('.pdf-page-container');
        const visibleContainers = Array.from(pageContainers).filter(isContainerVisible);
        const hiddenContainers = Array.from(pageContainers).filter(container => !isContainerVisible(container));
        
        for (const container of visibleContainers) {
            await renderPageWithZoom(container);
        }
        for (const container of hiddenContainers) {
            if (!isRenderingBatch) break;
            await renderPageWithZoom(container);
        }
        
        return Promise.reject(error);
    } finally {
        isRenderingBatch = false;
        updateZoomDisplay();
    }
}

// 개별 페이지 줌 렌더링 (렌더링 충돌 방지)
async function renderPageWithZoom(container) {
    const canvas = container.querySelector('canvas');
    const segmentOverlay = container.querySelector('.segment-overlay');
    const pageNum = parseInt(container.dataset.pageNumber);
    
    if (!canvas || !pageNum) {
        console.error('Canvas or page number not found for container:', container);
        return;
    }

    try {
        // 이전 렌더링 작업이 있으면 취소
        if (activeRenderTasks.has(pageNum)) {
            activeRenderTasks.get(pageNum).cancel();
            activeRenderTasks.delete(pageNum);
        }

        // 페이지와 viewport 가져오기
        const page = await pdfDoc.getPage(pageNum);
        const viewport = page.getViewport({ scale: currentScale });

        // 캔버스 크기 설정 (내부 해상도 + CSS 크기)
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // 세그먼트 오버레이 크기 변경
        if (segmentOverlay) {
            segmentOverlay.style.width = `${viewport.width}px`;
            segmentOverlay.style.height = `${viewport.height}px`;
        }

        // 새로운 렌더링 작업 시작
        const context = canvas.getContext('2d');
        if (context) {
            const renderTask = page.render({ canvasContext: context, viewport });
            activeRenderTasks.set(pageNum, renderTask);
            
            await renderTask.promise;
            activeRenderTasks.delete(pageNum);

            // 세그먼트 오버레이 업데이트
            const event = new CustomEvent('pageRendered', {
                detail: { 
                    viewport, 
                    pageNum: pageNum,
                    overlayId: segmentOverlay?.id,
                    viewMode: 'continuous'
                }
            });
            document.dispatchEvent(event);
        }

    } catch (error) {
        // 취소된 작업은 무시
        if (error.name !== 'RenderingCancelledException') {
            console.error(`페이지 ${pageNum} 줌 적용 중 오류:`, error);
        }
        activeRenderTasks.delete(pageNum);
    }
}

// 모든 활성 렌더링 작업 취소
function cancelAllRenderTasks() {
    for (const [pageNum, renderTask] of activeRenderTasks) {
        try {
            renderTask.cancel();
        } catch (error) {
            // 이미 완료된 작업은 무시
        }
    }
    activeRenderTasks.clear();
}

// 컨테이너가 현재 보이는 영역에 있는지 확인
function isContainerVisible(container) {
    const viewer = document.querySelector('.pdf-viewer.continuous-scroll');
    if (!viewer) return true;
    
    const containerRect = container.getBoundingClientRect();
    const viewerRect = viewer.getBoundingClientRect();
    
    // 컨테이너가 뷰어 영역과 겹치는지 확인 (여유분 포함)
    const margin = 200; // 200px 여유분으로 미리 렌더링
    return (
        containerRect.bottom >= viewerRect.top - margin &&
        containerRect.top <= viewerRect.bottom + margin
    );
}

export function fitToWidth() {
    if (!pdfDoc) return;
    
    autoFit = true;
    const pdfContainer = document.getElementById('pdfContainer');
    const containerWidth = pdfContainer.clientWidth - 100;
    
    // 큰 파일 처리를 위한 타임아웃 설정
    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('처리 시간 초과')), 5000);
    });
    
    Promise.race([
        pdfDoc.getPage(currentPage),
        timeoutPromise
    ]).then(page => {
        const viewport = page.getViewport({ scale: 1.0 });
        let targetWidth = viewport.width;
        
        // 듀얼 페이지 모드일 때는 두 페이지 너비를 고려
        if (viewMode === 'dual') {
            targetWidth = viewport.width * 2 + 20; // 페이지 간격 20px 추가
        }
        
        const scale = containerWidth / targetWidth;
        const clampedScale = Math.max(Math.min(scale, maxScale), minScale);
        
        currentScale = clampedScale;
        
        if (viewMode === 'continuous') {
            applyContinuousZoom().then(() => {
                triggerSegmentSync();
            });
        } else {
            rerenderCurrentView().then(() => {
                triggerSegmentSync();
            });
        }
    }).catch(error => {
        console.error('너비 맞춤 처리 중 오류:', error);
        showNotification('너비 맞춤 처리 중 오류가 발생했습니다. 파일이 너무 클 수 있습니다.', 'error');
        // 기본 스케일로 복구
        currentScale = 1.0;
        rerenderCurrentView().then(() => {
            triggerSegmentSync();
        });
    });
}

// 페이지 네비게이션
export function nextPage() {
    if (pdfDoc && currentPage < pdfDoc.numPages) {
        currentPage = currentPage + 1;
        if (viewMode === 'continuous') {
            scrollToPage(currentPage);
            updatePageControls();
        } else {
            rerenderCurrentView();
        }
    }
}

export function previousPage() {
    if (pdfDoc && currentPage > 1) {
        currentPage = currentPage - 1;
        if (viewMode === 'continuous') {
            scrollToPage(currentPage);
            updatePageControls();
        } else {
            rerenderCurrentView();
        }
    }
}

// 줌 레벨 표시 업데이트
function updateZoomDisplay() {
    const zoomLevel = document.getElementById('zoomLevel');
    if (zoomLevel) {
        zoomLevel.textContent = Math.round(currentScale * 100) + '%';
    }
}

// 세그먼트 이미지 캡처
export async function captureSegmentAsImage(segment) {
    if (!pdfDoc) return null;

    try {
        const page = await pdfDoc.getPage(segment.page_number);
        const scale = 2.0; // 고해상도 캡처를 위해 스케일 증가
        const viewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        await page.render({ canvasContext: context, viewport }).promise;

        const sx = segment.left * scale;
        const sy = segment.top * scale;
        const sWidth = segment.width * scale;
        const sHeight = segment.height * scale;

        const segmentCanvas = document.createElement('canvas');
        segmentCanvas.width = sWidth;
        segmentCanvas.height = sHeight;
        const segmentContext = segmentCanvas.getContext('2d');

        segmentContext.drawImage(canvas, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight);

        return segmentCanvas.toDataURL('image/png');
    } catch (error) {
        console.error('세그먼트 캡처 오류:', error);
        return null;
    }
}

// Getters
export function getCurrentPage() {
    return currentPage;
}

export function getCurrentScale() {
    return currentScale;
}

export function getPdfDoc() {
    return pdfDoc;
}

export function isAutoFit() {
    return autoFit;
}

// 초기화 후 뷰어 숨기기
export function hideViewer() {
    const pdfContainer = document.getElementById('pdfContainer');
    const uploadZone = document.getElementById('uploadZone');
    
    if (pdfContainer && uploadZone) {
        pdfContainer.innerHTML = '';
        uploadZone.style.display = 'block';
    }
}

// 뷰 모드 설정
export function setViewMode(mode) {
    if (mode !== 'single' && mode !== 'dual' && mode !== 'continuous') return;
    
    viewMode = mode;
    
    // 뷰 모드 버튼 업데이트
    updateViewModeButtons();
    updateViewOptionsMenu();
    
    // 드롭다운 메뉴 닫기
    const dropdown = document.getElementById('viewOptionsMenu');
    if (dropdown) dropdown.style.display = 'none';
    
    // 현재 페이지 다시 렌더링
    if (pdfDoc) {
        rerenderCurrentView();
    }
}

// 뷰 모드 버튼 상태 업데이트
function updateViewModeButtons() {
    const singleBtn = document.querySelector('.view-mode-btn[onclick*="single"]');
    const dualBtn = document.querySelector('.view-mode-btn[onclick*="dual"]');
    const continuousBtn = document.querySelector('.view-mode-btn[onclick*="continuous"]');
    
    if (singleBtn && dualBtn && continuousBtn) {
        singleBtn.className = `view-mode-btn ${viewMode === 'single' ? 'active' : ''}`;
        dualBtn.className = `view-mode-btn ${viewMode === 'dual' ? 'active' : ''}`;
        continuousBtn.className = `view-mode-btn ${viewMode === 'continuous' ? 'active' : ''}`;
    }
}

// 현재 뷰 모드 반환
export function getViewMode() {
    return viewMode;
}

// 세그먼트 표시/숨김 토글
export function toggleSegments() {
    segmentsVisible = !segmentsVisible;
    
    // 모든 세그먼트 오버레이의 표시 상태 변경
    const overlays = document.querySelectorAll('.segment-overlay');
    overlays.forEach(overlay => {
        overlay.style.display = segmentsVisible ? 'block' : 'none';
    });
    
    // 버튼 상태 업데이트
    updateSegmentToggleButton();
    updateViewOptionsMenu();
    
    // 알림 표시
    showNotification(
        segmentsVisible ? '세그먼트 표시됨' : '세그먼트 숨김 - 원본 PDF만 표시', 
        'info'
    );
    
    // 드롭다운 메뉴 닫기
    const dropdown = document.getElementById('viewOptionsMenu');
    if (dropdown) dropdown.style.display = 'none';
}

// 뷰 설정 드롭다운 토글
export function toggleViewSettings() {
    const dropdown = document.getElementById('viewOptionsMenu');
    if (dropdown) {
        const isVisible = dropdown.style.display !== 'none';
        dropdown.style.display = isVisible ? 'none' : 'block';
    }
}

// 세그먼트 토글 버튼 상태 업데이트
function updateSegmentToggleButton() {
    const segmentBtn = document.querySelector('.view-mode-btn[onclick*="toggleSegments"]');
    if (segmentBtn) {
        segmentBtn.className = `view-mode-btn ${segmentsVisible ? 'active' : ''}`;
    }
}

// 뷰 옵션 메뉴 상태 업데이트
function updateViewOptionsMenu() {
    const viewOptions = document.querySelectorAll('.view-option-btn');
    viewOptions.forEach(btn => {
        const onclick = btn.getAttribute('onclick');
        if (onclick) {
            if (onclick.includes('toggleSegments')) {
                btn.style.backgroundColor = segmentsVisible ? '#e3f2fd' : '';
                btn.style.fontWeight = segmentsVisible ? '600' : '400';
            } else if (onclick.includes("'single'")) {
                btn.style.backgroundColor = viewMode === 'single' ? '#e8f5e8' : '';
                btn.style.fontWeight = viewMode === 'single' ? '600' : '400';
            } else if (onclick.includes("'dual'")) {
                btn.style.backgroundColor = viewMode === 'dual' ? '#e8f5e8' : '';
                btn.style.fontWeight = viewMode === 'dual' ? '600' : '400';
            } else if (onclick.includes("'continuous'")) {
                btn.style.backgroundColor = viewMode === 'continuous' ? '#e8f5e8' : '';
                btn.style.fontWeight = viewMode === 'continuous' ? '600' : '400';
            }
        }
    });
}

// 줌 컨트롤 위치 업데이트 함수
export function updateZoomControlsPosition() {
    const pdfContainer = document.getElementById('pdfContainer');
    const zoomControls = document.querySelector('.zoom-controls');
    
    if (!pdfContainer || !zoomControls) return;
    
    // PDF 컨테이너의 현재 위치와 크기 다시 계산
    const pdfRect = pdfContainer.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    
    // 화면 크기에 따른 반응형 위치 조정
    if (viewportWidth <= 1024) {
        // 태블릿/모바일: CSS에서 처리하도록 스타일 초기화
        zoomControls.style.top = '';
        zoomControls.style.left = '';
        zoomControls.style.right = '';
        zoomControls.style.width = '';
    } else {
        // 데스크톱: PDF 컨테이너 기준으로 플로팅
        const floatingOffset = 12; // 플로팅 오프셋
        const leftMargin = 24; // 좌우 여백
        zoomControls.style.top = `${pdfRect.top + floatingOffset}px`;
        zoomControls.style.left = `${pdfRect.left + leftMargin}px`;
        zoomControls.style.right = `${viewportWidth - pdfRect.right + leftMargin}px`;
        zoomControls.style.width = 'auto';
    }
}

// 단일/듀얼 페이지 모드에 연속스크롤 방식 적용 (캔버스 크기 변경)
async function applyScaleToCurrentView() {
    if (!pdfDoc) return;
    
    try {
        if (viewMode === 'single') {
            await applyScaleToSinglePage();
        } else if (viewMode === 'dual') {
            await applyScaleToDualPages();
        }
    } catch (error) {
        console.error('스케일 적용 중 오류:', error);
    }
}

// 단일 페이지 모드 스케일 적용 (연속스크롤 방식 완전 복사)
async function applyScaleToSinglePage() {
    const canvas = document.getElementById('pdfCanvas');
    const segmentOverlay = document.getElementById('segmentOverlay');
    
    if (!canvas || !pdfDoc) return;
    
    try {
        // 이전 렌더링 작업이 있으면 취소 (연속스크롤과 동일)
        if (activeRenderTasks.has(currentPage)) {
            activeRenderTasks.get(currentPage).cancel();
            activeRenderTasks.delete(currentPage);
        }

        // 페이지와 viewport 가져오기
        const page = await pdfDoc.getPage(currentPage);
        const viewport = page.getViewport({ scale: currentScale });

        // 캔버스 크기 설정 (내부 해상도 + CSS 크기) - 연속스크롤 방식 완전 복사
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;

        // 세그먼트 오버레이 크기 변경 - 연속스크롤 방식 완전 복사
        if (segmentOverlay) {
            segmentOverlay.style.width = `${viewport.width}px`;
            segmentOverlay.style.height = `${viewport.height}px`;
        }
        
        // 뷰어 컨테이너 크기 조정
        const viewer = document.querySelector('.pdf-viewer.single-page');
        if (viewer) {
            viewer.style.width = viewport.width + 'px';
            viewer.style.height = viewport.height + 'px';
        }

        // 새로운 렌더링 작업 시작 - 연속스크롤 방식 완전 복사
        const context = canvas.getContext('2d');
        if (context) {
            const renderTask = page.render({ canvasContext: context, viewport });
            activeRenderTasks.set(currentPage, renderTask);
            
            await renderTask.promise;
            activeRenderTasks.delete(currentPage);

            // 세그먼트 오버레이 업데이트 - 연속스크롤 방식 완전 복사
            const event = new CustomEvent('pageRendered', {
                detail: { 
                    viewport, 
                    pageNum: currentPage,
                    overlayId: segmentOverlay?.id,
                    viewMode: 'single'
                }
            });
            document.dispatchEvent(event);
        }

    } catch (error) {
        // 취소된 작업은 무시 - 연속스크롤 방식 완전 복사
        if (error.name !== 'RenderingCancelledException') {
            console.error(`단일 페이지 ${currentPage} 줌 적용 중 오류:`, error);
        }
        activeRenderTasks.delete(currentPage);
    }
}

// 듀얼 페이지 모드 스케일 적용 (연속스크롤 방식 완전 복사)
async function applyScaleToDualPages() {
    const canvas1 = document.getElementById('pdfCanvas1');
    const canvas2 = document.getElementById('pdfCanvas2');
    const overlay1 = document.getElementById('segmentOverlay1');
    const overlay2 = document.getElementById('segmentOverlay2');
    
    if (!canvas1 || !pdfDoc) return;
    
    try {
        // 페이지 1 처리 - 연속스크롤 방식 완전 복사
        // 이전 렌더링 작업이 있으면 취소
        if (activeRenderTasks.has(currentPage)) {
            activeRenderTasks.get(currentPage).cancel();
            activeRenderTasks.delete(currentPage);
        }

        const page1 = await pdfDoc.getPage(currentPage);
        const viewport1 = page1.getViewport({ scale: currentScale });
        
        // 캔버스 크기 설정 (내부 해상도 + CSS 크기) - 연속스크롤 방식 완전 복사
        canvas1.width = viewport1.width;
        canvas1.height = viewport1.height;
        canvas1.style.width = `${viewport1.width}px`;
        canvas1.style.height = `${viewport1.height}px`;
        
        // 세그먼트 오버레이 크기 변경 - 연속스크롤 방식 완전 복사
        if (overlay1) {
            overlay1.style.width = `${viewport1.width}px`;
            overlay1.style.height = `${viewport1.height}px`;
        }
        
        // 새로운 렌더링 작업 시작 - 연속스크롤 방식 완전 복사
        const context1 = canvas1.getContext('2d');
        if (context1) {
            const renderTask1 = page1.render({ canvasContext: context1, viewport: viewport1 });
            activeRenderTasks.set(currentPage, renderTask1);
            
            await renderTask1.promise;
            activeRenderTasks.delete(currentPage);

            // 세그먼트 오버레이 업데이트 - 연속스크롤 방식 완전 복사
            const event1 = new CustomEvent('pageRendered', {
                detail: { 
                    viewport: viewport1, 
                    pageNum: currentPage,
                    overlayId: overlay1?.id,
                    viewMode: 'dual'
                }
            });
            document.dispatchEvent(event1);
        }
        
        // 페이지 2 처리 (존재하는 경우) - 연속스크롤 방식 완전 복사
        const pageNum2 = currentPage + 1;
        if (canvas2 && pageNum2 <= pdfDoc.numPages) {
            // 이전 렌더링 작업이 있으면 취소
            if (activeRenderTasks.has(pageNum2)) {
                activeRenderTasks.get(pageNum2).cancel();
                activeRenderTasks.delete(pageNum2);
            }

            const page2 = await pdfDoc.getPage(pageNum2);
            const viewport2 = page2.getViewport({ scale: currentScale });
            
            // 캔버스 크기 설정 (내부 해상도 + CSS 크기) - 연속스크롤 방식 완전 복사
            canvas2.width = viewport2.width;
            canvas2.height = viewport2.height;
            canvas2.style.width = `${viewport2.width}px`;
            canvas2.style.height = `${viewport2.height}px`;
            
            // 세그먼트 오버레이 크기 변경 - 연속스크롤 방식 완전 복사
            if (overlay2) {
                overlay2.style.width = `${viewport2.width}px`;
                overlay2.style.height = `${viewport2.height}px`;
            }
            
            // 새로운 렌더링 작업 시작 - 연속스크롤 방식 완전 복사
            const context2 = canvas2.getContext('2d');
            if (context2) {
                const renderTask2 = page2.render({ canvasContext: context2, viewport: viewport2 });
                activeRenderTasks.set(pageNum2, renderTask2);
                
                await renderTask2.promise;
                activeRenderTasks.delete(pageNum2);

                // 세그먼트 오버레이 업데이트 - 연속스크롤 방식 완전 복사
                const event2 = new CustomEvent('pageRendered', {
                    detail: { 
                        viewport: viewport2, 
                        pageNum: pageNum2,
                        overlayId: overlay2?.id,
                        viewMode: 'dual'
                    }
                });
                document.dispatchEvent(event2);
            }
        }
        
        // 전체 뷰어 크기 조정
        const viewer = document.querySelector('.pdf-viewer.dual-page');
        if (viewer) {
            const totalWidth = viewport1.width * (canvas2 && pageNum2 <= pdfDoc.numPages ? 2 : 1);
            viewer.style.width = totalWidth + 'px';
            viewer.style.height = viewport1.height + 'px';
        }

    } catch (error) {
        // 취소된 작업은 무시 - 연속스크롤 방식 완전 복사
        if (error.name !== 'RenderingCancelledException') {
            console.error(`듀얼 페이지 줌 적용 중 오류:`, error);
        }
        // 모든 페이지의 렌더링 작업 정리
        activeRenderTasks.delete(currentPage);
        activeRenderTasks.delete(currentPage + 1);
    }
}

// 세그먼트 동기화 강제 실행 함수
function triggerSegmentSync() {
    // 현재 뷰 모드에 따라 모든 페이지의 세그먼트 재동기화
    setTimeout(() => {
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
    }, 50); // PDF 렌더링 완료 후 세그먼트 동기화
}

// 🚀 개선된 시스템 상태 확인 함수들 (디버깅용)
export function getSystemStatus() {
    return {
        renderQueue: globalRenderQueue.getStatus(),
        debouncer: globalDebouncer.getStatus(),
        currentPage,
        currentScale,
        viewMode,
        activeRenderTasks: activeRenderTasks.size,
        isRenderingBatch
    };
}

export function forceRenderQueueClear() {
    globalRenderQueue.clearLowPriorityTasks();
    globalDebouncer.cancelAll();
    console.log('🧹 모든 렌더링 큐와 디바운서 강제 정리 완료');
}

// 전역 접근용 (디버깅)
window.pdfSystemStatus = getSystemStatus;
window.pdfForceClean = forceRenderQueueClear;

// Export 함수들은 index.js에서 글로벌로 노출됨