// knowledgeManager.js - 지식 관리 및 임베딩 관리 모듈

import { showNotification } from './utils.js';

class KnowledgeManager {
    constructor() {
        this.currentView = 'chat'; // 'chat' or 'knowledge'
        this.selectedItem = null;
        this.embeddingData = new Map(); // 파일별 임베딩 상태 캐시
        this.treeData = null; // 파일 트리 데이터 캐시
        this.init();
    }

    init() {
        this.setupEventListeners();
        this.loadEmbeddingData();
    }

    setupEventListeners() {
        // 페이지 전환 이벤트 리스너는 main에서 설정
    }

    // 지식 관리 페이지 전용 이벤트 리스너 설정
    setupKnowledgeEventListeners() {
        const container = document.getElementById('knowledgeContainer');
        if (!container) return;

        // 트리 노드 클릭 이벤트 (이벤트 위임)
        container.addEventListener('click', (e) => {
            const treeNode = e.target.closest('.tree-node');
            if (treeNode) {
                const type = treeNode.dataset.type;
                const id = treeNode.dataset.id;
                if (type && id) {
                    this.selectKnowledgeItem(treeNode, type, id);
                }
                return;
            }

            // 모델 선택 옵션 클릭
            const modelOption = e.target.closest('.model-option');
            if (modelOption) {
                this.selectEmbeddingModel(modelOption);
                return;
            }

            // 액션 버튼 클릭 (파일 액션)
            const actionBtn = e.target.closest('.action-btn[data-action]');
            if (actionBtn) {
                const action = actionBtn.dataset.action;
                const fileId = actionBtn.dataset.fileId;
                if (action && fileId) {
                    this.handleFileAction(action, fileId);
                }
                return;
            }

            // 폴더 액션 버튼 클릭
            const folderActionBtn = e.target.closest('.action-btn[data-folder-action]');
            if (folderActionBtn) {
                const action = folderActionBtn.dataset.folderAction;
                const folderId = folderActionBtn.dataset.folderId;
                if (action && folderId) {
                    this.handleFolderAction(action, folderId);
                }
                return;
            }

            // 모델 테스트 버튼 클릭
            const testBtn = e.target.closest('.test-model-btn[data-action]');
            if (testBtn) {
                const action = testBtn.dataset.action;
                if (action === 'test-ollama-model') {
                    this.testOllamaEmbeddingModel();
                }
                return;
            }
        });
    }

