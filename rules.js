let allRules = {};
let editingRule = null;

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  loadRules();
  bindEvents();
});

// 绑定事件
function bindEvents() {
  // 搜索
  document.getElementById('searchInput').addEventListener('input', (e) => {
    filterRules(e.target.value);
  });
  
  // 导出规则
  document.getElementById('exportRules').addEventListener('click', exportRules);
  
  // 导入规则
  document.getElementById('importRules').addEventListener('click', () => {
    document.getElementById('fileInput').click();
  });
  
  document.getElementById('fileInput').addEventListener('change', importRules);
  
  // 清空所有规则
  document.getElementById('clearAll').addEventListener('click', clearAllRules);
  
  // 使用事件委托处理动态添加的按钮
  document.getElementById('rulesList').addEventListener('click', handleRuleListClick);
  
  // 模态框相关事件
  const editModal = document.getElementById('editModal');
  
  // 模态框外部点击关闭
  editModal.addEventListener('click', (e) => {
    if (e.target.id === 'editModal') {
      closeEditModal();
    }
  });
  
  // 关闭按钮
  document.getElementById('modalCloseBtn').addEventListener('click', closeEditModal);
  
  // 取消按钮
  document.getElementById('modalCancelBtn').addEventListener('click', closeEditModal);
  
  // 保存按钮
  document.getElementById('modalSaveBtn').addEventListener('click', saveEditedRule);
  
  // ESC 键关闭模态框
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && editModal.classList.contains('show')) {
      closeEditModal();
    }
  });
  
  // 选择器类型改变时更新提示
  document.getElementById('editType').addEventListener('change', updateSelectorHelper);
}

// 处理规则列表中的点击事件（事件委托）
function handleRuleListClick(e) {
  const target = e.target;
  
  // 删除网站所有规则
  if (target.classList.contains('delete-site-btn') || target.closest('.delete-site-btn')) {
    const btn = target.classList.contains('delete-site-btn') ? target : target.closest('.delete-site-btn');
    const hostname = btn.dataset.hostname;
    deleteSite(hostname);
    return;
  }
  
  // 切换规则启用状态
  if (target.classList.contains('toggle-rule-btn') || target.closest('.toggle-rule-btn')) {
    const btn = target.classList.contains('toggle-rule-btn') ? target : target.closest('.toggle-rule-btn');
    const hostname = btn.dataset.hostname;
    const ruleId = btn.dataset.ruleId;
    toggleRule(hostname, ruleId);
    return;
  }
  
  // 编辑规则
  if (target.classList.contains('edit-rule-btn') || target.closest('.edit-rule-btn')) {
    const btn = target.classList.contains('edit-rule-btn') ? target : target.closest('.edit-rule-btn');
    const hostname = btn.dataset.hostname;
    const ruleId = btn.dataset.ruleId;
    openEditModal(hostname, ruleId);
    return;
  }
  
  // 删除单条规则
  if (target.classList.contains('delete-rule-btn') || target.closest('.delete-rule-btn')) {
    const btn = target.classList.contains('delete-rule-btn') ? target : target.closest('.delete-rule-btn');
    const hostname = btn.dataset.hostname;
    const ruleId = btn.dataset.ruleId;
    deleteRule(hostname, ruleId);
    return;
  }
}

// 加载规则
function loadRules() {
  chrome.storage.local.get(['rules'], (result) => {
    allRules = result.rules || {};
    displayRules();
    updateStats();
  });
}

