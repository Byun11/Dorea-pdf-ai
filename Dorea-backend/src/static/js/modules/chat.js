/* =====================================================
   Dorea Chat Module - Chat System & Streaming
   ===================================================== */

import { fetchApi, showNotification, getCurrentTime } from './utils.js';
import RagSourcesManager from './ragSourcesManager.js';

// 새로운 RAG 출처 버튼 생성 (RagSourcesManager 사용)
function createSourcesButton(similarDocs) {
    return window.ragSourcesManager.createSourcesButton(similarDocs);
}

// 출처 패널 토글 함수 (레거시 지원용)
function toggleSources(button) {
    // 기존 onclick 호출을 새로운 매니저로 리다이렉트
    console.warn('toggleSources는 레거시 함수입니다. 새로운 이벤트 기반 시스템을 사용하세요.');
}

// 드롭다운 위치 조정 함수 (레거시 지원용)
function adjustDropdownPosition(button, dropdown) {
    // 새로운 시스템에서는 RagSourcesManager가 처리
    console.warn('adjustDropdownPosition는 레거시 함수입니다.');
}

// 첨부된 세그먼트들의 HTML 표시 생성
function createSegmentAttachmentsHTML(segments) {
    if (!segments || segments.length === 0) return '';
    
    const typeMap = {
        'Text': { icon: '📝', name: '텍스트', color: '#3b82f6' },
        'Picture': { icon: '🖼️', name: '이미지', color: '#10b981' },
        'Figure': { icon: '📊', name: '도표', color: '#8b5cf6' },
        'Table': { icon: '📋', name: '표', color: '#f59e0b' },
        'Title': { icon: '🏷️', name: '제목', color: '#ef4444' },
        'Caption': { icon: '💬', name: '캡션', color: '#6b7280' }
    };
    
    
    // 이미지 세그먼트들을 따로 분리하여 큰 미리보기로 표시
    const imageSegments = segments.filter(s => s.type === 'Picture' || s.type === 'Figure');
    const otherSegments = segments.filter(s => s.type !== 'Picture' && s.type !== 'Figure');
    
    let imagePreviewHTML = '';
    if (imageSegments.length > 0) {
        const imagePreviews = imageSegments.map(segment => {
            // 🎯 이미 생성된 세그먼트 미리보기 이미지를 재사용!
            const segmentPreview = document.getElementById('segmentPreview');
            if (segmentPreview) {
                const existingImg = segmentPreview.querySelector('img');
                if (existingImg && existingImg.src) {
                    // 기존 이미지를 더 큰 사이즈로 복사
                    const imgSrc = existingImg.src;
                    
                    return `
                        <div style="
                            margin: 8px 0;
                            border: 1px solid var(--border-primary);
                            border-radius: 8px;
                            overflow: hidden;
                            background: white;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                            max-width: 200px;
                        ">
                            <img src="${imgSrc}" style="
                                width: 100%;
                                height: auto;
                                display: block;
                                max-width: 200px;
                            ">
                            <div style="
                                padding: 8px;
                                background: var(--bg-secondary);
                                font-size: 12px;
                                color: var(--text-secondary);
                                border-top: 1px solid var(--border-primary);
                            ">
                                ${segment.type === 'Picture' ? '🖼️ 이미지' : '📊 도표'} • 페이지 ${segment.page_number}
                            </div>
                        </div>
                    `;
                }
            }
            
            // 폴백: 세그먼트 정보만 표시
            return `
                <div style="
                    margin: 8px 0;
                    padding: 20px;
                    border: 1px solid var(--border-primary);
                    border-radius: 8px;
                    text-align: center;
                    color: var(--text-secondary);
                    background: var(--bg-tertiary);
                ">
                    ${segment.type === 'Picture' ? '🖼️' : '📊'} ${segment.type === 'Picture' ? '이미지' : '도표'} • 페이지 ${segment.page_number}
                </div>
            `;
        }).filter(Boolean).join('');
        
        if (imagePreviews) {
            imagePreviewHTML = `<div style="margin-top: 8px;">${imagePreviews}</div>`;
        }
    }
    
    // 텍스트 및 기타 세그먼트들 표시 
    let otherAttachmentsHTML = '';
    if (otherSegments.length > 0) {
        const otherAttachmentItems = Object.entries(otherSegments.reduce((acc, segment) => {
            const type = segment.type || 'Text';
            if (!acc[type]) acc[type] = [];
            acc[type].push(segment);
            return acc;
        }, {})).map(([type, typeSegments]) => {
            const typeInfo = typeMap[type] || typeMap['Text'];
            const count = typeSegments.length;
            
            // 텍스트 내용이 있는 모든 세그먼트에 대해 내용 미리보기 추가
            let contentPreview = '';
            if (typeSegments[0] && typeSegments[0].text) {
                const previewText = typeSegments[0].text.length > 100 
                    ? typeSegments[0].text.substring(0, 100) + '...' 
                    : typeSegments[0].text;
                
                // 타입별로 다른 스타일 적용
                const previewStyles = {
                    'Text': { prefix: '', style: 'font-style: italic;' },
                    'Title': { prefix: '', style: 'font-weight: bold; font-size: 13px;' },
                    'Table': { prefix: '📊 ', style: 'font-family: monospace; font-size: 11px;' },
                    'Caption': { prefix: '', style: 'font-style: italic; font-size: 11px;' }
                };
                
                const styleInfo = previewStyles[type] || previewStyles['Text'];
                
                contentPreview = `
                    <div style="
                        margin-top: 4px;
                        padding: 8px;
                        background: var(--bg-tertiary);
                        border-radius: 4px;
                        font-size: 12px;
                        color: var(--text-secondary);
                        border-left: 3px solid ${typeInfo.color};
                        ${styleInfo.style}
                    ">${styleInfo.prefix}"${previewText}"</div>
                `;
            }
            
            return `
                <div style="margin: 4px 0;">
                    <div class="segment-attachment-item" style="
                        display: inline-flex; 
                        align-items: center; 
                        gap: 6px; 
                        padding: 6px 12px; 
                        background: ${typeInfo.color}15; 
                        border: 1px solid ${typeInfo.color}40; 
                        border-radius: 12px; 
                        font-size: 13px;
                        color: ${typeInfo.color};
                    ">
                        <span style="font-size: 16px;">${typeInfo.icon}</span>
                        <span style="font-weight: 500;">${typeInfo.name}</span>
                        ${count > 1 ? `<span style="opacity: 0.7;">${count}개</span>` : ''}
                        <span style="opacity: 0.6; font-size: 11px;">• 페이지 ${typeSegments[0].page_number}</span>
                    </div>
                    ${contentPreview}
                </div>
            `;
        }).join('');
        
        if (otherAttachmentItems) {
            otherAttachmentsHTML = `
                <div style="margin-top: 8px;">
                    <div style="font-size: 11px; color: var(--text-tertiary); margin-bottom: 4px;">첨부된 내용:</div>
                    ${otherAttachmentItems}
                </div>
            `;
        }
    }
    
    return imagePreviewHTML + otherAttachmentsHTML;
}

// 저장된 글자 크기를 개별 메시지에 적용하는 함수
function applySavedFontSize(contentElement) {
    const savedLevel = localStorage.getItem('fontSizeLevel');
    if (savedLevel) {
        const fontSizeLevel = parseInt(savedLevel);
        const FONT_SIZE_LEVELS = [0.8, 0.9, 1.0, 1.1, 1.2]; // 글자 크기 배수
        const multiplier = FONT_SIZE_LEVELS[fontSizeLevel + 2];
        contentElement.style.fontSize = `${16 * multiplier}px`; // 기본 16px 기준
    }
}

// 모든 기존 메시지에 저장된 글자 크기 적용
function applyFontSizeToAllMessages() {
    const messageContents = document.querySelectorAll('.message-content');
    messageContents.forEach(content => {
        applySavedFontSize(content);
    });
}

