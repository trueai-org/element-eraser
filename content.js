let isPickerActive = false;
let highlightedElement = null;
let overlay = null;
let rulesCache = {};
let mutationObserver = null;
let styleElement = null;
let retryIntervals = [];

// ============================================
// 检查扩展上下文是否有效
// ============================================
function isExtensionValid() {
  try {
    return chrome.runtime && chrome.runtime.id !== undefined;
  } catch (e) {
    return false;
  }
}

// ============================================
// 安全地访问 chrome.storage
// ============================================
function safeStorageGet(keys, callback) {
  if (!isExtensionValid()) {
    console.warn('[元素删除器] 扩展上下文已失效，跳过存储操作');
    return;
  }

  try {
    chrome.storage.local.get(keys, (result) => {
      if (chrome.runtime.lastError) {
        console.error('[元素删除器] 存储读取失败:', chrome.runtime.lastError);
        return;
      }
      callback(result);
    });
  } catch (e) {
    console.error('[元素删除器] 存储访问异常:', e);
  }
}

function safeStorageSet(data, callback) {
  if (!isExtensionValid()) {
    console.warn('[元素删除器] 扩展上下文已失效，跳过存储操作');
    return;
  }

  try {
    chrome.storage.local.set(data, () => {
      if (chrome.runtime.lastError) {
        console.error('[元素删除器] 存储写入失败:', chrome.runtime.lastError);
        if (callback) callback(false);
        return;
      }
      if (callback) callback(true);
    });
  } catch (e) {
    console.error('[元素删除器] 存储访问异常:', e);
    if (callback) callback(false);
  }
}

// ============================================
// 立即执行初始化
// ============================================
(function init() {
  if (!isExtensionValid()) {
    return;
  }

  // 静默检查当前站点是否有规则，无规则则不初始化
  const hostname = window.location.hostname;
  try {
    chrome.storage.local.get(['rules'], (result) => {
      if (chrome.runtime.lastError) return;
      const allRules = result.rules || {};
      const siteRules = allRules[hostname] || [];
      if (siteRules.length === 0) {
        return;
      }

      if (!isExtensionValid()) {
        console.warn('[元素删除器] 扩展上下文无效，停止初始化');
        return;
      }

      console.log('[元素删除器] 初始化 - URL:', window.location.href);

      // 立即应用规则
      loadAndApplyRules();

      // 启动DOM监听器
      startMutationObserver();

      // 定时重试（处理延迟加载的内容）
      startRetryIntervals();
    });
  } catch (e) {
    // 扩展上下文失效，静默退出
  }
})();

// ============================================
// 监听来自popup的消息
// ============================================
if (isExtensionValid()) {
  // chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  //   if (!isExtensionValid()) {
  //     console.warn('[元素删除器] 扩展上下文已失效');
  //     sendResponse({ status: 'error', message: 'Extension context invalidated' });
  //     return true;
  //   }

  //   if (request.action === 'startPicker') {
  //     startPicker(request.selectorType || 'css', request.removeMode || false);
  //     sendResponse({ status: 'started' });
  //   } else if (request.action === 'stopPicker') {
  //     stopPicker();
  //     sendResponse({ status: 'stopped' });
  //   } else if (request.action === 'reloadRules') {
  //     loadAndApplyRules();
  //     sendResponse({ status: 'reloaded' });
  //   }
  //   return true;
  // });

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (!isExtensionValid()) {
      console.warn('[元素删除器] 扩展上下文已失效');
      sendResponse({ status: 'error', message: 'Extension context invalidated' });
      return true;
    }

    if (request.action === 'startPicker') {
      startPicker(request.selectorType || 'css', request.removeMode || false);
      sendResponse({ status: 'started' });
    } else if (request.action === 'stopPicker') {
      stopPicker();
      sendResponse({ status: 'stopped' });
    } else if (request.action === 'reloadRules') {
      loadAndApplyRules();
      sendResponse({ status: 'reloaded' });
    } else if (request.action === 'validateSelector') {
      // 新增：验证选择器
      const result = validateSelectorOnPage(request.selector, request.type);
      sendResponse(result);
    }
    return true;
  });
}

// 新增：在页面上验证选择器
function validateSelectorOnPage(selector, type) {
  try {
    let elements = [];

    if (type === 'xpath') {
      elements = getElementsByXPath(selector);
    } else {
      elements = Array.from(document.querySelectorAll(selector));
    }

    return {
      valid: true,
      count: elements.length
    };
  } catch (e) {
    return {
      valid: false,
      error: e.message,
      count: 0
    };
  }
}

