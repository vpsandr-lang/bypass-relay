import { initScene3D, setSpeaking, setListening, updateFacePosition, resetFacePosition } from './scene.js';
import { 
    toggleListening, speakText, showStatus, setProcessing,
    toggleSpeaking, startListening, stopListening, stopSpeaking, isSpeechEnabled
} from './voice.js';
import { startWebcam, detectFace } from './webcam.js';

let isProcessing = false;
let chatHistory = [];
let wakeTimeout = null;

// ====== Инициализация ======
async function init() {
    console.log('🔄 Запуск виртуального офис-менеджера...');

    // 3D сцена
    initScene3D();

    // Веб-камера
    await startWebcam();

    // Загружаем голоса
    window.speechSynthesis.getVoices();
    window.speechSynthesis.onvoiceschanged = () => window.speechSynthesis.getVoices();

    // Кнопки
    document.getElementById('btn-mic').addEventListener('click', () => {
        toggleListening(handleUserSpeech);
    });
    document.getElementById('btn-speak').addEventListener('click', toggleSpeaking);

    // Приветствие
    setTimeout(() => {
        showStatus('👋 Елена поприветствует вас...');
        const greeting = 'Здравствуйте! Я Елена, виртуальный офис-менеджер. Чем я могу вам помочь?';
        speakText(greeting, () => {
            setTimeout(() => startListening(handleUserSpeech), 1000);
        });
    }, 2000);

    // Поиск лица каждые 500мс
    setInterval(() => {
        const face = detectFace();
        if (face) {
            updateFacePosition(face.x, face.y);
        } else {
            resetFacePosition();
        }
    }, 500);

    console.log('✅ Виртуальный офис-менеджер запущен');
}

// ====== Обработка речи пользователя ======
async function handleUserSpeech(text) {
    if (isProcessing || !text.trim()) return;

    isProcessing = true;
    setProcessing(true);
    setListening(true);
    showStatus('⏳ Елена думает...');

    try {
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history: chatHistory.slice(-10)
            })
        });

        if (!response.ok) throw new Error('Server error');

        const data = await response.json();
        const answer = data.answer;

        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: answer });

        // Озвучиваем ответ
        setSpeaking(true);
        showStatus('🔊 Елена отвечает...');

        speakText(answer, () => {
            setSpeaking(false);
            isProcessing = false;
            setProcessing(false);
            
            // Снова начинаем слушать
            setTimeout(() => {
                if (!isProcessing) {
                    startListening(handleUserSpeech);
                }
            }, 500);
        });

    } catch (err) {
        console.error('Error:', err);
        showStatus('❌ Ошибка. Попробуйте ещё раз');
        isProcessing = false;
        setProcessing(false);
        setTimeout(() => startListening(handleUserSpeech), 2000);
    }
}

// ====== Запуск ======
document.addEventListener('DOMContentLoaded', init);