// 개선된 실시간 마크다운 렌더링 함수
function typeTextWithEffect(element, newText) {
    // 기존 텍스트 데이터를 data 속성에서 가져오기 (HTML이 아닌 순수 텍스트)
    let currentText = element.dataset.rawText || '';
    const fullText = currentText + newText;
    
    // 순수 텍스트 데이터 저장
    element.dataset.rawText = fullText;
    
    // 실시간 마크다운 파싱 및 렌더링
    try {
        // 전체 텍스트를 다시 파싱하여 완전한 마크다운 렌더링 보장
        const parsedContent = parseMarkdownWithMath(fullText);
        element.innerHTML = parsedContent;
        
        // KaTeX 수식 렌더링 - 디바운싱으로 성능 최적화
        if (typeof renderMathInElement !== 'undefined') {
            // 기존 타임아웃 취소
            if (element._katexTimeout) {
                clearTimeout(element._katexTimeout);
            }
            
            // 50ms 디바운싱으로 불필요한 렌더링 방지
            element._katexTimeout = setTimeout(() => {
                try {
                    renderMathInElement(element, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                            {left: '\\[', right: '\\]', display: true},
                            {left: '\\(', right: '\\)', display: false}
                        ],
                        throwOnError: false,
                        errorColor: 'var(--error, #ef4444)',
                        strict: false,
                        trust: true,  // 더 많은 LaTeX 명령어 허용
                        macros: {     // 일반적인 수학 매크로 추가
                            "\\hbar": "\\hslash",
                            "\\mathbf": "\\boldsymbol"
                        }
                    });
                } catch (error) {
                    console.warn('KaTeX 렌더링 오류:', error);
                } finally {
                    element._katexTimeout = null;
                }
            }, 50);
        }
    } catch (error) {
        console.error('실시간 마크다운 파싱 실패:', error);
        // 파싱 실패 시에도 기본 텍스트는 표시
        element.textContent = fullText;
    }
    
    // 스크롤을 부드럽게 하단으로 이동
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
        chatContainer.scrollTo({
            top: chatContainer.scrollHeight,
            behavior: 'smooth'
        });
    }
    
    // 부드러운 업데이트 효과
    element.style.opacity = '0.95';
    requestAnimationFrame(() => {
        element.style.opacity = '1';
    });
}

// 개선된 LaTeX 지원 마크다운 파서
function parseMarkdownWithMath(text) {
    if (!text || typeof text !== 'string') return '';
    
    try {
        // 수식을 임시로 보호 (더 안전한 정규식 사용)
        const mathPlaceholders = [];
        let protectedText = text;
        
        // $...$와 $...$ 수식을 찾아서 플레이스홀더로 대체
        // 블록 수식 처리 ($...$)
        protectedText = protectedText.replace(/\$\$([\s\S]*?)\$\$/g, (match, content) => {
            const placeholder = `__MATH_BLOCK_${mathPlaceholders.length}__`;
            mathPlaceholders.push({type: 'block', content: content.trim(), original: match});
            return placeholder;
        });
        
        // 인라인 수식 처리 ($...$) - 더 강력한 정규식으로 복잡한 수식 지원
        protectedText = protectedText.replace(/\$([^$\n]*(?:\\.[^$\n]*)*)\$/g, (match, content) => {
            const placeholder = `__MATH_INLINE_${mathPlaceholders.length}__`;
            mathPlaceholders.push({type: 'inline', content: content.trim(), original: match});
            return placeholder;
        });
        
        // 일반 마크다운 파싱
        const parsed = parseMarkdown(protectedText);
        
        // 수식 플레이스홀더를 다시 복원 (정규식 사용)
        let result = parsed;
        mathPlaceholders.forEach((math, index) => {
            const placeholder = math.type === 'block' ? `__MATH_BLOCK_${index}__` : `__MATH_INLINE_${index}__`;
            // 정규식을 사용하여 placeholder가 다른 태그에 의해 감싸지는 것을 방지
            result = result.replace(new RegExp(`(<p>\\s*)?${placeholder}(\\s*<\/p>)?`), math.original);
        });
        
        return result;
    } catch (error) {
        console.error('parseMarkdownWithMath 오류:', error);
        return parseMarkdown(text); // fallback to basic markdown
    }
}

// 향상된 마크다운 파서 (test.html과 동일한 구현)
function parseMarkdown(text) {
    // Escape HTML first
    let html = text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
    
    // Parse markdown
    html = html
        // Headers
        .replace(/^### (.*$)/gm, '<h3 style="margin: 10px 0 5px 0; color: var(--text-primary); font-size: 1.1em;">$1</h3>')
        .replace(/^## (.*$)/gm, '<h2 style="margin: 15px 0 8px 0; color: var(--text-primary); font-size: 1.2em;">$1</h2>')
        .replace(/^# (.*$)/gm, '<h1 style="margin: 20px 0 10px 0; color: var(--text-primary); font-size: 1.3em;">$1</h1>')
        
        // Bold - 다크모드에서도 잘 보이도록 개선
        .replace(/\*\*(.*?)\*\*/g, '<strong style="font-weight: 700; color: var(--text-primary); text-shadow: 0 0 1px currentColor;">$1</strong>')
        
        // Italic
        .replace(/\*(.*?)\*/g, '<em style="font-style: italic; color: var(--text-primary);">$1</em>')
        
        // Inline code
        .replace(/`(.*?)`/g, '<code style="background: var(--bg-tertiary); color: var(--text-primary); padding: 2px 4px; border-radius: 3px; font-family: monospace; font-size: 0.9em; border: 1px solid var(--border-primary);">$1</code>')
        
        // Code blocks
        .replace(/```([\s\S]*?)```/g, '<pre style="background: var(--bg-tertiary); color: var(--text-primary); padding: 10px; border-radius: 6px; overflow-x: auto; margin: 10px 0; border-left: 3px solid var(--primary); border: 1px solid var(--border-primary);"><code style="font-family: monospace; font-size: 0.9em; white-space: pre;">$1</code></pre>')
        
        // Links
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" style="color: var(--primary); text-decoration: underline;">$1</a>')
        
        // Line breaks
        .replace(/\n/g, '<br>');
    
    // Handle lists
    const lines = html.split('<br>');
    let result = [];
    let inList = false;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.match(/^[-*+]\s/)) {
            if (!inList) {
                result.push('<ul style="margin: 8px 0; padding-left: 20px;">');
                inList = true;
            }
            const listItem = line.replace(/^[-*+]\s/, '');
            result.push(`<li style="margin: 3px 0;">${listItem}</li>`);
        } else if (line.match(/^\d+\.\s/)) {
            if (!inList) {
                result.push('<ol style="margin: 8px 0; padding-left: 20px;">');
                inList = true;
            }
            const listItem = line.replace(/^\d+\.\s/, '');
            result.push(`<li style="margin: 3px 0;">${listItem}</li>`);
        } else {
            if (inList) {
                result.push('</ul>');
                inList = false;
            }
            if (line) {
                result.push(line + '<br>');
            }
        }
    }
    
    if (inList) {
        result.push('</ul>');
    }
    
    return result.join('');
}

// 채팅 시스템 변수
let currentChatSession = null;
let conversationHistory = [];
let isTyping = false;
let allChatSessions = [];
let ragModeEnabled = false; // RAG 모드 상태

// 채팅 시스템 초기화
export function init() {
    setupChatEventListeners();
    initializeWelcomeMessage();
    
    // 저장된 글자 크기를 기존 메시지들에 적용
    applyFontSizeToAllMessages();
    
    // RAG 토글 버튼 이벤트 리스너
    setupRagToggle();
    
    // 파일 로드 이벤트 리스너
    document.addEventListener('fileLoaded', (event) => {
        const { fileId, fileName } = event.detail;
        switchChatSession(fileId, fileName);
    });
    
    // 파일 삭제 이벤트 리스너
    document.addEventListener('fileDeleted', () => {
        resetChatUI();
    });
    
    // 빠른 액션 이벤트 리스너 (중복 등록 방지)
    document.removeEventListener('quickActionTriggered', handleQuickActionEvent);
    document.addEventListener('quickActionTriggered', handleQuickActionEvent);
    
    // 세그먼트 이미지 첨부 이벤트 리스너 (중복 등록 방지)
    document.removeEventListener('segmentImagesAttached', handleSegmentImagesEvent);
    document.addEventListener('segmentImagesAttached', handleSegmentImagesEvent);
}

// RAG 토글 설정
function setupRagToggle() {
    // 설정 메뉴와 통합된 토글 함수는 나중에 등록됨
    // 초기화 시 체크박스 상태 동기화는 initializeRagMode에서 처리
}

// 채팅 이벤트 리스너 설정
function setupChatEventListeners() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');

    if (chatInput) {
        chatInput.addEventListener('input', () => {
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
            if (sendBtn) sendBtn.disabled = !chatInput.value.trim();
        });

        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (chatInput.value.trim() && !isTyping) {
                    sendMessage();
                }
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendMessage);
    }
}

