/* =====================================================
   Dorea Segment Manager Module - Segment Selection & Overlay
   ===================================================== */

import { showNotification } from './utils.js';

// 세그먼트 관리 변수
let segments = [];
let selectedSegments = [];
let maxSegments = 4;
let selectedSegmentIds = []; // 선택된 세그먼트 ID 저장
let isImageModeActive = false; // 이미지 모드 상태


// 세그먼트 매니저 초기화
export function init() {
    // 🚀 개선된 페이지 렌더링 이벤트 리스너 (기존 방식과 병존)
    document.addEventListener('pageRendered', (event) => {
        const { viewport, pageNum, overlayId, viewMode } = event.detail;
        
        console.log(`📄 페이지 ${pageNum} 세그먼트 렌더링`);
        
        // 검증된 단일 렌더링 시스템 사용
        if ((viewMode === 'dual' || viewMode === 'continuous') && overlayId) {
            updateSegmentOverlayById(overlayId, viewport, pageNum);
        } else {
            updateSegmentOverlay(viewport, pageNum);
        }
    });
}

// 세그먼트 데이터 설정
export function setSegments(newSegments) {
    segments = newSegments || [];
}

// ID로 지정된 오버레이 업데이트 (듀얼 페이지 모드용)
function updateSegmentOverlayById(overlayId, viewport, pageNum) {
    const overlay = document.getElementById(overlayId);
    
    if (!overlay) {
        // 오버레이가 없으면 조용히 스킵
        return;
    }

    // 이전 세그먼트들 제거 (줌 변경시 위치 재계산을 위해)
    overlay.innerHTML = '';

    const pageSegments = segments.filter(s => s.page_number === pageNum);

    pageSegments.forEach((segment, index) => {
        const segmentEl = createSegmentElement(segment, index, pageNum, viewport);
        
        // 이전에 선택된 세그먼트인지 확인하고 선택 상태 복원
        const segmentId = segment.id || `page${pageNum}_${index}`;
        if (selectedSegmentIds.includes(segmentId)) {
            if (selectedSegmentIds.length === 1) {
                segmentEl.classList.add('selected');
            } else {
                segmentEl.classList.add('multi-selected');
            }
            // selectedSegments 배열도 업데이트
            const existingIndex = selectedSegments.findIndex(s => s.id === segmentId || s.segmentId === segmentId);
            if (existingIndex === -1) {
                selectedSegments.push({ ...segment, element: segmentEl });
            } else {
                selectedSegments[existingIndex].element = segmentEl;
            }
        }
        
        overlay.appendChild(segmentEl);
    });
}

// 세그먼트 요소 생성 헬퍼 함수
function createSegmentElement(segment, index, pageNum, viewport) {
    const segmentEl = document.createElement('div');
    segmentEl.className = 'segment';
    segmentEl.dataset.segmentIndex = index;
    segmentEl.dataset.segmentId = segment.id || `page${pageNum}_${index}`;

    // 🔍 디버깅: 세그먼트와 뷰포트 데이터 분석
    console.log(`🔧 [DEBUG] 페이지 ${pageNum}, 세그먼트 ${index}:`, {
        원본_세그먼트: { 
            left: segment.left, 
            top: segment.top, 
            width: segment.width, 
            height: segment.height,
            type: segment.type
        },
        뷰포트_정보: { 
            scale: viewport.scale, 
            width: viewport.width,
            height: viewport.height,
            transform: viewport.transform
        },
        변환_매트릭스: {
            offsetX: viewport.transform[4],
            offsetY: viewport.transform[5], 
            scaleX: viewport.transform[0],
            scaleY: viewport.transform[3],
            isFlipped: viewport.transform[3] < 0
        }
    });

    // 🚨 비정상 매트릭스 감지 및 수정
    const transform = viewport.transform;
    const isRotatedMatrix = (transform[0] === 0 && transform[3] === 0);
    
    console.log(`🔍 매트릭스 분석:`, {
        isRotated: isRotatedMatrix,
        transform: transform,
        viewport_scale: viewport.scale
    });
    
    let calculatedLeft, calculatedTop;
    
    // 🔥 단순화된 좌표 계산 - 복잡한 매트릭스 변환 제거
    console.log(`🎯 단순화된 포지셔닝 적용`);
    
    // 항상 viewport.scale만 사용 (가장 안정적)
    const scale = viewport.scale || 1;
    calculatedLeft = segment.left * scale;
    calculatedTop = segment.top * scale;
    
    console.log(`📐 단순 스케일링:`, {
        scale: scale,
        원본: { left: segment.left, top: segment.top },
        결과: { left: calculatedLeft, top: calculatedTop }
    });
    
    console.log(`📐 좌표 변환 결과:`, {
        방식: isRotatedMatrix ? '회전_매트릭스_단순처리' : '정상_매트릭스_처리',
        원본: { left: segment.left, top: segment.top },
        결과: { left: calculatedLeft, top: calculatedTop }
    });

    segmentEl.style.left = calculatedLeft + 'px';
    segmentEl.style.top = calculatedTop + 'px';
    segmentEl.style.width = (segment.width * viewport.scale) + 'px';
    segmentEl.style.height = (segment.height * viewport.scale) + 'px';
    
    console.log(`✅ 최종 계산 결과:`, {
        left: calculatedLeft,
        top: calculatedTop,
        width: segment.width * viewport.scale,
        height: segment.height * viewport.scale,
        CSS적용: `left: ${calculatedLeft}px, top: ${calculatedTop}px`
    });

    const typeColors = {
        'Text': 'rgba(59, 130, 246, 0.3)',
        'Picture': 'rgba(16, 185, 129, 0.3)',
        'Figure': 'rgba(16, 185, 129, 0.3)',
        'Table': 'rgba(245, 158, 11, 0.3)',
        'Title': 'rgba(190, 24, 93, 0.3)',
        'Caption': 'rgba(124, 58, 237, 0.3)'
    };

    segmentEl.style.backgroundColor = typeColors[segment.type] || 'rgba(59, 130, 246, 0.3)';

    segmentEl.addEventListener('click', (e) => {
        e.stopPropagation();
        handleSegmentClick(e, segment, segmentEl);
    });

    return segmentEl;
}

