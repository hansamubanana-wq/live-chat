/* =============================================
   LIVE CHAT - Client Application
   ============================================= */

// ===== State =====
const state = {
    socket: null,
    user: null,
    selectedIconData: null, // Base64 data URL
    selectedSC: null,
    ttsEnabled: true,
    ttsQueue: [],
    ttsSpeaking: false,
    autoScroll: true,
};

// ===== Tier Detection =====
function getTierForAmount(amount) {
    if (amount >= 10000) return { tier: 'rainbow', color: '#ff4757' };
    if (amount >= 5000) return { tier: 'red', color: '#ff1744' };
    if (amount >= 1000) return { tier: 'orange', color: '#ff6d00' };
    if (amount >= 500) return { tier: 'yellow', color: '#ffd600' };
    if (amount >= 100) return { tier: 'green', color: '#00c853' };
    return { tier: 'blue', color: '#1e88e5' };
}

function formatAmount(amount) {
    return '¥' + amount.toLocaleString('ja-JP');
}

// Pin durations (ms) per tier
const PIN_DURATIONS = {
    blue: 5000,
    green: 8000,
    yellow: 12000,
    orange: 20000,
    red: 30000,
    rainbow: 60000,
};

// ===== DOM Elements =====
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const dom = {
    // Screens
    registerScreen: $('#register-screen'),
    chatScreen: $('#chat-screen'),

    // Registration
    usernameInput: $('#username-input'),
    iconPreview: $('#icon-preview'),
    iconFileInput: $('#icon-file-input'),
    iconUploadBtn: $('#icon-upload-btn'),
    joinBtn: $('#join-btn'),

    // Chat
    viewerCount: $('#viewer-count'),
    ttsToggle: $('#tts-toggle'),
    pinnedSC: $('#pinned-sc'),
    chatMessages: $('#chat-messages'),
    chatInput: $('#chat-input'),
    sendBtn: $('#send-btn'),
    scToggle: $('#sc-toggle'),
    scSelector: $('#sc-selector'),
    scClose: $('#sc-close'),
    scBadge: $('#sc-badge'),
    inputWrapper: $('#input-wrapper'),
    scAmountInput: $('#sc-amount-input'),
    scConfirmBtn: $('#sc-confirm-btn'),

    // SC Stats
    scTotalBadge: $('#sc-total-badge'),
    scTotalAmount: $('#sc-total-amount'),
    rankingToggle: $('#ranking-toggle'),
    rankingPanel: $('#ranking-panel'),
    rankingClose: $('#ranking-close'),
    rankingList: $('#ranking-list'),
};

// ===== Initialization =====
function init() {
    setupIconUpload();
    setupRegistration();
    setupChat();
    connectSocket();
}

// ===== Icon Upload =====
function setupIconUpload() {
    // Click preview or button to trigger file input
    dom.iconPreview.addEventListener('click', () => dom.iconFileInput.click());
    dom.iconUploadBtn.addEventListener('click', () => dom.iconFileInput.click());

    dom.iconFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        // Validate file type
        if (!file.type.startsWith('image/')) {
            alert('画像ファイルを選択してください');
            return;
        }

        // Read and resize
        const reader = new FileReader();
        reader.onload = (event) => {
            const img = new Image();
            img.onload = () => {
                // Resize to 64x64 to keep data small
                const canvas = document.createElement('canvas');
                const size = 64;
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');

                // Crop to square center
                const minDim = Math.min(img.width, img.height);
                const sx = (img.width - minDim) / 2;
                const sy = (img.height - minDim) / 2;
                ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, size, size);

                state.selectedIconData = canvas.toDataURL('image/webp', 0.8);

                // Show preview
                dom.iconPreview.innerHTML = `<img src="${state.selectedIconData}" alt="アイコン">`;
                dom.iconPreview.classList.add('has-image');
                dom.iconUploadBtn.textContent = '変更する';

                checkRegisterReady();
            };
            img.src = event.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// ===== Registration =====
function setupRegistration() {
    dom.usernameInput.addEventListener('input', checkRegisterReady);
    dom.usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            if (dom.joinBtn.classList.contains('ready')) {
                joinChat();
            }
        }
    });

    dom.joinBtn.addEventListener('click', joinChat);
}

function checkRegisterReady() {
    const name = dom.usernameInput.value.trim();
    const hasIcon = !!state.selectedIconData;
    const ready = name.length > 0 && hasIcon;

    dom.joinBtn.classList.toggle('ready', ready);
    dom.joinBtn.disabled = !ready;
}

function joinChat() {
    const name = dom.usernameInput.value.trim();
    if (!name || !state.selectedIconData) return;

    state.user = { name, icon: state.selectedIconData };

    // Register with server
    state.socket.emit('register', state.user);

    // Switch screens
    dom.registerScreen.classList.remove('active');
    dom.chatScreen.classList.add('active');

    // Focus input
    setTimeout(() => dom.chatInput.focus(), 300);
}