    // 지식 관리 페이지 HTML 생성
    createKnowledgeHTML() {
        return `
            <div class="knowledge-sidebar">
                <div class="sidebar-header">
                    <h2 class="sidebar-title">
                        📚 문서 트리
                    </h2>
                    <div class="embedding-stats" id="embeddingStats">
                        <div class="stat-item">
                            <div class="stat-dot completed"></div>
                            <span id="completedCount">0 완료</span>
                        </div>
                        <div class="stat-item">
                            <div class="stat-dot processing"></div>
                            <span id="processingCount">0 처리중</span>
                        </div>
                        <div class="stat-item">
                            <div class="stat-dot none"></div>
                            <span id="noneCount">0 대기</span>
                        </div>
                    </div>
                </div>

                <div class="folder-tree" id="knowledgeFolderTree">
                    <!-- 동적으로 생성됨 -->
                </div>
            </div>

            <div class="knowledge-main">
                <div class="main-header">
                    <h1 class="main-title">🧠 임베딩 관리</h1>
                    <p class="main-subtitle">선택된 항목의 임베딩 상태를 관리하고 설정을 조정하세요</p>
                </div>

                <div class="main-content">
                    <!-- 임베딩 설정 -->
                    <div class="embedding-settings">
                        <div class="settings-header">
                            ⚙️ 임베딩 설정
                        </div>
                        <div class="model-grid">
                            <div class="model-option selected" data-model="ollama">
                                <div class="model-radio"></div>
                                <div class="model-name">Ollama 임베딩</div>
                                <div class="model-desc">임베딩 전용 Ollama 모델 지정</div>
                                <span class="model-badge local">로컬</span>
                            </div>
                            
                            <div class="model-option" data-model="openai">
                                <div class="model-radio"></div>
                                <div class="model-name">OpenAI API</div>
                                <div class="model-desc">text-embedding-3-small</div>
                                <span class="model-badge premium">프리미엄</span>
                            </div>
                        </div>
                        
                        <!-- Ollama 임베딩 모델 설정 -->
                        <div class="ollama-embedding-settings" id="ollamaEmbeddingSettings">
                            <div class="setting-group">
                                <label for="ollamaEmbeddingModel" class="setting-label">
                                    🤖 Ollama 임베딩 모델
                                </label>
                                <div class="model-input-group">
                                    <input 
                                        type="text" 
                                        id="ollamaEmbeddingModel" 
                                        class="model-input"
                                        placeholder="예: nomic-embed-text, all-minilm"
                                        value="nomic-embed-text"
                                    >
                                    <button class="test-model-btn" data-action="test-ollama-model">
                                        🔍 테스트
                                    </button>
                                </div>
                                <div class="setting-help">
                                    임베딩 전용 모델을 지정하세요. 
                                    <a href="https://ollama.com/library" target="_blank">모델 목록 보기</a>
                                </div>
                            </div>
                        </div>
                        
                        <!-- OpenAI API 설정 -->
                        <div class="openai-embedding-settings" id="openaiEmbeddingSettings" style="display: none;">
                            <div class="setting-group">
                                <label for="openaiEmbeddingModel" class="setting-label">
                                    🚀 OpenAI 임베딩 모델
                                </label>
                                <select id="openaiEmbeddingModel" class="model-select">
                                    <option value="text-embedding-3-small">text-embedding-3-small (권장)</option>
                                    <option value="text-embedding-3-large">text-embedding-3-large (고성능)</option>
                                    <option value="text-embedding-ada-002">text-embedding-ada-002 (레거시)</option>
                                </select>
                                <div class="setting-help">
                                    API 키는 메인 설정에서 관리됩니다.
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 선택된 항목 상세 정보 -->
                    <div class="selected-item-details" id="knowledgeItemDetails">
                        <div class="empty-state">
                            <div class="empty-icon">🗂️</div>
                            <div class="empty-title">항목을 선택하세요</div>
                            <div class="empty-desc">왼쪽 트리에서 폴더나 파일을 선택하면 상세 정보가 표시됩니다</div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    // 지식 관리 페이지 표시
    async showKnowledgeView() {
        const container = document.getElementById('knowledgeContainer');
        if (!container) return;

        // HTML 생성
        container.innerHTML = this.createKnowledgeHTML();
        container.style.display = 'grid';

        // 스타일 로드 (CSS는 이미 HTML에서 로드됨)
        // await this.loadKnowledgeStyles();

        // 폴더 트리 데이터 로드 및 렌더링
        await this.loadFolderTreeWithEmbedding();

        // 통계 업데이트
        this.updateEmbeddingStats();
        
        // 이벤트 리스너 설정
        this.setupKnowledgeEventListeners();
    }

    // 지식 관리 페이지 숨기기
    hideKnowledgeView() {
        const container = document.getElementById('knowledgeContainer');
        if (container) {
            container.style.display = 'none';
        }
    }

    // CSS 스타일 동적 로드
    async loadKnowledgeStyles() {
        // CSS가 이미 로드되었는지 확인
        if (document.querySelector('link[href*="knowledge.css"]')) {
            return;
        }

        return new Promise((resolve, reject) => {
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = '/static/css/knowledge.css';
            link.onload = resolve;
            link.onerror = reject;
            document.head.appendChild(link);
        });
    }

    // 폴더 트리 데이터 로드 (임베딩 상태 포함)
    async loadFolderTreeWithEmbedding() {
        try {
            // 기존 folderTreeManager의 데이터 활용
            if (window.folderTreeManager && window.folderTreeManager.getCurrentTree) {
                const treeData = window.folderTreeManager.getCurrentTree();
                await this.renderKnowledgeTree(treeData);
            } else {
                // 폴더 트리 매니저가 없으면 API 직접 호출
                await this.loadFolderTreeFromAPI();
            }
        } catch (error) {
            console.error('폴더 트리 로드 실패:', error);
            showNotification('폴더 트리를 불러오는데 실패했습니다.', 'error');
        }
    }

    // API에서 폴더 트리 직접 로드
    async loadFolderTreeFromAPI() {
        const token = localStorage.getItem('token');
        if (!token) return;

        const response = await fetch('/api/folders', {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        if (response.ok) {
            const data = await response.json();
            await this.renderKnowledgeTree(data.data || []);
        }
    }

    // 임베딩 상태와 함께 트리 렌더링
    async renderKnowledgeTree(treeData) {
        const container = document.getElementById('knowledgeFolderTree');
        if (!container) return;

        // 임베딩 상태 정보 가져오기
        await this.loadEmbeddingStates(treeData);

        const html = this.generateTreeHTML(treeData);
        container.innerHTML = html;
    }

    // 트리 HTML 생성 (임베딩 상태 포함)
    generateTreeHTML(items, level = 0) {
        let html = '';
        
        items.forEach(item => {
            const embeddingStatus = this.getEmbeddingStatus(item);
            const indent = level * 20;
            
            if (item.type === 'folder') {
                const folderStats = this.getFolderEmbeddingStats(item);
                html += `
                    <div class="tree-item" style="margin-left: ${indent}px;">
                        <div class="tree-node folder" data-type="folder" data-id="${item.id}">
                            <div class="node-icon">📁</div>
                            <div class="node-content">
                                <span class="node-name">${item.name}</span>
                                <span class="folder-summary">(${folderStats.completed}/${folderStats.total})</span>
                                <div class="embedding-indicator ${folderStats.status}"></div>
                            </div>
                        </div>
                    </div>
                `;
                
                // 하위 항목들 (별도의 아이템으로 생성)
                if (item.children && item.children.length > 0) {
                    html += this.generateTreeHTML(item.children, level + 1);
                }
                if (item.files && item.files.length > 0) {
                    html += this.generateTreeHTML(item.files, level + 1);
                }
            } else {
                // 파일
                html += `
                    <div class="tree-item" style="margin-left: ${indent}px;">
                        <div class="tree-node file" data-type="file" data-id="${item.id}">
                            <div class="node-icon">📄</div>
                            <div class="node-content">
                                <span class="node-name">${item.filename}</span>
                                <div class="embedding-indicator ${embeddingStatus}"></div>
                            </div>
                        </div>
                    </div>
                `;
            }
        });
        
        return html;
    }

    // 파일의 임베딩 상태 가져오기
    getEmbeddingStatus(item) {
        if (item.type !== 'file') return 'none';
        
        const embeddingData = this.embeddingData.get(item.id);
        if (!embeddingData) return 'none';
        
        return embeddingData.status || 'none';
    }

    // 폴더의 임베딩 통계
    getFolderEmbeddingStats(folder) {
        let total = 0;
        let completed = 0;
        let processing = 0;
        
        const countFiles = (items) => {
            items.forEach(item => {
                if (item.type === 'file') {
                    total++;
                    const status = this.getEmbeddingStatus(item);
                    if (status === 'completed') completed++;
                    else if (status === 'processing') processing++;
                } else if (item.children) {
                    countFiles(item.children);
                }
                if (item.files) {
                    countFiles(item.files);
                }
            });
        };
        
        if (folder.children) countFiles(folder.children);
        if (folder.files) countFiles(folder.files);
        
        return {
            total,
            completed,
            processing,
            status: processing > 0 ? 'processing' : completed === total ? 'completed' : 'none'
        };
    }

    // 임베딩 상태 데이터 로드
    async loadEmbeddingStates(treeData) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch('/api/knowledge/embeddings', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const data = await response.json();
                // 파일별 임베딩 상태를 Map에 저장
                data.embeddings?.forEach(embedding => {
                    this.embeddingData.set(embedding.file_id, embedding);
                });
            }
        } catch (error) {
            console.error('임베딩 상태 로드 실패:', error);
        }
    }

    // 임베딩 데이터 로드
    async loadEmbeddingData() {
        // 먼저 설정을 확인하고 설정이 있을 때만 다른 데이터 로드
        const settingsLoaded = await this.loadEmbeddingSettings();
        if (settingsLoaded) {
            await this.loadFolderTreeWithEmbedding();
        } else {
            // 설정이 없으면 폴더 트리만 로드 (임베딩 상태 없이)
            await this.loadFolderTreeOnly();
        }
    }

    // 폴더 트리와 임베딩 상태 동시 로드
    async loadFolderTreeWithEmbedding() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 파일 트리 데이터 로드
            const treeResponse = await fetch('/api/folders', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (treeResponse.ok) {
                const response = await treeResponse.json();
                console.log('API Response:', response); // 디버깅용
                const treeData = response.data || response; // data 속성이 있으면 사용, 없으면 전체 응답 사용
                console.log('Tree Data:', treeData); // 디버깅용
                
                // 임베딩 상태 로드
                await this.loadEmbeddingStates(treeData);
                
                // 폴더 트리 생성
                this.renderFolderTree(treeData);
            }
        } catch (error) {
            console.error('폴더 트리 로드 실패:', error);
        }
    }

    // 폴더 트리만 로드 (임베딩 상태 없이)
    async loadFolderTreeOnly() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 파일 트리 데이터 로드
            const treeResponse = await fetch('/api/folders', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (treeResponse.ok) {
                const response = await treeResponse.json();
                console.log('API Response (no embedding):', response); // 디버깅용
                const treeData = response.data || response;
                console.log('Tree Data (no embedding):', treeData); // 디버깅용
                
                // 폴더 트리 생성 (임베딩 상태 없이)
                this.renderFolderTree(treeData);
                
                // 설정 안내 메시지 표시
                this.showConfigurationPrompt();
            }
        } catch (error) {
            console.error('폴더 트리 로드 실패:', error);
        }
    }

    // 설정 안내 메시지 표시
    showConfigurationPrompt() {
        const detailsElement = document.getElementById('knowledgeItemDetails');
        if (detailsElement) {
            detailsElement.innerHTML = `
                <div class="config-prompt">
                    <div class="config-icon">⚙️</div>
                    <div class="config-title">임베딩 설정이 필요합니다</div>
                    <div class="config-desc">
                        RAG 기능을 사용하려면 먼저 임베딩 모델을 설정해야 합니다.<br>
                        왼쪽에서 Ollama 또는 OpenAI 모델을 선택하고 설정을 저장해주세요.
                    </div>
                    <div class="config-actions">
                        <button class="action-btn primary" onclick="document.querySelector('.model-option[data-model=ollama]').click()">
                            🤖 Ollama 설정하기
                        </button>
                        <button class="action-btn" onclick="document.querySelector('.model-option[data-model=openai]').click()">
                            🚀 OpenAI 설정하기
                        </button>
                    </div>
                </div>
            `;
        }
    }

    // 폴더 트리 렌더링
    renderFolderTree(treeData) {
        const container = document.getElementById('knowledgeFolderTree');
        if (!container || !treeData) return;

        // 트리 데이터 캐시
        this.treeData = treeData;

        const html = this.generateTreeHTML(treeData, 0);
        container.innerHTML = html || '<div class="empty-state">파일이 없습니다.</div>';
        
        // 이벤트 리스너 추가
        this.addTreeEventListeners(container);
    }

    // 트리 이벤트 리스너 추가
    addTreeEventListeners(container) {
        // 기존 이벤트 리스너 제거
        container.removeEventListener('click', this.handleTreeClick);
        
        // 새 이벤트 리스너 추가
        this.handleTreeClick = (event) => {
            const treeNode = event.target.closest('.tree-node');
            if (!treeNode) return;
            
            const type = treeNode.dataset.type;
            const id = treeNode.dataset.id;
            
            if (type && id) {
                this.selectKnowledgeItem(treeNode, type, id);
            }
        };
        
        container.addEventListener('click', this.handleTreeClick);
    }

    // 트리 HTML 생성
    generateTreeHTML(data, level = 0) {
        console.log(`generateTreeHTML called with data:`, data, `level: ${level}`); // 디버깅용
        
        // data가 배열인 경우 (루트 레벨)
        if (Array.isArray(data)) {
            console.log(`Processing array with ${data.length} items`); // 디버깅용
            let html = '';
            for (const item of data) {
                html += this.generateTreeHTML(item, level);
            }
            return html;
        }
        
        // data가 객체인 경우 (개별 폴더나 파일)
        if (!data) {
            console.log('No data'); // 디버깅용
            return '';
        }
        
        let html = '';
        
        // 폴더인 경우
        if (data.type === 'folder') {
            console.log(`Processing folder: ${data.name}`); // 디버깅용
            const folderStats = this.getFolderEmbeddingStats(data);
            html += `
                <div class="tree-item">
                    <div class="tree-node folder" 
                         data-type="folder" 
                         data-id="${data.name}"
                         style="margin-left: ${level * 20}px;">
                        <div class="node-icon">📁</div>
                        <div class="node-content">
                            <div class="node-name">${data.name}</div>
                            <div class="folder-summary">${folderStats.completed}/${folderStats.total}</div>
                        </div>
                    </div>
            `;
            
            // 하위 폴더들 (children) 렌더링
            if (data.children && data.children.length > 0) {
                for (const child of data.children) {
                    html += this.generateTreeHTML(child, level + 1);
                }
            }
            
            // 폴더 내 파일들 렌더링
            if (data.files && data.files.length > 0) {
                for (const file of data.files) {
                    html += this.generateTreeHTML({ ...file, type: 'file' }, level + 1);
                }
            }
            
            html += '</div>';
        }
        // 파일인 경우
        else if (data.type === 'file') {
            console.log('Processing file:', data); // 디버깅용
            const embeddingData = this.embeddingData.get(data.id);
            const status = embeddingData?.status || 'none';
            const displayName = data.filename || data.name || '이름 없는 파일';
            
            html += `
                <div class="tree-item">
                    <div class="tree-node file" 
                         data-type="file" 
                         data-id="${data.id}"
                         style="margin-left: ${level * 20}px;">
                        <div class="node-icon">📄</div>
                        <div class="node-content">
                            <div class="node-name" title="${displayName}">${displayName}</div>
                            <div class="embedding-indicator ${status}"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        
        return html;
    }

