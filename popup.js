let currentSelectorType = 'css';
let currentRemoveMode = false;
let currentTab = null;

document.addEventListener('DOMContentLoaded', async () => {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  loadStats();
  bindEvents();
  
  chrome.storage.local.get(['selectorType', 'removeMode'], (result) => {
    if (result.selectorType) {
      currentSelectorType = result.selectorType;
      updateSelectorTypeUI();
    }
    if (result.removeMode !== undefined) {
      currentRemoveMode = result.removeMode;
      updateRemoveModeUI();
    }
  });
});

function bindEvents() {
  // 选择器类型切换
  document.getElementById('selectCSS').addEventListener('click', () => {
    currentSelectorType = 'css';
    chrome.storage.local.set({ selectorType: 'css' });
    updateSelectorTypeUI();
  });
  
  document.getElementById('selectXPath').addEventListener('click', () => {
    currentSelectorType = 'xpath';
    chrome.storage.local.set({ selectorType: 'xpath' });
    updateSelectorTypeUI();
  });
  
  // 操作模式切换
  document.getElementById('selectHide').addEventListener('click', () => {
    currentRemoveMode = false;
    chrome.storage.local.set({ removeMode: false });
    updateRemoveModeUI();
  });
  
  document.getElementById('selectRemove').addEventListener('click', () => {
    currentRemoveMode = true;
    chrome.storage.local.set({ removeMode: true });
    updateRemoveModeUI();
  });
  
  // 开始选择元素
  document.getElementById('startPicker').addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(currentTab.id, { 
        action: 'startPicker',
        selectorType: currentSelectorType,
        removeMode: currentRemoveMode
      });
      window.close();
    } catch (e) {
      console.error('发送消息失败:', e);
      alert('无法启动选择器。请刷新页面后重试。');
    }
  });
  
  // 停止选择元素
  document.getElementById('stopPicker').addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(currentTab.id, { action: 'stopPicker' });
      showMessage('已停止选择模式');
    } catch (e) {
      console.error('发送消息失败:', e);
    }
  });
  
  // 查看规则
  document.getElementById('viewRules').addEventListener('click', () => {
    chrome.tabs.create({ url: 'rules.html' });
  });
  
  // 清除当前网站规则 (新增)
  document.getElementById('clearCurrentSite').addEventListener('click', async () => {
    const hostname = new URL(currentTab.url).hostname;
    
    chrome.storage.sync.get(['rules'], (result) => {
      const allRules = result.rules || {};
      const siteRules = allRules[hostname] || [];
      
      if (siteRules.length === 0) {
        showMessage('当前网站没有规则', 'info');
        return;
      }
      
      if (confirm(`⚠️ 确定要清除 ${hostname} 的所有规则吗？\n\n共 ${siteRules.length} 条规则将被删除。`)) {
        delete allRules[hostname];
        
        chrome.storage.sync.set({ rules: allRules }, () => {
          showMessage(`已清除 ${siteRules.length} 条规则`, 'success');
          loadStats();
          
          // 刷新页面以显示效果
          setTimeout(() => {
            chrome.tabs.reload(currentTab.id);
          }, 800);
        });
      }
    });
  });
  
  // 重新加载规则
  document.getElementById('reloadRules').addEventListener('click', async () => {
    try {
      await chrome.tabs.sendMessage(currentTab.id, { action: 'reloadRules' });
      await chrome.tabs.reload(currentTab.id);
      showMessage('规则已重新加载');
    } catch (e) {
      console.error('重新加载失败:', e);
    }
  });
  
  // 清除所有规则
  document.getElementById('clearAllRules').addEventListener('click', () => {
    if (confirm('⚠️ 确定要清除所有隐藏规则吗？\n\n此操作不可恢复，需要刷新页面才能看到效果。')) {
      chrome.storage.sync.clear(() => {
        showMessage('所有规则已清除');
        loadStats();
        setTimeout(() => {
          chrome.tabs.reload(currentTab.id);
        }, 500);
      });
    }
  });
}

function updateSelectorTypeUI() {
  const cssBtn = document.getElementById('selectCSS');
  const xpathBtn = document.getElementById('selectXPath');
  
  if (currentSelectorType === 'css') {
    cssBtn.classList.add('active');
    xpathBtn.classList.remove('active');
  } else {
    cssBtn.classList.remove('active');
    xpathBtn.classList.add('active');
  }
}

function updateRemoveModeUI() {
  const hideBtn = document.getElementById('selectHide');
  const removeBtn = document.getElementById('selectRemove');
  
  if (currentRemoveMode) {
    hideBtn.classList.remove('active');
    removeBtn.classList.add('active');
  } else {
    hideBtn.classList.add('active');
    removeBtn.classList.remove('active');
  }
}

function loadStats() {
  chrome.storage.sync.get(['rules'], (result) => {
    const allRules = result.rules || {};
    const hostname = new URL(currentTab.url).hostname;
    const siteRules = allRules[hostname] || [];
    
    let totalRules = 0;
    for (const site in allRules) {
      totalRules += allRules[site].length;
    }
    
    document.getElementById('totalRules').textContent = totalRules;
    document.getElementById('currentSiteRules').textContent = siteRules.length;
  });
}

function showMessage(message, type = 'success') {
  const info = document.querySelector('.info-box');
  const originalContent = info.innerHTML;
  
  const colors = {
    success: { bg: '#d4edda', border: '#28a745' },
    info: { bg: '#d1ecf1', border: '#17a2b8' },
    error: { bg: '#f8d7da', border: '#dc3545' }
  };
  
  const color = colors[type] || colors.success;
  
  info.innerHTML = `<strong>✓ ${message}</strong>`;
  info.style.background = color.bg;
  info.style.borderLeftColor = color.border;
  
  setTimeout(() => {
    info.innerHTML = originalContent;
    info.style.background = '#e6f3ff';
    info.style.borderLeftColor = '#667eea';
  }, 2000);
}