// ============================================
// 加载并应用规则（主函数）
// ============================================
function loadAndApplyRules() {
  if (!isExtensionValid()) {
    console.warn('[元素删除器] 扩展上下文已失效，跳过加载规则');
    return;
  }

  const hostname = window.location.hostname;

  safeStorageGet(['rules'], (result) => {
    const allRules = result.rules || {};
    const siteRules = allRules[hostname] || [];

    rulesCache[hostname] = siteRules;

    console.log(`[元素删除器] 加载 ${siteRules.length} 条规则`);

    if (siteRules.length > 0) {
      // 方法1: 直接隐藏/删除
      applyRulesToDOM(siteRules);

      // 方法2: 注入CSS样式（优先级更高）
      injectHideStyles(siteRules);
    }
  });
}

// ============================================
// 应用规则到DOM
// ============================================
function applyRulesToDOM(rules) {
  let hiddenCount = 0;
  let removedCount = 0;

  rules.forEach(rule => {
    if (!rule.enabled) return;

    try {
      let elements = [];

      // 根据类型查找元素
      if (rule.type === 'xpath') {
        elements = getElementsByXPath(rule.selector);
      } else {
        elements = Array.from(document.querySelectorAll(rule.selector));
      }

      elements.forEach(el => {
        if (!el || el.nodeType !== Node.ELEMENT_NODE) return;

        // 检查是否已处理过
        if (el.hasAttribute('data-element-remover-hidden')) return;

        // 根据规则的删除模式决定处理方式
        if (rule.removeMode) {
          // 直接删除元素
          el.remove();
          removedCount++;
        } else {
          // 隐藏元素（多种方式确保生效）
          hideElement(el);
          hiddenCount++;
        }
      });
    } catch (e) {
      console.error('[元素删除器] 规则应用失败:', rule.selector, e);
    }
  });

  if (hiddenCount > 0 || removedCount > 0) {
    console.log(`[元素删除器] 隐藏: ${hiddenCount}, 删除: ${removedCount}`);
  }
}

// ============================================
// 隐藏元素（多种方式）
// ============================================
function hideElement(element) {
  try {
    // 标记已处理
    element.setAttribute('data-element-remover-hidden', 'true');

    // 方式1: 设置内联样式（最高优先级）
    element.style.setProperty('display', 'none', 'important');
    element.style.setProperty('visibility', 'hidden', 'important');
    element.style.setProperty('opacity', '0', 'important');
    element.style.setProperty('pointer-events', 'none', 'important');
    element.style.setProperty('position', 'absolute', 'important');
    element.style.setProperty('left', '-9999px', 'important');

    // 方式2: 添加隐藏类
    element.classList.add('element-remover-hidden');

    // 方式3: 设置尺寸为0
    element.style.setProperty('width', '0', 'important');
    element.style.setProperty('height', '0', 'important');
    element.style.setProperty('overflow', 'hidden', 'important');
    element.style.setProperty('margin', '0', 'important');
    element.style.setProperty('padding', '0', 'important');
  } catch (e) {
    console.error('[元素删除器] 隐藏元素失败:', e);
  }
}

// ============================================
// 注入CSS样式（全局生效，优先级高）
// ============================================
function injectHideStyles(rules) {
  try {
    // 移除旧的样式
    if (styleElement && styleElement.parentNode) {
      styleElement.remove();
    }

    // 创建新的样式元素
    styleElement = document.createElement('style');
    styleElement.id = 'element-remover-styles';
    styleElement.setAttribute('type', 'text/css');

    let cssRules = [];

    // 为每个CSS选择器规则生成CSS
    rules.forEach(rule => {
      if (!rule.enabled || rule.type === 'xpath') return;

      const selector = rule.selector;

      // 添加多层隐藏样式
      cssRules.push(`
        ${selector} {
          display: none !important;
          visibility: hidden !important;
          opacity: 0 !important;
          pointer-events: none !important;
          position: absolute !important;
          left: -9999px !important;
          width: 0 !important;
          height: 0 !important;
          overflow: hidden !important;
          margin: 0 !important;
          padding: 0 !important;
        }
      `);
    });

    // 添加通用隐藏类
    cssRules.push(`
      .element-remover-hidden {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
      [data-element-remover-hidden="true"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
      }
    `);

    styleElement.textContent = cssRules.join('\n');

    // 尽早插入样式
    if (document.head) {
      document.head.appendChild(styleElement);
    } else {
      // 如果head还不存在，等待
      const observer = new MutationObserver(() => {
        if (document.head) {
          document.head.appendChild(styleElement);
          observer.disconnect();
        }
      });
      observer.observe(document.documentElement, { childList: true });
    }

    console.log('[元素删除器] CSS样式已注入');
  } catch (e) {
    console.error('[元素删除器] CSS注入失败:', e);
  }
}