// 세그먼트 오버레이 업데이트 (단일 페이지 모드용)
function updateSegmentOverlay(viewport, pageNum) {
    const viewer = document.querySelector('.pdf-viewer');
    const overlay = viewer?.querySelector('.segment-overlay');
    
    if (!overlay) return;

    // 이전 세그먼트들 제거 (줌 변경시 위치 재계산을 위해)
    overlay.innerHTML = '';

    const pageSegments = segments.filter(s => s.page_number === pageNum);

    pageSegments.forEach((segment, index) => {
        const segmentEl = createSegmentElement(segment, index, pageNum, viewport);
        
        // 이전에 선택된 세그먼트인지 확인하고 선택 상태 복원
        const segmentId = segment.id || `page${pageNum}_${index}`;
        if (selectedSegmentIds.includes(segmentId)) {
            if (selectedSegmentIds.length === 1) {
                segmentEl.classList.add('selected');
            } else {
                segmentEl.classList.add('multi-selected');
            }
            // selectedSegments 배열도 업데이트
            const existingIndex = selectedSegments.findIndex(s => s.id === segmentId || s.segmentId === segmentId);
            if (existingIndex === -1) {
                selectedSegments.push({ ...segment, element: segmentEl });
            } else {
                selectedSegments[existingIndex].element = segmentEl;
            }
        }
        
        overlay.appendChild(segmentEl);
    });
}

// 세그먼트 클릭 처리
function handleSegmentClick(event, segment, segmentEl) {
    const isCtrlPressed = event.ctrlKey || event.metaKey;

    if (!isCtrlPressed) {
        // 단일 선택 로직
        const isAlreadySelected = segmentEl.classList.contains('selected');
        const wasOnlySelection = selectedSegments.length === 1 && isAlreadySelected;

        clearAllSegments();

        if (!wasOnlySelection) {
            segmentEl.classList.add('selected');
            selectedSegments = [{ ...segment, element: segmentEl }];
            updateSelectedSegmentUI(segment);
        }
    } else {
        // 다중 선택 (Ctrl/Meta 클릭) 로직
        if (selectedSegments.length === 1 && selectedSegments[0].element.classList.contains('selected')) {
            selectedSegments[0].element.classList.remove('selected');
            selectedSegments[0].element.classList.add('multi-selected');
        }

        const existingIndex = selectedSegments.findIndex(s => s.element === segmentEl);

        if (existingIndex !== -1) {
            // 이미 다중 선택에 있으면 제거
            selectedSegments.splice(existingIndex, 1);
            segmentEl.classList.remove('multi-selected');
        } else {
            // 다중 선택에 추가
            if (selectedSegments.length < maxSegments) {
                selectedSegments.push({ ...segment, element: segmentEl });
                segmentEl.classList.add('multi-selected');
            } else {
                showNotification(`최대 ${maxSegments}개까지만 선택할 수 있습니다.`, 'warning');
            }
        }

        // 선택된 개수에 따라 UI 업데이트
        if (selectedSegments.length > 1) {
            updateMultiSegmentUI();
        } else if (selectedSegments.length === 1) {
            const lastSegment = selectedSegments[0];
            lastSegment.element.classList.remove('multi-selected');
            lastSegment.element.classList.add('selected');
            updateSelectedSegmentUI(lastSegment);
        } else {
            clearAllSegments();
        }
    }
}