// 显示规则
function displayRules() {
  const container = document.getElementById('rulesList');
  container.innerHTML = '';
  
  const sites = Object.keys(allRules);
  
  if (sites.length === 0) {
    container.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon">📭</div>
        <div class="empty-state-text">还没有任何规则</div>
        <p style="margin-top: 10px; color: #adb5bd;">开始在网页上删除元素来创建规则</p>
      </div>
    `;
    return;
  }
  
  sites.sort().forEach(hostname => {
    const siteRules = allRules[hostname];
    if (!siteRules || siteRules.length === 0) return;
    
    const siteSection = createSiteSection(hostname, siteRules);
    container.appendChild(siteSection);
  });
}

// 创建网站区块
function createSiteSection(hostname, rules) {
  const section = document.createElement('div');
  section.className = 'site-section';
  section.dataset.hostname = hostname;
  
  const enabledCount = rules.filter(r => r.enabled).length;
  
  section.innerHTML = `
    <div class="site-header">
      <div class="site-name">
        <span>🌐 ${escapeHtml(hostname)}</span>
        <span class="site-badge">${rules.length} 条规则</span>
      </div>
      <button class="btn btn-danger btn-sm delete-site-btn" data-hostname="${escapeHtml(hostname)}">
        🗑️ 删除网站所有规则
      </button>
    </div>
    <div class="rule-list"></div>
  `;
  
  const ruleList = section.querySelector('.rule-list');
  
  rules.forEach(rule => {
    const ruleItem = createRuleItem(hostname, rule);
    ruleList.appendChild(ruleItem);
  });
  
  return section;
}

// 创建规则项
function createRuleItem(hostname, rule) {
  const item = document.createElement('div');
  item.className = 'rule-item' + (rule.enabled ? '' : ' disabled');
  item.dataset.ruleId = rule.id;
  
  const createdDate = new Date(rule.createdAt).toLocaleString('zh-CN');
  const modeText = rule.removeMode ? '删除' : '隐藏';
  const modeClass = rule.removeMode ? '' : 'hide';
  
  item.innerHTML = `
    <div class="rule-header">
      <div class="rule-info">
        <div>
          <span class="rule-type ${rule.type}">${rule.type.toUpperCase()}</span>
          <span class="rule-mode ${modeClass}">${modeText}</span>
        </div>
        <div class="rule-selector">${escapeHtml(rule.selector)}</div>
        <div class="rule-desc">${escapeHtml(rule.description || '')}</div>
        <div class="rule-meta">
          创建于: ${createdDate}
          ${rule.tagName ? ` | 标签: <${rule.tagName}>` : ''}
          ${rule.className ? ` | 类: .${rule.className.split(' ').join('.')}` : ''}
        </div>
      </div>
      <div class="rule-actions">
        <button class="rule-btn rule-btn-toggle ${rule.enabled ? '' : 'disabled'} toggle-rule-btn" 
                data-hostname="${escapeHtml(hostname)}" 
                data-rule-id="${rule.id}">
          ${rule.enabled ? '✓ 启用' : '✗ 禁用'}
        </button>
        <button class="rule-btn rule-btn-edit edit-rule-btn" 
                data-hostname="${escapeHtml(hostname)}" 
                data-rule-id="${rule.id}">
          ✏️ 编辑
        </button>
        <button class="rule-btn rule-btn-delete delete-rule-btn" 
                data-hostname="${escapeHtml(hostname)}" 
                data-rule-id="${rule.id}">
          🗑️ 删除
        </button>
      </div>
    </div>
  `;
  
  return item;
}

// 更新统计
function updateStats() {
  const sites = Object.keys(allRules);
  let totalRules = 0;
  let activeRules = 0;
  
  sites.forEach(site => {
    const rules = allRules[site] || [];
    totalRules += rules.length;
    activeRules += rules.filter(r => r.enabled).length;
  });
  
  document.getElementById('totalSites').textContent = sites.length;
  document.getElementById('totalRules').textContent = totalRules;
  document.getElementById('activeRules').textContent = activeRules;
}

// 打开编辑模态框
function openEditModal(hostname, ruleId) {
  const rules = allRules[hostname];
  if (!rules) return;
  
  const rule = rules.find(r => r.id === ruleId);
  if (!rule) return;
  
  // 保存编辑信息
  editingRule = {
    hostname: hostname,
    ruleId: ruleId,
    originalRule: { ...rule }
  };
  
  // 填充表单
  document.getElementById('editType').value = rule.type;
  document.getElementById('editSelector').value = rule.selector;
  document.getElementById('editDescription').value = rule.description || '';
  document.getElementById('editRemoveMode').checked = rule.removeMode || false;
  document.getElementById('editEnabled').checked = rule.enabled;
  
  // 更新提示文字
  updateSelectorHelper();
  
  // 清空验证消息
  hideValidationMessage();
  
  // 显示模态框
  document.getElementById('editModal').classList.add('show');
}

// 关闭编辑模态框
function closeEditModal() {
  document.getElementById('editModal').classList.remove('show');
  editingRule = null;
  
  // 清空验证消息
  hideValidationMessage();
}

// 保存编辑后的规则
function saveEditedRule() {
  if (!editingRule) return;
  
  const hostname = editingRule.hostname;
  const ruleId = editingRule.ruleId;
  
  // 获取表单数据
  const newType = document.getElementById('editType').value;
  const newSelector = document.getElementById('editSelector').value.trim();
  const newDescription = document.getElementById('editDescription').value.trim();
  const newRemoveMode = document.getElementById('editRemoveMode').checked;
  const newEnabled = document.getElementById('editEnabled').checked;
  
  // 验证选择器
  if (!newSelector) {
    showValidationMessage('请输入选择器', 'error');
    return;
  }
  
  // 基本语法验证
  if (!validateSelectorSyntax(newSelector, newType)) {
    showValidationMessage('选择器语法可能有误，请检查', 'error');
    return;
  }
  
  const rules = allRules[hostname];
  if (!rules) return;
  
  const ruleIndex = rules.findIndex(r => r.id === ruleId);
  if (ruleIndex === -1) return;
  
  // 检查是否与其他规则重复
  const isDuplicate = rules.some((r, index) => 
    index !== ruleIndex && 
    r.selector === newSelector && 
    r.type === newType
  );
  
  if (isDuplicate) {
    showValidationMessage('该选择器已存在于其他规则中', 'error');
    return;
  }
  
  // 更新规则
  const updatedRule = {
    ...rules[ruleIndex],
    type: newType,
    selector: newSelector,
    description: newDescription || rules[ruleIndex].description,
    removeMode: newRemoveMode,
    enabled: newEnabled,
    updatedAt: Date.now()
  };
  
  rules[ruleIndex] = updatedRule;
  allRules[hostname] = rules;
  
  // 保存到存储
  saveRules(() => {
    showToast('规则已更新', 'success');
    closeEditModal();
    loadRules();
  });
}

// 验证选择器语法
function validateSelectorSyntax(selector, type) {
  try {
    if (type === 'css') {
      // CSS 选择器基本验证
      if (!selector || selector.trim() === '') {
        return false;
      }
      return true;
    } else if (type === 'xpath') {
      // XPath 基本验证
      if (!selector.startsWith('/') && !selector.startsWith('(')) {
        return false;
      }
      return true;
    }
  } catch (e) {
    return false;
  }
  return true;
}

// 更新选择器提示
function updateSelectorHelper() {
  const type = document.getElementById('editType').value;
  const helper = document.getElementById('editSelectorHelper');
  
  if (type === 'xpath') {
    helper.innerHTML = `
      <strong>XPath 示例:</strong><br>
      //*[@id="aswift_3_host"]<br>
      //div[@class="ad-container"]<br>
      //iframe[contains(@src, 'doubleclick')]
    `;
  } else {
    helper.innerHTML = `
      <strong>CSS 示例:</strong><br>
      #ad-banner<br>
      .popup-overlay<br>
      div[data-ad="true"]
    `;
  }
}

// 显示验证消息
function showValidationMessage(message, type) {
  const msg = document.getElementById('editValidationMessage');
  msg.textContent = message;
  msg.className = `validation-message ${type} show`;
}

// 隐藏验证消息
function hideValidationMessage() {
  const msg = document.getElementById('editValidationMessage');
  msg.className = 'validation-message';
}

// 切换规则启用状态
function toggleRule(hostname, ruleId) {
  const rules = allRules[hostname];
  if (!rules) return;
  
  const rule = rules.find(r => r.id === ruleId);
  
  if (rule) {
    rule.enabled = !rule.enabled;
    saveRules(() => {
      loadRules();
      showToast(rule.enabled ? '规则已启用' : '规则已禁用', 'success');
    });
  }
}

// 删除规则
function deleteRule(hostname, ruleId) {
  if (!confirm('确定要删除这条规则吗？')) return;
  
  const rules = allRules[hostname];
  if (!rules) return;
  
  const index = rules.findIndex(r => r.id === ruleId);
  
  if (index !== -1) {
    rules.splice(index, 1);
    
    if (rules.length === 0) {
      delete allRules[hostname];
    }
    
    saveRules(() => {
      loadRules();
      showToast('规则已删除', 'success');
    });
  }
}

// 删除网站所有规则
function deleteSite(hostname) {
  const rules = allRules[hostname];
  if (!rules) return;
  
  if (!confirm(`确定要删除 ${hostname} 的所有规则吗？\n\n共 ${rules.length} 条规则将被删除。`)) {
    return;
  }
  
  delete allRules[hostname];
  saveRules(() => {
    loadRules();
    showToast(`已删除 ${hostname} 的所有规则`, 'success');
  });
}

// 清空所有规则
function clearAllRules() {
  if (!confirm('⚠️ 确定要清空所有规则吗？\n\n此操作不可恢复！')) return;
  
  chrome.storage.local.remove(['rules'], () => {
    allRules = {};
    loadRules();
    showToast('所有规则已清空', 'success');
  });
}

// 保存规则
function saveRules(callback) {
  chrome.storage.local.set({ rules: allRules }, () => {
    if (chrome.runtime.lastError) {
      showToast('保存失败: ' + chrome.runtime.lastError.message, 'error');
    } else if (callback) {
      callback();
    }
  });
}

// 导出规则
function exportRules() {
  const dataStr = JSON.stringify(allRules, null, 2);
  const blob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement('a');
  a.href = url;
  a.download = `element-eraser-rules-${Date.now()}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  showToast('规则已导出', 'success');
}

// 导入规则
function importRules(event) {
  const file = event.target.files[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const imported = JSON.parse(e.target.result);
      
      if (!imported || typeof imported !== 'object') {
        showToast('导入失败：文件格式错误', 'error');
        return;
      }
      
      if (confirm('导入规则将与现有规则合并。是否继续？')) {
        for (const hostname in imported) {
          if (!allRules[hostname]) {
            allRules[hostname] = [];
          }
          
          const existingSelectors = new Set(
            allRules[hostname].map(r => r.selector + r.type)
          );
          
          imported[hostname].forEach(rule => {
            const key = rule.selector + rule.type;
            if (!existingSelectors.has(key)) {
              allRules[hostname].push(rule);
            }
          });
        }
        
        saveRules(() => {
          loadRules();
          showToast('规则导入成功！', 'success');
        });
      }
    } catch (err) {
      showToast('导入失败：' + err.message, 'error');
    }
  };
  reader.readAsText(file);
  event.target.value = '';
}

