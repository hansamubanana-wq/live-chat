/* =============================================
   LIVE CHAT - Client Application
   ============================================= */

// ===== State =====
const state = {
    socket: null,
    user: null,
    selectedIcon: null,
    selectedSC: null,
    ttsEnabled: true,
    ttsQueue: [],
    ttsSpeaking: false,
    autoScroll: true,
};

// ===== Constants =====
const ICONS = [
    '😀', '😎', '🤩', '🥳', '😺', '🐱',
    '🐶', '🦊', '🐻', '🐼', '🐸', '🦁',
    '🐯', '🐨', '🐷', '🐵', '🐰', '🦄',
    '🐲', '🦅', '🐧', '🐙', '🦋', '🌟',
    '🔥', '💎', '🎮', '🎵', '🚀', '⚡',
];

const SC_TIERS = {
    100: { tier: 'blue', label: '¥100', color: '#1e88e5' },
    500: { tier: 'green', label: '¥500', color: '#00c853' },
    1000: { tier: 'yellow', label: '¥1,000', color: '#ffd600' },
    5000: { tier: 'orange', label: '¥5,000', color: '#ff6d00' },
    10000: { tier: 'red', label: '¥10,000', color: '#ff1744' },
    50000: { tier: 'rainbow', label: '¥50,000', color: '#ff4757' },
};

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
    iconGrid: $('#icon-grid'),
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
};

// ===== Initialization =====
function init() {
    setupIconGrid();
    setupRegistration();
    setupChat();
    connectSocket();
}

// ===== Icon Grid =====
function setupIconGrid() {
    dom.iconGrid.innerHTML = ICONS.map(icon =>
        `<button class="icon-option" data-icon="${icon}">${icon}</button>`
    ).join('');

    dom.iconGrid.addEventListener('click', (e) => {
        const btn = e.target.closest('.icon-option');
        if (!btn) return;

        $$('.icon-option').forEach(el => el.classList.remove('selected'));
        btn.classList.add('selected');
        state.selectedIcon = btn.dataset.icon;
        checkRegisterReady();
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
    const hasIcon = !!state.selectedIcon;
    const ready = name.length > 0 && hasIcon;

    dom.joinBtn.classList.toggle('ready', ready);
    dom.joinBtn.disabled = !ready;
}

function joinChat() {
    const name = dom.usernameInput.value.trim();
    if (!name || !state.selectedIcon) return;

    state.user = { name, icon: state.selectedIcon };

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
            addSystemMessage(`${data.user.icon} ${data.user.name} が参加しました`);
        }
    });

    state.socket.on('user-left', (data) => {
        dom.viewerCount.textContent = data.onlineCount;
        addSystemMessage(`${data.user.icon} ${data.user.name} が退出しました`);
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
}

// ===== Chat UI =====
function setupChat() {
    // Send message
    dom.chatInput.addEventListener('input', () => {
        const hasText = dom.chatInput.value.trim().length > 0;
        dom.sendBtn.classList.toggle('ready', hasText);
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
        }
    });

    dom.scClose.addEventListener('click', () => {
        dom.scSelector.classList.add('hidden');
        dom.scToggle.classList.remove('active');
        clearSCSelection();
    });

    // SC tier selection
    $$('.sc-tier').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = parseInt(btn.dataset.amount);
            const tier = btn.dataset.tier;

            if (state.selectedSC && state.selectedSC.amount === amount) {
                // Deselect
                clearSCSelection();
                return;
            }

            $$('.sc-tier').forEach(el => el.classList.remove('selected'));
            btn.classList.add('selected');

            state.selectedSC = { amount, tier };

            // Show badge in input
            const scInfo = SC_TIERS[amount];
            dom.scBadge.textContent = scInfo.label;
            dom.scBadge.className = `sc-input-badge badge-${tier}`;
            dom.inputWrapper.classList.add('sc-active');

            dom.chatInput.focus();
        });
    });

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

    // Auto-scroll detection
    dom.chatMessages.addEventListener('scroll', () => {
        const el = dom.chatMessages;
        const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
        state.autoScroll = atBottom;
    });
}

function clearSCSelection() {
    state.selectedSC = null;
    $$('.sc-tier').forEach(el => el.classList.remove('selected'));
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

    // Clear SC selection after sending
    if (state.selectedSC) {
        clearSCSelection();
        dom.scSelector.classList.add('hidden');
        dom.scToggle.classList.remove('active');
    }
}

// ===== Message Rendering =====
function addSystemMessage(text) {
    const div = document.createElement('div');
    div.className = 'system-message';
    div.textContent = text;
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
        const scInfo = SC_TIERS[superChat.amount];
        div.className = `chat-msg sc-message sc-${superChat.tier}`;
        div.innerHTML = `
      <div class="msg-icon">${escapeHTML(user.icon)}</div>
      <div class="msg-body">
        <div class="msg-header">
          <span class="msg-name">${escapeHTML(user.name)}</span>
          <span class="msg-time">${time}</span>
        </div>
        <div class="sc-amount-tag">💰 ${scInfo.label}</div>
        <div class="msg-text">${escapeHTML(text)}</div>
      </div>
    `;

        // Pin the super chat
        pinSuperChat(user, text, superChat);
    } else {
        div.className = 'chat-msg';
        div.innerHTML = `
      <div class="msg-icon">${escapeHTML(user.icon)}</div>
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
    const scInfo = SC_TIERS[superChat.amount];
    const duration = PIN_DURATIONS[superChat.tier];

    const pin = document.createElement('div');
    pin.className = `pinned-sc tier-${superChat.tier}`;
    pin.innerHTML = `
    <div class="pinned-icon">${escapeHTML(user.icon)}</div>
    <div class="pinned-info">
      <div class="pinned-name">${escapeHTML(user.name)}</div>
      <div class="pinned-amount">${scInfo.label}</div>
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

// ===== Text-to-Speech =====
function queueTTS(data) {
    let ttsText;

    if (data.superChat) {
        const scInfo = SC_TIERS[data.superChat.amount];
        ttsText = `${data.user.name}さんから${scInfo.label}のスーパーチャット。${data.text}`;
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

// ===== Start =====
document.addEventListener('DOMContentLoaded', init);
