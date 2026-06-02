import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { VRM, VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm';

// ====== Состояние аватара ======
export const avatarState = {
    isSpeaking: false,
    isThinking: false,
    mouthOpen: 0,
    blinkTimer: 0,
    isBlinking: false,
    headTarget: new THREE.Vector3(0, 0, 0),
    idleBreathPhase: 0,
};

// ====== Основные переменные ======
let scene, camera, renderer;
let vrm = null;
let currentModel = null;
let clock = new THREE.Clock();
let animationId = null;
const container = document.getElementById('avatar-container');
const statusText = document.getElementById('status-text');
const statusIndicator = document.getElementById('status-indicator');

// ====== Создание сцены ======
function initScene() {
    const width = container.clientWidth;
    const height = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x1a237e);

    camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 20);
    camera.position.set(0, 0.8, 2.2);
    camera.lookAt(0, 0.7, 0);

    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: false,
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.2;
    container.appendChild(renderer.domElement);

    // Освещение
    const ambientLight = new THREE.AmbientLight(0x404060, 0.8);
    scene.add(ambientLight);

    const mainLight = new THREE.DirectionalLight(0xffeedd, 2);
    mainLight.position.set(2, 3, 4);
    mainLight.castShadow = true;
    scene.add(mainLight);

    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.6);
    fillLight.position.set(-3, 1, -2);
    scene.add(fillLight);

    const rimLight = new THREE.DirectionalLight(0x4488ff, 1);
    rimLight.position.set(-1, 2, -3);
    scene.add(rimLight);

    const backLight = new THREE.DirectionalLight(0xffffff, 0.5);
    backLight.position.set(0, 1, -3);
    scene.add(backLight);

    // Пол
    const floorGeometry = new THREE.CircleGeometry(3, 32);
    const floorMaterial = new THREE.MeshStandardMaterial({
        color: 0x0d1442,
        metalness: 0.1,
        roughness: 0.8,
        transparent: true,
        opacity: 0.6,
    });
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.5;
    floor.receiveShadow = true;
    scene.add(floor);

    // Эффект свечения вокруг персонажа
    const glowGeometry = new THREE.PlaneGeometry(4, 4);
    const glowMaterial = new THREE.MeshBasicMaterial({
        color: 0x3949ab,
        transparent: true,
        opacity: 0.05,
        blending: THREE.AdditiveBlending,
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.set(0, 0.7, -0.5);
    scene.add(glow);

    // Обработка ресайза
    window.addEventListener('resize', onResize);

    return { scene, camera, renderer };
}

function onResize() {
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (camera && renderer) {
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    }
}

// ====== Загрузка VRM модели ======
async function loadVRMModel(url) {
    try {
        const loader = new GLTFLoader();
        loader.registerPlugin(new VRMLoaderPlugin(VRMUtils));

        const gltf = await loader.loadAsync(url);
        const loadedVrm = gltf.userData.vrm;
        vrm = loadedVrm;

        // Настройка модели
        VRMUtils.deepDispose(gltf.scene);
        await vrm.scene;

        // Масштабирование и позиционирование
        vrm.scene.position.set(0, -0.5, 0);
        vrm.scene.scale.set(0.8, 0.8, 0.8);
        scene.add(vrm.scene);

        // Включаем анимации если есть
        if (vrm.animations) {
            vrm.animations.enable = true;
        }

        setStatus('online', 'Елена — готова помочь');
        console.log('VRM модель загружена успешно');
        return true;
    } catch (err) {
        console.warn('Не удалось загрузить VRM модель:', err.message);
        console.log('Создаю процедурного аватара...');
        createProceduralAvatar();
        return false;
    }
}

// ====== Создание процедурного аватара (запасной вариант) ======
function createProceduralAvatar() {
    const group = new THREE.Group();

    // Тело (торс)
    const bodyGeom = new THREE.CylinderGeometry(0.3, 0.25, 0.6, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
        color: 0x2c3e6b,
        metalness: 0.1,
        roughness: 0.6,
    });
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.y = 0.2;
    body.castShadow = true;
    group.add(body);

    // Воротник / плечи
    const shoulderGeom = new THREE.CylinderGeometry(0.35, 0.3, 0.08, 16);
    const shoulderMat = new THREE.MeshStandardMaterial({
        color: 0x1a237e,
        metalness: 0.3,
        roughness: 0.4,
    });
    const shoulders = new THREE.Mesh(shoulderGeom, shoulderMat);
    shoulders.position.y = 0.5;
    shoulders.castShadow = true;
    group.add(shoulders);

    // Шея
    const neckGeom = new THREE.CylinderGeometry(0.08, 0.1, 0.1, 12);
    const neckMat = new THREE.MeshStandardMaterial({
        color: 0xf5d6c6,
        roughness: 0.7,
    });
    const neck = new THREE.Mesh(neckGeom, neckMat);
    neck.position.y = 0.58;
    group.add(neck);

    // Голова
    const headGeom = new THREE.SphereGeometry(0.14, 24, 24);
    const headMat = new THREE.MeshStandardMaterial({
        color: 0xf5d6c6,
        roughness: 0.6,
    });
    const head = new THREE.Mesh(headGeom, headMat);
    head.position.y = 0.7;
    head.castShadow = true;
    group.add(head);

    // Волосы
    const hairGeom = new THREE.SphereGeometry(0.145, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.6);
    const hairMat = new THREE.MeshStandardMaterial({
        color: 0x3d2b1f,
        roughness: 0.9,
    });
    const hair = new THREE.Mesh(hairGeom, hairMat);
    hair.position.y = 0.73;
    hair.scale.y = 0.6;
    group.add(hair);

    // Глаза
    const eyeMat = new THREE.MeshStandardMaterial({
        color: 0x2c5a8c,
        roughness: 0.1,
        metalness: 0.3,
    });
    const eyeWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.4,
    });

    for (let side = -1; side <= 1; side += 2) {
        const eyeGroup = new THREE.Group();
        
        const white = new THREE.Mesh(
            new THREE.SphereGeometry(0.04, 16, 16),
            eyeWhiteMat
        );
        eyeGroup.add(white);

        const pupil = new THREE.Mesh(
            new THREE.SphereGeometry(0.025, 16, 16),
            eyeMat
        );
        pupil.position.z = 0.035;
        eyeGroup.add(pupil);

        eyeGroup.position.set(side * 0.06, 0.72, 0.12);
        eyeGroup.scale.set(1, 0.5, 0.3);
        group.add(eyeGroup);
    }

    // Рот (челюсть)
    const mouthGeom = new THREE.BoxGeometry(0.05, 0.008, 0.02);
    const mouthMat = new THREE.MeshStandardMaterial({ color: 0xc0392b });
    const mouth = new THREE.Mesh(mouthGeom, mouthMat);
    mouth.position.set(0, 0.66, 0.13);
    group.add(mouth);

    // Брови
    const browMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f });
    for (let side = -1; side <= 1; side += 2) {
        const brow = new THREE.Mesh(
            new THREE.BoxGeometry(0.035, 0.008, 0.01),
            browMat
        );
        brow.position.set(side * 0.05, 0.75, 0.14);
        group.add(brow);
    }

    // Пиджак / воротник
    const collarMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.5,
    });
    const collar = new THREE.Mesh(
        new THREE.BoxGeometry(0.12, 0.04, 0.06),
        collarMat
    );
    collar.position.set(0, 0.52, 0.12);
    group.add(collar);

    // Галстук
    const tieMat = new THREE.MeshStandardMaterial({
        color: 0xc5a55a,
        metalness: 0.3,
        roughness: 0.3,
    });
    const tie = new THREE.Mesh(
        new THREE.BoxGeometry(0.03, 0.2, 0.02),
        tieMat
    );
    tie.position.set(0, 0.38, 0.12);
    group.add(tie);

    group.position.y = -0.1;
    scene.add(group);
    currentModel = group;

    // Сохраняем ссылки для анимации
    currentModel.userData = {
        head: head,
        mouth: mouth,
        body: body,
        eyeGroupL: group.children.find(c => c.position.x === -0.06 && c.position.y === 0.72),
        eyeGroupR: group.children.find(c => c.position.x === 0.06 && c.position.y === 0.72),
        leftEye: null,
        rightEye: null,
    };

    setStatus('online', 'Елена — готова помочь');
    console.log('Процедурный аватар создан');
}