// 모든 세그먼트 선택 해제
export function clearAllSegments() {
    selectedSegments.forEach(segment => {
        if (segment.element) {
            segment.element.classList.remove('selected', 'multi-selected');
        }
    });
    selectedSegments = [];
    
    const indicator = document.getElementById('selectedSegmentIndicator');
    const multiSegments = document.getElementById('multiSelectedSegments');
    const quickActions = document.getElementById('quickActions');
    
    if (indicator) indicator.style.display = 'none';
    if (multiSegments) multiSegments.style.display = 'none';
    if (quickActions) quickActions.style.display = 'none';
}

// 단일 세그먼트 선택 UI 업데이트
function updateSelectedSegmentUI(segment) {
    const indicator = document.getElementById('selectedSegmentIndicator');
    const preview = document.getElementById('segmentPreview');
    const quickActions = document.getElementById('quickActions');
    const segmentType = document.getElementById('segmentType');

    if (segmentType) segmentType.textContent = segment.type || 'Unknown';
    
    if (preview) {
        // 이미지 관련 세그먼트인 경우 축소 이미지 표시
        if ((segment.type === 'Picture' || segment.type === 'Figure') && segment.left !== undefined) {
            createSegmentPreviewImage(segment, preview);
        } else if (segment.text) {
            const previewText = segment.text.length > 100 
                ? segment.text.substring(0, 100) + '...' 
                : segment.text;
            preview.textContent = previewText;
        } else {
            preview.textContent = `페이지 ${segment.page_number} 영역`;
        }
    }

    if (indicator) indicator.style.display = 'block';
    if (quickActions) quickActions.style.display = 'flex';
    
    const multiSegments = document.getElementById('multiSelectedSegments');
    if (multiSegments) multiSegments.style.display = 'none';
}

// 세그먼트 영역의 축소 이미지 생성
function createSegmentPreviewImage(segment, previewElement) {
    try {
        // 해당 페이지의 캔버스 찾기
        const pageCanvas = document.querySelector(`canvas[data-page-number="${segment.page_number}"]`);
        if (!pageCanvas) {
            console.warn(`페이지 ${segment.page_number}의 캔버스를 찾을 수 없습니다.`);
            previewElement.textContent = `페이지 ${segment.page_number} 이미지 영역`;
            return;
        }

        // 세그먼트 좌표를 캔버스 좌표로 변환 (세그먼트는 PDF 원본 좌표계 사용)
        const canvasWidth = pageCanvas.width;
        const canvasHeight = pageCanvas.height;
        
        // 현재 스케일 가져오기 (뷰포트 스케일)
        const pdfViewer = pageCanvas.closest('.pdf-viewer');
        let currentScale = 1.0;
        if (window.pdfViewer && window.pdfViewer.getCurrentScale) {
            currentScale = window.pdfViewer.getCurrentScale();
        }
        
        // 세그먼트 좌표를 캔버스 좌표로 변환
        const x = segment.left;
        const y = segment.top; 
        const width = segment.width;
        const height = segment.height;

        // 좌표 유효성 검사
        if (x < 0 || y < 0 || width <= 0 || height <= 0 || 
            x + width > canvasWidth || y + height > canvasHeight) {
            console.warn('세그먼트 좌표가 캔버스 범위를 벗어남:', { x, y, width, height, canvasWidth, canvasHeight });
            previewElement.textContent = `페이지 ${segment.page_number} 이미지 영역`;
            return;
        }

        // 임시 캔버스 생성하여 해당 영역 복사
        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        // 축소 이미지 크기 설정 (최대 100px)
        const maxSize = 100;
        const aspectRatio = width / height;
        let previewWidth, previewHeight;
        
        if (aspectRatio > 1) {
            previewWidth = Math.min(maxSize, width);
            previewHeight = previewWidth / aspectRatio;
        } else {
            previewHeight = Math.min(maxSize, height);
            previewWidth = previewHeight * aspectRatio;
        }
        
        tempCanvas.width = previewWidth;
        tempCanvas.height = previewHeight;
        
        // 원본 캔버스에서 해당 영역을 축소하여 복사
        tempCtx.drawImage(
            pageCanvas,
            x, y, width, height,  // 소스 영역
            0, 0, previewWidth, previewHeight  // 대상 영역
        );
        
        // 기존 내용 제거하고 이미지 추가
        previewElement.innerHTML = '';
        const img = document.createElement('img');
        img.src = tempCanvas.toDataURL();
        img.style.cssText = `
            max-width: 100px;
            max-height: 60px;
            border: 1px solid var(--border-primary);
            border-radius: 4px;
            object-fit: contain;
            background: white;
            display: block;
        `;
        previewElement.appendChild(img);
        
        console.log('이미지 미리보기 생성 완료:', { 
            pageNumber: segment.page_number, 
            type: segment.type,
            coordinates: { x, y, width, height },
            previewSize: { previewWidth, previewHeight }
        });
        
    } catch (error) {
        console.error('이미지 미리보기 생성 실패:', error);
        previewElement.textContent = `페이지 ${segment.page_number} 이미지 영역`;
    }
}

