(function () {
    'use strict';

    // ========== 常量定义 ==========
    var API_URL = 'https://api.deepseek.com/v1/chat/completions';
    var PRICE_MAP = {
        'deepseek-v4-flash': { input: 1, output: 2 },
        'deepseek-v4-pro': { input: 3, output: 6 }
    };
    var TOKEN_ESTIMATE_ENGLISH = 0.3;
    var TOKEN_ESTIMATE_CHINESE = 0.6;

    // ========== DOM 元素缓存 ==========
    var dom = {};

    function initializeDomReferences() {
        var elementIds = [
            'sidebar', 'messageList', 'messageArea', 'messageInput',
            'charCount', 'btnSend', 'welcomeScreen', 'sessionList',
            'sessionTitle', 'modeSwitch', 'deepThinking', 'btnSettings',
            'settingsModal', 'btnCloseSettings', 'apiKeyInput',
            'btnTogglePassword', 'temperatureSlider', 'tempDisplay',
            'btnSaveSettings', 'btnMDRules', 'mdRulesModal',
            'btnCloseMDRules', 'mdRulesInput', 'mdRulesEnabled',
            'btnSaveMDRules', 'toastContainer', 'usageInline',
            'configIndicator', 'btnNewSession', 'btnToggleSidebar',
            'quickActions', 'btnExportConfig', 'btnImportConfig'
        ];
        for (var i = 0; i < elementIds.length; i++) {
            dom[elementIds[i]] = document.getElementById(elementIds[i]);
        }
    }

    // ========== 应用状态 ==========
    var applicationState = {
        config: { apiKey: '', temperature: 0.7, mode: 'flash', thinking: false },
        customRules: { enabled: true, content: '' },
        sessions: [],
        activeSessionId: null,
        usage: { inputTokens: 0, outputTokens: 0, totalCost: 0 },
        isRequestInProgress: false,
        abortController: null,
        dotAnimationTimer: null,
        dotAnimationCounter: 0
    };

    // ========== 初始化 ==========
    function initializeApplication() {
        initializeDomReferences();
        loadAllDataFromStorage();
        bindAllEventHandlers();
        renderSessionList();
        activateCurrentSession();
        updateConfigIndicator();
        updateUsageDisplay();
        if (!applicationState.config.apiKey) {
            openSettingsModal();
            showToastMessage('请配置 API Key', 'warning');
        }
    }

    // ========== 数据持久化 ==========
    function loadAllDataFromStorage() {
        applicationState.config = loadJsonFromStorage('ds_v4_config', { apiKey: '', temperature: 0.7, mode: 'flash', thinking: false });
        applicationState.customRules = loadJsonFromStorage('ds_v4_mdrules', { enabled: true, content: '' });
        applicationState.sessions = loadJsonFromStorage('ds_v4_sessions', []);
        var savedActiveId = localStorage.getItem('ds_v4_active');
        if (savedActiveId && sessionExistsById(savedActiveId)) {
            applicationState.activeSessionId = savedActiveId;
        } else if (applicationState.sessions.length > 0) {
            applicationState.activeSessionId = applicationState.sessions[0].id;
        }
        applicationState.usage = { inputTokens: 0, outputTokens: 0, totalCost: 0 };
        synchronizeUiWithState();
    }

    function saveAllDataToStorage() {
        localStorage.setItem('ds_v4_config', JSON.stringify(applicationState.config));
        localStorage.setItem('ds_v4_mdrules', JSON.stringify(applicationState.customRules));
        localStorage.setItem('ds_v4_sessions', JSON.stringify(applicationState.sessions));
        if (applicationState.activeSessionId) {
            localStorage.setItem('ds_v4_active', applicationState.activeSessionId);
        } else {
            localStorage.removeItem('ds_v4_active');
        }
    }

    function loadJsonFromStorage(storageKey, defaultValue) {
        try {
            var rawData = localStorage.getItem(storageKey);
            return rawData ? JSON.parse(rawData) : defaultValue;
        } catch (parseError) {
            return defaultValue;
        }
    }

    function sessionExistsById(sessionId) {
        for (var i = 0; i < applicationState.sessions.length; i++) {
            if (applicationState.sessions[i].id === sessionId) return true;
        }
        return false;
    }

    function synchronizeUiWithState() {
        dom.apiKeyInput.value = applicationState.config.apiKey;
        dom.temperatureSlider.value = applicationState.config.temperature;
        dom.tempDisplay.textContent = applicationState.config.temperature;
        dom.deepThinking.checked = applicationState.config.thinking;
        dom.mdRulesInput.value = applicationState.customRules.content;
        dom.mdRulesEnabled.checked = applicationState.customRules.enabled;
        refreshModeButtonState();
        refreshThinkingToggleState();
    }

    // ========== 会话管理 ==========
    function createNewSession() {
        var sessionId = 'session_' + Date.now();
        var newSession = { id: sessionId, title: '新对话', messages: [], usage: { inputTokens: 0, outputTokens: 0, totalCost: 0 }, createdAt: new Date().toISOString() };
        applicationState.sessions.unshift(newSession);
        applicationState.activeSessionId = sessionId;
        saveAllDataToStorage();
        renderSessionList();
        activateCurrentSession();
    }

    function deleteSessionById(sessionId, domEvent) {
        domEvent.stopPropagation();
        var filteredSessions = [];
        for (var i = 0; i < applicationState.sessions.length; i++) {
            if (applicationState.sessions[i].id !== sessionId) {
                filteredSessions.push(applicationState.sessions[i]);
            }
        }
        applicationState.sessions = filteredSessions;
        if (applicationState.activeSessionId === sessionId) {
            applicationState.activeSessionId = applicationState.sessions.length > 0 ? applicationState.sessions[0].id : null;
        }
        saveAllDataToStorage();
        renderSessionList();
        activateCurrentSession();
        showToastMessage('对话已删除');
    }

    function renderSessionList() {
        dom.sessionList.innerHTML = '';
        for (var i = 0; i < applicationState.sessions.length; i++) {
            var session = applicationState.sessions[i];
            var isActive = session.id === applicationState.activeSessionId;
            dom.sessionList.appendChild(createSessionListItem(session, isActive));
        }
    }

    function createSessionListItem(session, isActive) {
        var listItem = document.createElement('div');
        listItem.className = 'session-item' + (isActive ? ' active' : '');
        var titleSpan = document.createElement('span');
        titleSpan.className = 'session-item-title';
        titleSpan.textContent = escapeHtml(session.title);
        listItem.appendChild(titleSpan);
        var deleteButton = document.createElement('button');
        deleteButton.className = 'session-item-del';
        deleteButton.innerHTML = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/></svg>';
        deleteButton.setAttribute('aria-label', '删除对话');
        deleteButton.addEventListener('click', function (event) { deleteSessionById(session.id, event); });
        listItem.appendChild(deleteButton);
        listItem.addEventListener('click', function () {
            applicationState.activeSessionId = session.id;
            saveAllDataToStorage();
            renderSessionList();
            activateCurrentSession();
            updateUsageDisplay();
        });
        return listItem;
    }

    function activateCurrentSession() {
        var currentSession = findSessionById(applicationState.activeSessionId);
        if (!currentSession) {
            dom.messageList.innerHTML = '';
            dom.welcomeScreen.style.display = 'flex';
            dom.sessionTitle.textContent = '新对话';
            return;
        }
        applicationState.usage = currentSession.usage || { inputTokens: 0, outputTokens: 0, totalCost: 0 };
        dom.messageList.innerHTML = '';
        updateUsageDisplay();
        if (currentSession.messages.length === 0) {
            dom.welcomeScreen.style.display = 'flex';
            dom.sessionTitle.textContent = '新对话';
        } else {
            dom.welcomeScreen.style.display = 'none';
            dom.sessionTitle.textContent = currentSession.title;
            for (var i = 0; i < currentSession.messages.length; i++) {
                var msg = currentSession.messages[i];
                appendMessageToChat(msg.role, msg.content, msg.thinking);
            }
        }
        scrollToBottom();
    }

    function findSessionById(sessionId) {
        if (!sessionId) return null;
        for (var i = 0; i < applicationState.sessions.length; i++) {
            if (applicationState.sessions[i].id === sessionId) return applicationState.sessions[i];
        }
        return null;
    }

    function updateCurrentSessionTitle() {
        var currentSession = findSessionById(applicationState.activeSessionId);
        if (!currentSession || currentSession.title !== '新对话') return;
        if (currentSession.messages.length < 1) return;
        var firstMsg = currentSession.messages[0];
        var maxLength = 30;
        var newTitle = firstMsg.content.slice(0, maxLength);
        if (firstMsg.content.length > maxLength) newTitle += '...';
        currentSession.title = newTitle;
        dom.sessionTitle.textContent = newTitle;
        saveAllDataToStorage();
        renderSessionList();
    }

    // ========== 消息渲染 ==========
    function appendMessageToChat(role, content, thinkingContent) {
        var messageContainer = document.createElement('div');
        messageContainer.className = 'message ' + role;
        messageContainer.appendChild(buildAvatarElement(role));

        var bodyWrapper = document.createElement('div');
        bodyWrapper.className = 'msg-body-wrapper';

        if (role === 'assistant' && thinkingContent) {
            bodyWrapper.appendChild(buildThinkingBlockElement(thinkingContent));
        }

        var bodyElement = document.createElement('div');
        bodyElement.className = 'msg-body';
        bodyElement.innerHTML = formatMessageContent(content);
        bodyWrapper.appendChild(bodyElement);
        messageContainer.appendChild(bodyWrapper);

        attachCodeBlockCopyButtons(bodyElement);
        dom.messageList.appendChild(messageContainer);
        scrollToBottom();
        return messageContainer;
    }

    function buildThinkingBlockElement(thinkingContent) {
        var block = document.createElement('div');
        block.className = 'think-block';
        var label = document.createElement('div');
        label.className = 'think-label';
        label.textContent = '深度思考过程';
        block.appendChild(label);
        var content = document.createElement('div');
        content.className = 'think-content';
        content.textContent = thinkingContent;
        block.appendChild(content);
        return block;
    }

    function buildAvatarElement(role) {
        var avatar = document.createElement('div');
        avatar.className = 'msg-avatar';
        avatar.textContent = role === 'user' ? 'You' : 'DS';
        return avatar;
    }

    function formatMessageContent(rawText) {
        var text = escapeHtml(rawText);
        text = text.replace(/```(\w*)\n?([\s\S]*?)```/g, function (match, language, codeContent) {
            var trimmedCode = codeContent.replace(/\n$/, '');
            var detectedLang = language || detectProgrammingLanguage(trimmedCode);
            return buildCodeBlockHtml(detectedLang, escapeHtmlPreservingEntities(trimmedCode));
        });
        text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
        text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        text = text.replace(/\n/g, '<br>');
        return text;
    }

    function buildCodeBlockHtml(language, codeContent) {
        var langLabel = language || 'code';
        var escapedCode = escapeHtml(codeContent);
        var headerHtml = '<div class="code-block-header">' +
            '<span class="code-block-lang">' + escapeHtml(langLabel) + '</span>' +
            '<button class="code-block-copy" aria-label="复制代码" data-code="' + escapeHtmlAttr(codeContent) + '">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
            '<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>' +
            '</svg>复制</button></div>';
        return '<div class="code-block-wrapper">' + headerHtml +
            '<pre><code class="language-' + escapeHtml(langLabel) + '">' + escapedCode + '</code></pre></div>';
    }

    function detectProgrammingLanguage(codeContent) {
        var trimmed = codeContent.trim();
        if (/^\s*function\s+|^\s*const\s+|^\s*let\s+|^\s*var\s+|^\s*=>\s*/.test(trimmed)) return 'javascript';
        if (/^\s*import\s+.*from\s+['"]|^\s*export\s+/.test(trimmed)) return 'javascript';
        if (/^\s*def\s+\w+\s*\(|^\s*class\s+\w+.*:/.test(trimmed)) return 'python';
        if (/^\s*public\s+class|^\s*private\s+|^\s*protected\s+/.test(trimmed)) return 'java';
        if (/^\s*package\s+\w+|^\s*func\s+\w+\s*\(/.test(trimmed)) return 'go';
        if (/^\s*#include|^\s*int\s+main\s*\(/.test(trimmed)) return 'cpp';
        if (/^\s*SELECT\s+|^\s*CREATE\s+TABLE|^\s*INSERT\s+INTO/i.test(trimmed)) return 'sql';
        if (/^\s*\{[^}]*\}|^\s*\[[^\]]*\]/.test(trimmed) && /"[^"]*"\s*:/.test(trimmed)) return 'json';
        if (/^\s*<[a-zA-Z]/.test(trimmed)) return 'html';
        if (/^\s*[.#][\w-]+\s*\{/.test(trimmed)) return 'css';
        return 'plaintext';
    }

    function attachCodeBlockCopyButtons(messageBody) {
        var copyButtons = messageBody.querySelectorAll('.code-block-copy');
        for (var i = 0; i < copyButtons.length; i++) {
            copyButtons[i].addEventListener('click', function (event) {
                var button = event.currentTarget;
                var codeElement = button.closest('.code-block-wrapper').querySelector('code');
                var originalCode = extractPlainTextFromCodeElement(codeElement);
                copyTextToClipboard(originalCode, button);
            });
        }
    }

/**
 * 从高亮代码元素中提取保留缩进的纯文本
 * 解码 HTML 实体并移除高亮 span 标签
 */
    function extractPlainTextFromCodeElement(codeElement) {
        var clonedNode = codeElement.cloneNode(true);
        var highlightSpans = clonedNode.querySelectorAll('span[class^="hl-"]');
        for (var i = 0; i < highlightSpans.length; i++) {
            var span = highlightSpans[i];
            var textNode = document.createTextNode(span.textContent);
            span.parentNode.replaceChild(textNode, span);
        }
        var htmlText = clonedNode.innerHTML;
        htmlText = htmlText.replace(/<br\s*\/?>/gi, '\n');
        var tempDiv = document.createElement('div');
        tempDiv.innerHTML = htmlText;
        return tempDiv.textContent;
    }

    function copyTextToClipboard(text, buttonElement) {
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(function () {
                showCopySuccessFeedback(buttonElement);
            }).catch(function () {
                fallbackCopyToClipboard(text, buttonElement);
            });
        } else {
            fallbackCopyToClipboard(text, buttonElement);
        }
    }

    function fallbackCopyToClipboard(text, buttonElement) {
        var textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.style.position = 'fixed';
        textArea.style.left = '-9999px';
        textArea.style.top = '-9999px';
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        try {
            var successful = document.execCommand('copy');
            if (successful) showCopySuccessFeedback(buttonElement);
        } catch (error) {
            // 静默处理
        }
        document.body.removeChild(textArea);
    }

    function showCopySuccessFeedback(buttonElement) {
        var originalHtml = buttonElement.innerHTML;
        buttonElement.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>已复制';
        buttonElement.classList.add('copied');
        setTimeout(function () {
            buttonElement.innerHTML = originalHtml;
            buttonElement.classList.remove('copied');
        }, 2000);
    }

    // ========== 流式响应 ==========
    function showTypingIndicator() {
        removeStreamingElements();
        applicationState.dotAnimationCounter = 0;
        var dotsContainer = document.createElement('div');
        dotsContainer.className = 'message assistant';
        dotsContainer.id = 'typingIndicator';
        dotsContainer.appendChild(buildAvatarElement('assistant'));
        var bubble = document.createElement('div');
        bubble.className = 'msg-body';
        bubble.id = 'typingBubble';
        dotsContainer.appendChild(bubble);
        dom.messageList.appendChild(dotsContainer);
        animateTypingDots(bubble);
        applicationState.dotAnimationTimer = setInterval(function () { animateTypingDots(bubble); }, 400);
        scrollToBottom();
    }

    function animateTypingDots(bubble) {
        applicationState.dotAnimationCounter = (applicationState.dotAnimationCounter + 1) % 4;
        var dots = '';
        for (var i = 0; i < applicationState.dotAnimationCounter; i++) dots += '.';
        bubble.innerHTML = '<span class="dots-text">' + dots + '</span>';
    }

    function transitionToStreamingContent(bubble) {
        if (applicationState.dotAnimationTimer) {
            clearInterval(applicationState.dotAnimationTimer);
            applicationState.dotAnimationTimer = null;
        }
        bubble.innerHTML = '';
        bubble.id = 'streamingBubble';
        var parentEl = document.getElementById('typingIndicator');
        if (parentEl) parentEl.id = 'streamingMessage';
    }

    function finalizeStreamingResponse(fullContent, thinkingContent) {
        var streamElement = document.getElementById('streamingMessage');
        if (streamElement) {
            streamElement.removeAttribute('id');
            var bubble = streamElement.querySelector('.msg-body');
            if (bubble) {
                bubble.removeAttribute('id');
                bubble.innerHTML = formatMessageContent(fullContent);
                attachCodeBlockCopyButtons(bubble);
                var cursor = bubble.querySelector('.stream-cursor');
                if (cursor) cursor.parentNode.removeChild(cursor);
            }
            if (thinkingContent) {
                var thinkBlock = buildThinkingBlockElement(thinkingContent);
                streamElement.insertBefore(thinkBlock, streamElement.querySelector('.msg-body'));
            }
        }
    }

    function removeStreamingElements() {
        if (applicationState.dotAnimationTimer) {
            clearInterval(applicationState.dotAnimationTimer);
            applicationState.dotAnimationTimer = null;
        }
        var ids = ['typingIndicator', 'streamingMessage'];
        for (var i = 0; i < ids.length; i++) {
            var el = document.getElementById(ids[i]);
            if (el && el.parentNode) el.parentNode.removeChild(el);
        }
    }

    // ========== 请求完成收尾 ==========
    function finalizeRequest() {
        applicationState.isRequestInProgress = false;
        applicationState.abortController = null;
        updateSendButtonState();
    }

    // ========== API 通信 ==========
    function sendMessage() {
        if (applicationState.isRequestInProgress) return;
        var userInput = dom.messageInput.value.trim();
        if (!userInput) return;
        if (!applicationState.config.apiKey) {
            openSettingsModal();
            showToastMessage('请配置 API Key', 'warning');
            return;
        }

        dom.messageInput.value = '';
        updateCharacterCount();
        autoResizeTextarea();

        if (!applicationState.activeSessionId) createNewSession();
        var currentSession = findSessionById(applicationState.activeSessionId);
        if (!currentSession) {
            createNewSession();
            currentSession = findSessionById(applicationState.activeSessionId);
        }
        if (!currentSession) {
            showToastMessage('会话创建失败，请刷新页面', 'error');
            return;
        }

        dom.welcomeScreen.style.display = 'none';
        currentSession.messages.push({ role: 'user', content: userInput });
        appendMessageToChat('user', userInput);
        updateCurrentSessionTitle();
        saveAllDataToStorage();
        renderSessionList();

        var requestMessages = buildRequestMessages(currentSession);
        executeApiRequest(requestMessages, currentSession, userInput);
    }

    function buildRequestMessages(session) {
        var msgs = [];
        if (applicationState.customRules.enabled && applicationState.customRules.content) {
            msgs.push({ role: 'system', content: applicationState.customRules.content });
        }
        msgs.push({
            role: 'system',
            content: '回答中的代码必须使用正确的 Markdown 代码块格式：三个反引号后紧跟语言名称，例如 ```python 或 ```javascript，不能省略语言名称。'
        });
        if (applicationState.config.thinking && applicationState.config.mode === 'pro') {
            msgs.push({ role: 'system', content: '用【思考】标记思考过程，用【回答】标记最终回答。' });
        }
        for (var i = 0; i < session.messages.length; i++) {
            msgs.push({ role: session.messages[i].role, content: session.messages[i].content });
        }
        return msgs;
    }

    function executeApiRequest(requestMessages, currentSession, userInput) {
        applicationState.isRequestInProgress = true;
        updateSendButtonState();
        showTypingIndicator();
        var bubble = document.getElementById('typingBubble');
        applicationState.abortController = new AbortController();
        var selectedModel = applicationState.config.mode === 'pro' ? 'deepseek-v4-pro' : 'deepseek-v4-flash';

        fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + applicationState.config.apiKey },
            body: JSON.stringify({ model: selectedModel, messages: requestMessages, temperature: applicationState.config.temperature, stream: true }),
            signal: applicationState.abortController.signal
        })
            .then(function (response) {
                if (!response.ok) {
                    return response.json().then(function (errData) {
                        throw new Error((errData.error && errData.error.message) || '请求失败 (HTTP ' + response.status + ')');
                    }).catch(function (e) {
                        if (e instanceof Error && e.message.indexOf('请求失败') === 0) throw e;
                        throw new Error('请求失败 (HTTP ' + response.status + ')');
                    });
                }
                return response;
            })
            .then(function (response) {
                return processStreamingResponse(response, bubble);
            })
            .then(function (fullContent) {
                var thinkingContent = null;
                var finalContent = fullContent;
                if (applicationState.config.thinking && applicationState.config.mode === 'pro') {
                    var match = finalContent.match(/【思考】([\s\S]*?)【回答】/);
                    if (match) {
                        thinkingContent = match[1].trim();
                        finalContent = finalContent.replace(/【思考】[\s\S]*?【回答】/, '').trim();
                    }
                }
                if (!finalContent && thinkingContent) { finalContent = thinkingContent; thinkingContent = null; }
                if (!finalContent) finalContent = '未收到有效回复';

                finalizeStreamingResponse(finalContent, thinkingContent);
                currentSession.messages.push({ role: 'assistant', content: finalContent, thinking: thinkingContent });

                // ✅ 估算 Token（输入 + 输出）
                var inputTokens = estimateTokenCount(userInput);
                var outputTokens = estimateTokenCount(finalContent);
                applicationState.usage.inputTokens += inputTokens;
                applicationState.usage.outputTokens += outputTokens;
                var price = PRICE_MAP[selectedModel] || PRICE_MAP['deepseek-v4-flash'];
                applicationState.usage.totalCost += (inputTokens / 1000000) * price.input + (outputTokens / 1000000) * price.output;
                currentSession.usage = {
                    inputTokens: applicationState.usage.inputTokens,
                    outputTokens: applicationState.usage.outputTokens,
                    totalCost: applicationState.usage.totalCost
                };

                saveAllDataToStorage();
                updateUsageDisplay();
                finalizeRequest();
            })
            .catch(function (error) {
                removeStreamingElements();
                if (error.name !== 'AbortError') {
                    appendMessageToChat('assistant', '请求失败: ' + error.message);
                    showToastMessage('发送失败', 'error');
                }
                finalizeRequest();
            });
    }

    function processStreamingResponse(response, bubble) {
        var reader = response.body.getReader();
        var textDecoder = new TextDecoder('utf-8');
        var accumulatedContent = '';
        var isFirstChunk = true;

        function readNextChunk() {
            return reader.read().then(function (result) {
                if (result.done) return accumulatedContent;
                var chunkText = textDecoder.decode(result.value, { stream: true });
                var lines = chunkText.split('\n');
                for (var i = 0; i < lines.length; i++) {
                    var line = lines[i].trim();
                    if (!line || line === 'data: [DONE]') continue;
                    if (line.indexOf('data: ') !== 0) continue;
                    try {
                        var jsonData = JSON.parse(line.slice(6));
                        var delta = jsonData.choices && jsonData.choices[0] && jsonData.choices[0].delta;
                        if (delta && delta.content) {
                            if (isFirstChunk) { isFirstChunk = false; transitionToStreamingContent(bubble); bubble = document.getElementById('streamingBubble'); }
                            accumulatedContent += delta.content;
                            if (bubble) {
                                bubble.innerHTML = formatMessageContent(accumulatedContent) + '<span class="stream-cursor">|</span>';
                            }
                            scrollToBottom();
                        }
                    } catch (e) { /* 忽略解析错误 */ }
                }
                return readNextChunk();
            });
        }
        return readNextChunk();
    }

    // ========== Token 估算 ==========
    function estimateTokenCount(text) {
        if (!text) return 0;
        var chineseChars = (text.match(/[\u4e00-\u9fff\u3400-\u4dbf]/g) || []).length;
        var otherChars = text.length - chineseChars;
        return Math.ceil(chineseChars * TOKEN_ESTIMATE_CHINESE + otherChars * TOKEN_ESTIMATE_ENGLISH);
    }

    // ========== UI 辅助 ==========
    function updateUsageDisplay() {
        var totalTokens = applicationState.usage.inputTokens + applicationState.usage.outputTokens;
        dom.usageInline.textContent = 'Tokens: ' + formatLargeNumber(totalTokens) + ' | \u00a5' + applicationState.usage.totalCost.toFixed(4);
    }

    function formatLargeNumber(number) {
        if (number >= 1000000) return (number / 1000000).toFixed(2) + 'M';
        if (number >= 1000) return (number / 1000).toFixed(1) + 'K';
        return String(number);
    }

    function updateConfigIndicator() {
        var indicatorText = dom.configIndicator.querySelector('.config-text');
        if (applicationState.config.apiKey) {
            dom.configIndicator.classList.add('ready');
            indicatorText.textContent = '已配置';
        } else {
            dom.configIndicator.classList.remove('ready');
            indicatorText.textContent = '未配置';
        }
    }

    function refreshModeButtonState() {
        var modeButtons = dom.modeSwitch.querySelectorAll('.mode-option');
        for (var i = 0; i < modeButtons.length; i++) {
            var btn = modeButtons[i];
            btn.classList.remove('active');
            if (btn.dataset.mode === applicationState.config.mode) btn.classList.add('active');
        }
        refreshThinkingToggleState();
    }

    function refreshThinkingToggleState() {
        if (applicationState.config.mode === 'flash') {
            applicationState.config.thinking = false;
            dom.deepThinking.checked = false;
        }
    }

    function updateSendButtonState() {
        if (applicationState.isRequestInProgress) {
            dom.btnSend.disabled = false;
            dom.btnSend.classList.add('btn-stop-active');
            dom.btnSend.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>';
            dom.btnSend.title = '暂停回复';
        } else {
            var hasContent = dom.messageInput.value.trim().length > 0;
            dom.btnSend.disabled = !hasContent;
            dom.btnSend.classList.remove('btn-stop-active');
            dom.btnSend.innerHTML = '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>';
            dom.btnSend.title = '发送';
        }
    }

    function updateCharacterCount() {
        dom.charCount.textContent = dom.messageInput.value.length + '/4000';
        updateSendButtonState();
    }

    function autoResizeTextarea() {
        var textarea = dom.messageInput;
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 100) + 'px';
    }

    function scrollToBottom() {
        requestAnimationFrame(function () { dom.messageArea.scrollTop = dom.messageArea.scrollHeight; });
    }

    // ========== 弹窗 ==========
    function openSettingsModal() {
        dom.settingsModal.classList.remove('hidden');
        dom.apiKeyInput.value = applicationState.config.apiKey;
        dom.temperatureSlider.value = applicationState.config.temperature;
        dom.tempDisplay.textContent = applicationState.config.temperature;
    }
    function closeSettingsModal() { dom.settingsModal.classList.add('hidden'); }
    function openCustomRulesModal() { dom.mdRulesModal.classList.remove('hidden'); }
    function closeCustomRulesModal() { dom.mdRulesModal.classList.add('hidden'); }

    // ========== YAML 导入导出 ==========
    function exportConfigToYaml() {
        var configData = {
            api_key: applicationState.config.apiKey,
            temperature: applicationState.config.temperature,
            mode: applicationState.config.mode,
            thinking: applicationState.config.thinking,
            md_rules: { enabled: applicationState.customRules.enabled, content: applicationState.customRules.content },
            usage: { input: applicationState.usage.inputTokens, output: applicationState.usage.outputTokens, cost: applicationState.usage.totalCost }
        };
        var yamlContent = convertObjectToYaml(configData);
        triggerFileDownload(yamlContent, 'deepseek_v4_config.yaml', 'application/x-yaml');
        showToastMessage('配置已导出');
    }

    function importConfigFromYaml() {
        var fileInput = document.createElement('input');
        fileInput.type = 'file';
        fileInput.accept = '.yaml,.yml';
        fileInput.onchange = function () {
            var selectedFile = fileInput.files[0];
            if (!selectedFile) return;
            var fileReader = new FileReader();
            fileReader.onload = function (loadEvent) {
                try {
                    var parsedData = parseYamlToObject(loadEvent.target.result);
                    applyImportedConfig(parsedData);
                } catch (parseError) {
                    showToastMessage('YAML 解析失败: ' + parseError.message, 'error');
                }
            };
            fileReader.readAsText(selectedFile);
        };
        fileInput.click();
    }

    function applyImportedConfig(importedData) {
        if (importedData.api_key) applicationState.config.apiKey = importedData.api_key;
        if (importedData.temperature !== undefined) applicationState.config.temperature = importedData.temperature;
        if (importedData.mode) applicationState.config.mode = importedData.mode;
        if (importedData.thinking !== undefined) applicationState.config.thinking = importedData.thinking;
        if (importedData.md_rules) {
            applicationState.customRules.enabled = importedData.md_rules.enabled !== false;
            applicationState.customRules.content = importedData.md_rules.content || '';
        }
        if (importedData.usage) {
            applicationState.usage.inputTokens = importedData.usage.input || 0;
            applicationState.usage.outputTokens = importedData.usage.output || 0;
            applicationState.usage.totalCost = importedData.usage.cost || 0;
        }
        saveAllDataToStorage();
        synchronizeUiWithState();
        updateUsageDisplay();
        updateConfigIndicator();
        showToastMessage('配置已导入');
    }

    function triggerFileDownload(content, fileName, mimeType) {
        var blob = new Blob([content], { type: mimeType });
        var downloadLink = document.createElement('a');
        downloadLink.href = URL.createObjectURL(blob);
        downloadLink.download = fileName;
        downloadLink.click();
        URL.revokeObjectURL(downloadLink.href);
    }

    function convertObjectToYaml(sourceObject, indentLevel) {
        indentLevel = indentLevel || 0;
        var indentSpaces = '  '.repeat(indentLevel);
        var outputLines = [];
        if (typeof sourceObject === 'object' && sourceObject !== null && !Array.isArray(sourceObject)) {
            for (var key in sourceObject) {
                if (!sourceObject.hasOwnProperty(key)) continue;
                var value = sourceObject[key];
                if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                    outputLines.push(indentSpaces + key + ':');
                    outputLines.push(convertObjectToYaml(value, indentLevel + 1));
                } else if (typeof value === 'string') {
                    outputLines.push(indentSpaces + key + ': "' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
                } else {
                    outputLines.push(indentSpaces + key + ': ' + value);
                }
            }
        }
        return outputLines.join('\n');
    }

    function parseYamlToObject(yamlText) {
        var lines = yamlText.split('\n');
        var rootObject = {};
        var parseStack = [{ obj: rootObject, indent: -1 }];
        for (var i = 0; i < lines.length; i++) {
            var line = lines[i];
            var trimmedLine = line.trim();
            if (!trimmedLine || trimmedLine.startsWith('#')) continue;
            var indentSize = line.search(/\S/);
            var colonPosition = trimmedLine.indexOf(':');
            if (colonPosition === -1) continue;
            var key = trimmedLine.substring(0, colonPosition).trim();
            var value = trimmedLine.substring(colonPosition + 1).trim();
            if (value === '') continue;
            if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1).replace(/\\"/g, '"');
            else if (value === 'true') value = true;
            else if (value === 'false') value = false;
            else if (!isNaN(value)) value = Number(value);
            while (parseStack.length > 1 && parseStack[parseStack.length - 1].indent >= indentSize) parseStack.pop();
            parseStack[parseStack.length - 1].obj[key] = value;
        }
        return rootObject;
    }

    // ========== Toast ==========
    function showToastMessage(message, type) {
        type = type || 'success';
        var toastElement = document.createElement('div');
        toastElement.className = 'toast ' + type;
        toastElement.textContent = message;
        dom.toastContainer.appendChild(toastElement);
        setTimeout(function () {
            toastElement.style.opacity = '0';
            toastElement.style.transition = 'opacity 0.3s';
            setTimeout(function () {
                if (toastElement.parentNode) toastElement.parentNode.removeChild(toastElement);
            }, 300);
        }, 2200);
    }

    // ========== 安全工具 ==========
    function escapeHtml(unsafeText) {
        return unsafeText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    }
    function escapeHtmlAttr(text) {
        return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '&#10;');
    }

    function escapeHtmlPreservingEntities(text) {
        return text.replace(/&(?!(amp;|lt;|gt;|quot;|#039;|#\d+;))/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ========== 事件绑定 ==========
    function bindAllEventHandlers() {
        dom.btnNewSession.addEventListener('click', createNewSession);
        dom.btnToggleSidebar.addEventListener('click', function () { dom.sidebar.classList.toggle('open'); });
        dom.btnSend.addEventListener('click', function () {
            if (applicationState.isRequestInProgress) {
                if (applicationState.abortController) {
                    applicationState.abortController.abort();
                    removeStreamingElements();
                    showToastMessage('已暂停回复', 'warning');
                    finalizeRequest();
                }
            } else {
                sendMessage();
            }
        });
        dom.messageInput.addEventListener('keydown', function (event) {
            if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); sendMessage(); }
        });
        dom.messageInput.addEventListener('input', function () { updateCharacterCount(); autoResizeTextarea(); });
        dom.btnSettings.addEventListener('click', openSettingsModal);
        dom.btnCloseSettings.addEventListener('click', closeSettingsModal);
        dom.settingsModal.addEventListener('click', function (event) { if (event.target === dom.settingsModal) closeSettingsModal(); });
        dom.btnTogglePassword.addEventListener('click', function () { dom.apiKeyInput.type = dom.apiKeyInput.type === 'password' ? 'text' : 'password'; });
        dom.temperatureSlider.addEventListener('input', function () { dom.tempDisplay.textContent = dom.temperatureSlider.value; });
        dom.btnSaveSettings.addEventListener('click', saveSettingsConfiguration);
        dom.btnExportConfig.addEventListener('click', exportConfigToYaml);
        dom.btnImportConfig.addEventListener('click', importConfigFromYaml);
        dom.btnMDRules.addEventListener('click', openCustomRulesModal);
        dom.btnCloseMDRules.addEventListener('click', closeCustomRulesModal);
        dom.mdRulesModal.addEventListener('click', function (event) { if (event.target === dom.mdRulesModal) closeCustomRulesModal(); });
        dom.btnSaveMDRules.addEventListener('click', saveCustomRulesConfiguration);
        dom.modeSwitch.addEventListener('click', function (event) {
            var clickedButton = event.target.closest('.mode-option');
            if (!clickedButton) return;
            applicationState.config.mode = clickedButton.dataset.mode;
            refreshModeButtonState();
            saveAllDataToStorage();
        });
        dom.deepThinking.addEventListener('change', function () { applicationState.config.thinking = dom.deepThinking.checked; saveAllDataToStorage(); });
        dom.quickActions.addEventListener('click', function (event) {
            var quickButton = event.target.closest('.quick-btn');
            if (!quickButton) return;
            if (quickButton.dataset.prompt) { dom.messageInput.value = quickButton.dataset.prompt; updateCharacterCount(); autoResizeTextarea(); sendMessage(); }
        });
        document.addEventListener('keydown', function (event) { if (event.key === 'Escape') { closeSettingsModal(); closeCustomRulesModal(); } });
    }

    function saveSettingsConfiguration() {
        var apiKey = dom.apiKeyInput.value.trim();
        if (!apiKey) { showToastMessage('请输入 API Key', 'warning'); return; }
        applicationState.config.apiKey = apiKey;
        applicationState.config.temperature = parseFloat(dom.temperatureSlider.value);
        saveAllDataToStorage();
        closeSettingsModal();
        updateConfigIndicator();
        showToastMessage('设置已保存');
    }

    function saveCustomRulesConfiguration() {
        applicationState.customRules.content = dom.mdRulesInput.value.trim();
        applicationState.customRules.enabled = dom.mdRulesEnabled.checked;
        saveAllDataToStorage();
        closeCustomRulesModal();
        showToastMessage('规则已保存');
    }

    // ========== 启动 ==========
    initializeApplication();
})();