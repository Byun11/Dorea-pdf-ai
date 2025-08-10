/* =====================================================
   Dorea Ollama Manager Module - Ollama Model Management
   ===================================================== */

import { fetchApi, showNotification } from './utils.js';

// Ollama 관리 변수
let currentUserSettings = null;
let selectedProvider = 'gpt';
let availableModels = [];

// Ollama 매니저 초기화
export function init() {
    // 모달 관련 이벤트 리스너는 필요시 추가
}

// 설정 모달 열기
export async function openSettingsModal() {
    // 모델 관리 모달 열기
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.style.display = 'flex';
        
        await loadUserSettings();
        
        // 기본적으로 GPT API 입력 화면 표시
        selectProvider('gpt');
        
        // API 키 입력 필드에 포커스
        const apiKeyInput = document.getElementById('apiKeyInput');
        if (apiKeyInput) {
            apiKeyInput.focus();
        }
    }
}

// 설정 모달 닫기
export function closeSettingsModal() {
    // 모델 관리 모달 닫기
    const modal = document.getElementById('settingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
}

// 사용자 설정 로드
async function loadUserSettings() {
    // 사용자 설정 로딩
    
    try {
        const response = await fetchApi('/api/settings');

        if (response.ok) {
            currentUserSettings = await response.json();
            // 사용자 설정 로딩 완료
            
            // UI에 설정 반영
            selectedProvider = currentUserSettings.selected_model_provider || 'gpt';
            updateModelSelectionUI();
            updateCurrentModelInfo();
            
            // Ollama 모델 목록 로드
            if (selectedProvider === 'ollama') {
                await loadOllamaModels();
            }
        } else {
            console.error('❌ 설정 로딩 실패:', response.status);
            showNotification('설정을 불러오는데 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('❌ 설정 로딩 오류:', error);
        showNotification('설정 로딩 중 오류가 발생했습니다.', 'error');
    }
}

// 프로바이더 선택
export function selectProvider(provider) {
    selectedProvider = provider;
    updateModelSelectionUI();
    
    const ollamaManagement = document.getElementById('ollamaManagement');
    const gptApiKeyManagement = document.getElementById('gptApiKeyManagement');
    
    if (provider === 'ollama') {
        // Ollama 선택 시
        if (ollamaManagement) ollamaManagement.style.display = 'block';
        if (gptApiKeyManagement) gptApiKeyManagement.style.display = 'none';
        loadOllamaModels();
    } else if (provider === 'gpt') {
        // GPT 선택 시
        if (ollamaManagement) ollamaManagement.style.display = 'none';
        if (gptApiKeyManagement) gptApiKeyManagement.style.display = 'block';
    } else {
        // 기타
        if (ollamaManagement) ollamaManagement.style.display = 'none';
        if (gptApiKeyManagement) gptApiKeyManagement.style.display = 'none';
    }
    
    updateCurrentModelInfo();
}

// 모델 선택 UI 업데이트
function updateModelSelectionUI() {
    // GPT 토글 업데이트
    const gptToggle = document.getElementById('gptToggle')?.parentElement;
    
    // Ollama 토글 업데이트
    const ollamaToggle = document.getElementById('ollamaToggle')?.parentElement;
    
    // 선택 상태 초기화
    if (gptToggle) gptToggle.classList.remove('selected');
    if (ollamaToggle) ollamaToggle.classList.remove('selected');
    
    // 현재 선택된 제공자에 따라 UI 업데이트
    if (selectedProvider === 'gpt') {
        if (gptToggle) gptToggle.classList.add('selected');
    } else {
        if (ollamaToggle) ollamaToggle.classList.add('selected');
    }
}

// 현재 모델 정보 업데이트
function updateCurrentModelInfo() {
    const currentModelName = document.getElementById('currentModelName');
    
    if (currentModelName) {
        if (selectedProvider === 'gpt') {
            currentModelName.textContent = 'OpenAI GPT-4o';
        } else if (selectedProvider === 'ollama' && currentUserSettings?.selected_ollama_model) {
            currentModelName.textContent = currentUserSettings.selected_ollama_model;
        } else {
            currentModelName.textContent = '모델을 선택해주세요';
        }
    }
}

// Ollama 모델 목록 로드
async function loadOllamaModels() {
    // Ollama 모델 목록 로딩
    
    const installedSelect = document.getElementById('installedModelSelect');
    const deleteSelect = document.getElementById('deleteModelSelect');
    
    // 로딩 상태
    if (installedSelect) {
        installedSelect.innerHTML = '<option value="">모델을 불러오는 중...</option>';
    }
    if (deleteSelect) {
        deleteSelect.innerHTML = '<option value="" disabled>모델을 불러오는 중...</option>';
    }
    
    try {
        const response = await fetchApi('/api/models/local');

        if (response.ok) {
            const data = await response.json();
            availableModels = data.models || [];
            // Ollama 모델 목록 로딩 완료
            
            // 설치된 모델 선택 드롭다운 업데이트
            if (installedSelect) {
                installedSelect.innerHTML = '<option value="">모델을 선택하세요</option>';
            }
            if (deleteSelect) {
                deleteSelect.innerHTML = '<option value="" disabled>모델 선택</option>';
            }
            
            if (availableModels.length > 0) {
                availableModels.forEach(model => {
                    // 설치된 모델 선택
                    if (installedSelect) {
                        const installedOption = document.createElement('option');
                        installedOption.value = model.name;
                        installedOption.textContent = model.name;
                        installedSelect.appendChild(installedOption);
                    }
                    
                    // 삭제용 모델 선택
                    if (deleteSelect) {
                        const deleteOption = document.createElement('option');
                        deleteOption.value = model.name;
                        deleteOption.textContent = model.name;
                        deleteSelect.appendChild(deleteOption);
                    }
                });
                
                // 현재 선택된 모델 반영
                if (currentUserSettings?.selected_ollama_model && installedSelect) {
                    installedSelect.value = currentUserSettings.selected_ollama_model;
                }
            } else {
                if (installedSelect) {
                    installedSelect.innerHTML = '<option value="">다운로드된 모델이 없습니다</option>';
                }
                if (deleteSelect) {
                    deleteSelect.innerHTML = '<option value="" disabled>다운로드된 모델이 없습니다</option>';
                }
            }
        } else {
            console.error('❌ 모델 목록 조회 실패:', response.status);
            if (installedSelect) {
                installedSelect.innerHTML = '<option value="">모델 목록 조회 실패</option>';
            }
            if (deleteSelect) {
                deleteSelect.innerHTML = '<option value="" disabled>모델 목록 조회 실패</option>';
            }
        }
    } catch (error) {
        console.error('❌ 모델 목록 조회 오류:', error);
        if (installedSelect) {
            installedSelect.innerHTML = '<option value="">연결 오류</option>';
        }
        if (deleteSelect) {
            deleteSelect.innerHTML = '<option value="" disabled>연결 오류</option>';
        }
    }
}

// 모델 다운로드
export async function pullModel() {
    console.log('📥 모델 다운로드 시작');
    
    const input = document.getElementById('pullModelInput');
    const button = document.getElementById('pullModelBtn');
    const status = document.getElementById('pullModelStatus');
    
    const modelName = input ? input.value.trim() : '';
    if (!modelName) {
        showNotification('모델 이름을 입력해주세요.', 'error');
        return;
    }
    
    // 로딩 상태
    if (button) {
        button.disabled = true;
        button.innerHTML = '<div class="spinner w-4 h-4"></div>';
    }
    if (status) {
        status.style.display = 'block';
        status.className = 'status-loading border rounded p-2';
        status.innerHTML = `
            <div class="flex items-center justify-between">
                <span>모델 '${modelName}' 다운로드 준비 중...</span>
            </div>
            <div class="mt-2">
                <div class="bg-gray-200 rounded-full h-2">
                    <div id="downloadProgress" class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
                </div>
                <div class="flex justify-between text-xs text-gray-500 mt-1">
                    <span id="downloadPercent">0%</span>
                    <span id="downloadSize">준비 중...</span>
                </div>
            </div>
        `;
    }
    
    try {
        const response = await fetchApi('/api/models/local/download', {
            method: 'POST',
            body: JSON.stringify({ model_name: modelName })
        });
        
        if (!response.ok) {
            throw new Error('다운로드 시작 실패');
        }
        
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        
        function readStream() {
            reader.read().then(({ done, value }) => {
                if (done) {
                    console.log('✅ 다운로드 완료');
                    handleDownloadComplete();
                    return;
                }
                
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                
                lines.forEach(line => {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(6));
                            handleDownloadEvent(data);
                        } catch (e) {
                            console.log('JSON 파싱 오류:', e);
                        }
                    }
                });
                
                readStream();
            }).catch(error => {
                console.error('스트림 읽기 오류:', error);
                handleDownloadError(error);
            });
        }
        
        readStream();
        
    } catch (error) {
        console.error('❌ 모델 다운로드 오류:', error);
        handleDownloadError(error);
    }
    
    function handleDownloadEvent(data) {
        const progressBar = document.getElementById('downloadProgress');
        const percentText = document.getElementById('downloadPercent');
        const sizeText = document.getElementById('downloadSize');
        
        switch (data.type) {
            case 'start':
                if (status) status.className = 'status-loading border rounded p-2';
                break;
                
            case 'progress':
                if (progressBar && percentText && sizeText) {
                    progressBar.style.width = `${data.percentage}%`;
                    percentText.textContent = `${data.percentage}%`;
                    
                    const completedMB = (data.completed / 1024 / 1024).toFixed(1);
                    const totalMB = (data.total / 1024 / 1024).toFixed(1);
                    sizeText.textContent = `${completedMB}MB / ${totalMB}MB`;
                }
                break;
                
            case 'status':
                if (sizeText) {
                    sizeText.textContent = data.status;
                }
                break;
                
            case 'done':
                handleDownloadComplete();
                break;
                
            case 'error':
                handleDownloadError(new Error(data.error));
                break;
        }
    }
    
    function handleDownloadComplete() {
        if (status) {
            status.className = 'status-success border rounded p-2';
            status.innerHTML = `
                <div class="flex items-center">
                    <span>✅ 모델 '${modelName}' 다운로드 완료!</span>
                </div>
            `;
        }
        
        // 입력 필드 초기화
        if (input) input.value = '';
        
        // 버튼 상태 복원
        if (button) {
            button.disabled = false;
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"></path><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"></path></svg>';
        }
        
        // 모델 목록 새로고침
        setTimeout(() => {
            loadOllamaModels();
        }, 2000);
        
        // 5초 후 상태 메시지 숨기기
        setTimeout(() => {
            if (status) status.style.display = 'none';
        }, 5000);
    }
    
    function handleDownloadError(error) {
        if (status) {
            status.className = 'status-error border rounded p-2';
            status.innerHTML = `
                <div class="flex items-center">
                    <span>❌ 다운로드 오류: ${error.message || '알 수 없는 오류'}</span>
                </div>
            `;
        }
        
        // 버튼 상태 복원
        if (button) {
            button.disabled = false;
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path d="M8.75 2.75a.75.75 0 0 0-1.5 0v5.69L5.03 6.22a.75.75 0 0 0-1.06 1.06l3.5 3.5a.75.75 0 0 0 1.06 0l3.5-3.5a.75.75 0 0 0-1.06-1.06L8.75 8.44V2.75Z"></path><path d="M3.5 9.75a.75.75 0 0 0-1.5 0v1.5A2.75 2.75 0 0 0 4.75 14h6.5A2.75 2.75 0 0 0 14 11.25v-1.5a.75.75 0 0 0-1.5 0v1.5c0 .69-.56 1.25-1.25 1.25h-6.5c-.69 0-1.25-.56-1.25-1.25v-1.5Z"></path></svg>';
        }
        
        // 5초 후 상태 메시지 숨기기
        setTimeout(() => {
            if (status) status.style.display = 'none';
        }, 5000);
    }
}