// 작은 미리보기 이미지 생성 헬퍼 함수
function createSmallPreviewImage(segment, size) {
    try {
        const pageCanvas = document.querySelector(`canvas[data-page-number="${segment.page_number}"]`);
        if (!pageCanvas) return null;

        const tempCanvas = document.createElement('canvas');
        const tempCtx = tempCanvas.getContext('2d');
        
        tempCanvas.width = size;
        tempCanvas.height = size;
        
        // 세그먼트 영역에서 정사각형으로 크롭하여 복사
        const sourceSize = Math.min(segment.width, segment.height);
        const sourceX = segment.left + (segment.width - sourceSize) / 2;
        const sourceY = segment.top + (segment.height - sourceSize) / 2;
        
        tempCtx.drawImage(
            pageCanvas,
            sourceX, sourceY, sourceSize, sourceSize,
            0, 0, size, size
        );
        
        return tempCanvas.toDataURL();
    } catch (error) {
        console.warn('작은 미리보기 이미지 생성 실패:', error);
        return null;
    }
}

// 다중 세그먼트 선택 UI 업데이트
function updateMultiSegmentUI() {
    const container = document.getElementById('multiSelectedSegments');
    const list = document.getElementById('segmentsList');
    const count = document.getElementById('segmentsCount');

    if (selectedSegments.length === 0) {
        if (container) container.style.display = 'none';
        const quickActions = document.getElementById('quickActions');
        const indicator = document.getElementById('selectedSegmentIndicator');
        if (quickActions) quickActions.style.display = 'none';
        if (indicator) indicator.style.display = 'none';
        return;
    }

    if (count) count.textContent = `${selectedSegments.length}개`;
    
    if (list) {
        list.innerHTML = selectedSegments.map((segment, index) => {
            const typeMap = {
                'Text': { badge: 'badge-text', name: '텍스트' },
                'Picture': { badge: 'badge-picture', name: '이미지' },
                'Figure': { badge: 'badge-figure', name: '도표' },
                'Table': { badge: 'badge-table', name: '표' },
                'Title': { badge: 'badge-title', name: '제목' },
                'Caption': { badge: 'badge-caption', name: '캡션' }
            };

            const typeInfo = typeMap[segment.type] || { badge: 'badge-text', name: segment.type };
            
            // 이미지/도표 타입의 경우 미리보기 이미지 생성
            let previewImageHTML = '';
            if ((segment.type === 'Picture' || segment.type === 'Figure') && segment.left !== undefined) {
                const previewImageData = createSmallPreviewImage(segment, 40); // 40px 크기
                if (previewImageData) {
                    previewImageHTML = `
                        <img src="${previewImageData}" style="
                            width: 40px; 
                            height: 40px; 
                            border-radius: 4px; 
                            object-fit: cover; 
                            margin-right: 8px;
                            border: 1px solid var(--border-primary);
                        ">
                    `;
                }
            }
            
            return `
                <div class="segment-item" style="display: flex; align-items: center; padding: 8px;">
                    ${previewImageHTML}
                    <div style="flex: 1;">
                        <div class="segment-type-badge ${typeInfo.badge}" style="margin-bottom: 4px;">
                            ${typeInfo.name}
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">
                            페이지 ${segment.page_number}
                            ${segment.text ? ` • ${segment.text.substring(0, 30)}${segment.text.length > 30 ? '...' : ''}` : ''}
                        </div>
                    </div>
                    <button onclick="window.segmentManager.removeSegment(${index})" style="background: none; border: none; color: var(--text-tertiary); cursor: pointer; padding: 2px; margin-left: 8px;">×</button>
                </div>
            `;
        }).join('');
    }

    if (container) container.style.display = 'block';
    const quickActions = document.getElementById('quickActions');
    const indicator = document.getElementById('selectedSegmentIndicator');
    if (quickActions) quickActions.style.display = 'flex';
    if (indicator) indicator.style.display = 'none';
}