// 환영 메시지 초기화
function initializeWelcomeMessage() {
    const welcomeTime = document.getElementById('welcomeTime');
    const sendBtn = document.getElementById('sendBtn');
    
    if (welcomeTime) welcomeTime.textContent = getCurrentTime();
    if (sendBtn) sendBtn.disabled = true;
}

// 메시지 전송
export async function sendMessage(customMessage = null) {
    const input = document.getElementById('chatInput');
    const message = customMessage || (input ? input.value.trim() : '');
    
    if (!message || isTyping) return;

    if (!currentChatSession) {
        showNotification('먼저 파일을 선택해주세요.', 'warning');
        return;
    }

    // 🔥 캡처된 이미지가 있으면 이미지와 함께 전송
    if (window.pendingCaptureImage) {
        console.log('📷 캡처된 이미지와 함께 메시지 전송');
        const captureImage = window.pendingCaptureImage;
        
        // 🧹 캡처 이미지 상태 완전 정리 (메모리 누수 방지)
        window.pendingCaptureImage = null;
        
        // 타임아웃도 정리
        if (window.captureTimeoutId) {
            clearTimeout(window.captureTimeoutId);
            window.captureTimeoutId = null;
        }
        
        // UI 정리
        const segmentIndicator = document.getElementById('selectedSegmentIndicator');
        if (segmentIndicator) {
            segmentIndicator.style.display = 'none';
        }
        
        // 입력창 정리
        if (input) input.value = '';
        
        console.log('🧹 캡처 이미지 메모리 정리 완료');
        
        // 이미지와 함께 전송
        await sendMessageWithImage(message, captureImage);
        return;
    }

    // 선택된 세그먼트 가져오기
    const selectedSegments = getSelectedSegments();
    
    console.log('🔍 [DEBUG] sendMessage 호출:');
    console.log('  - 메시지:', message);
    console.log('  - 선택된 세그먼트 수:', selectedSegments.length);
    
    // 메시지 처리 (이미지 모드 체크 포함)
    await processMessage(message, selectedSegments);
}

// 이미지와 함께 메시지를 전송하는 함수
export async function sendMessageWithImage(message, imageData) {
    if (!message || isTyping) return;

    if (!currentChatSession) {
        showNotification('먼저 파일을 선택해주세요.', 'warning');
        return;
    }

    console.log('🖼️ [DEBUG] sendMessageWithImage 호출:');
    console.log('  - 메시지:', message);
    console.log('  - 이미지 데이터 길이:', imageData ? imageData.length : 0);
    
    // 이미지 크기 검사 (기본적인 검증만)
    if (imageData && imageData.length > 200000) {
        console.warn('⚠️ 이미지가 너무 큽니다:', imageData.length, '바이트');
        showNotification('이미지가 너무 큽니다. 더 작은 영역을 선택해주세요.', 'warning');
        return;
    }
    
    // 이미지 세그먼트 생성
    const imageSegment = {
        type: 'image',
        content: imageData,
        page: (window.pdfViewer && window.pdfViewer.getCurrentPage ? window.pdfViewer.getCurrentPage() : null) || 1,
        description: '캡처된 화면 이미지'
    };
    
    // 이미지를 포함한 메시지 처리
    await processImageMessage(message, [imageSegment]);
}

// 이미지 메시지 처리 전용 함수
async function processImageMessage(message, imageSegments) {
    addMessage(message, true, false, true);
    
    // 캡처된 이미지 표시
    const lastMessage = document.querySelector('.message:last-child .message-content');
    if (lastMessage && imageSegments.length > 0) {
        const imagePreview = document.createElement('div');
        imagePreview.className = 'message-image-preview';
        imagePreview.innerHTML = `
            <div style="margin-top: 8px; padding: 8px; background: #f8f9fa; border-radius: 8px; border: 1px solid #e9ecef;">
                <div style="font-size: 12px; color: #6c757d; margin-bottom: 4px;">📷 첨부된 이미지</div>
                <img src="${imageSegments[0].content}" style="max-width: 200px; max-height: 120px; border-radius: 4px; object-fit: contain; background: white; border: 1px solid #dee2e6;" alt="캡처된 이미지">
            </div>
        `;
        lastMessage.appendChild(imagePreview);
    }

    isTyping = true;
    const typingIndicator = addTypingIndicator();

    try {
        // 현재 세션의 대화 히스토리 가져오기
        let conversationHistory = [];
        try {
            const historyResponse = await fetchApi(`/chats/${currentChatSession.sessionId}/messages`);
            if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                const recentMessages = historyData.messages.slice(-3);
                conversationHistory = recentMessages.map(msg => ({
                    role: msg.is_user ? 'user' : 'assistant',
                    content: msg.content
                }));
            }
        } catch (error) {
            console.warn('대화 히스토리 로드 실패:', error);
        }

        // API 요청 데이터 구성
        const requestBody = {
            segments: imageSegments,
            query: message,
            conversation_history: conversationHistory
        };

        console.log('🔍 [FRONTEND-DEBUG] API 요청 전송 직전. Body:', JSON.stringify(requestBody, (key, value) => {
            if (key === 'content' && typeof value === 'string' && value.startsWith('data:image')) {
                return value.substring(0, 100) + '...'; // 이미지 데이터 축약
            }
            return value;
        }, 2));

        // 스트리밍 API 호출
        const response = await fetchApi('/multi-segment-stream', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        typingIndicator.remove();
        const messageEl = addMessage('', false, true);
        const contentEl = messageEl.querySelector('.message-content');

        // 스트리밍 응답 처리
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.substring(6));
                        if (json.type === 'chunk' && json.content) {
                            typeTextWithEffect(contentEl, json.content);
                        } else if (json.type === 'info' && json.message) {
                            typeTextWithEffect(contentEl, `\n\nℹ️ ${json.message}\n\n`);
                        } else if (json.type === 'error') {
                            contentEl.textContent += `❌ ${json.error}`;
                            contentEl.style.color = '#dc2626';
                        } else if (json.type === 'done') {
                            const finalText = contentEl.dataset.rawText || '';
                            if (finalText) {
                                try {
                                    const finalParsed = parseMarkdownWithMath(finalText);
                                    contentEl.innerHTML = finalParsed;
                                    
                                    if (typeof renderMathInElement !== 'undefined') {
                                        try {
                                            renderMathInElement(contentEl, {
                                                delimiters: [
                                                    {left: '$$', right: '$$', display: true},
                                                    {left: '$', right: '$', display: false},
                                                    {left: '\\\\[', right: '\\\\]', display: true},
                                                    {left: '\\(', right: '\\)', display: false}
                                                ],
                                                throwOnError: false,
                                                errorColor: 'var(--error, #ef4444)',
                                                strict: false,
                                                trust: true
                                            });
                                        } catch (error) {
                                            console.warn('최종 KaTeX 렌더링 오류:', error);
                                        }
                                    }
                                } catch (error) {
                                    console.warn('최종 마크다운 파싱 오류:', error);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('스트림 파싱 오류:', e);
                    }
                }
            }
        }

        messageEl.classList.remove('streaming');

        // 메시지 저장
        await saveMessageToDB(`${message} [이미지 첨부됨]`, true, []);
        await saveMessageToDB(contentEl.dataset.rawText || contentEl.textContent, false, null);

    } catch (error) {
        console.error('이미지 채팅 오류:', error);
        if (typingIndicator) typingIndicator.remove();
        addMessage(`죄송합니다. 오류가 발생했습니다: ${error.message}`, false);
        showNotification('이미지 메시지 전송에 실패했습니다.', 'error');
    } finally {
        isTyping = false;
    }
}