// 모델 삭제
export async function deleteModel() {
    console.log('🗑️ 모델 삭제 시작');
    
    const select = document.getElementById('deleteModelSelect');
    const button = document.getElementById('deleteModelBtn');
    
    const modelName = select ? select.value : '';
    if (!modelName) {
        showNotification('삭제할 모델을 선택해주세요.', 'error');
        return;
    }
    
    if (!confirm(`'${modelName}' 모델을 삭제하시겠습니까?`)) {
        return;
    }
    
    // 로딩 상태
    if (button) {
        button.disabled = true;
        button.innerHTML = '<div class="spinner w-4 h-4"></div>';
    }
    
    try {
        const response = await fetchApi('/api/models/local/delete', {
            method: 'DELETE',
            body: JSON.stringify({
                model_name: modelName
            })
        });
        
        const result = await response.json();
        
        if (response.ok) {
            showNotification(result.message || `모델 '${modelName}'이 삭제되었습니다.`, 'success');
            
            // 모델 목록 새로고침
            await loadOllamaModels();
        } else {
            showNotification(result.detail || '모델 삭제에 실패했습니다.', 'error');
        }
        
    } catch (error) {
        console.error('❌ 모델 삭제 오류:', error);
        showNotification('모델 삭제 중 오류가 발생했습니다.', 'error');
    } finally {
        if (button) {
            button.disabled = false;
            button.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4"><path fill-rule="evenodd" d="M5 3.25V4H2.75a.75.75 0 0 0 0 1.5h.3l.815 8.15A1.5 1.5 0 0 0 5.357 15h5.285a1.5 1.5 0 0 0 1.493-1.35l.815-8.15h.3a.75.75 0 0 0 0-1.5H11v-.75A2.25 2.25 0 0 0 8.75 1h-1.5A2.25 2.25 0 0 0 5 3.25Zm2.25-.75a.75.75 0 0 0-.75.75V4h3v-.75a.75.75 0 0 0-.75-.75h-1.5ZM6.05 6a.75.75 0 0 1 .787.713l.275 5.5a.75.75 0 0 1-1.498.075l-.275-5.5A.75.75 0 0 1 6.05 6Zm3.9 0a.75.75 0 0 1 .712.787l-.275 5.5a.75.75 0 0 1-1.498-.075l.275-5.5a.75.75 0 0 1 .786-.711Z" clip-rule="evenodd"></path></svg>';
        }
    }
}