// ====== Анимация аватара ======
function animateAvatar() {
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (vrm) {
        // VRM анимация
        animateVRM(delta, time);
    } else if (currentModel) {
        // Процедурная анимация
        animateProcedural(delta, time);
    }
}

function animateVRM(delta, time) {
    if (!vrm || !vrm.scene) return;

    // Дыхание
    const breath = Math.sin(time * 1.5) * 0.005;
    vrm.scene.position.y = -0.5 + breath;

    // Покачивание
    const sway = Math.sin(time * 0.8) * 0.003;
    vrm.scene.rotation.z = sway;

    // Моргание
    avatarState.blinkTimer += delta;
    if (avatarState.blinkTimer > 3 + Math.random() * 2 && !avatarState.isBlinking) {
        avatarState.isBlinking = true;
        avatarState.blinkTimer = 0;
    }
    if (avatarState.isBlinking) {
        const blinkValue = Math.sin(avatarState.blinkTimer * 20);
        if (blinkValue < 0) {
            if (vrm.blendShapeProxy) {
                vrm.blendShapeProxy.setValue('blink', Math.abs(blinkValue));
            }
        } else {
            avatarState.isBlinking = false;
            if (vrm.blendShapeProxy) {
                vrm.blendShapeProxy.setValue('blink', 0);
            }
        }
    }

    // Синхронизация губ при речи
    if (avatarState.isSpeaking && vrm.blendShapeProxy) {
        const mouthValue = Math.min(1, avatarState.mouthOpen + Math.sin(time * 12) * 0.3 + 0.3);
        vrm.blendShapeProxy.setValue('aa', mouthValue * 0.3);
        vrm.blendShapeProxy.setValue('ih', mouthValue * 0.2);
    }

    // Поворот головы
    if (vrm.humanoid) {
        const headNode = vrm.humanoid.getRawBoneNode('head');
        if (headNode) {
            const target = avatarState.headTarget;
            const currentRot = headNode.rotation;
            headNode.rotation.x += (target.x - currentRot.x) * delta * 2;
            headNode.rotation.y += (target.y - currentRot.y) * delta * 2;
        }
    }

    vrm.update(delta);
}