    // 폴더의 임베딩 통계 계산
    getFolderEmbeddingStats(folder) {
        let total = 0;
        let completed = 0;
        
        // 현재 폴더의 파일들 확인
        if (folder.files && folder.files.length > 0) {
            total += folder.files.length;
            folder.files.forEach(file => {
                const embeddingData = this.embeddingData.get(file.id);
                if (embeddingData?.status === 'completed') {
                    completed++;
                }
            });
        }
        
        // 하위 폴더들 재귀적으로 확인 (children 속성 사용)
        if (folder.children && folder.children.length > 0) {
            folder.children.forEach(subFolder => {
                const subStats = this.getFolderEmbeddingStats(subFolder);
                total += subStats.total;
                completed += subStats.completed;
            });
        }
        
        return { total, completed };
    }

    // 임베딩 설정 로드
    async loadEmbeddingSettings() {
        try {
            const token = localStorage.getItem('token');
            if (!token) return false;

            const response = await fetch('/api/knowledge/settings', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const settings = await response.json();
                if (settings && settings.configured) {
                    this.applyEmbeddingSettings(settings);
                    return true; // 설정이 있음
                }
            }
            return false; // 설정이 없음
        } catch (error) {
            console.error('임베딩 설정 로드 실패:', error);
            return false;
        }
    }

