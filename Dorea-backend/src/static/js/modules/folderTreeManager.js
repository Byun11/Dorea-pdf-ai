// folderTreeManager.js - 폴더 트리 구조 관리

import { showNotification } from './utils.js';
import * as fileManager from './fileManager.js';
import { showMoveFileDialog } from './ui.js'; // 파일 이동 UI 함수 import

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
            renderFolderTree();
            updateFolderStats();
        } else {
            console.error('폴더 트리 로드 실패:', response.statusText);
        }
    } catch (error) {
        console.error('폴더 트리 로드 오류:', error);
    } finally {
        if (fileManager) {
            fileManager.checkAndStartPolling();
        }
    }
}

// 모든 파일 목록을 평면화하여 반환 (폴링 체크용)
function getAllFiles() {
    const files = [];
    function traverse(items) {
        for (const item of items) {
            if (item.type === 'file') {
                files.push(item);
            } else if (item.type === 'folder') {
                if (item.files) traverse(item.files);
                if (item.subfolders) traverse(item.subfolders);
            }
        }
    }
    traverse(currentTree);
    return files;
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
    items.sort((a, b) => {
        if (a.type === 'folder' && b.type !== 'folder') return -1;
        if (a.type !== 'folder' && b.type === 'folder') return 1;
        const nameA = (a.name || a.filename || '').toLowerCase();
        const nameB = (b.name || b.filename || '').toLowerCase();
        return nameA.localeCompare(nameB);
    });
    
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
    const children = [...(folder.subfolders || []), ...(folder.files || [])];
    const hasChildren = children.length > 0;

    const folderContent = `
        <div class="tree-item ${isSelected ? 'selected' : ''}" style="margin-left: ${level * 20}px;">
            <div class="tree-node folder" 
                 data-type="folder" 
                 data-id="${folder.id}"
                 onclick="event.stopPropagation(); folderTreeManager.toggleFolder(${folder.id})">
                <div class="node-icon">📁</div>
                <div class="node-content">
                    <span class="node-name">${folder.name}</span>
                    <span class="folder-summary">(${folder.files.length})</span>
                </div>
            </div>
            <div class="folder-actions">
                <button onclick="event.stopPropagation(); folderTreeManager.showFolderContextMenu(${folder.id}, event)" 
                        class="context-menu-btn" title="폴더 옵션">⋮</button>
            </div>
        </div>
    `;

    let childrenContent = '';
    if (hasChildren) {
        childrenContent = `<div class="folder-children ${isExpanded ? '' : 'collapsed'}">`;
        childrenContent += renderTreeItems(children, level + 1);
        childrenContent += `</div>`;
    }

    return folderContent + childrenContent;
}

// 파일 아이템 렌더링
function renderFileItem(file, level) {
    const isSelected = selectedFileId === file.id;
    const statusInfo = {
        'waiting': { icon: '⏳', text: '대기 중' },
        'processing': { icon: '🔄', text: '처리 중' },
        'completed': { icon: '📄', text: '완료' },
        'failed': { icon: '❌', text: '실패' },
        'error': { icon: '❌', text: '오류' },
    };
    const currentStatus = statusInfo[file.status] || { icon: '❓', text: '알 수 없음' };
    const fileName = file.filename.replace(/'/g, "'").replace(/"/g, '&quot;');

    return `
        <div class="tree-item ${isSelected ? 'selected' : ''}" style="margin-left: ${level * 20}px;">
            <div class="tree-node file" 
                 data-type="file" 
                 data-id="${file.id}"
                 onclick="folderTreeManager.selectFile('${file.id}', '${fileName}', '${file.status}')"
                 title="${file.filename}\n상태: ${currentStatus.text}">
                <div class="node-icon">📄</div>
                <div class="node-content">
                    <span class="node-name">${file.filename}</span>
                    <div class="embedding-indicator ${file.status}"></div>
                </div>
            </div>
            <div class="file-actions">
                 <button onclick="event.stopPropagation(); folderTreeManager.showFileContextMenu('${file.id}', event)" 
                         class="context-menu-btn" title="파일 옵션">⋮</button>
            </div>
        </div>
    `;
}

