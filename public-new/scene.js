import * as THREE from 'three';

// ====== Состояние ======
export const avatarState = {
    isSpeaking: false,
    isListening: false,
    mouthOpen: 0,
    blinkTimer: 0,
    isBlinking: false,
    headTarget: new THREE.Vector3(0, 0, 0),
    faceDetected: false,
    faceX: 0,
    faceY: 0,
};

let scene, camera, renderer;
let clock = new THREE.Clock();
let model = null;
let headBone, leftEye, rightEye, mouth, jawBone;
let leftEyelid, rightEyelid, leftBrow, rightBrow;

const container = document.getElementById('canvas-container');

// ====== Инициализация сцены ======
function initScene() {
    const w = container.clientWidth;
    const h = container.clientHeight;

    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2c3e50);

    camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 30);
    camera.position.set(0, 1.3, 2.5);
    camera.lookAt(0, 1.0, 0);

    renderer = new THREE.WebGLRenderer({ 
        antialias: true,
        alpha: false,
    });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.5;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(renderer.domElement);

    // Кабинет
    createOffice();

    // Модель
    createReceptionist();

    window.addEventListener('resize', onResize);
    return { scene, camera, renderer };
}

function onResize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

// ====== Создание кабинета ======
function createOffice() {
    // Комната
    const roomMat = new THREE.MeshStandardMaterial({
        color: 0xebe5d9,
        roughness: 0.9,
        side: THREE.BackSide,
    });
    const room = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 5), roomMat);
    room.position.set(0, 1.5, -0.5);
    scene.add(room);

    // Пол (паркет)
    const floorMat = new THREE.MeshStandardMaterial({
        color: 0x8B7355,
        roughness: 0.7,
        metalness: 0.1,
    });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, 0, -0.5);
    floor.receiveShadow = true;
    scene.add(floor);

    // Окно
    createWindow();

    // Стол
    createDesk();

    // Освещение
    createLighting();
}

function createWindow() {
    const windowGroup = new THREE.Group();
    
    // Оконный проем
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x8B7355, roughness: 0.8 });
    
    // Рама
    const frame = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.8, 0.1), frameMat);
    frame.position.set(0, 1.6, -2.5);
    windowGroup.add(frame);

    // Стекло
    const glassMat = new THREE.MeshPhysicalMaterial({
        color: 0x87CEEB,
        transparent: true,
        opacity: 0.3,
        roughness: 0.0,
        metalness: 0.0,
        envMapIntensity: 1.0,
    });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.6), glassMat);
    glass.position.set(0, 1.6, -2.45);
    windowGroup.add(glass);

    // Вид из окна (небоскребы)
    const cityMat = new THREE.MeshStandardMaterial({ color: 0x4a6fa5, roughness: 0.8 });
    for (let i = 0; i < 5; i++) {
        const building = new THREE.Mesh(
            new THREE.BoxGeometry(0.2 + Math.random() * 0.3, 0.3 + Math.random() * 1.0, 0.05),
            cityMat
        );
        building.position.set(
            -0.8 + i * 0.4,
            1.0 + Math.random() * 0.8,
            -2.7
        );
        // Окна на зданиях
        const windowMat = new THREE.MeshBasicMaterial({ color: 0xffd700 });
        for (let w = 0; w < 3; w++) {
            const win = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.04), windowMat);
            win.position.set(
                -0.05 + Math.random() * 0.1,
                0.1 + Math.random() * 0.3,
                0.026
            );
            building.add(win);
        }
        windowGroup.add(building);
    }

    // Небо
    const skyMat = new THREE.MeshBasicMaterial({
        color: 0x87CEEB,
        transparent: true,
        opacity: 0.6,
    });
    const sky = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 1.6), skyMat);
    sky.position.set(0, 1.6, -2.46);
    windowGroup.add(sky);

    scene.add(windowGroup);
}

