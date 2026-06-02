const video = document.getElementById('webcam-feed');
let stream = null;

export async function startWebcam() {
    try {
        stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
            audio: false
        });
        video.srcObject = stream;
        await video.play();
        return true;
    } catch (err) {
        console.warn('Webcam error:', err.message);
        video.style.display = 'none';
        return false;
    }
}

export function stopWebcam() {
    if (stream) {
        stream.getTracks().forEach(t => t.stop());
    }
}

// ====== Определение лица через canvas ======
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d');

export function detectFace() {
    if (!video.videoWidth || !video.readyState) return null;
    
    const w = video.videoWidth;
    const h = video.videoHeight;
    canvas.width = w;
    canvas.height = h;
    
    ctx.drawImage(video, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    
    // Простое определение лица по цвету кожи
    // Ищем область с наибольшей концентрацией телесного цвета
    let totalPixels = 0;
    let sumX = 0, sumY = 0;
    
    for (let y = 0; y < h; y += 4) {
        for (let x = 0; x < w; x += 4) {
            const idx = (y * w + x) * 4;
            const r = data[idx];
            const g = data[idx + 1];
            const b = data[idx + 2];
            
            // Простой детектор кожи (YCrCb simplified)
            if (r > 95 && g > 40 && b > 20 &&
                r > g && r > b &&
                Math.abs(r - g) > 15 &&
                r > 100 && r < 250) {
                sumX += x;
                sumY += y;
                totalPixels++;
            }
        }
    }
    
    if (totalPixels > 20) {
        const centerX = (sumX / totalPixels / w) * 2 - 1; // -1..1
        const centerY = (sumY / totalPixels / h) * 2 - 1;
        return { x: centerX, y: centerY };
    }
    
    return null;
}
