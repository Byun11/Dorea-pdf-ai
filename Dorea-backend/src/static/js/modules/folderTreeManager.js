// folderTreeManager.js - 폴더 트리 구조 관리

import { showNotification } from './utils.js';
import { selectFile as fileManagerSelectFile } from './fileManager.js';

let currentTree = [];
let selectedFolderId = null;
let selectedFileId = null;
let expandedFolders = new Set();

// API 호출 함수
async function fetchApi(endpoint, options = {}) {
    const token = localStorage.getItem('token');
    if (!token) {
        throw new Error('인증 토큰이 없습니다');
    }
    
    const defaultOptions = {
        headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            ...options.headers
        }
    };
    
    return fetch(endpoint, { ...defaultOptions, ...options });
}

// 폴더 트리 로드
async function loadFolderTree() {
    try {
        const response = await fetchApi('/api/folders');
        
        if (response.ok) {
            const data = await response.json();
            currentTree = data.data || [];
            
            // 클라이언트 큐의 파일들도 트리에 추가
            addClientQueueToTree();
            
            renderFolderTree();
        } else {
            console.error('폴더 트리 로드 실패:', response.statusText);
        }
    } catch (error) {
        console.error('폴더 트리 로드 오류:', error);
    }
}


// 클라이언트 큐의 파일들을 트리에 추가
function addClientQueueToTree() {
    // fileManager 큐에서 파일들 가져오기
    if (!window.fileManager || !window.fileManager.getFileQueue) {
        return;
    }
    
    const fileQueue = window.fileManager.getFileQueue();
    if (!fileQueue || fileQueue.length === 0) {
        return;
    }
    
    console.log(`📋 클라이언트 큐에서 ${fileQueue.length}개 파일 확인 중...`);
    
    fileQueue.forEach(queueFile => {
        // waiting, processing 상태의 파일들만 추가
        if (['waiting', 'processing'].includes(queueFile.status)) {
            // 서버 트리에 이미 있는지 확인
            const existsInTree = findFileInTree(currentTree, queueFile.id);
            if (!existsInTree) {
                // 서버에 없는 클라이언트 큐 파일을 트리에 추가
                addQueueFileToTree(queueFile);
            }
        }
    });
}

// 큐 파일을 트리에 추가
function addQueueFileToTree(queueFile) {
    const clientFile = {
        id: queueFile.id,
        filename: queueFile.name,
        status: queueFile.status,
        file_size: queueFile.file ? queueFile.file.size : 0,
        created_at: new Date().toISOString(),
        language: queueFile.language,
        type: 'file',
        isClientQueue: true // 클라이언트 큐 파일 표시
    };
    
    if (queueFile.folderId) {
        // 특정 폴더에 추가
        const folder = findItemInTree(currentTree, queueFile.folderId, 'folder');
        if (folder) {
            if (!folder.files) folder.files = [];
            folder.files.push(clientFile);
            console.log(`📁 클라이언트 파일 '${clientFile.filename}' → 폴더 '${folder.name}' 추가`);
        } else {
            // 폴더를 찾지 못했을 때 루트에 추가
            currentTree.push(clientFile);
            console.log(`📁 클라이언트 파일 '${clientFile.filename}' → 루트 추가 (폴더 미발견)`);
        }
    } else {
        // 루트에 추가
        currentTree.push(clientFile);
        console.log(`📁 클라이언트 파일 '${clientFile.filename}' → 루트 추가`);
    }
}

// 트리 렌더링
function renderFolderTree() {
    const treeContainer = document.getElementById('folderTree');
    if (!treeContainer) return;

    if (currentTree.length === 0) {
        treeContainer.innerHTML = `
            <div class="empty-tree">
                <div style="font-size: 2rem; margin-bottom: 1rem;">📁</div>
                <p>폴더나 파일이 없습니다</p>
                <button onclick="folderTreeManager.createNewFolder()" class="create-folder-btn">
                    새 폴더 만들기
                </button>
            </div>
        `;
        return;
    }

    treeContainer.innerHTML = renderTreeItems(currentTree);
}