function createDesk() {
    const deskMat = new THREE.MeshStandardMaterial({
        color: 0x5D4037,
        roughness: 0.6,
        metalness: 0.2,
    });
    const deskTopMat = new THREE.MeshStandardMaterial({
        color: 0x6D4C41,
        roughness: 0.5,
    });

    // Столешница
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.7), deskTopMat);
    top.position.set(0, 0.7, 0.5);
    top.castShadow = true;
    top.receiveShadow = true;
    scene.add(top);

    // Ножки
    const legMat = new THREE.MeshStandardMaterial({ color: 0x3E2723, metalness: 0.4, roughness: 0.3 });
    for (let x of [-0.5, 0.5]) {
        for (let z of [0.2, 0.8]) {
            const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.65), legMat);
            leg.position.set(x, 0.35, z);
            scene.add(leg);
        }
    }

    // Монитор
    const monitorScreenMat = new THREE.MeshPhysicalMaterial({
        color: 0x1a1a2e,
        metalness: 0.0,
        roughness: 0.1,
    });
    const monitorBodyMat = new THREE.MeshStandardMaterial({
        color: 0x2c2c2c,
        metalness: 0.5,
        roughness: 0.3,
    });

    const screen = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.3, 0.02), monitorScreenMat);
    screen.position.set(0.3, 0.9, 0.5);
    screen.castShadow = true;
    scene.add(screen);

    // Подставка монитора
    const stand = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, 0.02), monitorBodyMat);
    stand.position.set(0.3, 0.78, 0.5);
    scene.add(stand);

    // Клавиатура
    const kbMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
    const kb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.12), kbMat);
    kb.position.set(0, 0.73, 0.7);
    scene.add(kb);

    // Кресло офисное
    createChair();
}

function createChair() {
    const chairMat = new THREE.MeshStandardMaterial({ color: 0x2c2c2c, roughness: 0.7 });
    const chairMetal = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.3 });

    // Сиденье
    const seat = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 0.05, 16), chairMat);
    seat.position.set(0, 0.65, -0.3);
    seat.receiveShadow = true;
    scene.add(seat);

    // Спинка
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.4, 0.05), chairMat);
    back.position.set(0, 0.85, -0.55);
    scene.add(back);

    // Ножка
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6), chairMetal);
    pole.position.set(0, 0.35, -0.3);
    scene.add(pole);

    // База
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.25, 0.03, 5), chairMetal);
    base.position.set(0, 0.05, -0.3);
    base.rotation.y = Math.PI / 4;
    scene.add(base);
}

function createLighting() {
    // Солнечный свет из окна
    const sunLight = new THREE.DirectionalLight(0xffeedd, 2.5);
    sunLight.position.set(1, 3, -3);
    sunLight.castShadow = true;
    sunLight.shadow.mapSize.width = 1024;
    sunLight.shadow.mapSize.height = 1024;
    scene.add(sunLight);

    // Потолочный свет
    const ceilingLight = new THREE.DirectionalLight(0xffffff, 0.5);
    ceilingLight.position.set(0, 3, 0);
    scene.add(ceilingLight);

    // Заполняющий свет
    const fillLight = new THREE.DirectionalLight(0x8888ff, 0.3);
    fillLight.position.set(-2, 1, 2);
    scene.add(fillLight);

    // Теплый свет сбоку (настольная лампа)
    const lampLight = new THREE.PointLight(0xffa500, 0.8, 2);
    lampLight.position.set(0.5, 1.1, 0.7);
    scene.add(lampLight);
    
    // Лампа
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xc5a55a, metalness: 0.6, roughness: 0.2 });
    const lampBase = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.06, 0.02), lampMat);
    lampBase.position.set(0.5, 0.72, 0.7);
    scene.add(lampBase);
    const lampArm = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.15), lampMat);
    lampArm.position.set(0.5, 0.8, 0.7);
    scene.add(lampArm);
    const lampShade = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 8), 
        new THREE.MeshStandardMaterial({ color: 0xc5a55a, roughness: 0.4 }));
    lampShade.position.set(0.5, 0.88, 0.7);
    scene.add(lampShade);
}