// RAG 벡터 검색 수행
async function performVectorSearch(query, fileId) {
    console.log('🔍 [DEBUG] RAG 벡터 검색 시작:', query);
    console.log('🔍 [DEBUG] 현재 세션 정보:', {
        fileId: currentChatSession?.fileId,
        sessionId: currentChatSession?.sessionId,
        fileName: currentChatSession?.fileName
    });
    
    // 임베딩 상태 확인
    const embeddingResponse = await fetchApi(`/api/knowledge/embeddings/${fileId}`);
    if (embeddingResponse.ok) {
        const embeddingStatus = await embeddingResponse.json();
        console.log('🔍 [DEBUG] 임베딩 상태:', embeddingStatus);
        
        if (embeddingStatus.status !== 'completed') {
            throw new Error(`지식 베이스에서 임베딩을 먼저 생성해주세요. 현재 상태: ${embeddingStatus.status}`);
        }
    } else {
        throw new Error('지식 베이스에서 임베딩을 먼저 생성해주세요.');
    }
    
    // 임베딩 설정 확인
    const settingsResponse = await fetchApi('/api/knowledge/settings');
    if (settingsResponse.ok) {
        const settings = await settingsResponse.json();
        console.log('🔍 [DEBUG] 임베딩 설정:', settings);
        
        if (!settings.configured) {
            throw new Error('임베딩 모델이 설정되지 않았습니다. 시스템 설정에서 임베딩 모델을 설정해주세요.');
        }
    } else {
        throw new Error('임베딩 설정 확인 실패');
    }
    
    // 벡터 검색 수행
    const searchResponse = await fetchApi('/api/knowledge/search', {
        method: 'POST',
        body: JSON.stringify({
            query: query,
            top_k: 5,
            file_id: fileId
        })
    });

    if (!searchResponse.ok) {
        const errorData = await searchResponse.json().catch(() => ({}));
        throw new Error(`벡터 검색 실패: ${errorData.detail || searchResponse.statusText}`);
    }

    const searchData = await searchResponse.json();
    const similarDocs = searchData.results || [];
    
    // 임베딩 모델 불일치 경고 체크
    if (similarDocs.length > 0 && similarDocs[0]?.type === 'embedding_inconsistency_warning') {
        const warningData = similarDocs[0];
        showEmbeddingInconsistencyWarning(warningData);
        return []; // 검색 결과 없음으로 처리
    }
    
    console.log('🔍 [DEBUG] 벡터 검색 결과:', similarDocs.length, '개 문서');
    console.log('🔍 [DEBUG] 첫 번째 검색 결과 샘플:', similarDocs[0]);
    
    return similarDocs;
}

// RAG 메시지 처리
async function processRagMessage(message) {
    addMessage(message, true);
    
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = '';
        input.style.height = 'auto';
    }
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    isTyping = true;
    const typingIndicator = addTypingIndicator();

    try {
        // 1. 벡터 검색 수행
        const similarDocs = await performVectorSearch(message, currentChatSession?.fileId);

        // 2. 검색 결과를 컨텍스트로 사용하여 GPT 요청
        const contextTexts = similarDocs.map(doc => doc.text).join('\n\n');
        
        // 현재 세션의 대화 히스토리 가져오기
        let conversationHistory = [];
        try {
            const historyResponse = await fetchApi(`/chats/${currentChatSession.sessionId}/messages`);
            if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                const recentMessages = historyData.messages.slice(-3);
                conversationHistory = recentMessages.map(msg => ({
                    role: msg.is_user ? 'user' : 'assistant',
                    content: msg.content
                }));
            }
        } catch (error) {
            console.warn('대화 히스토리 로드 실패:', error);
        }

        // RAG 프롬프트 구성
        const ragPrompt = `다음은 문서에서 검색된 관련 내용입니다:

${contextTexts}

위 내용을 바탕으로 다음 질문에 답변해주세요: ${message}

답변 시 주의사항:
- 검색된 내용에 근거하여 정확하게 답변하세요
- 관련 정보가 부족하다면 솔직히 말해주세요
- 가능하면 출처 페이지를 언급해주세요`;

        // API 요청 데이터 구성
        const requestBody = {
            segments: [{
                type: 'text',
                content: contextTexts,
                page: 'RAG Context'
            }],
            query: ragPrompt,
            conversation_history: conversationHistory,
            rag_mode: true
        };

        console.log('🔍 [DEBUG] RAG 요청 데이터:');
        console.log(`  - 검색된 문서: ${similarDocs.length}개`);
        console.log(`  - 컨텍스트 길이: ${contextTexts.length}자`);

        // 스트리밍 API 호출
        const response = await fetchApi('/multi-segment-stream', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        typingIndicator.remove();
        const messageEl = addMessage('', false, true);
        const contentEl = messageEl.querySelector('.message-content');

        // 출처 버튼 준비 (답변 완료 후 추가할 예정)
        let sourcesButtonHTML = '';
        if (similarDocs.length > 0) {
            sourcesButtonHTML = createSourcesButton(similarDocs);
        }

        // 스트리밍 응답 처리
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.substring(6));
                        if (json.type === 'chunk' && json.content) {
                            typeTextWithEffect(contentEl, json.content);
                        } else if (json.type === 'info' && json.message) {
                            typeTextWithEffect(contentEl, `\n\nℹ️ ${json.message}\n\n`);
                        } else if (json.type === 'error') {
                            contentEl.textContent += `❌ ${json.error}`;
                            contentEl.style.color = '#dc2626';
                        } else if (json.type === 'done') {
                            // 최종 렌더링
                            const finalText = contentEl.dataset.rawText || '';
                            if (finalText) {
                                try {
                                    const finalParsed = parseMarkdownWithMath(finalText);
                                    contentEl.innerHTML = finalParsed;
                                    
                                    if (typeof renderMathInElement !== 'undefined') {
                                        try {
                                            renderMathInElement(contentEl, {
                                                delimiters: [
                                                    {left: '$$', right: '$$', display: true},
                                                    {left: '$', right: '$', display: false},
                                                    {left: '\\\\[', right: '\\\\\]', display: true},
                                                    {left: '\\(', right: '\\)', display: false}
                                                ],
                                                throwOnError: false,
                                                errorColor: 'var(--error, #ef4444)',
                                                strict: false,
                                                trust: true,
                                                macros: {
                                                    "\\hbar": "\\hslash",
                                                    "\\mathbf": "\\boldsymbol",
                                                    "\\partial": "\\partial"
                                                }
                                            });
                                        } catch (error) {
                                            console.warn('최종 KaTeX 렌더링 오류:', error);
                                        }
                                    }
                                } catch (error) {
                                    console.warn('최종 마크다운 파싱 오류:', error);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('스트림 파싱 오류:', e);
                    }
                }
            }
        }

        messageEl.classList.remove('streaming');

        // 답변 완료 후 출처 버튼 추가 및 초기화
        if (sourcesButtonHTML && similarDocs.length > 0) {
            contentEl.insertAdjacentHTML('beforeend', sourcesButtonHTML);
            
            // 새로운 RAG 매니저로 초기화
            const ragContainer = contentEl.querySelector('.rag-sources-container');
            if (ragContainer) {
                const sourcesData = window.ragSourcesManager.processSourcesData(similarDocs);
                window.ragSourcesManager.initialize(ragContainer, sourcesData);
            }
        }

        // 메시지 저장
        await saveMessageToDB(message, true, null);
        await saveMessageToDB(contentEl.dataset.rawText || contentEl.textContent, false, null);

    } catch (error) {
        console.error('RAG 채팅 오류:', error);
        if (typingIndicator) typingIndicator.remove();
        
        // 임베딩 관련 오류인지 확인
        if (error.message.includes('임베딩을 먼저 생성해주세요') || error.message.includes('Cannot read properties of null')) {
            addMessage('지식 베이스에서 임베딩을 먼저 생성해주세요! 📚\n\n상단의 Knowledge 탭을 클릭하여 임베딩을 생성하면 AI가 문서 내용을 더 정확하게 분석할 수 있습니다.', false);
            showNotification('지식 베이스에서 임베딩을 먼저 생성해주세요!', 'warning');
        } else {
            addMessage(`죄송합니다. 검색 중 오류가 발생했습니다: ${error.message}`, false);
            showNotification('검색에 실패했습니다.', 'error');
        }
    } finally {
        isTyping = false;
        const sendBtn = document.getElementById('sendBtn');
        const chatInput = document.getElementById('chatInput');
        if (sendBtn && chatInput) {
            sendBtn.disabled = !chatInput.value.trim();
        }
    }
}