// 트리 아이템 재귀 렌더링
function renderTreeItems(items, level = 0) {
    return items.map(item => {
        if (item.type === 'folder') {
            return renderFolderItem(item, level);
        } else {
            return renderFileItem(item, level);
        }
    }).join('');
}

// 폴더 아이템 렌더링
function renderFolderItem(folder, level) {
    const isExpanded = expandedFolders.has(folder.id);
    const isSelected = selectedFolderId === folder.id;
    const hasFiles = folder.files.length > 0;
    
    const folderContent = `
        <div class="tree-item folder-item ${isSelected ? 'selected' : ''}" 
             data-type="folder" 
             data-id="${folder.id}"
             style="padding-left: ${level * 20}px">
            <div class="tree-item-content" onclick="folderTreeManager.toggleFolder(${folder.id})">
                <span class="expand-icon ${hasFiles ? 'has-children' : ''} ${isExpanded ? 'expanded' : ''}">
                    ${hasFiles ? (isExpanded ? '▼' : '▶') : ''}
                </span>
                <span class="folder-icon">📁</span>
                <span class="item-name">${folder.name}</span>
                <span class="item-count">(${folder.files.length})</span>
            </div>
            <div class="folder-actions">
                <button onclick="event.stopPropagation(); folderTreeManager.showFolderContextMenu(${folder.id}, event)" 
                        class="context-menu-btn" title="폴더 옵션">⋮</button>
            </div>
        </div>
    `;

    let filesContent = '';
    if (isExpanded && hasFiles) {
        filesContent += renderTreeItems(folder.files, level + 1);
    }

    return folderContent + filesContent;
}

// 파일 아이템 렌더링
function renderFileItem(file, level) {
    const isSelected = selectedFileId === file.id;
    const canSelect = file.status === 'completed';
    
    const statusEmoji = {
        'checking': '🔍',
        'waiting': '⏳',
        'processing': '🔄',
        'completed': '✅',
        'error': '❌',
        'failed': '❌',
        'cancelled': '🚫'
    };

    return `
        <div class="tree-item file-item ${file.status} ${isSelected ? 'selected' : ''}" 
             data-type="file" 
             data-id="${file.id}"
             style="padding-left: ${level * 20 + 20}px"
             ${canSelect ? `onclick="folderTreeManager.selectFile('${file.id}')"` : ''}
             title="${file.filename}">
            <div class="tree-item-content">
                <span class="file-icon">📄</span>
                <span class="item-name">${file.filename}</span>
                <span class="file-status">${statusEmoji[file.status] || '📄'}</span>
            </div>
            <div class="file-actions">
                ${file.status === 'completed' || file.status === 'error' || file.status === 'failed' || file.status === 'waiting' ? `
                    <button onclick="event.stopPropagation(); folderTreeManager.showFileContextMenu('${file.id}', event)" 
                            class="context-menu-btn" title="파일 옵션">⋮</button>
                ` : ''}
            </div>
        </div>
    `;
}

// 폴더 토글 (확장/축소)
function toggleFolder(folderId) {
    if (expandedFolders.has(folderId)) {
        expandedFolders.delete(folderId);
    } else {
        expandedFolders.add(folderId);
    }
    
    selectedFolderId = folderId;
    renderFolderTree();
}

// 파일 선택
async function selectFile(fileId) {
    selectedFileId = fileId;
    selectedFolderId = null;
    
    // fileManager의 selectFile 함수 호출
    await fileManagerSelectFile(fileId);
    
    renderFolderTree();
}