// ====== Создание реалистичной модели ======
function createReceptionist() {
    model = new THREE.Group();

    // ====== Торс ======
    const skinMat = new THREE.MeshStandardMaterial({
        color: 0xf5d6c6,
        roughness: 0.6,
    });
    const skinDark = new THREE.MeshStandardMaterial({
        color: 0xe8c8b5,
        roughness: 0.7,
    });

    // Пиджак
    const jacketMat = new THREE.MeshStandardMaterial({
        color: 0x1a237e,
        roughness: 0.4,
        metalness: 0.05,
    });
    const blouseMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.6,
    });

    // Тело
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.22, 0.4, 12), jacketMat);
    torso.position.y = 0.75;
    torso.castShadow = true;
    model.add(torso);

    // Блузка (воротник)
    const collar = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.06), blouseMat);
    collar.position.set(0, 0.93, 0.1);
    model.add(collar);

    // Плечи
    const shoulderMat = new THREE.MeshStandardMaterial({ color: 0x1a237e, roughness: 0.4 });
    const shoulders = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.05, 0.15), shoulderMat);
    shoulders.position.set(0, 0.95, 0);
    model.add(shoulders);

    // Шея
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.08, 12), skinMat);
    neck.position.set(0, 1.0, 0);
    model.add(neck);

    // ====== Голова ======
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 32, 32), skinMat);
    head.position.set(0, 1.12, 0);
    head.castShadow = true;
    head.name = 'head';
    model.add(head);
    headBone = head;

    // Нижняя челюсть (для анимации рта)
    const jawGeom = new THREE.SphereGeometry(0.065, 16, 16, 0, Math.PI * 2, Math.PI * 0.45, Math.PI * 0.45);
    const jaw = new THREE.Mesh(jawGeom, skinDark);
    jaw.position.set(0, 1.07, 0.08);
    jaw.name = 'jaw';
    model.add(jaw);
    jawBone = jaw;

    // ====== Глаза ======
    const eyeWhiteMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.1,
        metalness: 0.0,
    });
    const pupilMat = new THREE.MeshStandardMaterial({
        color: 0x2c5a8c,
        roughness: 0.0,
        metalness: 0.1,
    });
    const irisMat = new THREE.MeshStandardMaterial({
        color: 0x3a6ea5,
        roughness: 0.0,
        metalness: 0.0,
    });
    const corneaMat = new THREE.MeshPhysicalMaterial({
        color: 0xffffff,
        roughness: 0.0,
        metalness: 0.0,
        transparent: true,
        opacity: 0.15,
    });

    for (let side = -1; side <= 1; side += 2) {
        const eyeGroup = new THREE.Group();
        
        // Белок
        const white = new THREE.Mesh(new THREE.SphereGeometry(0.035, 20, 20), eyeWhiteMat);
        white.scale.set(1, 0.8, 0.4);
        eyeGroup.add(white);

        // Радужка
        const iris = new THREE.Mesh(new THREE.SphereGeometry(0.02, 16, 16), irisMat);
        iris.position.z = 0.03;
        iris.scale.set(1, 0.8, 0.3);
        eyeGroup.add(iris);

        // Зрачок
        const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.01, 12, 12), pupilMat);
        pupil.position.z = 0.035;
        pupil.scale.set(1, 0.8, 0.3);
        eyeGroup.add(pupil);

        // Роговица (блик)
        const cornea = new THREE.Mesh(new THREE.SphereGeometry(0.036, 16, 16), corneaMat);
        cornea.scale.set(1, 0.8, 0.35);
        eyeGroup.add(cornea);

        eyeGroup.position.set(side * 0.055, 1.14, 0.11);
        eyeGroup.name = side === -1 ? 'eyeL' : 'eyeR';
        model.add(eyeGroup);
    }
    leftEye = model.getObjectByName('eyeL');
    rightEye = model.getObjectByName('eyeR');

    // ====== Веки ======
    const lidMat = new THREE.MeshStandardMaterial({ color: 0xf0c8a0, roughness: 0.7 });
    for (let side = -1; side <= 1; side += 2) {
        const lid = new THREE.Mesh(new THREE.SphereGeometry(0.037, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5), lidMat);
        lid.position.set(side * 0.055, 1.145, 0.11);
        lid.scale.set(1, 0.3, 0.5);
        lid.name = side === -1 ? 'lidL' : 'lidR';
        model.add(lid);
    }
    leftEyelid = model.getObjectByName('lidL');
    rightEyelid = model.getObjectByName('lidR');

    // ====== Брови ======
    const browMat = new THREE.MeshStandardMaterial({ color: 0x3d2b1f, roughness: 0.9 });
    for (let side = -1; side <= 1; side += 2) {
        const brow = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.006, 0.01), browMat);
        brow.position.set(side * 0.045, 1.19, 0.12);
        brow.rotation.z = side * 0.1;
        brow.name = side === -1 ? 'browL' : 'browR';
        model.add(brow);
    }
    leftBrow = model.getObjectByName('browL');
    rightBrow = model.getObjectByName('browR');

    // ====== Рот ======
    const mouthMat = new THREE.MeshStandardMaterial({
        color: 0xb5656b,
        roughness: 0.4,
        metalness: 0.1,
    });
    const mouthUpper = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.005, 0.015), mouthMat);
    mouthUpper.position.set(0, 1.09, 0.135);
    model.add(mouthUpper);

    mouth = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.005, 0.015), 
        new THREE.MeshStandardMaterial({ color: 0x8b3a3a, roughness: 0.5 }));
    mouth.position.set(0, 1.075, 0.135);
    model.add(mouth);

    // ====== Нос ======
    const noseMat = new THREE.MeshStandardMaterial({ color: 0xf0c0a8, roughness: 0.8 });
    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.02, 0.015, 6), noseMat);
    nose.position.set(0, 1.10, 0.14);
    nose.rotation.x = 0.2;
    model.add(nose);

    // ====== Волосы ======
    createHair();

    // Позиция модели
    model.position.set(0, 0, -0.05);
    scene.add(model);
}