// ============================================
// 启动DOM变化监听器
// ============================================
function startMutationObserver() {
  try {
    if (mutationObserver) {
      mutationObserver.disconnect();
    }

    mutationObserver = new MutationObserver((mutations) => {
      const hostname = window.location.hostname;
      const rules = rulesCache[hostname] || [];

      if (rules.length === 0) return;

      // 检查新添加的节点
      mutations.forEach(mutation => {
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === Node.ELEMENT_NODE) {
            // 对新节点应用规则
            applyRulesToElement(node, rules);

            // 检查新节点的子元素
            try {
              const children = node.querySelectorAll('*');
              children.forEach(child => {
                applyRulesToElement(child, rules);
              });
            } catch (e) {
              // 忽略查询错误
            }
          }
        });
      });
    });

    // 开始监听
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    console.log('[元素删除器] DOM监听器已启动');
  } catch (e) {
    console.error('[元素删除器] DOM监听器启动失败:', e);
  }
}

// ============================================
// 对单个元素应用规则
// ============================================
function applyRulesToElement(element, rules) {
  rules.forEach(rule => {
    if (!rule.enabled) return;

    try {
      let matches = false;

      if (rule.type === 'xpath') {
        // XPath匹配
        const xpath = rule.selector;
        const result = document.evaluate(
          xpath,
          element,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null
        );
        matches = result.singleNodeValue === element;
      } else {
        // CSS选择器匹配
        matches = element.matches(rule.selector);
      }

      if (matches) {
        if (rule.removeMode) {
          element.remove();
        } else {
          hideElement(element);
        }
      }
    } catch (e) {
      // 忽略匹配错误
    }
  });
}

// ============================================
// 定时重试（处理延迟加载）
// ============================================
function startRetryIntervals() {
  // 清除旧的定时器
  retryIntervals.forEach(id => clearTimeout(id));
  retryIntervals = [];

  // 在多个时间点重新应用规则
  const delays = [1000, 3000, 5000, 10000]; // 1s, 3s, 5s, 10s

  delays.forEach(delay => {
    const id = setTimeout(() => {
      if (!isExtensionValid()) return;
      console.log(`[元素删除器] 定时重试 (${delay}ms)`);
      loadAndApplyRules();
    }, delay);
    retryIntervals.push(id);
  });
}

// ============================================
// 通过XPath查找元素
// ============================================
function getElementsByXPath(xpath) {
  const result = [];
  try {
    const nodesSnapshot = document.evaluate(
      xpath,
      document,
      null,
      XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
      null
    );

    for (let i = 0; i < nodesSnapshot.snapshotLength; i++) {
      result.push(nodesSnapshot.snapshotItem(i));
    }
  } catch (e) {
    console.error('[元素删除器] XPath错误:', xpath, e);
  }
  return result;
}

// ============================================
// 开始选择元素
// ============================================
function startPicker(selectorType = 'css', removeMode = false) {
  if (isPickerActive) return;

  isPickerActive = true;
  window.currentSelectorType = selectorType;
  window.currentRemoveMode = removeMode;
  document.body.style.cursor = 'crosshair';

  createOverlay(selectorType, removeMode);

  document.addEventListener('mouseover', highlightElement, true);
  document.addEventListener('mouseout', unhighlightElement, true);
  document.addEventListener('click', selectElement, true);
  document.addEventListener('keydown', handleKeyPress, true);
}

// ============================================
// 停止选择元素
// ============================================
function stopPicker() {
  if (!isPickerActive) return;

  isPickerActive = false;
  document.body.style.cursor = '';

  if (overlay && overlay.parentNode) {
    overlay.remove();
    overlay = null;
  }

  document.removeEventListener('mouseover', highlightElement, true);
  document.removeEventListener('mouseout', unhighlightElement, true);
  document.removeEventListener('click', selectElement, true);
  document.removeEventListener('keydown', handleKeyPress, true);

  if (highlightedElement) {
    highlightedElement.style.outline = '';
    highlightedElement.style.boxShadow = '';
    highlightedElement = null;
  }
}