    // 임베딩 설정 적용
    applyEmbeddingSettings(settings) {
        // 모델 선택 적용
        const modelOptions = document.querySelectorAll('.model-option');
        modelOptions.forEach(option => {
            option.classList.remove('selected');
            if (option.dataset.model === settings.provider) {
                option.classList.add('selected');
            }
        });

        // 설정 영역 표시
        this.toggleModelSettings(settings.provider);

        // 모델명 입력
        if (settings.provider === 'ollama') {
            const input = document.getElementById('ollamaEmbeddingModel');
            if (input) input.value = settings.model_name || 'nomic-embed-text';
        } else if (settings.provider === 'openai') {
            const select = document.getElementById('openaiEmbeddingModel');
            if (select) select.value = settings.model_name || 'text-embedding-3-small';
        }
    }

    // 항목 선택 처리
    selectKnowledgeItem(element, type, id) {
        // 모든 트리 노드에서 selected 클래스 제거
        document.querySelectorAll('.tree-node').forEach(node => {
            node.classList.remove('selected');
        });
        
        // 선택된 노드에 selected 클래스 추가
        element.classList.add('selected');
        
        // 상세 정보 업데이트
        this.updateItemDetails(type, id);
    }

    // 상세 정보 업데이트
    updateItemDetails(type, id) {
        const detailsElement = document.getElementById('knowledgeItemDetails');
        if (!detailsElement) return;

        if (type === 'file') {
            this.updateFileDetails(id, detailsElement);
        } else if (type === 'folder') {
            this.updateFolderDetails(id, detailsElement);
        }
    }

