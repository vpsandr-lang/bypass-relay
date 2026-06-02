import { setSpeaking, setMouthOpen, setStatus } from './avatar.js';

// ====== Состояние ======
let isListening = false;
let isSpeakingEnabled = true;
let speechSynthesis = window.speechSynthesis;
let recognition = null;
let onSpeechResult = null;
let currentUtterance = null;

// ====== Инициализация распознавания речи ======
function initSpeechRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
        console.warn('Speech Recognition не поддерживается браузером');
        return null;
    }

    const recog = new SpeechRecognition();
    recog.lang = 'ru-RU';
    recog.continuous = false;
    recog.interimResults = true;
    recog.maxAlternatives = 3;

    recog.onresult = (event) => {
        let interim = '';
        let final = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcript = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
                final += transcript;
            } else {
                interim += transcript;
            }
        }

        if (final && onSpeechResult) {
            onSpeechResult(final);
            stopListening();
        }
    };

    recog.onerror = (event) => {
        console.warn('Speech recognition error:', event.error);
        isListening = false;
        updateMicButton(false);
        if (event.error === 'no-speech') {
            // Просто перезапускаем через секунду
            setTimeout(() => {
                if (isListening) startListening();
            }, 1000);
        }
    };

    recog.onend = () => {
        if (isListening) {
            // Автоматически перезапускаем если всё ещё в режиме прослушивания
            try { recog.start(); } catch(e) {}
        }
    };

    return recog;
}

// ====== Управление микрофоном ======
export function startListening() {
    if (!recognition) {
        recognition = initSpeechRecognition();
        if (!recognition) {
            showToast('Распознавание речи не поддерживается в этом браузере', 'error');
            return;
        }
    }

    try {
        recognition.start();
        isListening = true;
        updateMicButton(true);
        setStatus('speaking', 'Елена — слушает...');
    } catch (e) {
        console.warn('Recognition start error:', e);
    }
}

export function stopListening() {
    if (recognition && isListening) {
        try {
            recognition.stop();
        } catch (e) {}
    }
    isListening = false;
    updateMicButton(false);
}

export function toggleListening() {
    if (isListening) {
        stopListening();
    } else {
        startListening();
    }
}

export function setOnSpeechResult(callback) {
    onSpeechResult = callback;
}

// ====== Микрофон индикатор ======
function updateMicButton(active) {
    const btn = document.getElementById('btn-mic');
    if (btn) {
        btn.classList.toggle('active', active);
        btn.innerHTML = active ? '<span class="icon">🎤</span>' : '<span class="icon">🎤</span>';
    }
}

// ====== Синтез речи ======
export function speakText(text, onEnd) {
    if (!isSpeakingEnabled) {
        if (onEnd) onEnd();
        return;
    }

    // Отменяем предыдущую речь
    if (currentUtterance) {
        speechSynthesis.cancel();
    }

    // Разбиваем на предложения для более естественного звучания
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let index = 0;

    function speakNext() {
        if (index >= sentences.length) {
            setSpeaking(false);
            if (onEnd) onEnd();
            return;
        }

        const utterance = new SpeechSynthesisUtterance(sentences[index].trim());
        utterance.lang = 'ru-RU';
        utterance.rate = 1.0;
        utterance.pitch = 1.1;
        utterance.volume = 1;

        // Выбираем женский голос для синтеза
        const voices = speechSynthesis.getVoices();
        const russianVoice = voices.find(v => v.lang.startsWith('ru') && v.name.includes('Female')) 
            || voices.find(v => v.lang.startsWith('ru'))
            || voices.find(v => v.name.includes('Samantha'))
            || voices.find(v => v.name.includes('Google'))
            || voices[0];
        
        if (russianVoice) utterance.voice = russianVoice;

        utterance.onstart = () => {
            setSpeaking(true);
            // Анимация рта во время речи
            const mouthInterval = setInterval(() => {
                const value = Math.random() * 0.8 + 0.2;
                setMouthOpen(value);
            }, 100);
            utterance.userData = { mouthInterval };
        };

        utterance.onend = () => {
            if (utterance.userData?.mouthInterval) {
                clearInterval(utterance.userData.mouthInterval);
            }
            setMouthOpen(0);
            index++;
            speakNext();
        };

        utterance.onerror = () => {
            setSpeaking(false);
            setMouthOpen(0);
            index++;
            speakNext();
        };

        currentUtterance = utterance;
        speechSynthesis.speak(utterance);
    }

    setSpeaking(true);
    speakNext();
}

export function stopSpeaking() {
    speechSynthesis.cancel();
    setSpeaking(false);
    setMouthOpen(0);
    currentUtterance = null;
}

export function toggleSpeaking() {
    isSpeakingEnabled = !isSpeakingEnabled;
    const btn = document.getElementById('btn-speak');
    if (btn) {
        btn.classList.toggle('active', isSpeakingEnabled);
        btn.innerHTML = isSpeakingEnabled ? '<span class="icon">🔊</span>' : '<span class="icon">🔇</span>';
    }
    if (!isSpeakingEnabled) stopSpeaking();
}

export function isSpeechEnabled() {
    return isSpeakingEnabled;
}

// ====== Toast уведомления ======
function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

export { isListening };
