let currentSelectorType = 'css';
let currentRemoveMode = false;
let currentTab = null;

document.addEventListener('DOMContentLoaded', async () => {
  [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  loadStats();
  bindEvents();

  chrome.storage.local.get(['selectorType', 'removeMode', 'manualExpanded'], (result) => {
    if (result.selectorType) {
      currentSelectorType = result.selectorType;
      updateSelectorTypeUI();
    }
    if (result.removeMode !== undefined) {
      currentRemoveMode = result.removeMode;
      updateRemoveModeUI();
    }
    // 恢复折叠状态
    if (result.manualExpanded) {
      expandManualSection();
    }
  });
});

function bindEvents() {

  // 打开帮助页面
  document.getElementById('openHelp').addEventListener('click', () => {
    chrome.tabs.create({ url: 'help.html' });
  });

  // 选择器类型切换
  document.getElementById('selectCSS').addEventListener('click', () => {
    currentSelectorType = 'css';
    chrome.storage.local.set({ selectorType: 'css' });
    updateSelectorTypeUI();
    updateSelectorTypeLabel();
  });

  document.getElementById('selectXPath').addEventListener('click', () => {
    currentSelectorType = 'xpath';
    chrome.storage.local.set({ selectorType: 'xpath' });
    updateSelectorTypeUI();
    updateSelectorTypeLabel();
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

  // 折叠面板切换
  document.getElementById('manualToggle').addEventListener('click', () => {
    const content = document.getElementById('manualContent');
    const icon = document.querySelector('.collapsible-icon');
    const isExpanded = content.classList.contains('expanded');

    if (isExpanded) {
      content.classList.remove('expanded');
      icon.classList.add('collapsed');
      chrome.storage.local.set({ manualExpanded: false });
    } else {
      content.classList.add('expanded');
      icon.classList.remove('collapsed');
      chrome.storage.local.set({ manualExpanded: true });
    }
  });

  // 验证选择器
  document.getElementById('validateSelector').addEventListener('click', validateManualSelector);

  // 添加手动规则
  document.getElementById('addManualRule').addEventListener('click', addManualRule);

  // 输入框实时验证
  document.getElementById('manualSelector').addEventListener('input', () => {
    // 清除之前的验证状态
    hideValidationStatus();
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

  // 清除当前网站规则
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
    if (confirm('⚠️ 确定要清除所有隐藏规则吗？\n\n此操作不可恢复！')) {
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

// 展开手动输入部分
function expandManualSection() {
  const content = document.getElementById('manualContent');
  const icon = document.querySelector('.collapsible-icon');
  content.classList.add('expanded');
  icon.classList.remove('collapsed');
}

// 更新选择器类型标签
function updateSelectorTypeLabel() {
  const label = document.getElementById('selectorTypeLabel');
  label.textContent = currentSelectorType === 'xpath' ? '(XPath)' : '(CSS)';

  // 更新占位符
  const textarea = document.getElementById('manualSelector');
  if (currentSelectorType === 'xpath') {
    textarea.placeholder = '例如：//*[@id="aswift_3_host"]\n或：//div[@class="ad-container"]';
  } else {
    textarea.placeholder = '例如：#ad-banner\n或：.popup-overlay';
  }
}

// 验证手动输入的选择器
async function validateManualSelector() {
  const selector = document.getElementById('manualSelector').value.trim();

  if (!selector) {
    showValidationStatus('请输入选择器', 'invalid');
    return;
  }

  try {
    // 发送验证请求到当前页面
    const result = await chrome.tabs.sendMessage(currentTab.id, {
      action: 'validateSelector',
      selector: selector,
      type: currentSelectorType
    });

    if (result.valid) {
      if (result.count > 0) {
        showValidationStatus(`✓ 有效！找到 ${result.count} 个匹配元素`, 'valid');
      } else {
        showValidationStatus('✓ 选择器有效，但当前页面无匹配元素', 'info');
      }
    } else {
      showValidationStatus(`✗ 无效选择器: ${result.error}`, 'invalid');
    }
  } catch (e) {
    console.error('验证失败:', e);
    showValidationStatus('验证失败：无法连接到页面', 'invalid');
  }
}

// 添加手动规则
async function addManualRule() {
  const selector = document.getElementById('manualSelector').value.trim();
  const description = document.getElementById('manualDescription').value.trim();

  if (!selector) {
    showValidationStatus('请输入选择器', 'invalid');
    return;
  }

  const hostname = new URL(currentTab.url).hostname;

  // 创建规则对象
  const newRule = {
    id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
    selector: selector,
    type: currentSelectorType,
    enabled: true,
    removeMode: currentRemoveMode,
    createdAt: Date.now(),
    description: description || `手动添加: ${selector.substring(0, 30)}...`,
    tagName: 'manual',
    className: '',
    textContent: ''
  };

  // 保存规则
  chrome.storage.sync.get(['rules'], (result) => {
    const allRules = result.rules || {};
    const siteRules = allRules[hostname] || [];

    // 检查是否已存在
    const exists = siteRules.some(rule =>
      rule.selector === selector && rule.type === currentSelectorType
    );

    if (exists) {
      showValidationStatus('该规则已存在', 'invalid');
      return;
    }

    siteRules.push(newRule);
    allRules[hostname] = siteRules;

    chrome.storage.sync.set({ rules: allRules }, () => {
      if (chrome.runtime.lastError) {
        showValidationStatus('保存失败: ' + chrome.runtime.lastError.message, 'invalid');
        return;
      }

      showValidationStatus('✓ 规则已添加！', 'valid');
      loadStats();

      // 清空输入
      document.getElementById('manualSelector').value = '';
      document.getElementById('manualDescription').value = '';

      // 刷新页面应用规则
      setTimeout(() => {
        chrome.tabs.reload(currentTab.id);
      }, 1000);
    });
  });
}

// 显示验证状态
function showValidationStatus(message, type) {
  const status = document.getElementById('validationStatus');
  status.textContent = message;
  status.className = `validation-status ${type} show`;
}

// 隐藏验证状态
function hideValidationStatus() {
  const status = document.getElementById('validationStatus');
  status.className = 'validation-status';
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