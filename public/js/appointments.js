// ====== Модальное окно записи на приём ======
const modal = document.getElementById('appointment-modal');
const form = document.getElementById('appointment-form');
const closeBtn = document.querySelector('.modal-close');

let socket = null;

export function initAppointments(socketInstance) {
    socket = socketInstance;

    // Открытие модального окна
    document.getElementById('btn-appointment').addEventListener('click', () => {
        openModal();
    });

    // Закрытие
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) closeModal();
    });

    // Установка минимальной даты (сегодня)
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('apt-date').setAttribute('min', today);

    // Отправка формы
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitAppointment();
    });
}

function openModal() {
    modal.classList.remove('hidden');
    // Устанавливаем дату по умолчанию (завтра)
    const tomorrow = new Date(Date.now() + 86400000);
    document.getElementById('apt-date').value = tomorrow.toISOString().split('T')[0];
    document.getElementById('apt-time').value = '10:00';
}

export function closeModal() {
    modal.classList.add('hidden');
    form.reset();
}

async function submitAppointment() {
    const data = {
        name: document.getElementById('apt-name').value.trim(),
        phone: document.getElementById('apt-phone').value.trim(),
        email: document.getElementById('apt-email').value.trim(),
        date: document.getElementById('apt-date').value,
        time: document.getElementById('apt-time').value,
        service_type: document.getElementById('apt-service').value,
        notes: document.getElementById('apt-notes').value.trim(),
    };

    if (!data.name || !data.date || !data.time) {
        showToast('Заполните обязательные поля', 'error');
        return;
    }

    try {
        const response = await fetch('/api/appointments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data),
        });

        if (!response.ok) throw new Error('Ошибка сервера');

        const result = await response.json();
        showToast(`✅ ${result.message}`);
        closeModal();

        // Отправляем уведомление через Socket.IO
        if (socket) {
            socket.emit('appointment:created', data);
        }

        // Добавляем сообщение в чат
        window.dispatchEvent(new CustomEvent('appointment:created', {
            detail: data
        }));

    } catch (err) {
        showToast('❌ Ошибка при записи. Попробуйте позже.', 'error');
        console.error('Appointment error:', err);
    }
}

export function openAppointmentForm(partialData) {
    openModal();
    if (partialData.name) document.getElementById('apt-name').value = partialData.name;
    if (partialData.phone) document.getElementById('apt-phone').value = partialData.phone;
}

function showToast(message, type = 'success') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}