function animateProcedural(delta, time) {
    if (!currentModel) return;

    const data = currentModel.userData;
    
    // Дыхание / покачивание
    const breath = Math.sin(time * 1.5) * 0.003;
    currentModel.position.y = -0.1 + breath;
    currentModel.rotation.z = Math.sin(time * 0.8) * 0.002;

    // Поворот головы
    if (data.head) {
        data.head.rotation.x += (avatarState.headTarget.x - data.head.rotation.x) * delta * 2;
        data.head.rotation.y += (avatarState.headTarget.y * 0.5 - data.head.rotation.y) * delta * 2;
    }

    // Моргание
    avatarState.blinkTimer += delta;
    if (avatarState.blinkTimer > 2.5 + Math.random() * 3 && !avatarState.isBlinking) {
        avatarState.isBlinking = true;
        avatarState.blinkTimer = 0;
    }
    if (avatarState.isBlinking) {
        const blinkProgress = avatarState.blinkTimer * 15;
        if (blinkProgress < Math.PI) {
            const scale = Math.abs(Math.cos(blinkProgress));
            // Scale eyes
            for (const key of ['eyeGroupL', 'eyeGroupR']) {
                if (data[key]) {
                    data[key].scale.y = 0.5 - scale * 0.45;
                }
            }
        } else {
            avatarState.isBlinking = false;
            for (const key of ['eyeGroupL', 'eyeGroupR']) {
                if (data[key]) {
                    data[key].scale.y = 0.5;
                }
            }
        }
    }

    // Рот при речи
    if (data.mouth) {
        if (avatarState.isSpeaking) {
            const mouthVal = avatarState.mouthOpen + Math.sin(time * 14) * 0.5;
            const clampedMouth = Math.max(0.008, Math.min(0.06, 0.008 + mouthVal * 0.04));
            data.mouth.scale.y = clampedMouth / 0.008;
        } else {
            data.mouth.scale.y += (1 - data.mouth.scale.y) * delta * 8;
        }
    }
}

// ====== Управление статусом ======
export function setStatus(type, text) {
    statusIndicator.className = `status-${type}`;
    if (text) statusText.textContent = text;
}

export function setSpeaking(isSpeaking) {
    avatarState.isSpeaking = isSpeaking;
    if (isSpeaking) {
        setStatus('speaking', 'Елена — говорит');
    } else {
        avatarState.mouthOpen = 0;
        setStatus('online', 'Елена — готова помочь');
    }
}

export function setThinking(isThinking) {
    avatarState.isThinking = isThinking;
    if (isThinking) {
        setStatus('thinking', 'Елена — обрабатывает запрос...');
    } else {
        setStatus('online', 'Елена — готова помочь');
    }
}

export function setMouthOpen(value) {
    avatarState.mouthOpen = Math.min(1, Math.max(0, value));
}

export function lookAt(x, y) {
    avatarState.headTarget.set(x || 0, y || 0, 0);
}

// ====== Загрузка аватара ======
export async function initAvatar() {
    initScene();
    
    // Пробуем загрузить VRM модель
    const vrmUrls = [
        'models/avatar.vrm',
        'https://cdn.jsdelivr.net/gh/vrm-c/vrm-spec/samples/avatar-sample.vrm',
    ];

    let loaded = false;
    for (const url of vrmUrls) {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (response.ok) {
                loaded = await loadVRMModel(url);
                if (loaded) break;
            }
        } catch (e) {
            console.log(`VRM недоступен: ${url}`);
        }
    }

    if (!loaded) {
        createProceduralAvatar();
    }

    // Запускаем цикл анимации
    function animate() {
        animationId = requestAnimationFrame(animate);
        animateAvatar();
        renderer.render(scene, camera);
    }
    animate();

    // Периодически смотрим в сторону или случайное движение
    setInterval(() => {
        if (!avatarState.isSpeaking) {
            lookAt(
                (Math.random() - 0.5) * 0.2,
                (Math.random() - 0.5) * 0.05
            );
        }
    }, 4000);
}