// 过滤规则
function filterRules(query) {
  const sections = document.querySelectorAll('.site-section');
  query = query.toLowerCase();
  
  if (!query) {
    sections.forEach(section => {
      section.style.display = '';
      const rules = section.querySelectorAll('.rule-item');
      rules.forEach(rule => rule.style.display = '');
    });
    return;
  }
  
  sections.forEach(section => {
    const hostname = section.dataset.hostname.toLowerCase();
    const rules = section.querySelectorAll('.rule-item');
    let hasVisibleRule = false;
    
    rules.forEach(rule => {
      const selector = rule.querySelector('.rule-selector').textContent.toLowerCase();
      const desc = rule.querySelector('.rule-desc').textContent.toLowerCase();
      
      if (hostname.includes(query) || selector.includes(query) || desc.includes(query)) {
        rule.style.display = '';
        hasVisibleRule = true;
      } else {
        rule.style.display = 'none';
      }
    });
    
    section.style.display = (hasVisibleRule || hostname.includes(query)) ? '' : 'none';
  });
}

// 显示Toast通知
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  const icon = document.getElementById('toastIcon');
  const msg = document.getElementById('toastMessage');
  
  const icons = {
    success: '✓',
    error: '✗',
    info: 'ℹ'
  };
  
  icon.textContent = icons[type] || icons.success;
  msg.textContent = message;
  
  toast.className = `toast ${type} show`;
  
  setTimeout(() => {
    toast.style.animation = 'slideOutRight 0.3s ease-out';
    setTimeout(() => {
      toast.className = 'toast';
      toast.style.animation = '';
    }, 300);
  }, 3000);
}

// HTML转义
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}