// 폴더 토글
function toggleFolder(folderId) {
    if (expandedFolders.has(folderId)) {
        expandedFolders.delete(folderId);
    } else {
        expandedFolders.add(folderId);
    }
    selectedFolderId = folderId;
    selectedFileId = null;
    renderFolderTree();
    updateFolderStats();
}

// 파일 선택
async function selectFile(fileId, fileName, fileStatus) {
    selectedFileId = fileId;
    selectedFolderId = null;
    await fileManager.selectFile(fileId, fileName, fileStatus);
    renderFolderTree();
}

// 새 폴더 생성
async function createNewFolder() {
    const folderName = prompt('새 폴더 이름을 입력하세요:');
    if (!folderName || !folderName.trim()) return;
    try {
        const response = await fetchApi('/api/folders', {
            method: 'POST',
            body: JSON.stringify({ name: folderName.trim() })
        });
        if (response.ok) {
            await loadFolderTree();
            showNotification('폴더가 생성되었습니다.', 'success');
        } else {
            const errorData = await response.json();
            throw new Error(errorData.detail || '폴더 생성 실패');
        }
    } catch (error) {
        console.error('폴더 생성 오류:', error);
        showNotification(error.message, 'error');
    }
}

// 컨텍스트 메뉴 관련 함수들
function showFolderContextMenu(folderId, event) {
    event.preventDefault();
    event.stopPropagation();

    const folder = findFolderInTree(folderId);
    if (!folder) return;

    const contextMenu = document.getElementById('contextMenu') || createContextMenu();
    contextMenu.innerHTML = `
        <div class="context-menu-item" onclick="folderTreeManager.renameFolder(${folder.id}, '${folder.name}')">✏️ 이름 변경</div>
        <div class="context-menu-item danger" onclick="folderTreeManager.deleteFolder(${folder.id}, '${folder.name}')">🗑️ 폴더 삭제</div>
    `;
    displayContextMenu(event, contextMenu);
}

function showFileContextMenu(fileId, event) {
    event.preventDefault();
    event.stopPropagation();
    const contextMenu = document.getElementById('contextMenu') || createContextMenu();
    const file = findFileInTree(fileId);
    if (!file) return;

    let menuItems = '';
    menuItems += `<div class="context-menu-item" onclick="folderTreeManager.handleMoveFileClick('${file.id}', ${file.folder_id})">📁 폴더 이동</div>`;

    if (file.status === 'completed') {
        menuItems += `<div class="context-menu-item" onclick="fileManager.retryFile('${file.id}', '${file.filename}')">🔄 재처리</div>`;
    } else if (file.status === 'failed' || file.status === 'error') {
        menuItems += `<div class="context-menu-item" onclick="fileManager.retryFile('${file.id}', '${file.filename}')">🔄 재시도</div>`;
    }

    menuItems += `<div class="context-menu-item danger" onclick="fileManager.deleteFile('${file.id}', '${file.filename}')">🗑️ 파일 삭제</div>`;
    
    contextMenu.innerHTML = menuItems;
    displayContextMenu(event, contextMenu);
}

function createContextMenu() {
    let menu = document.getElementById('contextMenu');
    if (menu) return menu;
    menu = document.createElement('div');
    menu.id = 'contextMenu';
    menu.className = 'context-menu';
    document.body.appendChild(menu);
    return menu;
}

function displayContextMenu(event, menu) {
    menu.style.left = event.pageX + 'px';
    menu.style.top = event.pageY + 'px';
    menu.style.display = 'block';
    document.addEventListener('click', hideContextMenu, { once: true });
}

function hideContextMenu() {
    const menu = document.getElementById('contextMenu');
    if (menu) menu.style.display = 'none';
}