// ============================================
// 创建提示覆盖层
// ============================================
function createOverlay(selectorType, removeMode) {
  overlay = document.createElement('div');
  overlay.setAttribute('data-element-remover-overlay', 'true');

  const typeText = selectorType === 'xpath' ? 'XPath' : 'CSS选择器';
  const modeText = removeMode ? '删除' : '隐藏';
  const modeColor = removeMode ? '#f56565' : '#48bb78';

  // 使用 textContent 和 createElement 避免 CSP 问题
  overlay.style.cssText = `
    position: fixed !important;
    top: 10px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: rgba(0, 0, 0, 0.9) !important;
    color: white !important;
    padding: 15px 30px !important;
    border-radius: 8px !important;
    font-size: 14px !important;
    z-index: 2147483647 !important;
    pointer-events: none !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5) !important;
  `;

  // 创建内容元素（避免使用 innerHTML）
  const container = document.createElement('div');
  container.style.cssText = 'text-align: center;';

  const title = document.createElement('div');
  title.style.cssText = 'font-size: 16px; margin-bottom: 5px;';
  title.textContent = '🎯 元素选择模式';

  const info = document.createElement('div');
  info.style.cssText = 'font-size: 12px; opacity: 0.8;';
  info.textContent = `类型: ${typeText} | 模式: ${modeText} | ESC 退出`;

  container.appendChild(title);
  container.appendChild(info);
  overlay.appendChild(container);

  document.body.appendChild(overlay);
}

// ============================================
// 高亮元素
// ============================================
function highlightElement(e) {
  if (!isPickerActive) return;

  e.preventDefault();
  e.stopPropagation();

  // 不要高亮我们自己的覆盖层
  if (e.target.hasAttribute('data-element-remover-overlay')) return;

  if (highlightedElement) {
    highlightedElement.style.outline = '';
    highlightedElement.style.boxShadow = '';
  }

  highlightedElement = e.target;
  const removeMode = window.currentRemoveMode;
  const color = removeMode ? '#ff4444' : '#4444ff';

  highlightedElement.style.outline = `3px solid ${color}`;
  highlightedElement.style.boxShadow = `0 0 0 3px ${color}33`;

  // 更新覆盖层显示选择器
  if (overlay) {
    const selectorType = window.currentSelectorType || 'css';
    const selector = selectorType === 'xpath'
      ? generateXPath(highlightedElement)
      : generateCSSSelector(highlightedElement);

    const typeText = selectorType === 'xpath' ? 'XPath' : 'CSS选择器';
    const modeText = removeMode ? '删除' : '隐藏';

    // 清空并重新创建内容
    overlay.innerHTML = '';
    const container = document.createElement('div');
    container.style.cssText = 'text-align: center;';

    const title = document.createElement('div');
    title.style.cssText = 'font-size: 16px; margin-bottom: 5px;';
    title.textContent = '🎯 元素选择模式';

    const info = document.createElement('div');
    info.style.cssText = 'font-size: 12px; opacity: 0.8; margin-bottom: 8px;';
    info.textContent = `类型: ${typeText} | 模式: ${modeText} | ESC 退出`;

    const selectorBox = document.createElement('div');
    selectorBox.style.cssText = 'font-size: 11px; background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px; max-width: 600px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;';
    selectorBox.textContent = selector;

    container.appendChild(title);
    container.appendChild(info);
    container.appendChild(selectorBox);
    overlay.appendChild(container);
  }
}

// ============================================
// 取消高亮
// ============================================
function unhighlightElement(e) {
  if (!isPickerActive || !highlightedElement) return;

  if (e.target === highlightedElement) {
    e.target.style.outline = '';
    e.target.style.boxShadow = '';
  }
}