// ===== Socket.io =====
function connectSocket() {
    state.socket = io();

    state.socket.on('connect', () => {
        console.log('Connected to server');
    });

    state.socket.on('user-joined', (data) => {
        dom.viewerCount.textContent = data.onlineCount;
        if (data.user.id !== state.socket.id) {
            addSystemMessage(data.user.icon, `${data.user.name} が参加しました`);
        }
    });

    state.socket.on('user-left', (data) => {
        dom.viewerCount.textContent = data.onlineCount;
        addSystemMessage(data.user.icon, `${data.user.name} が退出しました`);
    });

    state.socket.on('user-list', (data) => {
        dom.viewerCount.textContent = data.onlineCount;
    });

    state.socket.on('chat-message', (data) => {
        addChatMessage(data);

        // TTS
        if (state.ttsEnabled && data.user.id !== state.socket.id) {
            queueTTS(data);
        }
    });

    state.socket.on('sc-stats-update', (data) => {
        updateScStats(data);
    });
}

// ===== Chat UI =====
function setupChat() {
    // Send message
    dom.chatInput.addEventListener('input', () => {
        const hasText = dom.chatInput.value.trim().length > 0;
        dom.sendBtn.classList.toggle('ready', hasText);
        dom.sendBtn.disabled = !hasText;
    });

    dom.chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    dom.sendBtn.addEventListener('click', sendMessage);

    // SC toggle
    dom.scToggle.addEventListener('click', () => {
        const isHidden = dom.scSelector.classList.contains('hidden');
        dom.scSelector.classList.toggle('hidden', !isHidden);
        dom.scToggle.classList.toggle('active', isHidden);

        if (!isHidden) {
            clearSCSelection();
        } else {
            dom.scAmountInput.focus();
        }
    });

    dom.scClose.addEventListener('click', () => {
        dom.scSelector.classList.add('hidden');
        dom.scToggle.classList.remove('active');
        clearSCSelection();
    });

    // SC amount input
    dom.scAmountInput.addEventListener('input', () => {
        const val = parseInt(dom.scAmountInput.value);
        dom.scConfirmBtn.disabled = !(val >= 1);
    });

    dom.scAmountInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            confirmSCAmount();
        }
    });

    dom.scConfirmBtn.addEventListener('click', confirmSCAmount);

    // TTS toggle
    dom.ttsToggle.addEventListener('click', () => {
        state.ttsEnabled = !state.ttsEnabled;
        dom.ttsToggle.classList.toggle('tts-on', state.ttsEnabled);
        dom.ttsToggle.classList.toggle('tts-off', !state.ttsEnabled);
        dom.ttsToggle.textContent = state.ttsEnabled ? '🔊' : '🔇';

        if (!state.ttsEnabled) {
            speechSynthesis.cancel();
            state.ttsQueue = [];
            state.ttsSpeaking = false;
        }
    });

    // Ranking toggle
    dom.rankingToggle.addEventListener('click', () => {
        dom.rankingPanel.classList.toggle('hidden');
        dom.rankingToggle.classList.toggle('active');
    });

    dom.rankingClose.addEventListener('click', () => {
        dom.rankingPanel.classList.add('hidden');
        dom.rankingToggle.classList.remove('active');
    });

    // Auto-scroll detection
    dom.chatMessages.addEventListener('scroll', () => {
        const el = dom.chatMessages;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        state.autoScroll = atBottom;
    });
}

function confirmSCAmount() {
    const amount = parseInt(dom.scAmountInput.value);
    if (!amount || amount < 1) return;

    const tierInfo = getTierForAmount(amount);

    state.selectedSC = { amount, tier: tierInfo.tier };

    // Show badge in input
    dom.scBadge.textContent = formatAmount(amount);
    dom.scBadge.className = `sc-input-badge badge-${tierInfo.tier}`;
    dom.inputWrapper.classList.add('sc-active');

    // Hide selector
    dom.scSelector.classList.add('hidden');
    dom.scToggle.classList.remove('active');

    dom.chatInput.focus();
}

function clearSCSelection() {
    state.selectedSC = null;
    dom.scAmountInput.value = '';
    dom.scConfirmBtn.disabled = true;
    dom.scBadge.className = 'sc-input-badge hidden';
    dom.inputWrapper.classList.remove('sc-active');
}

function sendMessage() {
    const text = dom.chatInput.value.trim();
    if (!text) return;

    const data = { text };

    if (state.selectedSC) {
        data.superChat = {
            amount: state.selectedSC.amount,
            tier: state.selectedSC.tier,
        };
    }

    state.socket.emit('chat-message', data);

    dom.chatInput.value = '';
    dom.sendBtn.classList.remove('ready');
    dom.sendBtn.disabled = true;

    // Clear SC selection after sending
    if (state.selectedSC) {
        clearSCSelection();
    }
}

// ===== Message Rendering =====
function renderIcon(iconData, size) {
    const sizeClass = size === 'small' ? 'icon-sm' : size === 'large' ? 'icon-lg' : '';
    return `<img src="${escapeAttr(iconData)}" class="user-icon ${sizeClass}" alt="アイコン">`;
}