function findFileInTree(fileId) {
    return getAllFiles().find(f => f.id === fileId);
}

function findFolderInTree(folderId) {
    let foundFolder = null;
    function traverse(items) {
        for (const item of items) {
            if (foundFolder) return;
            if (item.type === 'folder') {
                if (item.id === folderId) {
                    foundFolder = item;
                    return;
                }
                if (item.subfolders) traverse(item.subfolders);
            }
        }
    }
    traverse(currentTree);
    return foundFolder;
}

// --- 폴더 & 파일 액션 함수 ---
async function deleteFolder(folderId, folderName) {
    await fileManager.deleteFolder(folderId, folderName);
}

async function renameFolder(folderId, currentName) {
    hideContextMenu();
    const newName = prompt("새 폴더 이름을 입력하세요:", currentName);

    if (newName && newName.trim() && newName.trim() !== currentName) {
        const success = await fileManager.renameFolder(folderId, newName.trim());
        if (success) {
            await loadFolderTree();
        }
    }
}

function handleMoveFileClick(fileId, folderId) {
    hideContextMenu();
    showMoveFileDialog(fileId, folderId, currentTree, async (newFolderId) => {
        const success = await fileManager.moveFile(fileId, newFolderId);
        if (success) {
            await loadFolderTree();
        }
    });
}

// 폴더 통계 업데이트
function updateFolderStats() {
    const files = getAllFiles();
    const stats = {
        total: files.length,
        completed: files.filter(f => f.status === 'completed').length,
        processing: files.filter(f => f.status === 'processing').length,
        waiting: files.filter(f => f.status === 'waiting').length,
        failed: files.filter(f => f.status === 'failed').length
    };
    
    const completedSpan = document.getElementById('completedCount');
    const processingSpan = document.getElementById('processingCount');
    const waitingSpan = document.getElementById('noneCount');
    
    if (completedSpan) completedSpan.textContent = `${stats.completed} 완료`;
    if (processingSpan) processingSpan.textContent = `${stats.processing} 처리중`;
    if (waitingSpan) waitingSpan.textContent = `${stats.waiting} 대기`;
    
    const processingItem = processingSpan?.parentElement;
    const waitingItem = waitingSpan?.parentElement;
    
    if (processingItem) processingItem.style.display = 'flex';
    if (waitingItem) waitingItem.style.display = 'flex';
    
    const embeddingStats = document.querySelector('.embedding-stats');
    const existingFailedItem = embeddingStats?.querySelector('.stat-item.failed');
    
    if (stats.failed > 0 && !existingFailedItem) {
        const failedItem = document.createElement('div');
        failedItem.className = 'stat-item failed';
        failedItem.innerHTML = `
            <span class="stat-dot failed"></span>
            <span>${stats.failed} 실패</span>
        `;
        embeddingStats?.insertBefore(failedItem, embeddingStats.lastElementChild);
    } else if (stats.failed === 0 && existingFailedItem) {
        existingFailedItem.remove();
    } else if (stats.failed > 0 && existingFailedItem) {
        existingFailedItem.querySelector('span:last-child').textContent = `${stats.failed} 실패`;
    }
}

// 초기화
function init() {
    loadFolderTree();
    document.addEventListener('click', (event) => {
        const treeContainer = document.getElementById('folderTree');
        if (treeContainer && !treeContainer.contains(event.target)) {
            selectedFolderId = null;
            selectedFileId = null;
            renderFolderTree();
        }
    });
}

// 외부 인터페이스
window.folderTreeManager = {
    init,
    loadFolderTree,
    toggleFolder,
    selectFile,
    createNewFolder,
    deleteFolder,
    showFolderContextMenu,
    showFileContextMenu,
    getAllFiles,
    updateFolderStats,
    renameFolder,
    handleMoveFileClick, // 이동 처리 함수 추가
    getSelectedFolderId: () => selectedFolderId,
};