// 메시지 처리 (이미지 모드 자동 감지 + RAG 모드)
async function processMessage(message, selectedSegments = null) {
    if (!selectedSegments) {
        selectedSegments = getSelectedSegments();
    }

    // RAG 모드 체크 - 명시적으로 활성화되어 있거나, 세그먼트가 선택되지 않았을 때 자동 활성화
    const shouldUseRag = ragModeEnabled;
    if (shouldUseRag) {
        console.log('🔍 [DEBUG] RAG 모드로 메시지 처리');
        console.log(`  - 모드: ${ragModeEnabled ? '명시적 활성화' : '자동 활성화 (세그먼트 없음)'}`);
        await processRagMessage(message);
        return;
    }

    // 이미지 모드 체크
    const isImageMode = getImageModeStatus();

    addMessage(message, true);
    
    const input = document.getElementById('chatInput');
    if (input) {
        input.value = '';
        input.style.height = 'auto';
    }
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    isTyping = true;
    const typingIndicator = addTypingIndicator();

    try {
        // 세그먼트 데이터 준비
        const segmentsToProcess = [];

        for (const segment of selectedSegments) {
            // 이미지 모드가 켜져있으면 모든 세그먼트를 이미지로 처리
            if (isImageMode) {
                console.log('🖼️ [DEBUG] 이미지 모드: 모든 세그먼트를 이미지로 처리');
                const imageData = await captureSegmentAsImage(segment);
                segmentsToProcess.push({
                    type: 'image',
                    content: imageData,
                    page: segment.page_number,
                    description: `페이지 ${segment.page_number}의 ${segment.type}`
                });
            } else {
                // 이미지 모드가 아닐 때는 기존 로직
                if (segment.type === 'Picture' || segment.type === 'Figure') {
                    const imageData = await captureSegmentAsImage(segment);
                    segmentsToProcess.push({
                        type: 'image',
                        content: imageData,
                        page: segment.page_number,
                        description: `페이지 ${segment.page_number}의 이미지`
                    });
                } else {
                    segmentsToProcess.push({
                        type: 'text',
                        content: segment.text || '',
                        page: segment.page_number
                    });
                }
            }
        }

        // 현재 세션의 대화 히스토리 가져오기
        let conversationHistory = [];
        try {
            const historyResponse = await fetchApi(`/chats/${currentChatSession.sessionId}/messages`);
            if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                // 최근 3개 메시지만 사용 (현재 질문에 집중)
                const recentMessages = historyData.messages.slice(-3);
                conversationHistory = recentMessages.map(msg => ({
                    role: msg.is_user ? 'user' : 'assistant',
                    content: msg.content
                }));
            }
        } catch (error) {
            console.warn('대화 히스토리 로드 실패:', error);
        }

        // API 요청 데이터 구성
        const requestBody = {
            segments: segmentsToProcess,
            query: message,
            conversation_history: conversationHistory
        };

        // 🔍 디버깅: 전송할 데이터 확인
        console.log('🔍 [DEBUG] 백엔드로 전송할 데이터:');
        console.log(`  - Segments: ${segmentsToProcess.length}개`);
        console.log(`  - Query: ${message}`);
        console.log(`  - Conversation History: ${conversationHistory.length}개`);
        console.log('  - Request Body:', JSON.stringify(requestBody, null, 2));

        // 스트리밍 API 호출
        const response = await fetchApi('/multi-segment-stream', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        typingIndicator.remove();
        const messageEl = addMessage('', false, true);
        const contentEl = messageEl.querySelector('.message-content');

        // 스트리밍 응답 처리
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop(); // 마지막 불완전한 라인

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.substring(6));
                        if (json.type === 'chunk' && json.content) {
                            // 실시간 마크다운 렌더링 (전체 텍스트 재파싱 방식)
                            typeTextWithEffect(contentEl, json.content);
                        } else if (json.type === 'info' && json.message) {
                            // info 메시지도 동일한 방식으로 처리
                            typeTextWithEffect(contentEl, `\n\nℹ️ ${json.message}\n\n`);
                        } else if (json.type === 'error') {
                            contentEl.textContent += `❌ ${json.error}`;
                            contentEl.style.color = '#dc2626';
                        } else if (json.type === 'start') {
                            // 스트림 시작
                        } else if (json.type === 'done') {
                            // 최종 렌더링 확인 (이미 실시간으로 완료됨)
                            const finalText = contentEl.dataset.rawText || '';
                            if (finalText) {
                                try {
                                    const finalParsed = parseMarkdownWithMath(finalText);
                                    contentEl.innerHTML = finalParsed;
                                    
                                    // 최종 KaTeX 렌더링
                                    if (typeof renderMathInElement !== 'undefined') {
                                        try {
                                            renderMathInElement(contentEl, {
                                                delimiters: [
                                                    {left: '$$', right: '$$', display: true},
                                                    {left: '$', right: '$', display: false},
                                                    {left: '\\\\[', right: '\\\\\]', display: true},
                                                    {left: '\\(', right: '\\)', display: false}
                                                ],
                                                throwOnError: false,
                                                errorColor: 'var(--error, #ef4444)',
                                                strict: false,
                                                trust: true,
                                                macros: {
                                                    "\\hbar": "\\hslash",
                                                    "\\mathbf": "\\boldsymbol",
                                                    "\\partial": "\\partial"
                                                }
                                            });
                                        } catch (error) {
                                            console.warn('최종 KaTeX 렌더링 오류:', error);
                                        }
                                    }
                                } catch (error) {
                                    console.warn('최종 마크다운 파싱 오류:', error);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('스트림 파싱 오류:', e);
                    }
                }
            }
        }

        messageEl.classList.remove('streaming');

        // 메시지 저장 및 UI 정리 (순수 텍스트로 저장)
        await saveMessageToDB(message, true, selectedSegments.map(s => s.id));
        await saveMessageToDB(contentEl.dataset.rawText || contentEl.textContent, false, null);
        // 🔥 세그먼트 선택 유지 - clearSelectedSegments() 제거

    } catch (error) {
        console.error('채팅 오류:', error);
        if (typingIndicator) typingIndicator.remove();
        addMessage(`죄송합니다. 오류가 발생했습니다: ${error.message}`, false);
        showNotification('채팅 전송에 실패했습니다.', 'error');
    } finally {
        isTyping = false;
        const sendBtn = document.getElementById('sendBtn');
        const chatInput = document.getElementById('chatInput');
        if (sendBtn && chatInput) {
            sendBtn.disabled = !chatInput.value.trim();
        }
    }
}