// 모델 설정 저장
export async function saveModelSettings() {
    console.log('💾 모델 설정 저장');
    
    let selectedModel = null;
    
    if (selectedProvider === 'ollama') {
        const installedSelect = document.getElementById('installedModelSelect');
        selectedModel = installedSelect ? installedSelect.value : null;
        if (!selectedModel) {
            showNotification('Ollama 모델을 선택해주세요.', 'error');
            return;
        }
    }
    
    const saveBtn = document.querySelector('.save-btn');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = '저장 중...';
    }
    
    try {
        const response = await fetchApi('/api/settings', {
            method: 'POST',
            body: JSON.stringify({
                selected_model_provider: selectedProvider,
                selected_ollama_model: selectedProvider === 'ollama' ? selectedModel : null
            })
        });

        if (response.ok) {
            const data = await response.json();
            console.log('✅ 설정 저장 완료:', data);
            
            // 현재 설정 업데이트
            currentUserSettings = {
                selected_model_provider: data.selected_model_provider,
                selected_ollama_model: data.selected_ollama_model
            };
            
            showNotification('설정이 저장되었습니다.', 'success');
            closeSettingsModal();
        } else {
            const errorData = await response.json();
            console.error('❌ 설정 저장 실패:', errorData);
            showNotification(errorData.detail || '설정 저장에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('❌ 설정 저장 오류:', error);
        showNotification('설정 저장 중 오류가 발생했습니다.', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = '저장';
        }
    }
}

// Export 함수들은 index.js에서 글로벌로 노출됨

// HTML onclick에서 사용할 수 있도록 전역 함수로 등록
window.openSettingsModal = openSettingsModal;
window.closeSettingsModal = closeSettingsModal;
window.selectProvider = selectProvider;
window.pullModel = pullModel;
window.deleteModel = deleteModel;
window.saveModelSettings = saveModelSettings;