    // 파일 상세 정보 업데이트
    updateFileDetails(fileId, container) {
        const embeddingData = this.embeddingData.get(fileId);
        const status = embeddingData?.status || 'none';
        
        const statusConfig = {
            completed: {
                text: '✅ 임베딩 완료',
                class: 'completed',
                actions: [
                    { text: '💬 채팅에서 사용', class: 'primary', action: 'use-in-chat' },
                    { text: '🔄 재생성', class: '', action: 'regenerate' },
                    { text: '🗑️ 삭제', class: 'danger', action: 'delete' }
                ]
            },
            processing: {
                text: '🔄 처리 중',
                class: 'processing',
                actions: [
                    { text: '❌ 취소', class: 'danger', action: 'cancel' }
                ]
            },
            failed: {
                text: '❌ 임베딩 실패',
                class: 'failed',
                actions: [
                    { text: '🔄 재시도', class: 'primary', action: 'regenerate' },
                    { text: '🗑️ 삭제', class: 'danger', action: 'delete' }
                ]
            },
            cancelled: {
                text: '⏹️ 취소됨',
                class: 'cancelled',
                actions: [
                    { text: '▶️ 임베딩 생성', class: 'primary', action: 'create-embedding' },
                    { text: '🗑️ 삭제', class: 'danger', action: 'delete' }
                ]
            },
            none: {
                text: '⚪ 임베딩 없음',
                class: 'none',
                actions: [
                    { text: '▶️ 임베딩 생성', class: 'primary', action: 'create-embedding' }
                ]
            }
        };

        // 안전한 기본값 설정
        const config = statusConfig[status] || statusConfig.none;
        const progressHTML = status === 'processing' ? `
            <div class="progress-section">
                <div class="progress-bar">
                    <div class="progress-fill" style="width: ${embeddingData?.progress || 0}%;"></div>
                </div>
                <div class="progress-text">
                    임베딩 생성 중... ${embeddingData?.progress || 0}% 완료
                </div>
            </div>
        ` : '';

        container.innerHTML = `
            <div class="detail-header">
                <div class="detail-title">
                    📄 ${embeddingData?.filename || '파일명'}
                </div>
                <div class="status-badge ${config.class}">
                    ${config.text}
                </div>
            </div>

            <div class="detail-meta">
                <div class="meta-item">
                    <div class="meta-label">임베딩 모델</div>
                    <div class="meta-value">${embeddingData?.model_name || 'N/A'}</div>
                </div>
                <div class="meta-item">
                    <div class="meta-label">생성 날짜</div>
                    <div class="meta-value">${this.formatDate(embeddingData?.created_at)}</div>
                </div>
                ${embeddingData?.total_chunks ? `
                <div class="meta-item">
                    <div class="meta-label">청크 수</div>
                    <div class="meta-value">${embeddingData.total_chunks}개</div>
                </div>` : ''}
            </div>

            ${progressHTML}

            <div class="action-buttons">
                ${config.actions.map(action => 
                    `<button class="action-btn ${action.class}" data-action="${action.action}" data-file-id="${fileId}">${action.text}</button>`
                ).join('')}
            </div>
        `;

        // 액션 버튼 이벤트 리스너 추가
        container.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const action = btn.dataset.action;
                const fileId = btn.dataset.fileId;
                
                if (action && fileId) {
                    await this.handleFileAction(action, fileId);
                }
            });
        });
    }

    // 폴더 상세 정보 업데이트
    updateFolderDetails(folderId, container) {
        // 폴더 상세 정보 구현
        container.innerHTML = `
            <div class="detail-header">
                <div class="detail-title">
                    📁 폴더 정보
                </div>
            </div>
            <div class="action-buttons">
                <button class="action-btn primary" data-folder-action="embed-all" data-folder-id="${folderId}">🚀 폴더 전체 임베딩</button>
                <button class="action-btn" data-folder-action="retry-failed" data-folder-id="${folderId}">🔄 실패 항목 재시도</button>
                <button class="action-btn" data-folder-action="view-report" data-folder-id="${folderId}">📊 상세 리포트</button>
            </div>
        `;

        // 폴더 액션 버튼 이벤트 리스너 추가
        container.querySelectorAll('.action-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const action = btn.dataset.folderAction;
                const folderId = btn.dataset.folderId;
                
                if (action && folderId) {
                    await this.handleFolderAction(action, folderId);
                }
            });
        });
    }

    // 파일 액션 처리
    async handleFileAction(action, fileId) {
        switch (action) {
            case 'use-in-chat':
                // 채팅 페이지로 전환하고 해당 파일 선택
                this.switchToChatWithFile(fileId);
                break;
            case 'create-embedding':
                await this.createEmbedding(fileId);
                break;
            case 'regenerate':
                await this.regenerateEmbedding(fileId);
                break;
            case 'cancel':
                await this.cancelEmbedding(fileId);
                break;
            case 'delete':
                await this.deleteEmbedding(fileId);
                break;
            // 다른 액션들...
        }
    }

    // 폴더 액션 처리
    async handleFolderAction(action, folderId) {
        switch (action) {
            case 'embed-all':
                await this.embedAllInFolder(folderId);
                break;
            // 다른 액션들...
        }
    }

    // 채팅 페이지로 전환 (특정 파일 선택)
    switchToChatWithFile(fileId) {
        // 메인 앱에서 페이지 전환 처리
        if (window.switchView) {
            window.switchView('chat');
            // 파일 선택 로직 (fileManager와 연동)
            setTimeout(() => {
                if (window.fileManager && window.fileManager.selectFile) {
                    window.fileManager.selectFile(fileId);
                }
            }, 100);
        }
    }

    // 임베딩 모델 선택
    selectEmbeddingModel(element) {
        document.querySelectorAll('.model-option').forEach(option => {
            option.classList.remove('selected');
        });
        element.classList.add('selected');
        
        const model = element.dataset.model;
        
        // 설정 영역 표시/숨김
        this.toggleModelSettings(model);
        
        this.saveEmbeddingSettings({ model });
    }

    // 모델별 설정 영역 토글
    toggleModelSettings(selectedModel) {
        const ollamaSettings = document.getElementById('ollamaEmbeddingSettings');
        const openaiSettings = document.getElementById('openaiEmbeddingSettings');
        
        if (ollamaSettings && openaiSettings) {
            if (selectedModel === 'ollama') {
                ollamaSettings.style.display = 'block';
                openaiSettings.style.display = 'none';
            } else if (selectedModel === 'openai') {
                ollamaSettings.style.display = 'none';
                openaiSettings.style.display = 'block';
            }
        }
    }

    // Ollama 임베딩 모델 테스트
    async testOllamaEmbeddingModel() {
        const modelInput = document.getElementById('ollamaEmbeddingModel');
        const testBtn = document.querySelector('.test-model-btn[data-action="test-ollama-model"]');
        
        if (!modelInput || !testBtn) return;
        
        const modelName = modelInput.value.trim();
        if (!modelName) {
            showNotification('모델명을 입력해주세요.', 'warning');
            return;
        }

        // 버튼 상태 변경
        const originalText = testBtn.innerHTML;
        testBtn.innerHTML = '⏳ 테스트 중...';
        testBtn.disabled = true;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/knowledge/test-embedding-model', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provider: 'ollama',
                    model: modelName
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                showNotification(`✅ 모델 테스트 성공: ${modelName}`, 'success');
                testBtn.innerHTML = '✅ 성공';
                setTimeout(() => {
                    testBtn.innerHTML = originalText;
                }, 2000);
            } else {
                showNotification(`❌ 모델 테스트 실패: ${result.detail || '알 수 없는 오류'}`, 'error');
                testBtn.innerHTML = '❌ 실패';
                setTimeout(() => {
                    testBtn.innerHTML = originalText;
                }, 2000);
            }
        } catch (error) {
            console.error('모델 테스트 실패:', error);
            showNotification('모델 테스트 중 오류가 발생했습니다.', 'error');
            testBtn.innerHTML = '❌ 오류';
            setTimeout(() => {
                testBtn.innerHTML = originalText;
            }, 2000);
        } finally {
            testBtn.disabled = false;
        }
    }

    // OpenAI 임베딩 모델 테스트
    async testOpenaiEmbeddingModel() {
        const modelSelect = document.getElementById('openaiEmbeddingModel');
        const testBtn = document.querySelector('.test-model-btn[data-action="test-openai-model"]');
        
        if (!modelSelect || !testBtn) return;
        
        const modelName = modelSelect.value;
        if (!modelName) {
            showNotification('모델을 선택해주세요.', 'warning');
            return;
        }

        // 버튼 상태 변경
        const originalText = testBtn.innerHTML;
        testBtn.innerHTML = '⏳ 테스트 중...';
        testBtn.disabled = true;

        try {
            const token = localStorage.getItem('token');
            const response = await fetch('/api/knowledge/test-embedding-model', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    provider: 'openai',
                    model: modelName
                })
            });

            const result = await response.json();
            
            if (response.ok) {
                showNotification(`✅ 모델 테스트 성공: ${modelName}`, 'success');
                testBtn.innerHTML = '✅ 성공';
                setTimeout(() => {
                    testBtn.innerHTML = originalText;
                }, 2000);
            } else {
                showNotification(`❌ 모델 테스트 실패: ${result.detail || '알 수 없는 오류'}`, 'error');
                testBtn.innerHTML = '❌ 실패';
                setTimeout(() => {
                    testBtn.innerHTML = originalText;
                }, 2000);
            }
        } catch (error) {
            console.error('모델 테스트 실패:', error);
            showNotification('모델 테스트 중 오류가 발생했습니다.', 'error');
            testBtn.innerHTML = '❌ 오류';
            setTimeout(() => {
                testBtn.innerHTML = originalText;
            }, 2000);
        } finally {
            testBtn.disabled = false;
        }
    }

    // 임베딩 설정 저장
    async saveEmbeddingSettings(settings) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 추가 설정 정보 수집
            if (settings.model === 'ollama') {
                const modelInput = document.getElementById('ollamaEmbeddingModel');
                if (modelInput) {
                    settings.ollama_model = modelInput.value.trim();
                }
            } else if (settings.model === 'openai') {
                const modelSelect = document.getElementById('openaiEmbeddingModel');
                if (modelSelect) {
                    settings.openai_model = modelSelect.value;
                }
            }

            const response = await fetch('/api/knowledge/settings', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(settings)
            });

            if (response.ok) {
                showNotification('임베딩 설정이 저장되었습니다.', 'success');
                // 설정 변경으로 인한 UI 갱신
                await this.loadEmbeddingSettings();
                this.refreshUI();
            }
        } catch (error) {
            console.error('설정 저장 실패:', error);
            showNotification('설정 저장에 실패했습니다.', 'error');
        }
    }

    // 임베딩 생성
    async createEmbedding(fileId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            // 파일 정보 찾기
            const fileInfo = this.findFileInTree(fileId);
            if (!fileInfo) {
                showNotification('파일 정보를 찾을 수 없습니다.', 'error');
                return;
            }

            // 임베딩 설정이 있는지 확인
            const settings = await this.loadEmbeddingSettings();
            if (!settings) {
                showNotification('먼저 임베딩 모델을 설정해주세요.', 'warning');
                return;
            }

            const response = await fetch(`/api/knowledge/embeddings/${fileId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: fileInfo.name || fileInfo.filename
                })
            });

            if (response.ok) {
                showNotification('임베딩 생성을 시작했습니다.', 'success');
                // 즉시 상태 업데이트
                this.embeddingData.set(fileId, {
                    file_id: fileId,
                    filename: fileInfo.name || fileInfo.filename,
                    status: 'processing',
                    total_chunks: 0,
                    completed_chunks: 0,
                    progress: 0,
                    created_at: new Date()
                });
                this.refreshUI();
            } else {
                const error = await response.json();
                let errorMsg = error.detail;
                if (errorMsg.includes('처리된 PDF 파일을 찾을 수 없습니다')) {
                    errorMsg = '이 파일은 아직 PDF 처리가 완료되지 않았습니다.\n먼저 채팅 섹션에서 파일을 업로드하고 처리를 완료해주세요.';
                }
                showNotification(`임베딩 생성 실패:\n${errorMsg}`, 'error');
            }
        } catch (error) {
            console.error('임베딩 생성 실패:', error);
            showNotification('임베딩 생성에 실패했습니다.', 'error');
        }
    }

    // 임베딩 재생성
    async regenerateEmbedding(fileId) {
        const confirm = window.confirm('기존 임베딩을 삭제하고 다시 생성하시겠습니까?');
        if (!confirm) return;

        await this.deleteEmbedding(fileId);
        setTimeout(() => {
            this.createEmbedding(fileId);
        }, 1000);
    }

    // 임베딩 삭제
    async deleteEmbedding(fileId) {
        const confirm = window.confirm('임베딩을 삭제하시겠습니까?');
        if (!confirm) return;

        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`/api/knowledge/embeddings/${fileId}`, {
                method: 'DELETE',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showNotification('임베딩이 삭제되었습니다.', 'success');
                // 모니터링 중지
                this.stopProgressMonitoring(fileId);
                // 즉시 상태 업데이트
                this.embeddingData.delete(fileId);
                this.refreshUI();
            } else {
                const error = await response.json();
                showNotification(`임베딩 삭제 실패: ${error.detail}`, 'error');
            }
        } catch (error) {
            console.error('임베딩 삭제 실패:', error);
            showNotification('임베딩 삭제에 실패했습니다.', 'error');
        }
    }

    // 임베딩 취소
    async cancelEmbedding(fileId) {
        const confirm = window.confirm('임베딩 처리를 취소하시겠습니까?');
        if (!confirm) return;

        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`/api/knowledge/embeddings/${fileId}/cancel`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                showNotification('임베딩 처리가 취소되었습니다.', 'success');
                // 모니터링 중지
                this.stopProgressMonitoring(fileId);
                // 즉시 상태 업데이트
                const embeddingData = this.embeddingData.get(fileId);
                if (embeddingData) {
                    embeddingData.status = 'cancelled';
                    embeddingData.error_message = '사용자에 의해 취소됨';
                }
                this.refreshUI();
            } else {
                const error = await response.json();
                showNotification(`임베딩 취소 실패: ${error.detail}`, 'error');
            }
        } catch (error) {
            console.error('임베딩 취소 실패:', error);
            showNotification('임베딩 취소에 실패했습니다.', 'error');
        }
    }

    // 임베딩 생성
    async createEmbedding(fileId) {
        try {
            const fileInfo = this.findFileInTree(fileId);
            if (!fileInfo) {
                showNotification('파일 정보를 찾을 수 없습니다.', 'error');
                return;
            }

            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`/api/knowledge/embeddings/${fileId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    filename: fileInfo.filename || fileInfo.name
                })
            });

            if (response.ok) {
                showNotification('임베딩 생성이 시작되었습니다.', 'success');
                
                // 서버에서 최신 상태 가져오기
                setTimeout(() => {
                    this.refreshFileStatus(fileId);
                }, 1000);
                
                // 처리 중인 파일의 진행률 모니터링 시작
                this.startProgressMonitoring(fileId);
            } else {
                const error = await response.json();
                let errorMsg = error.detail;
                if (errorMsg.includes('처리된 PDF 파일을 찾을 수 없습니다')) {
                    errorMsg = '이 파일은 아직 PDF 처리가 완료되지 않았습니다.\n먼저 채팅 섹션에서 파일을 업로드하고 처리를 완료해주세요.';
                }
                showNotification(`임베딩 생성 실패:\n${errorMsg}`, 'error');
            }
        } catch (error) {
            console.error('임베딩 생성 실패:', error);
            showNotification('임베딩 생성에 실패했습니다.', 'error');
        }
    }

    // 임베딩 재생성
    async regenerateEmbedding(fileId) {
        const confirm = window.confirm('기존 임베딩을 삭제하고 다시 생성하시겠습니까?');
        if (!confirm) return;

        await this.deleteEmbedding(fileId);
        setTimeout(() => {
            this.createEmbedding(fileId);
        }, 1000);
    }

    // 파일 트리에서 파일 찾기
    findFileInTree(fileId) {
        let result = null;
        
        const searchInData = (items) => {
            if (!items) return;
            
            // 배열인 경우
            if (Array.isArray(items)) {
                for (const item of items) {
                    // 파일인 경우 직접 확인
                    if (item.type === 'file' && item.id === fileId) {
                        result = item;
                        return;
                    }
                    // 폴더인 경우 재귀 검색
                    else if (item.type === 'folder') {
                        // 폴더 내 파일들 확인
                        if (item.files && Array.isArray(item.files)) {
                            for (const file of item.files) {
                                if (file.id === fileId) {
                                    result = { ...file, filename: file.filename || file.name };
                                    return;
                                }
                            }
                        }
                        // 하위 폴더들 확인
                        if (item.children && Array.isArray(item.children)) {
                            searchInData(item.children);
                        }
                    }
                    if (result) return;
                }
            }
        };
        
        if (this.treeData) {
            searchInData(this.treeData);
        }
        
        return result;
    }

    // UI 전체 새로고침
    refreshUI() {
        // 폴더 트리 다시 렌더링
        this.renderFolderTree(this.treeData);
        
        // 통계 업데이트
        this.updateEmbeddingStats();
        
        // 선택된 항목이 있으면 상세 정보도 업데이트
        const selectedNode = document.querySelector('.tree-node.selected');
        if (selectedNode) {
            const isFile = selectedNode.classList.contains('file');
            const fileId = selectedNode.onclick?.toString().match(/'([^']+)'/)?.[1];
            if (isFile && fileId) {
                this.updateItemDetails('file', fileId);
            }
        }
    }

    // 폴더의 모든 파일 임베딩
    async embedAllInFolder(folderId) {
        const confirm = window.confirm('폴더 내 모든 파일의 임베딩을 생성하시겠습니까?');
        if (!confirm) return;

        showNotification('폴더 임베딩을 시작합니다...', 'info');
        // 구현 필요
    }

    // 임베딩 상태 갱신
    async refreshEmbeddingStatus() {
        await this.loadFolderTreeWithEmbedding();
        this.updateEmbeddingStats();
    }

    // 통계 업데이트
    updateEmbeddingStats() {
        let completed = 0;
        let processing = 0;
        let none = 0;

        this.embeddingData.forEach(data => {
            switch (data.status) {
                case 'completed': completed++; break;
                case 'processing': processing++; break;
                default: none++; break;
            }
        });

        const completedElement = document.getElementById('completedCount');
        const processingElement = document.getElementById('processingCount');
        const noneElement = document.getElementById('noneCount');
        
        if (completedElement) completedElement.textContent = `${completed} 완료`;
        if (processingElement) processingElement.textContent = `${processing} 처리중`;
        if (noneElement) noneElement.textContent = `${none} 대기`;
    }

    // 폴더의 모든 파일 임베딩
    async embedAllInFolder(folderId) {
        const confirm = window.confirm('폴더 내 모든 파일의 임베딩을 생성하시겠습니까?');
        if (!confirm) return;

        showNotification('폴더 임베딩을 시작합니다...', 'info');
        
        // 폴더의 모든 파일 찾기
        const folderFiles = this.findFilesInFolder(folderId);
        if (folderFiles.length === 0) {
            showNotification('폴더에 파일이 없습니다.', 'warning');
            return;
        }

        // 각 파일에 대해 임베딩 생성
        for (const file of folderFiles) {
            try {
                await this.createEmbedding(file.id);
                // 각 파일 처리 후 잠시 대기
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error) {
                console.error(`파일 ${file.filename} 임베딩 실패:`, error);
            }
        }
        
        showNotification(`${folderFiles.length}개 파일의 임베딩 생성을 시작했습니다.`, 'success');
        // 전체 상태 갱신
        this.refreshUI();
    }

    // 폴더의 모든 파일 찾기
    findFilesInFolder(folderId) {
        const files = [];
        
        const searchInData = (items) => {
            if (!items) return;
            
            if (Array.isArray(items)) {
                for (const item of items) {
                    if (item.type === 'folder' && item.name === folderId) {
                        // 해당 폴더 찾음 - 내부 파일들 수집
                        if (item.files && Array.isArray(item.files)) {
                            item.files.forEach(file => {
                                files.push({
                                    id: file.id,
                                    filename: file.filename || file.name
                                });
                            });
                        }
                        // 하위 폴더도 재귀적으로 검색
                        if (item.children && Array.isArray(item.children)) {
                            item.children.forEach(subFolder => {
                                searchInData([subFolder]);
                            });
                        }
                    } else if (item.type === 'folder' && item.children) {
                        // 다른 폴더의 하위 폴더들 검색
                        searchInData(item.children);
                    }
                }
            }
        };
        
        if (this.treeData) {
            searchInData(this.treeData);
        }
        
        return files;
    }

    // 특정 파일의 최신 상태 확인
    async refreshFileStatus(fileId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`/api/knowledge/embeddings/${fileId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const embedding = await response.json();
                if (embedding) {
                    this.embeddingData.set(fileId, {
                        ...embedding,
                        created_at: new Date(embedding.created_at),
                        updated_at: new Date(embedding.updated_at)
                    });
                } else {
                    // 임베딩이 삭제된 경우
                    this.embeddingData.delete(fileId);
                }
                this.refreshUI();
            }
        } catch (error) {
            console.error('파일 상태 확인 실패:', error);
        }
    }

    // 특정 파일의 최신 상태 확인
    async refreshFileStatus(fileId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`/api/knowledge/embeddings/${fileId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const embedding = await response.json();
                if (embedding) {
                    this.embeddingData.set(fileId, {
                        ...embedding,
                        created_at: new Date(embedding.created_at),
                        updated_at: new Date(embedding.updated_at)
                    });
                } else {
                    // 임베딩이 삭제된 경우
                    this.embeddingData.delete(fileId);
                }
                this.refreshUI();
            }
        } catch (error) {
            console.error('파일 상태 확인 실패:', error);
        }
    }

    // 진행률 모니터링 시작
    startProgressMonitoring(fileId) {
        // 기존 모니터링이 있으면 정리
        if (this.progressTimers && this.progressTimers.has(fileId)) {
            clearInterval(this.progressTimers.get(fileId));
        }
        
        if (!this.progressTimers) {
            this.progressTimers = new Map();
        }

        // 3초마다 진행률 확인
        const timer = setInterval(async () => {
            await this.checkFileProgress(fileId);
        }, 3000);

        this.progressTimers.set(fileId, timer);
    }

    // 진행률 모니터링 중지
    stopProgressMonitoring(fileId) {
        if (this.progressTimers && this.progressTimers.has(fileId)) {
            clearInterval(this.progressTimers.get(fileId));
            this.progressTimers.delete(fileId);
        }
    }

    // 파일 진행률 확인
    async checkFileProgress(fileId) {
        try {
            const token = localStorage.getItem('token');
            if (!token) return;

            const response = await fetch(`/api/knowledge/embeddings/${fileId}`, {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json'
                }
            });

            if (response.ok) {
                const embedding = await response.json();
                if (embedding) {
                    const currentData = this.embeddingData.get(fileId);
                    const newProgress = embedding.progress;
                    const newStatus = embedding.status;

                    // 상태나 진행률이 변경된 경우에만 업데이트
                    if (!currentData || 
                        currentData.progress !== newProgress || 
                        currentData.status !== newStatus) {
                        
                        this.embeddingData.set(fileId, {
                            ...embedding,
                            created_at: new Date(embedding.created_at),
                            updated_at: new Date(embedding.updated_at)
                        });
                        
                        this.refreshUI();
                    }

                    // 완료되거나 실패한 경우 모니터링 중지
                    if (newStatus === 'completed' || newStatus === 'failed' || newStatus === 'cancelled') {
                        this.stopProgressMonitoring(fileId);
                    }
                }
            }
        } catch (error) {
            console.error('진행률 확인 실패:', error);
        }
    }

    // 유틸리티 함수들
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    formatDate(dateString) {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('ko-KR');
    }
}

// 전역 인스턴스 생성
const knowledgeManager = new KnowledgeManager();
window.knowledgeManager = knowledgeManager;

export { knowledgeManager };