// ============================================
// 选择并删除/隐藏元素
// ============================================
function selectElement(e) {
  if (!isPickerActive) return;

  e.preventDefault();
  e.stopPropagation();

  const element = e.target;

  // 不要选择我们自己的覆盖层
  if (element.hasAttribute('data-element-remover-overlay')) return;

  if (element.tagName === 'BODY' || element.tagName === 'HTML') {
    showNotification('❌ 不能删除整个页面！', 'error');
    return;
  }

  const selectorType = window.currentSelectorType || 'css';
  const removeMode = window.currentRemoveMode || false;
  const selector = selectorType === 'xpath'
    ? generateXPath(element)
    : generateCSSSelector(element);

  // 立即处理元素
  if (removeMode) {
    element.remove();
  } else {
    hideElement(element);
  }

  // 保存规则
  saveRule(window.location.hostname, selector, selectorType, element, removeMode);

  const modeText = removeMode ? '删除' : '隐藏';
  showNotification(`✓ 元素已${modeText} (${selectorType.toUpperCase()})`, 'success');

  if (highlightedElement) {
    highlightedElement.style.outline = '';
    highlightedElement.style.boxShadow = '';
    highlightedElement = null;
  }
}

// ============================================
// 处理键盘事件
// ============================================
function handleKeyPress(e) {
  if (e.key === 'Escape') {
    stopPicker();
    showNotification('已退出选择模式', 'info');
  }
}

// ============================================
// 保存规则
// ============================================
function saveRule(hostname, selector, type, element, removeMode) {
  if (!isExtensionValid()) {
    console.warn('[元素删除器] 扩展上下文已失效，无法保存规则');
    showNotification('❌ 保存失败：扩展已重新加载', 'error');
    return;
  }

  safeStorageGet(['rules'], (result) => {
    const allRules = result.rules || {};
    const siteRules = allRules[hostname] || [];

    const exists = siteRules.some(rule =>
      rule.selector === selector && rule.type === type
    );

    if (exists) {
      console.log('[元素删除器] 规则已存在');
      return;
    }

    const newRule = {
      id: Date.now() + '_' + Math.random().toString(36).substr(2, 9),
      selector: selector,
      type: type,
      enabled: true,
      removeMode: removeMode,
      createdAt: Date.now(),
      description: generateRuleDescription(element),
      tagName: element.tagName.toLowerCase(),
      className: element.className || '',
      textContent: element.textContent?.substring(0, 50) || ''
    };

    siteRules.push(newRule);
    allRules[hostname] = siteRules;
    rulesCache[hostname] = siteRules;

    safeStorageSet({ rules: allRules }, (success) => {
      if (success) {
        console.log('[元素删除器] 规则已保存:', newRule);
        // 重新注入CSS
        injectHideStyles(siteRules);
      } else {
        showNotification('❌ 保存失败', 'error');
      }
    });
  });
}

// ============================================
// 生成规则描述
// ============================================
function generateRuleDescription(element) {
  const tag = element.tagName.toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = element.className ? `.${element.className.split(' ').join('.')}` : '';
  const text = element.textContent?.trim().substring(0, 30) || '';

  return `<${tag}${id}${classes}> ${text ? `"${text}..."` : ''}`;
}

// ============================================
// 显示通知
// ============================================
function showNotification(message, type = 'success') {
  const notification = document.createElement('div');
  notification.setAttribute('data-element-remover-notification', 'true');

  const colors = {
    success: 'rgba(76, 175, 80, 0.95)',
    error: 'rgba(244, 67, 54, 0.95)',
    info: 'rgba(33, 150, 243, 0.95)'
  };

  notification.style.cssText = `
    position: fixed !important;
    top: 70px !important;
    left: 50% !important;
    transform: translateX(-50%) !important;
    background: ${colors[type] || colors.success} !important;
    color: white !important;
    padding: 15px 30px !important;
    border-radius: 8px !important;
    font-size: 16px !important;
    z-index: 2147483647 !important;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
    box-shadow: 0 4px 20px rgba(0,0,0,0.3) !important;
    pointer-events: none !important;
  `;

  notification.textContent = message;
  document.body.appendChild(notification);

  // 使用 CSS 过渡而不是动画
  setTimeout(() => {
    notification.style.opacity = '1';
  }, 10);

  setTimeout(() => {
    notification.style.opacity = '0';
    setTimeout(() => {
      if (notification.parentNode) {
        notification.remove();
      }
    }, 300);
  }, 2500);
}

// ============================================
// 添加动画样式（避免 CSP 问题）
// ============================================
if (!document.getElementById('element-remover-animation-styles')) {
  const style = document.createElement('style');
  style.id = 'element-remover-animation-styles';
  style.setAttribute('type', 'text/css');
  style.textContent = `
    [data-element-remover-notification] {
      opacity: 0;
      transition: opacity 0.3s ease-out;
    }
  `;
  if (document.head) {
    document.head.appendChild(style);
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      if (document.head) {
        document.head.appendChild(style);
      }
    });
  }
}