// 메시지 추가
function addMessage(content, isUser, isStreaming = false, isImageMessage = false) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return null;

    const messageEl = document.createElement('div');
    messageEl.className = `chat-message ${isUser ? 'user' : 'ai'}${isStreaming ? ' streaming' : ''}`;

    const avatar = document.createElement('div');
    avatar.className = `message-avatar ${isUser ? 'user' : 'ai'}`;
    
    if (isUser) {
        avatar.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>`;
    } else {
        avatar.textContent = 'AI';
    }

    const messageBubble = document.createElement('div');
    messageBubble.className = 'message-bubble';

    const contentDiv = document.createElement('div');
    contentDiv.className = 'message-content';
    
    // 순수 텍스트 데이터 저장 (스트리밍용)
    contentDiv.dataset.rawText = content;
    
    // AI 응답인 경우 마크다운으로 렌더링, 사용자 메시지는 일반 텍스트
    if (!isUser && content.trim()) {
        try {
            const parsedContent = parseMarkdownWithMath(content);
            contentDiv.innerHTML = parsedContent;
            
            // KaTeX 렌더링
            if (typeof renderMathInElement !== 'undefined') {
                try {
                    renderMathInElement(contentDiv, {
                        delimiters: [
                            {left: '$$', right: '$$', display: true},
                            {left: '$', right: '$', display: false},
                            {left: '\\\\[', right: '\\\\\]', display: true},
                            {left: '\\(', right: '\\)', display: false}
                        ],
                        throwOnError: false,
                        errorColor: 'var(--error, #ef4444)',
                        strict: false,
                        trust: true,
                        macros: {
                            "\\hbar": "\\hslash",
                            "\\mathbf": "\\boldsymbol",
                            "\\partial": "\\partial"
                        }
                    });
                } catch (error) {
                    console.warn('addMessage KaTeX 렌더링 오류:', error);
                }
            }
        } catch (error) {
            console.warn('마크다운 파싱 오류:', error);
            contentDiv.textContent = content;
        }
    } else {
        contentDiv.textContent = content;
    }

    const timeDiv = document.createElement('div');
    timeDiv.className = 'message-time';
    timeDiv.textContent = getCurrentTime();

    const selectedSegments = getSelectedSegments();
    if (selectedSegments.length > 0 && isUser && !isImageMessage) {
        const segmentsDiv = document.createElement('div');
        segmentsDiv.className = 'message-segments';
        segmentsDiv.innerHTML = createSegmentAttachmentsHTML(selectedSegments);
        messageBubble.appendChild(segmentsDiv);
    }

    messageBubble.appendChild(contentDiv);
    messageBubble.appendChild(timeDiv);

    messageEl.appendChild(avatar);
    messageEl.appendChild(messageBubble);

    // 저장된 글자 크기 적용
    applySavedFontSize(contentDiv);

    chatContainer.appendChild(messageEl);
    // 부드러운 스크롤 적용
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });

    return messageEl;
}

// 타이핑 인디케이터 추가
function addTypingIndicator() {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return null;

    const typingEl = document.createElement('div');
    typingEl.className = 'chat-message ai';

    const avatar = document.createElement('div');
    avatar.className = 'message-avatar ai';
    avatar.textContent = 'AI';

    const typingContent = document.createElement('div');
    typingContent.innerHTML = `
        <div class="typing-indicator">
            <div class="typing-dots">
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
                <div class="typing-dot"></div>
            </div>
            <span>답변을 작성하고 있습니다...</span>
        </div>
    `;

    typingEl.appendChild(avatar);
    typingEl.appendChild(typingContent);
    chatContainer.appendChild(typingEl);
    // 부드러운 스크롤 적용
    chatContainer.scrollTo({
        top: chatContainer.scrollHeight,
        behavior: 'smooth'
    });

    return typingEl;
}

// DB에 메시지 저장
async function saveMessageToDB(content, isUser, messageSegments) {
    if (!currentChatSession) return;

    try {
        const sessionId = currentChatSession.sessionId;
        
        await fetchApi(`/chats/${sessionId}/messages`, {
            method: 'POST',
            body: JSON.stringify({
                content: content,
                is_user: isUser,
                selected_segments: null,
                api_type: 'streaming'
            })
        });
    } catch (error) {
        console.error('DB 저장 실패:', error);
    }
}

// 채팅 세션 관리
function switchChatSession(fileId, fileName) {
    if (!currentChatSession || currentChatSession.fileId !== fileId) {
        currentChatSession = {
            fileId: fileId,
            fileName: fileName,
            sessionId: null,
            conversationHistory: [],
            selectedSegment: null,
            createdAt: new Date()
        };

        // 새 세션 생성 또는 기존 세션 로드
        createOrLoadChatSession(fileId, fileName);
    }

    // UI 업데이트
    const currentFileName = document.getElementById('currentFileName');
    const sessionName = document.getElementById('sessionName');
    const chatControls = document.getElementById('chatControls');
    
    if (currentFileName) currentFileName.textContent = fileName;
    if (sessionName) sessionName.textContent = currentChatSession.fileName;
    if (chatControls) chatControls.style.display = 'flex';

    loadChatSessions(fileId);
    
    // 파일 전환 시 RAG 모드 자동 비활성화 (임베딩 모델 충돌 방지)
    if (ragModeEnabled) {
        ragModeEnabled = false;
        updateChatInputPlaceholder();
        updateRagSwitchStyles();
        console.log('🔄 파일 전환으로 RAG 모드 자동 비활성화됨');
    }
}

// 채팅 세션 생성 또는 로드
async function createOrLoadChatSession(fileId, fileName) {
    try {
        // 해당 파일의 기존 세션들 확인
        const sessionsResponse = await fetchApi(`/files/${fileId}/chats`);

        if (sessionsResponse.ok) {
            const sessionsData = await sessionsResponse.json();
            const existingSessions = sessionsData.sessions;

            if (existingSessions.length > 0) {
                // 가장 최근 세션 사용
                const latestSession = existingSessions[0];
                currentChatSession.sessionId = latestSession.id;
                const sessionName = document.getElementById('sessionName');
                if (sessionName) sessionName.textContent = latestSession.session_name;
                await loadChatHistory(latestSession.id);
            } else {
                // 새 세션 생성
                await newSession(false);
            }
            // 세션 목록 UI 업데이트
            updateSessionSelectUI(existingSessions);
        }
    } catch (error) {
        console.error('채팅 세션 로드/생성 오류:', error);
    }
}

// 채팅 히스토리 로드
async function loadChatHistory(sessionId) {
    try {
        const response = await fetchApi(`/chats/${sessionId}/messages`);

        if (response.ok) {
            const data = await response.json();
            const chatContainer = document.getElementById('chatContainer');
            
            if (chatContainer) {
                // 환영 메시지를 제외하고 모든 메시지 제거
                const welcomeMessage = chatContainer.querySelector('.chat-message.ai:first-child');
                chatContainer.innerHTML = '';
                if (welcomeMessage) {
                    chatContainer.appendChild(welcomeMessage);
                }

                // 메시지 히스토리 표시
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        addMessage(msg.content, msg.is_user);
                    });
                }
            }
        }
    } catch (error) {
        console.error('채팅 히스토리 로드 오류:', error);
    }
}

// 채팅 세션 목록 로드
async function loadChatSessions(fileId) {
    try {
        const response = await fetchApi(`/files/${fileId}/chats`);

        if (response.ok) {
            const data = await response.json();
            allChatSessions = data.sessions;
            updateSessionSelectUI(allChatSessions);
            return allChatSessions;
        }
        return [];
    } catch (error) {
        console.error('세션 목록 로드 오류:', error);
        return [];
    }
}

// 세션 선택 UI 업데이트
function updateSessionSelectUI(sessions = []) {
    const sessionSelect = document.getElementById('sessionSelect');
    if (!sessionSelect) return;
    
    if (sessions.length <= 1) {
        sessionSelect.style.display = 'none';
        return;
    }

    sessionSelect.innerHTML = '<option value="">채팅 세션 선택</option>';
    
    sessions.forEach(session => {
        const option = document.createElement('option');
        option.value = session.id;
        option.textContent = session.session_name;
        if (session.id === currentChatSession?.sessionId) {
            option.selected = true;
        }
        sessionSelect.appendChild(option);
    });

    sessionSelect.style.display = 'block';
}

// 세션 전환
export async function switchToSession(sessionId) {
    if (!sessionId || sessionId === currentChatSession?.sessionId) {
        return;
    }

    if (currentChatSession) {
        currentChatSession.sessionId = sessionId;
        await loadChatHistory(sessionId);
        
        const sessions = await loadChatSessions(currentChatSession.fileId);
        const session = sessions.find(s => s.id === sessionId);
        if (session) {
            const sessionName = document.getElementById('sessionName');
            if (sessionName) sessionName.textContent = session.session_name;
        }
    }
}

// 새 세션 생성
export async function newSession(showAlert = true) {
    if (!currentChatSession) return;

    const fileId = currentChatSession.fileId;

    try {
        const response = await fetchApi(`/files/${fileId}/chats`, {
            method: 'POST'
        });

        if (response.ok) {
            const data = await response.json();
            currentChatSession.sessionId = data.session.id;
            currentChatSession.conversationHistory = [];
            
            const chatContainer = document.getElementById('chatContainer');
            if (chatContainer) {
                const welcomeMessage = chatContainer.querySelector('.chat-message.ai:first-child');
                chatContainer.innerHTML = '';
                if (welcomeMessage) chatContainer.appendChild(welcomeMessage);
            }

            const sessionName = document.getElementById('sessionName');
            if (sessionName) sessionName.textContent = data.session.session_name;
            
            const sessions = await loadChatSessions(fileId);
            updateSessionSelectUI(sessions);
            
            if (showAlert) showNotification('새 채팅 세션이 생성되었습니다.', 'success');
        }
    } catch (error) {
        console.error('새 세션 생성 오류:', error);
        if (showAlert) showNotification('새 세션 생성에 실패했습니다.', 'error');
    }
}

// 세션 이름 변경
export async function renameSession() {
    if (!currentChatSession || !currentChatSession.sessionId) return;

    const sessionName = document.getElementById('sessionName');
    const currentName = sessionName ? sessionName.textContent : '';
    const newName = prompt('세션 이름을 입력하세요:', currentName);
    
    if (!newName || newName.trim() === currentName) return;

    try {
        const response = await fetchApi(`/chats/${currentChatSession.sessionId}/name`, {
            method: 'PUT',
            body: JSON.stringify({ session_name: newName.trim() })
        });

        if (response.ok) {
            const data = await response.json();
            if (sessionName) sessionName.textContent = data.session_name;
            
            const sessions = await loadChatSessions(currentChatSession.fileId);
            updateSessionSelectUI(sessions);
            
            showNotification('세션 이름이 변경되었습니다.', 'success');
        }
    } catch (error) {
        console.error('세션 이름 변경 오류:', error);
        showNotification('세션 이름 변경에 실패했습니다.', 'error');
    }
}

// 세션 삭제
export async function deleteSession() {
    if (!currentChatSession || !currentChatSession.sessionId) return;

    if (!confirm('현재 채팅 세션을 삭제하시겠습니까?')) return;

    try {
        const response = await fetchApi(`/chats/${currentChatSession.sessionId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            showNotification('채팅 세션이 삭제되었습니다.', 'success');
            // 다른 세션으로 전환하거나 새 세션 생성
            const sessions = await loadChatSessions(currentChatSession.fileId);
            if (sessions.length > 0) {
                await switchToSession(sessions[0].id);
            } else {
                await newSession();
            }
        }
    } catch (error) {
        console.error('세션 삭제 오류:', error);
        showNotification('세션 삭제에 실패했습니다.', 'error');
    }
}