function createHair() {
    const hairMat = new THREE.MeshStandardMaterial({
        color: 0x3d2b1f,
        roughness: 0.9,
    });
    const hairMatLight = new THREE.MeshStandardMaterial({
        color: 0x4a3728,
        roughness: 0.9,
    });

    // Основная прическа (каре/боб)
    const hairMain = new THREE.Mesh(new THREE.SphereGeometry(0.145, 24, 24, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
    hairMain.position.set(0, 1.14, -0.02);
    hairMain.scale.set(1, 0.5, 1);
    model.add(hairMain);

    // Длинные пряди с боков
    for (let side = -1; side <= 1; side += 2) {
        const strand = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.12, 0.015), hairMatLight);
        strand.position.set(side * 0.12, 1.04, 0);
        strand.rotation.z = side * 0.15;
        model.add(strand);
    }

    // Чёлка
    const bangs = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.05, 0.02), hairMat);
    bangs.position.set(0, 1.18, 0.08);
    bangs.rotation.x = -0.3;
    model.add(bangs);

    // Пучок/хвост сзади
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.04, 12, 12), hairMat);
    bun.position.set(0, 1.15, -0.13);
    model.add(bun);
}

// ====== Анимация ======
export function animateAvatar() {
    const delta = clock.getDelta();
    const time = clock.getElapsedTime();

    if (!model) return;

    // Дыхание
    const breath = Math.sin(time * 1.2) * 0.002;
    model.position.y = breath;

    // Покачивание
    model.rotation.z = Math.sin(time * 0.6) * 0.001;

    // Голова - слежение за лицом
    if (headBone) {
        const targetX = avatarState.faceDetected ? avatarState.faceX * 0.3 : Math.sin(time * 0.3) * 0.05;
        const targetY = avatarState.faceDetected ? avatarState.faceY * 0.3 : Math.sin(time * 0.2) * 0.02;

        headBone.rotation.x += (targetY - headBone.rotation.x) * delta * 3;
        headBone.rotation.y += (targetX - headBone.rotation.y) * delta * 3;
    }

    // Челюсть (рот)
    if (jawBone) {
        if (avatarState.isSpeaking) {
            const mouthVal = 0.05 + Math.sin(time * 15) * 0.04;
            jawBone.position.y = 1.07 - mouthVal * 0.5;
            if (mouth) {
                mouth.scale.y = Math.max(0.3, Math.min(2.5, 1 + mouthVal * 30));
            }
        } else {
            jawBone.position.y += (1.07 - jawBone.position.y) * delta * 10;
            if (mouth) {
                mouth.scale.y += (1 - mouth.scale.y) * delta * 8;
            }
        }
    }

    // Моргание
    avatarState.blinkTimer += delta;
    if (avatarState.blinkTimer > 3 + Math.random() * 4 && !avatarState.isBlinking) {
        avatarState.isBlinking = true;
        avatarState.blinkTimer = 0;
    }
    if (avatarState.isBlinking) {
        const progress = avatarState.blinkTimer * 20;
        if (progress < Math.PI) {
            const blinkScale = Math.abs(Math.cos(progress));
            if (leftEyelid) leftEyelid.scale.y = blinkScale * 0.3;
            if (rightEyelid) rightEyelid.scale.y = blinkScale * 0.3;
        } else {
            avatarState.isBlinking = false;
            if (leftEyelid) leftEyelid.scale.y = 0.3;
            if (rightEyelid) rightEyelid.scale.y = 0.3;
        }
    }
}

// ====== Управление состоянием ======
export function setSpeaking(val) {
    avatarState.isSpeaking = val;
}

export function setListening(val) {
    avatarState.isListening = val;
}

export function updateFacePosition(x, y) {
    avatarState.faceDetected = true;
    avatarState.faceX = x;
    avatarState.faceY = y;
}

export function resetFacePosition() {
    avatarState.faceDetected = false;
}

// ====== Рендер ======
let running = false;

export function startRendering() {
    if (running) return;
    running = true;
    function render() {
        if (!running) return;
        requestAnimationFrame(render);
        animateAvatar();
        renderer.render(scene, camera);
    }
    render();
}

export function initScene3D() {
    initScene();
    startRendering();
    console.log('3D сцена готова');
}