// 새 폴더 생성
async function createNewFolder() {
    const folderName = prompt('새 폴더 이름을 입력하세요:');
    if (!folderName || !folderName.trim()) return;

    try {
        const response = await fetchApi('/api/folders', {
            method: 'POST',
            body: JSON.stringify({
                name: folderName.trim()
            })
        });

        if (response.ok) {
            await loadFolderTree(); // 트리 새로고침
            showNotification('폴더가 생성되었습니다.', 'success');
        } else {
            const errorData = await response.json();
            showNotification(errorData.detail || '폴더 생성에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('폴더 생성 오류:', error);
        showNotification('폴더 생성 중 오류가 발생했습니다.', 'error');
    }
}

// 폴더 이름 변경
async function renameFolder(folderId) {
    const folder = findItemInTree(currentTree, folderId, 'folder');
    if (!folder) return;

    const newName = prompt('새 폴더 이름을 입력하세요:', folder.name);
    if (!newName || !newName.trim() || newName.trim() === folder.name) return;

    try {
        const response = await fetchApi(`/api/folders/${folderId}`, {
            method: 'PUT',
            body: JSON.stringify({
                name: newName.trim()
            })
        });

        if (response.ok) {
            await loadFolderTree();
            showNotification('폴더 이름이 변경되었습니다.', 'success');
        } else {
            const errorData = await response.json();
            showNotification(errorData.detail || '폴더 이름 변경에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('폴더 이름 변경 오류:', error);
        showNotification('폴더 이름 변경 중 오류가 발생했습니다.', 'error');
    }
}

// 폴더 삭제
async function deleteFolder(folderId) {
    const folder = findItemInTree(currentTree, folderId, 'folder');
    if (!folder) return;

    if (!confirm(`폴더 '${folder.name}'을(를) 정말 삭제하시겠습니까?\n폴더 내 파일들은 루트로 이동됩니다.`)) {
        return;
    }

    try {
        const response = await fetchApi(`/api/folders/${folderId}`, {
            method: 'DELETE'
        });

        if (response.ok) {
            await loadFolderTree();
            showNotification('폴더가 삭제되었습니다.', 'success');
            
            // 삭제된 폴더가 선택되어 있었다면 선택 해제
            if (selectedFolderId === folderId) {
                selectedFolderId = null;
            }
        } else {
            const errorData = await response.json();
            showNotification(errorData.detail || '폴더 삭제에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('폴더 삭제 오류:', error);
        showNotification('폴더 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// 파일 이동
async function moveFile(fileId, newFolderId) {
    try {
        const response = await fetchApi(`/api/files/${fileId}/move`, {
            method: 'PATCH',
            body: JSON.stringify({
                new_folder_id: newFolderId
            })
        });

        if (response.ok) {
            await loadFolderTree();
            showNotification('파일이 이동되었습니다.', 'success');
        } else {
            const errorData = await response.json();
            showNotification(errorData.detail || '파일 이동에 실패했습니다.', 'error');
        }
    } catch (error) {
        console.error('파일 이동 오류:', error);
        showNotification('파일 이동 중 오류가 발생했습니다.', 'error');
    }
}

// 트리에서 아이템 찾기 (평면 구조)
function findItemInTree(items, id, type) {
    for (const item of items) {
        // ID 비교 시 타입 변환 (숫자 ↔ 문자열)
        if (item.type === type && String(item.id) === String(id)) {
            return item;
        }
        // 폴더 내 파일 검색
        if (item.type === 'folder' && item.files) {
            const found = findItemInTree(item.files, id, type);
            if (found) return found;
        }
    }
    return null;
}

// 컨텍스트 메뉴 표시 (폴더용)
function showFolderContextMenu(folderId, event) {
    event.preventDefault();
    event.stopPropagation();
    
    const contextMenu = document.getElementById('folderContextMenu') || createFolderContextMenu();
    
    // 메뉴 항목 업데이트 (하위 폴더 생성 제거)
    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="folderTreeManager.renameFolder(${folderId})">
            ✏️ 이름 변경
        </div>
        <div class="context-menu-item danger" onclick="folderTreeManager.deleteFolder(${folderId})">
            🗑️ 폴더 삭제
        </div>
    `;
    
    // 위치 설정
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.style.display = 'block';
    
    // 외부 클릭시 메뉴 숨김
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

// 컨텍스트 메뉴 표시 (파일용)
function showFileContextMenu(fileId, event) {
    event.preventDefault();
    event.stopPropagation();
    
    const contextMenu = document.getElementById('fileContextMenu') || createFileContextMenu();
    
    // 현재 파일 정보 찾기
    const file = findFileInTree(currentTree, fileId);
    if (!file) {
        console.error('파일을 찾을 수 없습니다:', fileId);
        return;
    }
    
    // 파일 상태에 따른 메뉴 항목 생성
    let menuItems = [];
    
    // 기본 메뉴들
    menuItems.push(`
        <div class="context-menu-item" onclick="folderTreeManager.showMoveFileDialog('${fileId}')">
            📁 폴더로 이동
        </div>
    `);
    
    // 상태별 메뉴
    if (file.status === 'completed') {
        menuItems.push(`
            <div class="context-menu-item" onclick="folderTreeManager.reprocessFile('${fileId}')">
                🔄 재처리
            </div>
        `);
    } else if (file.status === 'error' || file.status === 'failed') {
        menuItems.push(`
            <div class="context-menu-item" onclick="folderTreeManager.retryFile('${fileId}')">
                🔄 재시도
            </div>
        `);
    } else if (file.status === 'waiting') {
        menuItems.push(`
            <div class="context-menu-item" onclick="folderTreeManager.cancelProcessing('${fileId}')">
                ⏸ 처리 중단
            </div>
        `);
    }
    
    menuItems.push(`
        <div class="context-menu-separator"></div>
        <div class="context-menu-item danger" onclick="folderTreeManager.deleteFile('${fileId}')">
            🗑️ 파일 삭제
        </div>
    `);
    
    contextMenu.innerHTML = menuItems.join('');
    
    // 위치 설정
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    contextMenu.style.display = 'block';
    
    // 외부 클릭시 메뉴 숨김
    setTimeout(() => {
        document.addEventListener('click', hideContextMenu, { once: true });
    }, 0);
}

// 컨텍스트 메뉴 DOM 생성
function createFolderContextMenu() {
    const menu = document.createElement('div');
    menu.id = 'folderContextMenu';
    menu.className = 'context-menu';
    document.body.appendChild(menu);
    return menu;
}

function createFileContextMenu() {
    const menu = document.createElement('div');
    menu.id = 'fileContextMenu'; 
    menu.className = 'context-menu';
    document.body.appendChild(menu);
    return menu;
}

// 트리에서 파일 찾기 (평면 구조)
function findFileInTree(tree, fileId) {
    for (const item of tree) {
        if (item.type === 'file' && item.id === fileId) {
            return item;
        }
        if (item.type === 'folder' && item.files) {
            for (const file of item.files) {
                if (file.id === fileId) {
                    return file;
                }
            }
        }
    }
    return null;
}

// 파일 재처리 - fileManager 통합 처리 방식 사용
async function reprocessFile(fileId) {
    try {
        console.log(`🔄 [folderTreeManager] reprocessFile 호출: ${fileId}`);
        
        // fileManager의 retryFile 함수 호출 (통합된 처리 방식)
        if (window.fileManager && window.fileManager.retryFile) {
            await window.fileManager.retryFile(fileId);
        } else {
            throw new Error('fileManager.retryFile 함수를 찾을 수 없습니다');
        }
        
        // 트리 새로고침
        await loadFolderTree();
        
    } catch (error) {
        console.error('재처리 오류:', error);
        showNotification('재처리 중 오류가 발생했습니다.', 'error');
    }
}

// 파일 재시도 - fileManager의 retryFile 함수 호출 (원래 방식)
async function retryFile(fileId) {
    try {
        console.log(`🔄 [folderTreeManager] retryFile 호출: ${fileId}`);
        
        // fileManager의 retryFile 함수 호출 (실제 처리 큐에 추가)
        if (window.fileManager && window.fileManager.retryFile) {
            await window.fileManager.retryFile(fileId);
        } else {
            throw new Error('fileManager.retryFile 함수를 찾을 수 없습니다');
        }
        
        // 트리 새로고침
        await loadFolderTree();
        
    } catch (error) {
        console.error('재시도 오류:', error);
        showNotification('재시도 중 오류가 발생했습니다.', 'error');
    }
}

// 파일 처리 중단 (waiting 상태용)
async function cancelProcessing(fileId) {
    try {
        console.log(`⏸ 파일 처리 중단 요청: ${fileId}`);
        
        // 백엔드에 상태를 'failed'로 업데이트
        const response = await fetchApi(`/api/files/${fileId}/cancel-processing`, {
            method: 'POST'
        });
        
        if (response.ok) {
            showNotification('파일 처리를 중단했습니다. 재시도할 수 있습니다.', 'success');
            console.log(`✅ 파일 상태가 failed로 변경됨: ${fileId}`);
        } else {
            const errorData = await response.json();
            showNotification(`처리 중단 실패: ${errorData.detail}`, 'error');
        }
        
        // 트리 새로고침
        await loadFolderTree();
        
    } catch (error) {
        console.error('❌ 처리 중단 오류:', error);
        showNotification('처리 중단 중 오류가 발생했습니다.', 'error');
    }
}

// 파일 삭제
async function deleteFile(fileId) {
    const file = findFileInTree(currentTree, fileId);
    if (!file) {
        showNotification('파일을 찾을 수 없습니다.', 'error');
        return;
    }
    
    if (!confirm(`"${file.filename}" 파일을 삭제하시겠습니까?`)) {
        return;
    }
    
    try {
        const response = await fetchApi(`/api/files/${fileId}`, {
            method: 'DELETE'
        });
        
        if (response.ok) {
            showNotification('파일이 삭제되었습니다.', 'success');
            // 트리 새로고침
            await loadFolderTree();
        } else {
            const errorData = await response.json();
            showNotification(`파일 삭제 실패: ${errorData.detail}`, 'error');
        }
    } catch (error) {
        console.error('파일 삭제 오류:', error);
        showNotification('파일 삭제 중 오류가 발생했습니다.', 'error');
    }
}

// 컨텍스트 메뉴 숨김
function hideContextMenu() {
    const folderMenu = document.getElementById('folderContextMenu');
    const fileMenu = document.getElementById('fileContextMenu');
    if (folderMenu) folderMenu.style.display = 'none';
    if (fileMenu) fileMenu.style.display = 'none';
}

// 파일 이동 다이얼로그 표시
function showMoveFileDialog(fileId) {
    hideContextMenu();
    
    // 모든 폴더 목록을 가져와서 선택할 수 있게 함
    const folders = getAllFolders(currentTree);
    
    const dialog = document.createElement('div');
    dialog.className = 'move-file-dialog';
    dialog.innerHTML = `
        <div class="dialog-overlay" onclick="this.parentElement.remove()">
            <div class="dialog-content" onclick="event.stopPropagation()">
                <h3>파일 이동</h3>
                <p>이동할 폴더를 선택하세요:</p>
                <div class="folder-list">
                    <div class="folder-option" onclick="folderTreeManager.moveFile('${fileId}', null); this.closest('.move-file-dialog').remove()">
                        📁 루트 (최상위)
                    </div>
                    ${folders.map(folder => `
                        <div class="folder-option" onclick="folderTreeManager.moveFile('${fileId}', ${folder.id}); this.closest('.move-file-dialog').remove()">
                            ${'　'.repeat(folder.level)}📁 ${folder.name}
                        </div>
                    `).join('')}
                </div>
                <div class="dialog-actions">
                    <button onclick="this.closest('.move-file-dialog').remove()">취소</button>
                </div>
            </div>
        </div>
    `;
    
    document.body.appendChild(dialog);
}

// 모든 폴더를 평면 목록으로 변환 (평면 구조)
function getAllFolders(items, level = 0, result = []) {
    items.forEach(item => {
        if (item.type === 'folder') {
            result.push({
                id: item.id,
                name: item.name,
                level: level
            });
        }
    });
    return result;
}


// 초기화
function init() {
    loadFolderTree();
}

// 외부 인터페이스
window.folderTreeManager = {
    init,
    loadFolderTree,
    renderFolderTree,
    toggleFolder,
    selectFile,
    createNewFolder,
    renameFolder,
    deleteFolder,
    moveFile,
    reprocessFile,
    retryFile,
    deleteFile,
    cancelProcessing,
    showFolderContextMenu,
    showFileContextMenu,
    showMoveFileDialog,
    getSelectedFolderId: () => selectedFolderId,
    getSelectedFileId: () => selectedFileId
};