// 채팅 UI 초기화
function resetChatUI() {
    currentChatSession = null;
    conversationHistory = [];

    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
        chatContainer.innerHTML = `
            <div class="chat-message ai">
                <div class="message-avatar ai">AI</div>
                <div class="message-bubble">
                    <div class="message-content">
                        안녕하세요! PDF 문서 분석을 도와드리는 AI 어시스턴트입니다.
                        문서를 업로드하고 특정 영역을 클릭하거나 직접 질문해주세요.
                    </div>
                    <div class="message-time">${getCurrentTime()}</div>
                </div>
            </div>
        `;
    }

    // 헤더 정보 초기화
    const currentFileName = document.getElementById('currentFileName');
    const sessionName = document.getElementById('sessionName');
    const sessionSelect = document.getElementById('sessionSelect');
    const chatControls = document.getElementById('chatControls');
    
    if (currentFileName) currentFileName.textContent = '파일을 선택해주세요';
    if (sessionName) sessionName.textContent = '채팅 세션';
    if (sessionSelect) sessionSelect.style.display = 'none';
    if (chatControls) chatControls.style.display = 'none';

    // 채팅 UI 완전 초기화 완료
}

// 헬퍼 함수들
function getSelectedSegments() {
    // segmentManager에서 선택된 세그먼트 가져오기
    if (window.segmentManager && window.segmentManager.getSelectedSegments) {
        return window.segmentManager.getSelectedSegments();
    }
    return [];
}

function getImageModeStatus() {
    // segmentManager에서 이미지 모드 상태 가져오기
    if (window.segmentManager && window.segmentManager.getImageModeStatus) {
        return window.segmentManager.getImageModeStatus();
    }
    return false;
}

function clearSelectedSegments() {
    // segmentManager의 세그먼트 선택 해제
    if (window.segmentManager && window.segmentManager.clearAllSegments) {
        window.segmentManager.clearAllSegments();
    }
}

async function captureSegmentAsImage(segment) {
    // pdfViewer의 세그먼트 이미지 캡처 기능 사용
    if (window.pdfViewer && window.pdfViewer.captureSegmentAsImage) {
        return await window.pdfViewer.captureSegmentAsImage(segment);
    }
    return null;
}

// Export 함수들은 index.js에서 글로벌로 노출됨

// (이전 복잡한 함수들 제거함 - sendNormalMessage에서 모든 로직 처리)

// 퀵 액션 이벤트 핸들러 (중복 등록 방지용)
function handleQuickActionEvent(event) {
    const { message } = event.detail;
    console.log('⚡ [DEBUG] quickActionTriggered 이벤트 발생:', message);
    sendMessage(message);
}

// 이벤트 핸들러 함수 (중복 등록 방지용)
function handleSegmentImagesEvent(event) {
    const { images, segments, message } = event.detail;
    console.log('🔥 [DEBUG] segmentImagesAttached 이벤트 발생');
    
    // 이미지 모드가 활성화되어 있으면 이벤트 기반 처리 무시
    const isImageMode = getImageModeStatus();
    if (isImageMode) {
        console.log('🚫 [DEBUG] 이미지 모드 활성화됨 - 이벤트 기반 처리 무시');
        return;
    }
    
    handleSegmentImagesAttachment(images, segments, message);
}

// 세그먼트 이미지 첨부 처리 (이벤트 기반)
async function handleSegmentImagesAttachment(images, segments, message) {
    if (!currentChatSession) {
        showNotification('먼저 파일을 선택해주세요.', 'warning');
        return;
    }

    if (!images || images.length === 0) {
        showNotification('이미지 생성에 실패했습니다.', 'error');
        return;
    }

    // 사용자 메시지를 채팅에 추가 (이미지 첨부 표시 포함)
    const chatInput = document.getElementById('chatInput');
    const userMessage = chatInput ? chatInput.value.trim() : message;
    
    addMessage(userMessage, true);
    
    if (chatInput) {
        chatInput.value = '';
        chatInput.style.height = 'auto';
    }
    
    const sendBtn = document.getElementById('sendBtn');
    if (sendBtn) sendBtn.disabled = true;

    isTyping = true;
    const typingIndicator = addTypingIndicator();

    try {
        // 이미지를 Base64 형태로 준비
        const imageData = images.map((imageBlob, index) => ({
            type: 'image',
            content: imageBlob, // 이미 Base64 형태로 제공됨
            page: segments[index] ? segments[index].page_number : 1,
            description: `페이지 ${segments[index] ? segments[index].page_number : 1}의 ${segments[index] ? segments[index].type : '영역'}`
        }));

        // 현재 세션의 대화 히스토리 가져오기
        let conversationHistory = [];
        try {
            const historyResponse = await fetchApi(`/chats/${currentChatSession.sessionId}/messages`);
            if (historyResponse.ok) {
                const historyData = await historyResponse.json();
                const recentMessages = historyData.messages.slice(-3);
                conversationHistory = recentMessages.map(msg => ({
                    role: msg.is_user ? 'user' : 'assistant',
                    content: msg.content
                }));
            }
        } catch (error) {
            console.warn('대화 히스토리 로드 실패:', error);
        }

        // API 요청 데이터 구성
        const requestBody = {
            segments: imageData,
            query: message || '첨부된 이미지들을 분석해주세요.',
            conversation_history: conversationHistory
        };

        console.log('🔍 [DEBUG] 이미지 첨부 데이터 전송:');
        console.log(`  - Images: ${imageData.length}개`);
        console.log(`  - Query: ${requestBody.query}`);

        // 스트리밍 API 호출
        const response = await fetchApi('/multi-segment-stream', {
            method: 'POST',
            body: JSON.stringify(requestBody)
        });

        typingIndicator.remove();
        const messageEl = addMessage('', false, true);
        const contentEl = messageEl.querySelector('.message-content');

        // 스트리밍 응답 처리
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop();

            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    try {
                        const json = JSON.parse(line.substring(6));
                        if (json.type === 'chunk' && json.content) {
                            typeTextWithEffect(contentEl, json.content);
                        } else if (json.type === 'info' && json.message) {
                            typeTextWithEffect(contentEl, `\n\nℹ️ ${json.message}\n\n`);
                        } else if (json.type === 'error') {
                            contentEl.textContent += `❌ ${json.error}`;
                            contentEl.style.color = '#dc2626';
                        } else if (json.type === 'done') {
                            const finalText = contentEl.dataset.rawText || '';
                            if (finalText) {
                                try {
                                    const finalParsed = parseMarkdownWithMath(finalText);
                                    contentEl.innerHTML = finalParsed;
                                    
                                    if (typeof renderMathInElement !== 'undefined') {
                                        try {
                                            renderMathInElement(contentEl, {
                                                delimiters: [
                                                    {left: '$$', right: '$$', display: true},
                                                    {left: '$', right: '$', display: false},
                                                    {left: '\\\\[', right: '\\\\\]', display: true},
                                                    {left: '\\(', right: '\\)', display: false}
                                                ],
                                                throwOnError: false,
                                                errorColor: 'var(--error, #ef4444)',
                                                strict: false,
                                                trust: true,
                                                macros: {
                                                    "\\hbar": "\\hslash",
                                                    "\\mathbf": "\\boldsymbol",
                                                    "\\partial": "\\partial"
                                                }
                                            });
                                        } catch (error) {
                                            console.warn('최종 KaTeX 렌더링 오류:', error);
                                        }
                                    }
                                } catch (error) {
                                    console.warn('최종 마크다운 파싱 오류:', error);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('스트림 파싱 오류:', e);
                    }
                }
            }
        }

        messageEl.classList.remove('streaming');

        // 메시지 저장
        await saveMessageToDB(userMessage, true, segments.map(s => s.id || `page${s.page_number}`));
        await saveMessageToDB(contentEl.dataset.rawText || contentEl.textContent, false, null);

    } catch (error) {
        console.error('이미지 첨부 채팅 오류:', error);
        if (typingIndicator) typingIndicator.remove();
        addMessage(`죄송합니다. 이미지 분석 중 오류가 발생했습니다: ${error.message}`, false);
        showNotification('이미지 분석에 실패했습니다.', 'error');
    } finally {
        isTyping = false;
        const sendBtn = document.getElementById('sendBtn');
        const chatInput = document.getElementById('chatInput');
        if (sendBtn && chatInput) {
            sendBtn.disabled = !chatInput.value.trim();
        }
    }
}

