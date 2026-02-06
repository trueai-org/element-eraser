// 工具函数库

// 生成CSS选择器
function generateCSSSelector(element) {
  // 优先使用 ID
  if (element.id) {
    return `#${element.id}`;
  }
  
  // 使用唯一的类名组合
  if (element.className && typeof element.className === 'string') {
    const classes = element.className.trim().split(/\s+/).filter(c => c);
    if (classes.length > 0) {
      const selector = `${element.tagName.toLowerCase()}.${classes.join('.')}`;
      if (document.querySelectorAll(selector).length === 1) {
        return selector;
      }
    }
  }
  
  // 生成完整路径
  const path = [];
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let selector = current.tagName.toLowerCase();
    
    if (current.id) {
      selector = `#${current.id}`;
      path.unshift(selector);
      break;
    }
    
    // 计算 nth-of-type
    let sibling = current;
    let nth = 1;
    
    while (sibling.previousElementSibling) {
      sibling = sibling.previousElementSibling;
      if (sibling.tagName === current.tagName) {
        nth++;
      }
    }
    
    // 检查是否有多个同类型兄弟元素
    const parent = current.parentElement;
    if (parent) {
      const siblings = Array.from(parent.children).filter(
        child => child.tagName === current.tagName
      );
      if (siblings.length > 1) {
        selector += `:nth-of-type(${nth})`;
      }
    }
    
    path.unshift(selector);
    current = current.parentElement;
    
    // 限制路径深度
    if (path.length >= 6) break;
  }
  
  return path.join(' > ');
}

// 生成XPath
function generateXPath(element) {
  if (element.id) {
    return `//*[@id="${element.id}"]`;
  }
  
  const path = [];
  let current = element;
  
  while (current && current.nodeType === Node.ELEMENT_NODE) {
    let index = 0;
    let sibling = current.previousSibling;
    
    while (sibling) {
      if (sibling.nodeType === Node.ELEMENT_NODE && sibling.nodeName === current.nodeName) {
        index++;
      }
      sibling = sibling.previousSibling;
    }
    
    const tagName = current.nodeName.toLowerCase();
    const pathIndex = index > 0 ? `[${index + 1}]` : '';
    path.unshift(`${tagName}${pathIndex}`);
    
    current = current.parentElement;
  }
  
  return '/' + path.join('/');
}

// 通过XPath查找元素
function getElementsByXPath(xpath) {
  const result = [];
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
  
  return result;
}

// 验证选择器
function validateSelector(selector, type = 'css') {
  try {
    if (type === 'css') {
      document.querySelectorAll(selector);
      return true;
    } else if (type === 'xpath') {
      document.evaluate(selector, document, null, XPathResult.ANY_TYPE, null);
      return true;
    }
  } catch (e) {
    return false;
  }
  return false;
}

// 格式化日期
function formatDate(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

// 获取域名
function getDomain(url) {
  try {
    return new URL(url).hostname;
  } catch (e) {
    return url;
  }
}