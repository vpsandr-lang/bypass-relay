// ====== Голосовое взаимодействие ======
let recognition = null;
let isListening = false;
let isSpeakingEnabled = true;
let isProcessing = false;
let onFinalResult = null;
let currentUtterance = null;

// ====== Speech Recognition ======
function initRecognition() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        console.warn('Speech Recognition not supported');
        return null;
    }
    const r = new SR();
    r.lang = 'ru-RU';
    r.continuous = true;
    r.interimResults = true;
    r.maxAlternatives = 3;

    r.onresult = (event) => {
        let final = '';
        let interim = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
                final += event.results[i][0].transcript;
            } else {
                interim += event.results[i][0].transcript;
            }
        }
        if (final) {
            showStatus(`👤 ${final}`);
            if (onFinalResult) onFinalResult(final);
        } else if (interim) {
            showStatus(`🎤 ${interim}...`);
        }
    };

    r.onerror = (e) => {
        if (e.error !== 'no-speech') {
            console.warn('Recognition error:', e.error);
        }
    };

    r.onend = () => {
        if (isListening && !isProcessing) {
            try { r.start(); } catch(e) {}
        }
    };

    return r;
}

export function startListening(callback) {
    onFinalResult = callback;
    if (!recognition) {
        recognition = initRecognition();
        if (!recognition) return;
    }
    try {
        recognition.start();
        isListening = true;
        updateMicBtn(true);
        showStatus('🎤 Слушаю...');
    } catch(e) {}
}

export function stopListening() {
    if (recognition && isListening) {
        try { recognition.stop(); } catch(e) {}
    }
    isListening = false;
    updateMicBtn(false);
}

export function toggleListening(callback) {
    if (isListening) {
        stopListening();
    } else {
        startListening(callback);
    }
}

export function setProcessing(val) {
    isProcessing = val;
    if (val) {
        stopListening();
    } else if (isListening) {
        startListening(onFinalResult);
    }
}

function updateMicBtn(active) {
    const btn = document.getElementById('btn-mic');
    if (!btn) return;
    btn.className = `btn ${active ? 'listening' : ''}`;
}

// ====== Speech Synthesis ======
export function speakText(text, onDone) {
    if (!isSpeakingEnabled) {
        if (onDone) onDone();
        return;
    }

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'ru-RU';
    utterance.rate = 0.95;
    utterance.pitch = 1.1;
    utterance.volume = 1;

    // Выбор голоса
    const voices = window.speechSynthesis.getVoices();
    const ruVoice = voices.find(v => v.lang.startsWith('ru') && /female|google|samantha/i.test(v.name))
        || voices.find(v => v.lang.startsWith('ru'))
        || voices.find(v => /google|samantha/i.test(v.name))
        || voices[0];
    if (ruVoice) utterance.voice = ruVoice;

    const bubble = document.getElementById('speech-bubble');
    const statusText = document.getElementById('status-text');

    utterance.onstart = () => {
        updateSpeakBtn(true);
        showBubble(text);
        updateStatusFromBtn('🔊');
    };

    utterance.onend = () => {
        updateSpeakBtn(false);
        hideBubble();
        if (onDone) onDone();
    };

    utterance.onerror = () => {
        updateSpeakBtn(false);
        hideBubble();
        if (onDone) onDone();
    };

    currentUtterance = utterance;
    window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
    window.speechSynthesis.cancel();
    updateSpeakBtn(false);
    hideBubble();
}

export function toggleSpeaking() {
    isSpeakingEnabled = !isSpeakingEnabled;
    const btn = document.getElementById('btn-speak');
    if (btn) btn.className = `btn ${isSpeakingEnabled ? 'active' : ''}`;
    if (!isSpeakingEnabled) stopSpeaking();
}

export function isSpeechEnabled() {
    return isSpeakingEnabled;
}

function updateSpeakBtn(active) {
    const btn = document.getElementById('btn-speak');
    if (!btn) return;
    btn.className = `btn ${active ? 'speaking' : (isSpeakingEnabled ? 'active' : '')}`;
}

// ====== UI helpers ======
function showBubble(text) {
    const el = document.getElementById('speech-bubble');
    if (el) {
        el.textContent = text;
        el.classList.add('visible');
    }
}

function hideBubble() {
    const el = document.getElementById('speech-bubble');
    if (el) el.classList.remove('visible');
}

export function showStatus(text) {
    const el = document.getElementById('status-text');
    if (el) {
        el.textContent = text;
        el.style.opacity = '1';
        clearTimeout(el._timeout);
        el._timeout = setTimeout(() => {
            if (!isListening && !isProcessing) {
                el.textContent = 'Нажмите на микрофон для начала разговора';
            }
        }, 5000);
    }
}

function updateStatusFromBtn(text) {
    const el = document.getElementById('status-text');
    if (el) el.textContent = text;
}

export function resetStatus() {
    const el = document.getElementById('status-text');
    if (el && !isListening && !isProcessing) {
        el.textContent = 'Нажмите на микрофон для начала разговора';
    }
}