/* =====================================================
   RAG 모드 및 설정 메뉴 관리
   ===================================================== */

// RAG 모드 토글 함수
function toggleRagMode() {
    const toggleSwitch = document.getElementById('ragToggleSwitch');
    
    if (toggleSwitch) {
        // 체크박스 상태에 따라 RAG 모드 설정
        ragModeEnabled = toggleSwitch.checked;
    } else {
        // 체크박스가 없으면 토글
        ragModeEnabled = !ragModeEnabled;
    }
    
    // 업데이트
    updateChatInputPlaceholder();
    updateRagSwitchStyles();
    
    console.log('🔍 RAG 모드:', ragModeEnabled ? '활성화' : '비활성화');
    
    // 상태 표시 메시지
    import('./utils.js').then(({ showNotification }) => {
        showNotification(
            ragModeEnabled ? 'RAG 모드가 활성화되었습니다' : 'RAG 모드가 비활성화되었습니다',
            'info'
        );
    });
}

// RAG 스위치 스타일 업데이트
function updateRagSwitchStyles() {
    const toggleSwitch = document.getElementById('ragToggleSwitch');
    if (toggleSwitch) {
        toggleSwitch.checked = ragModeEnabled;
    }
}

// 채팅 입력창 플레이스홀더 업데이트
function updateChatInputPlaceholder() {
    const chatInput = document.getElementById('chatInput');
    if (chatInput) {
        chatInput.placeholder = ragModeEnabled 
            ? '전체 문서에 대해 질문해보세요...' 
            : '질문을 입력하세요...';
    }
}

// 설정 메뉴 토글 함수
function toggleSettings() {
    const settingsMenu = document.getElementById('settingsMenu');
    console.log('설정 메뉴 토글:', settingsMenu); // 디버깅
    
    if (settingsMenu) {
        const isVisible = !settingsMenu.classList.contains('hidden');
        
        console.log('현재 숨김 여부:', settingsMenu.classList.contains('hidden')); // 디버깅
        
        if (isVisible) {
            settingsMenu.classList.add('hidden');
            document.removeEventListener('click', closeSettingsOnOutsideClick);
            console.log('메뉴 숨김'); // 디버깅
        } else {
            settingsMenu.classList.remove('hidden');
            document.addEventListener('click', closeSettingsOnOutsideClick);
            console.log('메뉴 표시'); // 디버깅
        }
    } else {
        console.error('settingsMenu를 찾을 수 없습니다');
    }
}

// 외부 클릭 시 설정 메뉴 닫기
function closeSettingsOnOutsideClick(event) {
    const settingsMenu = document.getElementById('settingsMenu');
    const settingsBtn = document.getElementById('chatSettingsBtn');
    
    if (settingsMenu && settingsBtn) {
        if (!settingsMenu.contains(event.target) && !settingsBtn.contains(event.target)) {
            settingsMenu.classList.add('hidden');
            document.removeEventListener('click', closeSettingsOnOutsideClick);
            console.log('외부 클릭으로 메뉴 닫힘'); // 디버깅
        }
    }
}

// 초기화 시 RAG 모드 상태 동기화
function initializeRagMode() {
    updateChatInputPlaceholder();
    updateRagSwitchStyles();
}

// 페이지로 점프하는 함수
function jumpToPage(pageNumber) {
    if (window.pdfViewer && window.pdfViewer.goToPage) {
        window.pdfViewer.goToPage(pageNumber);
        showNotification(`페이지 ${pageNumber}로 이동했습니다.`, 'success');
    } else {
        console.warn('PDF 뷰어를 찾을 수 없습니다.');
    }
}

// 임베딩 모델 불일치 경고 표시
function showEmbeddingInconsistencyWarning(warningData) {
    console.warn('⚠️ 임베딩 모델 불일치 감지:', warningData);
    
    import('./utils.js').then(({ showNotification }) => {
        const fileCount = warningData.inconsistent_files?.length || 0;
        const currentModel = warningData.current_model || '알 수 없음';
        
        const message = `현재 설정된 임베딩 모델(${currentModel})과 다른 모델로 임베딩된 파일이 ${fileCount}개 있습니다.\n\nRAG 검색이 제대로 동작하지 않을 수 있습니다. 설정에서 임베딩 모델을 확인하거나 파일을 재임베딩해주세요.`;
        
        showNotification(message, 'warning', 8000); // 8초간 표시
        
        // 콘솔에 상세 정보 출력
        console.group('📊 임베딩 모델 불일치 상세 정보');
        console.log('현재 모델:', currentModel);
        console.log('불일치 파일 목록:', warningData.inconsistent_files);
        console.groupEnd();
        
        // 설정 메뉴 강조 효과 (선택적)
        highlightSettingsButton();
    }).catch(error => {
        console.error('알림 표시 실패:', error);
    });
}

// 설정 버튼 강조 효과
function highlightSettingsButton() {
    const settingsBtn = document.querySelector('.settings-btn');
    if (settingsBtn) {
        settingsBtn.style.animation = 'pulse 2s infinite';
        
        // 5초 후 애니메이션 제거
        setTimeout(() => {
            settingsBtn.style.animation = '';
        }, 5000);
    }
}

// 초기화 함수 - 페이지 로드 시 호출
function initializeChat() {
    initializeRagMode();
    console.log('💬 Chat 모듈 초기화 완료');
}

// 출처 패널 외부 클릭 이벤트 처리
document.addEventListener('click', function(event) {
    // 출처 버튼이나 패널 내부를 클릭한 경우가 아니라면 모든 패널 닫기
    if (!event.target.closest('.rag-sources-container')) {
        const chatContainer = document.getElementById('chatContainer');
        
        document.querySelectorAll('.rag-sources-panel.show').forEach(panel => {
            const button = panel.parentNode.querySelector('.rag-sources-toggle-btn');
            const arrow = button.querySelector('.rag-sources-arrow');
            panel.classList.remove('show');
            arrow.textContent = '▼';
            button.classList.remove('active');
            
            // 저장된 스크롤 위치로 즉시 복원
            if (chatContainer && button.dataset.savedScrollTop !== undefined) {
                console.log('외부클릭 스크롤 복원:', button.dataset.savedScrollTop);
                chatContainer.scrollTop = parseInt(button.dataset.savedScrollTop);
                delete button.dataset.savedScrollTop;
            }
        });
    }
});


// 전역 함수 등록
window.toggleRagMode = toggleRagMode;
window.toggleSettings = toggleSettings;
window.jumpToPage = jumpToPage;
// 레거시 지원을 위해 유지 (실제로는 새로운 시스템 사용)
window.toggleSources = toggleSources;
window.initializeChat = initializeChat;