function addSystemMessage(iconData, text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.innerHTML = `${renderIcon(iconData, 'small')} <span>${escapeHTML(text)}</span>`;
    dom.chatMessages.appendChild(div);
    scrollToBottom();
}

function addChatMessage(data) {
    const { user, text, timestamp, superChat } = data;
    const time = new Date(timestamp).toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit'
    });

    const div = document.createElement('div');

    if (superChat) {
        const tierInfo = getTierForAmount(superChat.amount);
        const label = formatAmount(superChat.amount);
        div.className = `chat-msg sc-message sc-${tierInfo.tier}`;
        div.innerHTML = `
      <div class="msg-icon">${renderIcon(user.icon)}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-name">${escapeHTML(user.name)}</span>
          <span class="msg-time">${time}</span>
        </div>
        <div class="sc-amount-tag">💰 ${label}</div>
        <div class="msg-text">${escapeHTML(text)}</div>
      </div>
    `;

        // Pin the super chat
        pinSuperChat(user, text, superChat);
    } else {
        div.className = 'chat-msg';
        div.innerHTML = `
      <div class="msg-icon">${renderIcon(user.icon)}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-name">${escapeHTML(user.name)}</span>
          <span class="msg-time">${time}</span>
        </div>
        <div class="msg-text">${escapeHTML(text)}</div>
      </div>
    `;
    }

    dom.chatMessages.appendChild(div);
    scrollToBottom();
}

function pinSuperChat(user, text, superChat) {
    const tierInfo = getTierForAmount(superChat.amount);
    const label = formatAmount(superChat.amount);
    const duration = PIN_DURATIONS[tierInfo.tier];

    const pin = document.createElement('div');
    pin.className = `pinned-sc tier-${tierInfo.tier}`;
    pin.innerHTML = `
    <div class="pinned-icon">${renderIcon(user.icon)}</div>
    <div class="pinned-info">
      <div class="pinned-name">${escapeHTML(user.name)}</div>
      <div class="pinned-amount">${label}</div>
      <div class="pinned-text">${escapeHTML(text)}</div>
    </div>
    <div class="pinned-timer" style="animation-duration: ${duration}ms;"></div>
  `;

    dom.pinnedSC.appendChild(pin);

    // Auto-remove after duration
    setTimeout(() => {
        pin.style.transition = 'opacity 0.5s, transform 0.5s';
        pin.style.opacity = '0';
        pin.style.transform = 'translateY(-100%)';
        setTimeout(() => pin.remove(), 500);
    }, duration);
}

function scrollToBottom() {
    if (state.autoScroll) {
        requestAnimationFrame(() => {
            dom.chatMessages.scrollTop = dom.chatMessages.scrollHeight;
        });
    }
}

// ===== SC Stats / Ranking =====
function updateScStats(data) {
    // Update total
    dom.scTotalAmount.textContent = formatAmount(data.totalAmount);

    // Update ranking
    if (data.ranking.length === 0) {
        dom.rankingList.innerHTML = '<div class="ranking-empty">まだスーパーチャットはありません</div>';
        return;
    }

    dom.rankingList.innerHTML = data.ranking.map((entry, i) => {
        const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}`;
        return `
      <div class="ranking-item ${i < 3 ? 'ranking-top' : ''}">
        <span class="ranking-pos">${medal}</span>
        <div class="ranking-user-icon">${renderIcon(entry.icon, 'small')}</div>
        <span class="ranking-name">${escapeHTML(entry.name)}</span>
        <span class="ranking-amount">${formatAmount(entry.total)}</span>
      </div>
    `;
    }).join('');
}

// ===== Text-to-Speech =====
function queueTTS(data) {
    let ttsText;

    if (data.superChat) {
        const label = formatAmount(data.superChat.amount);
        ttsText = `${data.user.name}さんから${label}のスーパーチャット。${data.text}`;
    } else {
        ttsText = `${data.user.name}さん。${data.text}`;
    }

    state.ttsQueue.push(ttsText);
    processTTSQueue();
}

function processTTSQueue() {
    if (state.ttsSpeaking || state.ttsQueue.length === 0) return;

    state.ttsSpeaking = true;
    const text = state.ttsQueue.shift();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ja-JP';
    utterance.rate = 1.1;
    utterance.pitch = 1;

    // Try to find a Japanese voice
    const voices = speechSynthesis.getVoices();
    const jaVoice = voices.find(v => v.lang.startsWith('ja'));
    if (jaVoice) {
        utterance.voice = jaVoice;
    }

    utterance.onend = () => {
        state.ttsSpeaking = false;
        processTTSQueue();
    };

    utterance.onerror = () => {
        state.ttsSpeaking = false;
        processTTSQueue();
    };

    speechSynthesis.speak(utterance);
}

// Preload voices
if (typeof speechSynthesis !== 'undefined') {
    speechSynthesis.onvoiceschanged = () => {
        speechSynthesis.getVoices();
    };
}

// ===== Utilities =====
function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function escapeAttr(str) {
    return str.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ===== Start =====
document.addEventListener('DOMContentLoaded', init);
