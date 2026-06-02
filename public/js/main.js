import { initAvatar, setStatus, setSpeaking, setThinking, lookAt } from './avatar.js';
import { 
    toggleListening, setOnSpeechResult, speakText, stopSpeaking, 
    toggleSpeaking, isSpeechEnabled, startListening 
} from './speech.js';
import { startWebcam } from './webcam.js';
import { initAppointments, closeModal, openAppointmentForm } from './appointments.js';

// ====== Состояние ======
let chatHistory = [];
let isProcessing = false;

// ====== Socket.IO ======
const socket = io();

// ====== DOM элементы ======
const messagesContainer = document.getElementById('chat-messages');
const messageInput = document.getElementById('message-input');
const sendBtn = document.getElementById('btn-send');
const micBtn = document.getElementById('btn-mic');
const speakBtn = document.getElementById('btn-speak');
const typingIndicator = document.getElementById('typing-indicator');
const quickBtns = document.querySelectorAll('.quick-btn');
const fullscreenBtn = document.getElementById('btn-fullscreen');

// ====== Инициализация ======
async function init() {
    console.log('🔄 Инициализация виртуального офис-менеджера...');

    // Инициализация 3D аватара
    await initAvatar();
    
    // Запуск веб-камеры
    await startWebcam();

    // Инициализация записи на приём
    initAppointments(socket);

    // Настройка обработчиков
    setupEventHandlers();

    // Устанавливаем обработчик распознавания речи
    setOnSpeechResult(handleSpeechResult);

    // Автоматическое приветствие через 1.5 секунды
    setTimeout(() => {
        addMessage('assistant', 'Здравствуйте! Меня зовут Елена. Я — виртуальный офис-менеджер нашей нотариальной конторы. Чем я могу вам помочь? Вы можете спросить меня о наших услугах, ценах, необходимых документах или записаться на приём к нотариусу.');
        speakIfEnabled('Здравствуйте! Меня зовут Елена. Я — виртуальный офис-менеджер нашей нотариальной конторы. Чем я могу вам помочь?');
    }, 1500);

    // Слушаем события
    window.addEventListener('appointment:created', (e) => {
        const data = e.detail;
        addMessage('assistant', `Отлично, ${data.name}! Вы записаны на ${data.date} в ${data.time}. Ждём вас в нашей нотариальной конторе!`);
        speakIfEnabled(`Отлично, ${data.name}! Вы записаны на ${data.date} в ${data.time}. Ждём вас в нашей нотариальной конторе!`);
    });

    // Фокусируемся на вводе
    messageInput.focus();

    console.log('✅ Виртуальный офис-менеджер запущен');
}

// ====== Обработчики событий ======
function setupEventHandlers() {
    // Отправка сообщения
    sendBtn.addEventListener('click', sendMessage);
    messageInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Микрофон
    micBtn.addEventListener('click', toggleListening);

    // Озвучивание
    speakBtn.addEventListener('click', toggleSpeaking);

    // Быстрые кнопки
    quickBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            messageInput.value = btn.dataset.question;
            sendMessage();
        });
    });

    // Полный экран
    fullscreenBtn.addEventListener('click', toggleFullscreen);
}

// ====== Отправка сообщения ======
async function sendMessage() {
    const text = messageInput.value.trim();
    if (!text || isProcessing) return;

    messageInput.value = '';
    addMessage('user', text);

    await processUserMessage(text);
}

// ====== Обработка результата распознавания речи ======
async function handleSpeechResult(text) {
    if (!text || isProcessing) return;
    
    addMessage('user', `🎤 ${text}`);
    await processUserMessage(text);
}

// ====== Обработка сообщения пользователя ======
async function processUserMessage(text) {
    isProcessing = true;
    setThinking(true);
    typingIndicator.classList.remove('hidden');
    scrollToBottom();

    // Проверяем, хочет ли пользователь записаться
    const isAppointmentIntent = /записат|запишите|запись на приём|хочу записаться/i.test(text);
    
    try {
        // Отправляем запрос к LLM через бэкенд
        const response = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                message: text,
                history: chatHistory.slice(-20)
            })
        });

        if (!response.ok) throw new Error('Server error');

        const data = await response.json();
        const answer = data.answer;

        // Обновляем историю
        chatHistory.push({ role: 'user', content: text });
        chatHistory.push({ role: 'assistant', content: answer });

        // Добавляем сообщение в чат
        typingIndicator.classList.add('hidden');
        setThinking(false);
        
        addMessage('assistant', answer);
        speakIfEnabled(answer);
        scrollToBottom();

        // Если пользователь хочет записаться, открываем форму
        if (isAppointmentIntent) {
            setTimeout(() => openAppointmentForm({}), 2000);
        }

    } catch (err) {
        console.error('Chat error:', err);
        typingIndicator.classList.add('hidden');
        setThinking(false);
        
        const errorMsg = 'Извините, произошла ошибка. Пожалуйста, попробуйте ещё раз или обратитесь к нотариусу по телефону.';
        addMessage('assistant', errorMsg);
        speakIfEnabled(errorMsg);
    } finally {
        isProcessing = false;
    }
}

// ====== Добавление сообщения в чат ======
function addMessage(role, content) {
    const div = document.createElement('div');
    div.className = `message ${role}`;
    
    const contentDiv = document.createElement('div');
    contentDiv.className = 'msg-content';
    contentDiv.textContent = content;
    
    div.appendChild(contentDiv);
    messagesContainer.appendChild(div);
    scrollToBottom();
}

// ====== Прокрутка вниз ======
function scrollToBottom() {
    const container = document.getElementById('chat-container');
    container.scrollTop = container.scrollHeight;
}

// ====== Озвучивание ======
function speakIfEnabled(text) {
    if (isSpeechEnabled()) {
        // Берем только первые 3 предложения для озвучивания
        const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
        const speakText = sentences.slice(0, 3).join(' ');
        speakText(speakText);
    }
}

// ====== Полный экран ======
function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.() || 
        document.documentElement.webkitRequestFullscreen?.();
    } else {
        document.exitFullscreen?.() || 
        document.webkitExitFullscreen?.();
    }
}

// ====== Запуск ======
document.addEventListener('DOMContentLoaded', init);
