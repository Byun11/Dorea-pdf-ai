// folderTreeManager.js - 폴더 트리 구조 관리

import { showNotification } from './utils.js';
import * as fileManager from './fileManager.js';

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
    items.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
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
        <div class="tree-item folder-item ${isSelected ? 'selected' : ''}" 
             data-type="folder" 
             data-id="${folder.id}"
             style="padding-left: ${level * 20}px">
            <div class="tree-item-content" onclick="event.stopPropagation(); folderTreeManager.toggleFolder(${folder.id})">
                <span class="expand-icon ${hasChildren ? 'has-children' : ''} ${isExpanded ? 'expanded' : ''}">
                    ${hasChildren ? (isExpanded ? '▼' : '▶') : ''}
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

    let childrenContent = '';
    if (isExpanded && hasChildren) {
        childrenContent += renderTreeItems(children, level + 1);
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
        <div class="tree-item file-item ${file.status} ${isSelected ? 'selected' : ''}" 
             data-type="file" 
             data-id="${file.id}"
             style="padding-left: ${level * 20 + 10}px"
             onclick="folderTreeManager.selectFile('${file.id}', '${fileName}', '${file.status}')"
             title="${file.filename}\n상태: ${currentStatus.text}">
            <div class="tree-item-content">
                <span class="file-icon">${currentStatus.icon}</span>
                <span class="item-name">${file.filename}</span>
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
    const contextMenu = document.getElementById('contextMenu') || createContextMenu();
    contextMenu.innerHTML = `
        <div class="context-menu-item">✏️ 이름 변경 (미구현)</div>
        <div class="context-menu-item danger" onclick="folderTreeManager.deleteFolder(${folderId})">🗑️ 폴더 삭제</div>
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

    // 상태별 메뉴 항목 구성 (처리 취소 제외)
    if (file.status === 'completed') {
        menuItems += `<div class="context-menu-item" onclick="fileManager.retryFile('${file.id}', '${file.filename}')">🔄 재처리</div>`;
    } else if (file.status === 'failed' || file.status === 'error') {
        menuItems += `<div class="context-menu-item" onclick="fileManager.retryFile('${file.id}', '${file.filename}')">🔄 재시도</div>`;
    }

    // 항상 표시되는 삭제 메뉴
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

async function deleteFolder(folderId) {
    showNotification('폴더 삭제는 아직 지원되지 않습니다.', 'info');
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
    getSelectedFolderId: () => selectedFolderId,
};
