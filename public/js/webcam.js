// ====== Веб-камера ======
let stream = null;
const video = document.getElementById('webcam-feed');

export async function startWebcam() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: {
                width: { ideal: 320 },
                height: { ideal: 240 },
                facingMode: 'user',
            },
            audio: false,
        });
        video.srcObject = stream;
        await video.play();
        console.log('Веб-камера активирована');
        return true;
    } catch (err) {
        console.warn('Не удалось включить веб-камеру:', err.message);
        // Показываем заглушку
        const canvas = document.createElement('canvas');
        canvas.width = 320;
        canvas.height = 240;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#1a1a2e';
        ctx.fillRect(0, 0, 320, 240);
        ctx.fillStyle = '#666';
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Камера недоступна', 160, 120);
        video.srcObject = null;
        video.poster = canvas.toDataURL();
        return false;
    }
}

export function stopWebcam() {
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
    }
}

export function captureFrame() {
    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 320;
    canvas.height = video.videoHeight || 240;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL('image/jpeg', 0.7);
}

// Детекция движения (простая)
let previousFrame = null;
export function detectMotion() {
    if (!video.videoWidth) return 0;
    
    const canvas = document.createElement('canvas');
    canvas.width = 80;
    canvas.height = 60;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, 80, 60);
    const data = ctx.getImageData(0, 0, 80, 60).data;
    
    if (!previousFrame) {
        previousFrame = data;
        return 0;
    }
    
    let diff = 0;
    for (let i = 0; i < data.length; i += 16) {
        diff += Math.abs(data[i] - previousFrame[i]);
    }
    previousFrame = data;
    
    return diff / (data.length / 16);
}