// 세그먼트 제거
export function removeSegment(index) {
    if (selectedSegments[index] && selectedSegments[index].element) {
        selectedSegments[index].element.classList.remove('multi-selected');
    }
    selectedSegments.splice(index, 1);
    updateMultiSegmentUI();
}

// 이미지 모드 토글
export function toggleImageMode() {
    isImageModeActive = !isImageModeActive;
    const toggleBtn = document.getElementById('imageToggleBtn');
    
    console.log('🔄 [DEBUG] 이미지 모드 토글:', isImageModeActive);
    
    if (toggleBtn) {
        if (isImageModeActive) {
            toggleBtn.classList.add('active');
            toggleBtn.title = '이미지 모드 활성화됨: 채팅 전송 시 이미지로 함께 전송';
            showNotification('이미지 모드가 켜졌습니다. 이제 채팅 전송 시 선택된 영역이 이미지로 함께 전송됩니다.', 'info');
        } else {
            toggleBtn.classList.remove('active');
            toggleBtn.title = '이미지 모드: 채팅과 함께 이미지로 전송';
            showNotification('이미지 모드가 꺼졌습니다.', 'info');
        }
    }
}

// 이미지 모드 상태 확인
export function getImageModeStatus() {
    console.log('🔍 [DEBUG] getImageModeStatus 호출:', isImageModeActive);
    return isImageModeActive;
}

// 빠른 액션 처리
export function quickAction(action) {
    if (selectedSegments.length === 0) {
        showNotification('영역을 먼저 선택해주세요.', 'warning');
        return;
    }

    const actions = {
        'translate': '이 영역을 한국어로 번역해주세요.',
        'summarize': '이 영역을 요약해주세요.',
        'explain': '이 영역을 자세히 설명해주세요.',
        'analyze': '이 영역을 분석해주세요.'
    };

    const message = actions[action];
    if (message) {
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            chatInput.value = message;
            // 메시지 전송 이벤트 발생
            const event = new CustomEvent('quickActionTriggered', {
                detail: { message, segments: selectedSegments }
            });
            document.dispatchEvent(event);
        }
    }
}

// 세그먼트를 이미지로 첨부하는 액션 처리 (📷 이미지로 버튼용)
async function handleImageAction() {
    try {
        showNotification('이미지 생성 중...', 'info');
        
        // 선택된 세그먼트들을 이미지로 변환
        const imagePromises = selectedSegments.map(async (segment) => {
            // pdfViewer의 captureSegmentAsImage 함수 사용
            if (window.pdfViewer && window.pdfViewer.captureSegmentAsImage) {
                return await window.pdfViewer.captureSegmentAsImage(segment);
            }
            return null;
        });

        const images = await Promise.all(imagePromises);
        const validImages = images.filter(img => img !== null);

        if (validImages.length === 0) {
            showNotification('이미지 생성에 실패했습니다.', 'error');
            return;
        }

        // 채팅 입력창에 이미지 첨부 메시지 설정
        const chatInput = document.getElementById('chatInput');
        if (chatInput) {
            const segmentCount = selectedSegments.length;
            const segmentTypes = [...new Set(selectedSegments.map(s => s.type))].join(', ');
            chatInput.value = `📷 이미지로 첨부됨 (${segmentCount}개 영역: ${segmentTypes})`;
        }

        // 이미지 첨부 이벤트 발생 (📷 이미지로 버튼 전용)
        const event = new CustomEvent('segmentImagesAttached', {
            detail: { 
                images: validImages, 
                segments: selectedSegments,
                message: `OCR 품질이 좋지 않아 이미지로 첨부합니다. 총 ${validImages.length}개 영역을 분석해주세요.`
            }
        });
        document.dispatchEvent(event);

        showNotification(`${validImages.length}개 영역이 이미지로 첨부되었습니다.`, 'success');
        
    } catch (error) {
        console.error('이미지 생성 중 오류:', error);
        showNotification('이미지 생성 중 오류가 발생했습니다.', 'error');
    }
}

// Getters
export function getSelectedSegments() {
    return selectedSegments;
}

export function getSegments() {
    return segments;
}

// Export 함수들은 index.js에서 글로벌로 노출됨

// HTML onclick에서 사용할 수 있도록 전역 함수로 등록
window.clearAllSegments = clearAllSegments;
window.quickAction = quickAction;
window.toggleImageMode = toggleImageMode;