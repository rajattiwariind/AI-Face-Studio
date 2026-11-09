"use strict";

import {
    FaceLandmarker,
    FilesetResolver
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14";

const $ = id => document.getElementById(id);

const canvas = $("canvas");
const ctx = canvas.getContext("2d");
const video = $("cameraVideo");
const photoInput = $("photoInput");

let faceLandmarker = null;
let engineReady = false;

let originalImage = null;
let photoURL = null;
let cameraStream = null;

let currentMode = "photo";
let currentEffect = "dog";
let intensity = 100;

let brightness = 100;
let contrast = 100;
let saturation = 100;

let selectedFilter = "original";
let filterIntensity = 100;

let faceLandmarks = null;
let mirrored = false;

let animationFrame = null;
let lastVideoTime = -1;
let lastDetectionTime = 0;

let cameraActive = false;

const MAX_PHOTO_SIZE = 15 * 1024 * 1024;

const effects = [
    "dog",
    "anime",
    "devil",
    "angel",
    "butterfly",
    "glasses",
    "glow",
    "hearts"
];

// --------------------------------------------------
// PHOTO FILTER PRESETS
// --------------------------------------------------

const photoFilters = {
    original: {
        label: "Original",
        css: "none"
    },

    natural: {
        label: "Natural",
        css: "saturate(1.12) contrast(1.04) brightness(1.02)"
    },

    vintage: {
        label: "Vintage",
        css: "sepia(0.48) saturate(0.82) contrast(0.92) brightness(1.04)"
    },

    mono: {
        label: "Black & White",
        css: "grayscale(1) contrast(1.12)"
    },

    warm: {
        label: "Warm",
        css: "sepia(0.24) saturate(1.28) hue-rotate(-8deg) brightness(1.03)"
    },

    cool: {
        label: "Cool",
        css: "saturate(0.92) hue-rotate(12deg) contrast(1.06)"
    },

    cinematic: {
        label: "Cinematic",
        css: "contrast(1.22) saturate(0.82) brightness(0.94) sepia(0.10)"
    },

    portrait: {
        label: "Portrait",
        css: "saturate(1.08) contrast(1.04) brightness(1.05)"
    },

    soft: {
        label: "Soft",
        css: "brightness(1.08) contrast(0.88) saturate(1.04)"
    },

    dramatic: {
        label: "Dramatic",
        css: "contrast(1.35) saturate(1.18) brightness(0.94)"
    }
};

// --------------------------------------------------
// BASIC UI
// --------------------------------------------------

function setMessage(message) {
    $("notice").textContent = message;
}

function setFaceStatus(message) {
    $("faceStatus").textContent = message;
}

function setEditingEnabled(enabled) {

    [
        "download",
        "clear",
        "clearEffect",
        "brightness",
        "contrast",
        "saturation",
        "resetAdjustments",
        "intensity",
        "generate"
    ].forEach(id => {
        $(id).disabled = !enabled;
    });

    $("intensity").disabled = !enabled || !faceLandmarks;

    if ($("filterIntensity")) {
        $("filterIntensity").disabled =
            !enabled || currentMode !== "photo";
    }
}

function updateEffectButtons() {

    document.querySelectorAll(".effect").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.effect === currentEffect
        );

    });
}

function selectEffect(effect) {

    if (!effects.includes(effect)) return;

    currentEffect = effect;

    updateEffectButtons();
}

// --------------------------------------------------
// 1. INITIALIZE MEDIAPIPE
// --------------------------------------------------

async function initializeFaceEngine() {

    try {

        $("aiStatus").textContent = "Loading face engine...";

        const vision = await FilesetResolver.forVisionTasks(
            "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm"
        );

        faceLandmarker = await FaceLandmarker.createFromOptions(
            vision,
            {
                baseOptions: {
                    modelAssetPath:
                        "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task",

                    delegate: "CPU"
                },

                runningMode: "VIDEO",

                numFaces: 1,

                outputFaceBlendshapes: false,

                outputFacialTransformationMatrixes: false
            }
        );

        engineReady = true;

        $("aiStatus").textContent = "Face engine ready";

        setMessage(
            "Face detection is ready. Upload a selfie or start the camera."
        );

    } catch (error) {

        console.error("MediaPipe initialization failed:", error);

        $("aiStatus").textContent = "Face engine unavailable";

        setMessage(
            "Could not load MediaPipe. Check your internet connection and reload the page."
        );
    }
}

const enginePromise = initializeFaceEngine();

// --------------------------------------------------
// 2. IMAGE VALIDATION
// --------------------------------------------------

async function validateImage(file) {

    const form = new FormData();

    form.append("image", file);

    const response = await fetch("/api/images/validate", {
        method: "POST",
        body: form
    });

    if (!response.ok) {
        throw new Error("Spring Boot image validation failed.");
    }

    const contentType = response.headers.get("content-type") || "";

    if (contentType.includes("application/json")) {
        return response.json();
    }

    return {
        valid: true
    };
}

// --------------------------------------------------
// 3. PHOTO UPLOAD
// --------------------------------------------------

$("photoUpload").addEventListener("click", event => {

    if (event.target.closest("input")) return;

    photoInput.click();

});

$("photoUpload").addEventListener("dragover", event => {

    event.preventDefault();

    $("photoUpload").classList.add("dragging");

});

$("photoUpload").addEventListener("dragleave", () => {

    $("photoUpload").classList.remove("dragging");

});

$("photoUpload").addEventListener("drop", event => {

    event.preventDefault();

    $("photoUpload").classList.remove("dragging");

    const file = event.dataTransfer.files[0];

    if (file) loadPhoto(file);

});

photoInput.addEventListener("change", () => {

    const file = photoInput.files[0];

    if (file) loadPhoto(file);

    // Allows selecting the same photo again.
    photoInput.value = "";

});

// --------------------------------------------------
// LOAD PHOTO
// --------------------------------------------------

async function loadPhoto(file) {

    if (!file || !/^image\/(jpeg|png|webp)$/.test(file.type)) {

        setMessage("Please select a JPG, PNG or WebP image.");

        return;
    }

    if (file.size > MAX_PHOTO_SIZE) {

        setMessage("Image size must be less than 15 MB.");

        return;
    }

    try {

        setMessage("Validating image...");

        await validateImage(file);

        await enginePromise;

        if (!engineReady) {

            throw new Error(
                "Face detection engine is unavailable."
            );
        }

        stopCamera();

        if (photoURL) {
            URL.revokeObjectURL(photoURL);
        }

        photoURL = URL.createObjectURL(file);

        const image = new Image();

        image.onload = async () => {

            originalImage = image;

            currentMode = "photo";

            mirrored = false;

            $("photoMode").classList.add("active");

            $("cameraMode").classList.remove("active");

            $("photoUpload").style.display = "block";

            $("cameraControls").style.display = "none";

            video.style.display = "none";

            $("empty").style.display = "none";

            canvas.style.display = "block";

            canvas.width = image.naturalWidth;

            canvas.height = image.naturalHeight;

            $("size").style.display = "block";

            $("size").textContent =
                `${canvas.width} × ${canvas.height}`;

            $("fileInfo").textContent =
                `${file.name} · ${canvas.width} × ${canvas.height}`;

            // Reset image adjustments.
            resetAdjustments(false);

            // Reset photo filter.
            selectedFilter = "original";

            filterIntensity = 100;

            updateFilterButtons();

            if ($("filterIntensity")) {

                $("filterIntensity").value = 100;

                $("filterIntensityValue").textContent = "100%";
            }

            // Enable editing before face detection.
            setEditingEnabled(true);

            // Display the uploaded photo immediately.
            renderOneFrame();

            // Detect face.
            await detectPhotoFace();

            // Start animation.
            startRenderLoop();

            setMessage(
                "Photo loaded. Choose a photo filter or AR effect."
            );

        };

        image.onerror = () => {

            setMessage("Could not open this image.");

        };

        image.src = photoURL;

    } catch (error) {

        console.error(error);

        setMessage(error.message);

    }
}

// --------------------------------------------------
// 4. FACE DETECTION FOR PHOTOS
// --------------------------------------------------

async function detectPhotoFace() {

    if (!originalImage || !faceLandmarker || currentMode !== "photo") {
        return;
    }

    try {

        // Photo detection requires IMAGE mode.
        await faceLandmarker.setOptions({
            runningMode: "IMAGE"
        });

        const result = faceLandmarker.detect(originalImage);

        faceLandmarks =
            result.faceLandmarks?.[0] || null;

        updateDetectionStatus();

        renderOneFrame();

    } catch (error) {

        console.error("Photo face detection failed:", error);

        faceLandmarks = null;

        setFaceStatus("Face detection failed");

        renderOneFrame();

    } finally {

        // Restore VIDEO mode for the webcam.
        try {

            await faceLandmarker.setOptions({
                runningMode: "VIDEO"
            });

        } catch (error) {

            console.warn(
                "Could not restore video detection mode:",
                error
            );
        }
    }
}

// --------------------------------------------------
// 5. CAMERA MODE
// --------------------------------------------------

$("photoMode").addEventListener("click", () => {

    stopCamera();

    currentMode = "photo";

    $("photoMode").classList.add("active");

    $("cameraMode").classList.remove("active");

    $("photoUpload").style.display = "block";

    $("cameraControls").style.display = "none";

    video.style.display = "none";

    if (originalImage) {

        canvas.style.display = "block";

        faceLandmarks = null;

        detectPhotoFace();

        startRenderLoop();

    } else {

        canvas.style.display = "none";

        $("empty").style.display = "block";
    }

});

$("cameraMode").addEventListener("click", async () => {

    await enginePromise;

    currentMode = "camera";

    $("cameraMode").classList.add("active");

    $("photoMode").classList.remove("active");

    $("photoUpload").style.display = "none";

    $("cameraControls").style.display = "flex";

    if (photoURL) {

        URL.revokeObjectURL(photoURL);

        photoURL = null;
    }

    originalImage = null;

    faceLandmarks = null;

    canvas.style.display = "none";

    $("empty").style.display = "block";

    $("fileInfo").textContent = "";

    setFaceStatus("Camera is waiting");

    setEditingEnabled(false);

    if (!engineReady) {

        $("cameraMessage").textContent =
            "Face engine could not be loaded.";
    }

});

$("startCamera").addEventListener("click", startCamera);

$("stopCamera").addEventListener("click", stopCamera);

// --------------------------------------------------
// START CAMERA
// --------------------------------------------------

async function startCamera() {

    if (!engineReady) {
        await enginePromise;
    }

    if (!engineReady) {

        setMessage("Face detection engine is unavailable.");

        return;
    }

    if (!navigator.mediaDevices?.getUserMedia) {

        setMessage(
            "Camera access requires HTTPS or localhost."
        );

        return;
    }

    try {

        await faceLandmarker.setOptions({
            runningMode: "VIDEO"
        });

        $("cameraMessage").textContent =
            "Requesting camera permission...";

        cameraStream = await navigator.mediaDevices.getUserMedia({

            audio: false,

            video: {

                facingMode: "user",

                width: {
                    ideal: 1280
                },

                height: {
                    ideal: 720
                }

            }

        });

        video.srcObject = cameraStream;

        await video.play();

        cameraActive = true;

        mirrored = true;

        video.style.display = "none";

        canvas.style.display = "block";

        $("empty").style.display = "none";

        canvas.width = video.videoWidth;

        canvas.height = video.videoHeight;

        $("size").style.display = "block";

        $("size").textContent =
            `${canvas.width} × ${canvas.height}`;

        $("startCamera").disabled = true;

        $("stopCamera").disabled = false;

        $("cameraMessage").textContent = "Camera is running.";

        $("fileInfo").textContent = "Live camera selfie";

        setEditingEnabled(true);

        lastVideoTime = -1;

        startRenderLoop();

    } catch (error) {

        console.error("Camera error:", error);

        $("cameraMessage").textContent =
            "Camera could not start.";

        setMessage(
            "Camera permission was denied or the camera is already in use."
        );

        stopCamera();
    }
}

// --------------------------------------------------
// STOP CAMERA
// --------------------------------------------------

function stopCamera() {

    cameraActive = false;

    if (cameraStream) {

        cameraStream.getTracks().forEach(track => track.stop());

        cameraStream = null;
    }

    video.srcObject = null;

    $("startCamera").disabled = false;

    $("stopCamera").disabled = true;

    $("cameraMessage").textContent = "Camera is stopped.";

    if (currentMode === "camera") {

        faceLandmarks = null;

        canvas.style.display = "none";

        $("empty").style.display = "block";

        setEditingEnabled(false);

        setFaceStatus("Camera stopped");
    }
}

// --------------------------------------------------
// 6. LANDMARK HELPERS
// --------------------------------------------------

function point(index) {

    if (!faceLandmarks || !faceLandmarks[index]) {
        return null;
    }

    const landmark = faceLandmarks[index];

    return {

        // Canvas mirroring handles the camera preview.
        x: landmark.x * canvas.width,

        y: landmark.y * canvas.height

    };
}

function distance(a, b) {

    return Math.hypot(
        b.x - a.x,
        b.y - a.y
    );

}

function midpoint(a, b) {

    return {

        x: (a.x + b.x) / 2,

        y: (a.y + b.y) / 2

    };

}

function faceGeometry() {

    const left = point(127);

    const right = point(356);

    const forehead = point(10);

    const chin = point(152);

    const nose = point(1);

    if (!left || !right || !forehead || !chin || !nose) {
        return null;
    }

    const width = distance(left, right);

    const height = distance(forehead, chin);

    return {

        left,

        right,

        forehead,

        chin,

        nose,

        width,

        height,

        center: midpoint(left, right)

    };
}

// --------------------------------------------------
// FACE STATUS
// --------------------------------------------------

function updateDetectionStatus() {

    if (faceLandmarks) {

        setFaceStatus("Face detected");

        $("intensity").disabled = false;

    } else {

        setFaceStatus("No face detected");

        $("intensity").disabled = true;
    }
}

// --------------------------------------------------
// 7. EFFECT DRAWING UTILITIES
// --------------------------------------------------

function withEffectOpacity(callback) {

    ctx.save();

    ctx.globalAlpha = intensity / 100;

    callback();

    ctx.restore();
}

function drawLine(points, color, width) {

    if (!points.length) return;

    ctx.beginPath();

    ctx.moveTo(
        points[0].x,
        points[0].y
    );

    for (let i = 1; i < points.length; i++) {

        ctx.lineTo(
            points[i].x,
            points[i].y
        );
    }

    ctx.strokeStyle = color;

    ctx.lineWidth = width;

    ctx.lineCap = "round";

    ctx.stroke();
}

function drawEllipse(center, rx, ry, color, fill = true) {

    if (!center) return;

    ctx.beginPath();

    ctx.ellipse(
        center.x,
        center.y,
        rx,
        ry,
        0,
        0,
        Math.PI * 2
    );

    if (fill) {

        ctx.fillStyle = color;

        ctx.fill();

    } else {

        ctx.strokeStyle = color;

        ctx.stroke();
    }
}

// --------------------------------------------------
// STAR
// --------------------------------------------------

function drawStar(x, y, radius, color) {

    ctx.save();

    ctx.translate(x, y);

    ctx.beginPath();

    for (let i = 0; i < 10; i++) {

        const angle = Math.PI * i / 5 - Math.PI / 2;

        const r =
            i % 2 === 0
                ? radius
                : radius * 0.42;

        const px = Math.cos(angle) * r;

        const py = Math.sin(angle) * r;

        if (i === 0) {
            ctx.moveTo(px, py);
        } else {
            ctx.lineTo(px, py);
        }
    }

    ctx.closePath();

    ctx.fillStyle = color;

    ctx.fill();

    ctx.restore();
}

// --------------------------------------------------
// HEART
// --------------------------------------------------

function drawHeart(x, y, size, color) {

    ctx.save();

    ctx.translate(x, y);

    ctx.scale(size / 30, size / 30);

    ctx.beginPath();

    ctx.moveTo(0, 10);

    ctx.bezierCurveTo(
        -25, -8,
        -15, -25,
        0, -12
    );

    ctx.bezierCurveTo(
        15, -25,
        25, -8,
        0, 10
    );

    ctx.fillStyle = color;

    ctx.fill();

    ctx.restore();
}

// --------------------------------------------------
// HORNS
// --------------------------------------------------

function drawHorn(x, y, size, direction) {

    ctx.beginPath();

    ctx.moveTo(
        x - size * 0.45,
        y
    );

    ctx.quadraticCurveTo(
        x - size * 0.55,
        y - size * 0.7,
        x + direction * size * 0.2,
        y - size
    );

    ctx.quadraticCurveTo(
        x + direction * size * 0.05,
        y - size * 0.2,
        x + size * 0.45,
        y
    );

    ctx.closePath();

    const gradient = ctx.createLinearGradient(
        x,
        y,
        x,
        y - size
    );

    gradient.addColorStop(0, "#8c1837");

    gradient.addColorStop(1, "#ff557a");

    ctx.fillStyle = gradient;

    ctx.fill();

    ctx.strokeStyle = "#ffd0d9";

    ctx.lineWidth = 2;

    ctx.stroke();
}

// --------------------------------------------------
// 8. DOG EFFECT
// --------------------------------------------------

function drawDog(g) {

    const earY =
        g.forehead.y + g.height * 0.02;

    const earSize = g.width * 0.27;

    // Left ear
    ctx.save();

    ctx.translate(
        g.left.x + g.width * 0.06,
        earY
    );

    ctx.rotate(-0.35);

    ctx.beginPath();

    ctx.moveTo(0, 0);

    ctx.quadraticCurveTo(
        -earSize * 1.3,
        earSize * 0.25,
        -earSize * 0.6,
        earSize * 1.35
    );

    ctx.quadraticCurveTo(
        earSize * 0.4,
        earSize * 1.1,
        earSize * 0.35,
        earSize * 0.1
    );

    ctx.closePath();

    ctx.fillStyle = "#9b5c30";

    ctx.fill();

    ctx.beginPath();

    ctx.ellipse(
        -earSize * 0.3,
        earSize * 0.7,
        earSize * 0.28,
        earSize * 0.5,
        0,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "#e8a17c";

    ctx.fill();

    ctx.restore();

    // Right ear
    ctx.save();

    ctx.translate(
        g.right.x - g.width * 0.06,
        earY
    );

    ctx.rotate(0.35);

    ctx.beginPath();

    ctx.moveTo(0, 0);

    ctx.quadraticCurveTo(
        earSize * 1.3,
        earSize * 0.25,
        earSize * 0.6,
        earSize * 1.35
    );

    ctx.quadraticCurveTo(
        -earSize * 0.4,
        earSize * 1.1,
        -earSize * 0.35,
        earSize * 0.1
    );

    ctx.closePath();

    ctx.fillStyle = "#9b5c30";

    ctx.fill();

    ctx.beginPath();

    ctx.ellipse(
        earSize * 0.3,
        earSize * 0.7,
        earSize * 0.28,
        earSize * 0.5,
        0,
        0,
        Math.PI * 2
    );

    ctx.fillStyle = "#e8a17c";

    ctx.fill();

    ctx.restore();

    // Nose
    const nose = g.nose;

    drawEllipse(
        {
            x: nose.x,
            y: nose.y + g.height * 0.09
        },
        g.width * 0.085,
        g.height * 0.045,
        "#29202a"
    );

    // Nose shine
    drawEllipse(
        {
            x: nose.x - g.width * 0.02,
            y: nose.y + g.height * 0.075
        },
        g.width * 0.018,
        g.height * 0.009,
        "#ffffff"
    );

    // Tongue
    ctx.beginPath();

    ctx.moveTo(
        nose.x,
        nose.y + g.height * 0.17
    );

    ctx.quadraticCurveTo(
        nose.x - g.width * 0.06,
        nose.y + g.height * 0.28,
        nose.x,
        nose.y + g.height * 0.34
    );

    ctx.quadraticCurveTo(
        nose.x + g.width * 0.07,
        nose.y + g.height * 0.26,
        nose.x,
        nose.y + g.height * 0.17
    );

    ctx.fillStyle = "#ff7198";

    ctx.fill();
}

// --------------------------------------------------
// 9. ANIME EFFECT
// --------------------------------------------------

function drawAnime() {

    const leftA = point(33);

    const leftB = point(133);

    const rightA = point(362);

    const rightB = point(263);

    if (!leftA || !leftB || !rightA || !rightB) return;

    const leftEye = midpoint(leftA, leftB);

    const rightEye = midpoint(rightA, rightB);

    const leftTop = point(159);

    const leftBottom = point(145);

    const rightTop = point(386);

    const rightBottom = point(374);

    if (
        !leftEye ||
        !rightEye ||
        !leftTop ||
        !leftBottom ||
        !rightTop ||
        !rightBottom
    ) {
        return;
    }

    const eyeWidth =
        distance(leftEye, rightEye) * 0.22;

    function animeEye(center, top, bottom) {

        const eyeHeight = Math.max(
            eyeWidth * 0.9,
            distance(top, bottom) * 2.5
        );

        drawEllipse(
            center,
            eyeWidth,
            eyeHeight,
            "#ffffff"
        );

        drawEllipse(
            {
                x: center.x,
                y: center.y + eyeHeight * 0.08
            },
            eyeWidth * 0.57,
            eyeHeight * 0.72,
            "#48a9ff"
        );

        drawEllipse(
            {
                x: center.x,
                y: center.y + eyeHeight * 0.12
            },
            eyeWidth * 0.27,
            eyeHeight * 0.5,
            "#10234e"
        );

        drawEllipse(
            {
                x: center.x - eyeWidth * 0.18,
                y: center.y - eyeHeight * 0.2
            },
            eyeWidth * 0.17,
            eyeHeight * 0.18,
            "#ffffff"
        );

        ctx.beginPath();

        ctx.ellipse(
            center.x,
            center.y,
            eyeWidth,
            eyeHeight,
            0,
            Math.PI,
            Math.PI * 2
        );

        ctx.strokeStyle = "#17111f";

        ctx.lineWidth = eyeWidth * 0.18;

        ctx.stroke();
    }

    animeEye(leftEye, leftTop, leftBottom);

    animeEye(rightEye, rightTop, rightBottom);
}

// --------------------------------------------------
// 10. DEVIL EFFECT
// --------------------------------------------------

function drawDevil(g) {

    const size = g.width * 0.2;

    const y =
        g.forehead.y + g.height * 0.05;

    drawHorn(
        g.left.x + g.width * 0.13,
        y,
        size,
        -1
    );

    drawHorn(
        g.right.x - g.width * 0.13,
        y,
        size,
        1
    );

    const leftA = point(33);

    const leftB = point(133);

    const rightA = point(362);

    const rightB = point(263);

    if (!leftA || !leftB || !rightA || !rightB) return;

    const leftEye = midpoint(leftA, leftB);

    const rightEye = midpoint(rightA, rightB);

    drawEllipse(
        leftEye,
        g.width * 0.045,
        g.height * 0.025,
        "#ff263f"
    );

    drawEllipse(
        rightEye,
        g.width * 0.045,
        g.height * 0.025,
        "#ff263f"
    );

    drawStar(
        g.nose.x,
        g.nose.y + g.height * 0.3,
        g.width * 0.045,
        "#ff365e"
    );

    const time = performance.now() / 200;

    for (let i = 0; i < 5; i++) {

        const x =
            g.center.x +
            Math.sin(time + i * 1.5) * g.width * 0.55;

        const yFire =
            g.forehead.y +
            g.height * (
                0.4 + Math.sin(time * 1.3 + i) * 0.1
            );

        drawStar(
            x,
            yFire,
            g.width * 0.025,
            "#ff713e"
        );
    }
}

// --------------------------------------------------
// 11. ANGEL EFFECT
// --------------------------------------------------

function drawAngel(g) {

    const haloY =
        g.forehead.y - g.height * 0.16;

    ctx.save();

    ctx.beginPath();

    ctx.ellipse(
        g.center.x,
        haloY,
        g.width * 0.3,
        g.height * 0.055,
        0,
        0,
        Math.PI * 2
    );

    ctx.strokeStyle = "#fff1a8";

    ctx.lineWidth = Math.max(
        4,
        g.width * 0.018
    );

    ctx.shadowColor = "#ffe58b";

    ctx.shadowBlur = g.width * 0.07;

    ctx.stroke();

    ctx.restore();

    for (let i = 0; i < 9; i++) {

        const x =
            g.left.x + g.width * i / 8;

        const y =
            g.forehead.y - g.height * 0.05;

        drawStar(
            x,
            y + Math.sin(performance.now() / 300 + i) * 5,
            g.width * 0.025,
            "#fff4c2"
        );
    }
}

// --------------------------------------------------
// 12. BUTTERFLY EFFECT
// --------------------------------------------------

function drawButterfly(x, y, size, angle) {

    ctx.save();

    ctx.translate(x, y);

    ctx.rotate(angle);

    const flap =
        0.65 +
        Math.abs(Math.sin(performance.now() / 130)) * 0.35;

    ctx.scale(flap, 1);

    drawEllipse(
        {
            x: -size * 0.35,
            y: -size * 0.25
        },
        size * 0.42,
        size * 0.55,
        "#c58aff"
    );

    drawEllipse(
        {
            x: size * 0.35,
            y: -size * 0.25
        },
        size * 0.42,
        size * 0.55,
        "#8a8dff"
    );

    drawEllipse(
        {
            x: -size * 0.3,
            y: size * 0.3
        },
        size * 0.3,
        size * 0.35,
        "#ff91c8"
    );

    drawEllipse(
        {
            x: size * 0.3,
            y: size * 0.3
        },
        size * 0.3,
        size * 0.35,
        "#ff91c8"
    );

    ctx.beginPath();

    ctx.moveTo(0, -size * 0.5);

    ctx.lineTo(0, size * 0.6);

    ctx.strokeStyle = "#372044";

    ctx.lineWidth = Math.max(2, size * 0.08);

    ctx.stroke();

    ctx.restore();
}

function drawButterflies(g) {

    const time = performance.now() / 700;

    const size = g.width * 0.11;

    const positions = [

        {
            x: g.left.x,
            y: g.forehead.y - g.height * 0.12
        },

        {
            x: g.right.x,
            y: g.forehead.y - g.height * 0.12
        },

        {
            x: g.center.x,
            y: g.forehead.y - g.height * 0.24
        }

    ];

    positions.forEach((position, i) => {

        const x =
            position.x +
            Math.sin(time + i * 2) * g.width * 0.04;

        const y =
            position.y +
            Math.cos(time * 1.4 + i) * g.height * 0.025;

        drawButterfly(
            x,
            y,
            size,
            Math.sin(time + i) * 0.2
        );

    });
}

// --------------------------------------------------
// 13. GLASSES EFFECT
// --------------------------------------------------

function drawGlasses() {

    const leftA = point(33);

    const leftB = point(133);

    const rightA = point(362);

    const rightB = point(263);

    if (!leftA || !leftB || !rightA || !rightB) return;

    const leftEye = midpoint(leftA, leftB);

    const rightEye = midpoint(rightA, rightB);

    const width =
        distance(leftEye, rightEye) * 0.56;

    const height = width * 0.65;

    ctx.save();

    ctx.lineWidth = Math.max(5, width * 0.07);

    ctx.strokeStyle = "#11111c";

    ctx.fillStyle = "rgba(40, 45, 75, 0.58)";

    // Left lens
    ctx.beginPath();

    ctx.ellipse(
        leftEye.x,
        leftEye.y,
        width / 2,
        height / 2,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.stroke();

    // Right lens
    ctx.beginPath();

    ctx.ellipse(
        rightEye.x,
        rightEye.y,
        width / 2,
        height / 2,
        0,
        0,
        Math.PI * 2
    );

    ctx.fill();

    ctx.stroke();

    // Bridge
    drawLine(
        [
            {
                x: leftEye.x + width / 2,
                y: leftEye.y
            },
            {
                x: rightEye.x - width / 2,
                y: rightEye.y
            }
        ],
        "#11111c",
        Math.max(4, width * 0.07)
    );

    ctx.restore();
}

// --------------------------------------------------
// 14. BEAUTY GLOW EFFECT
// --------------------------------------------------

function drawGlow(g) {

    const gradient = ctx.createRadialGradient(
        g.center.x,
        g.center.y,
        g.width * 0.05,
        g.center.x,
        g.center.y,
        g.width * 0.75
    );

    gradient.addColorStop(
        0,
        "rgba(255, 225, 245, 0.25)"
    );

    gradient.addColorStop(
        0.5,
        "rgba(255, 190, 230, 0.12)"
    );

    gradient.addColorStop(
        1,
        "rgba(255, 190, 230, 0)"
    );

    ctx.fillStyle = gradient;

    ctx.fillRect(
        g.left.x - g.width * 0.2,
        g.forehead.y - g.height * 0.1,
        g.width * 1.4,
        g.height * 1.3
    );

    const cheeks = [
        point(205),
        point(425)
    ];

    cheeks.forEach(cheek => {

        if (!cheek) return;

        drawEllipse(
            cheek,
            g.width * 0.09,
            g.height * 0.035,
            "rgba(255, 100, 160, 0.24)"
        );

    });

    for (let i = 0; i < 8; i++) {

        drawStar(
            g.left.x + g.width * (i % 4) * 0.32,
            g.forehead.y +
                g.height * (Math.floor(i / 4) * 0.25),
            g.width * 0.018,
            "#fff1d6"
        );
    }
}

// --------------------------------------------------
// 15. FLOATING HEARTS
// --------------------------------------------------

function drawHearts(g) {

    const time = performance.now() / 1000;

    const colors = [
        "#ff5b91",
        "#ff9bc2",
        "#ff345f",
        "#ffcee0"
    ];

    for (let i = 0; i < 12; i++) {

        const phase =
            (time * 0.45 + i / 12) % 1;

        const side =
            i % 2 === 0 ? -1 : 1;

        const x =
            g.center.x +
            side * g.width * (0.35 + (i % 4) * 0.13) +
            Math.sin(time * 2 + i) * g.width * 0.04;

        const y =
            g.chin.y -
            phase * g.height * 1.25;

        const size =
            g.width * (0.045 + (i % 3) * 0.012);

        drawHeart(
            x,
            y,
            size,
            colors[i % colors.length]
        );
    }
}

// --------------------------------------------------
// 16. SELECTED AR EFFECT
// --------------------------------------------------

function drawSelectedEffect() {

    if (!faceLandmarks || intensity <= 0) return;

    const geometry = faceGeometry();

    if (!geometry) return;

    withEffectOpacity(() => {

        switch (currentEffect) {

            case "dog":

                drawDog(geometry);

                break;

            case "anime":

                drawAnime();

                break;

            case "devil":

                drawDevil(geometry);

                break;

            case "angel":

                drawAngel(geometry);

                break;

            case "butterfly":

                drawButterflies(geometry);

                break;

            case "glasses":

                drawGlasses();

                break;

            case "glow":

                drawGlow(geometry);

                break;

            case "hearts":

                drawHearts(geometry);

                break;
        }

    });
}

// --------------------------------------------------
// 17. DRAW PHOTO WITH FILTERS
// --------------------------------------------------

function drawBaseImage(source) {

    // Basic manual adjustments.
    ctx.save();

    ctx.filter =
        `brightness(${brightness}%) contrast(${contrast}%) saturate(${saturation}%)`;

    ctx.drawImage(
        source,
        0,
        0,
        canvas.width,
        canvas.height
    );

    ctx.restore();

    // Apply selected filter as a blend over original photo.
    const preset = photoFilters[selectedFilter];

    if (
        preset &&
        preset.css !== "none" &&
        filterIntensity > 0
    ) {

        ctx.save();

        ctx.globalAlpha = filterIntensity / 100;

        ctx.filter = preset.css;

        ctx.drawImage(
            source,
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.restore();
    }
}

// --------------------------------------------------
// 18. MAIN RENDER LOOP
// --------------------------------------------------

function startRenderLoop() {

    if (animationFrame) {

        cancelAnimationFrame(animationFrame);

    }

    function frame() {

        animationFrame = requestAnimationFrame(frame);

        let source = null;

        // Webcam mode
        if (currentMode === "camera" && cameraActive) {

            if (video.readyState < 2) return;

            source = video;

            if (
                video.currentTime !== lastVideoTime &&
                performance.now() - lastDetectionTime > 30
            ) {

                try {

                    const result = faceLandmarker.detectForVideo(
                        video,
                        performance.now()
                    );

                    faceLandmarks =
                        result.faceLandmarks?.[0] || null;

                    lastVideoTime = video.currentTime;

                    lastDetectionTime = performance.now();

                    updateDetectionStatus();

                } catch (error) {

                    console.error(
                        "Live face detection error:",
                        error
                    );
                }
            }

        }

        // Photo mode
        else if (currentMode === "photo" && originalImage) {

            source = originalImage;

        }

        if (!source) return;

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        ctx.save();

        // Mirror the camera image and the landmarks together.
        if (mirrored) {

            ctx.translate(canvas.width, 0);

            ctx.scale(-1, 1);

        }

        drawBaseImage(source);

        drawSelectedEffect();

        ctx.restore();
    }

    frame();
}

// --------------------------------------------------
// 19. PHOTO FILTER CONTROLS
// --------------------------------------------------

function createFilterControls() {

    if ($("photoFilterPanel")) return;

    const panel = document.createElement("section");

    panel.id = "photoFilterPanel";

    panel.className = "photo-filter-panel";

    panel.innerHTML = `
        <div class="filter-heading">
            <div>
                <strong>Photo filters</strong>
                <small>Apply a look to the entire photo</small>
            </div>
            <span id="activeFilterName">Original</span>
        </div>

        <div class="filter-list" id="filterList">

            ${Object.entries(photoFilters).map(([key, filter]) => `
                <button
                    type="button"
                    class="photo-filter${key === "original" ? " active" : ""}"
                    data-filter="${key}"
                >
                    <span class="filter-swatch filter-${key}"></span>
                    <span>${filter.label}</span>
                </button>
            `).join("")}

        </div>

        <label class="filter-strength" for="filterIntensity">
            <span>Filter strength</span>
            <output id="filterIntensityValue">100%</output>
        </label>

        <input
            id="filterIntensity"
            type="range"
            min="0"
            max="100"
            value="100"
            disabled
        >
    `;

    (canvas.parentElement || canvas)
        .insertAdjacentElement("afterend", panel);

    // Filter panel styling.
    const style = document.createElement("style");

    style.id = "photoFilterStyles";

    style.textContent = `

        .photo-filter-panel {
            margin: 16px 0;
            padding: 16px;
            border: 1px solid rgba(255,255,255,.12);
            border-radius: 16px;
            background: #171522;
            color: #f7f4ff;
        }

        .filter-heading {
            display: flex;
            justify-content: space-between;
            align-items: center;
            gap: 12px;
            margin-bottom: 14px;
        }

        .filter-heading strong {
            display: block;
            font-size: 15px;
        }

        .filter-heading small {
            display: block;
            margin-top: 4px;
            color: #aaa4b8;
            font-size: 12px;
        }

        #activeFilterName {
            font-size: 12px;
            color: #c7a7ff;
        }

        .filter-list {
            display: flex;
            gap: 10px;
            overflow-x: auto;
            padding: 2px 1px 10px;
        }

        .photo-filter {
            flex: 0 0 76px;
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 7px;
            padding: 7px 5px;
            border: 1px solid transparent;
            border-radius: 11px;
            background: #242132;
            color: #e9e4f2;
            font-size: 11px;
            cursor: pointer;
        }

        .photo-filter.active {
            border-color: #a879ff;
            background: #302443;
        }

        .filter-swatch {
            display: block;
            width: 58px;
            height: 48px;
            border-radius: 8px;
            background: linear-gradient(
                135deg,
                #d99b75,
                #7550a2 55%,
                #25213a
            );
        }

        .filter-vintage {
            filter: sepia(.6) saturate(.8);
        }

        .filter-mono {
            filter: grayscale(1);
        }

        .filter-warm {
            filter: sepia(.3) saturate(1.3);
        }

        .filter-cool {
            filter: hue-rotate(18deg) saturate(.8);
        }

        .filter-cinematic {
            filter: contrast(1.4) saturate(.7);
        }

        .filter-portrait {
            filter: brightness(1.1) saturate(1.2);
        }

        .filter-soft {
            filter: brightness(1.2) contrast(.8);
        }

        .filter-dramatic {
            filter: contrast(1.5) saturate(1.3);
        }

        .filter-natural {
            filter: saturate(1.2);
        }

        .filter-strength {
            display: flex;
            justify-content: space-between;
            margin: 8px 0;
            color: #c9c3d2;
            font-size: 12px;
        }

        #filterIntensity {
            width: 100%;
            accent-color: #a879ff;
        }

        @media(max-width:600px) {

            .photo-filter-panel {
                padding: 12px;
            }

            .photo-filter {
                flex-basis: 68px;
            }

        }

    `;

    document.head.appendChild(style);

    // Filter selection.
    panel.querySelectorAll(".photo-filter").forEach(button => {

        button.addEventListener("click", () => {

            selectedFilter = button.dataset.filter;

            updateFilterButtons();

            renderOneFrame();

        });

    });

    // Filter intensity.
    $("filterIntensity").addEventListener("input", event => {

        filterIntensity = Number(event.target.value);

        $("filterIntensityValue").textContent =
            `${filterIntensity}%`;

        renderOneFrame();

    });
}

// --------------------------------------------------
// UPDATE FILTER BUTTONS
// --------------------------------------------------

function updateFilterButtons() {

    document.querySelectorAll(".photo-filter").forEach(button => {

        button.classList.toggle(
            "active",
            button.dataset.filter === selectedFilter
        );

    });

    if ($("activeFilterName")) {

        $("activeFilterName").textContent =
            photoFilters[selectedFilter]?.label || "Original";

    }
}

// --------------------------------------------------
// 20. EFFECT SELECTOR
// --------------------------------------------------

document.querySelectorAll(".effect").forEach(button => {

    button.addEventListener("click", () => {

        selectEffect(button.dataset.effect);

        renderOneFrame();

    });

});

// --------------------------------------------------
// EFFECT INTENSITY
// --------------------------------------------------

$("intensity").addEventListener("input", event => {

    intensity = Number(event.target.value);

    $("intensityValue").textContent =
        intensity + "%";

    renderOneFrame();

});

// --------------------------------------------------
// RENDER SINGLE FRAME
// --------------------------------------------------

function renderOneFrame() {

    if (currentMode === "photo" && originalImage) {

        ctx.clearRect(
            0,
            0,
            canvas.width,
            canvas.height
        );

        drawBaseImage(originalImage);

        drawSelectedEffect();

    }

    // Camera mode is updated by the animation loop.
}

// --------------------------------------------------
// CLEAR AR EFFECT
// --------------------------------------------------

$("clearEffect").addEventListener("click", () => {

    selectEffect("dog");

    intensity = 0;

    $("intensity").value = 0;

    $("intensityValue").textContent = "0%";

    renderOneFrame();

});

// --------------------------------------------------
// 21. PHOTO ADJUSTMENTS
// --------------------------------------------------

function resetAdjustments(showMessage = true) {

    brightness = 100;

    contrast = 100;

    saturation = 100;

    $("brightness").value = 100;

    $("contrast").value = 100;

    $("saturation").value = 100;

    $("brightnessValue").textContent = "100%";

    $("contrastValue").textContent = "100%";

    $("saturationValue").textContent = "100%";

    if (showMessage) {

        setMessage("Adjustments reset.");

    }

    renderOneFrame();
}

// --------------------------------------------------
// ADJUSTMENT SLIDERS
// --------------------------------------------------

[
    [
        "brightness",
        "brightnessValue",
        value => brightness = value
    ],

    [
        "contrast",
        "contrastValue",
        value => contrast = value
    ],

    [
        "saturation",
        "saturationValue",
        value => saturation = value
    ]

].forEach(([id, output, setter]) => {

    $(id).addEventListener("input", event => {

        const value = Number(event.target.value);

        setter(value);

        $(output).textContent = value + "%";

        renderOneFrame();

    });

});

// --------------------------------------------------
// RESET ADJUSTMENTS
// --------------------------------------------------

$("resetAdjustments").addEventListener("click", () => {

    resetAdjustments();

});

// --------------------------------------------------
// 22. DOWNLOAD PHOTO
// --------------------------------------------------

$("download").addEventListener("click", () => {

    if (!originalImage && !cameraActive) return;

    const exportCanvas = document.createElement("canvas");

    exportCanvas.width = canvas.width;

    exportCanvas.height = canvas.height;

    const exportCtx = exportCanvas.getContext("2d");

    exportCtx.drawImage(
        canvas,
        0,
        0
    );

    exportCanvas.toBlob(blob => {

        if (!blob) {

            setMessage("Could not export the photo.");

            return;
        }

        const url = URL.createObjectURL(blob);

        const link = document.createElement("a");

        link.href = url;

        link.download = "face-studio-edited-photo.png";

        link.click();

        setTimeout(() => {

            URL.revokeObjectURL(url);

        }, 1000);

        setMessage("Edited photo downloaded successfully.");

    }, "image/png");

});

// --------------------------------------------------
// 23. CLEAR PHOTO
// --------------------------------------------------

$("clear").addEventListener("click", () => {

    stopCamera();

    if (photoURL) {

        URL.revokeObjectURL(photoURL);

        photoURL = null;

    }

    originalImage = null;

    faceLandmarks = null;

    selectedFilter = "original";

    filterIntensity = 100;

    updateFilterButtons();

    if ($("filterIntensity")) {

        $("filterIntensity").value = 100;

        $("filterIntensityValue").textContent = "100%";

    }

    photoInput.value = "";

    $("fileInfo").textContent = "";

    $("notice").textContent = "";

    $("aiMessage").textContent = "";

    $("empty").style.display = "block";

    $("size").style.display = "none";

    $("faceStatus").textContent =
        "Face detection is waiting";

    canvas.style.display = "none";

    setEditingEnabled(false);

    ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
    );

});

// --------------------------------------------------
// 24. EXISTING SPRING BOOT AI LAB
// --------------------------------------------------

$("generate").addEventListener("click", async () => {

    if (!originalImage) {

        $("aiMessage").textContent =
            "Upload a photo before using AI Lab.";

        return;
    }

    $("generate").disabled = true;

    $("aiMessage").textContent =
        "Preparing image...";

    try {

        const blob = await new Promise(resolve => {

            canvas.toBlob(resolve, "image/png");

        });

        if (!blob) {

            throw new Error(
                "Could not prepare image."
            );

        }

        const form = new FormData();

        form.append(
            "image",
            blob,
            "photo.png"
        );

        form.append(
            "feature",
            $("feature").value
        );

        form.append(
            "style",
            $("style").value
        );

        $("aiMessage").textContent =
            "Contacting AI service...";

        const response = await fetch(
            "/api/ai/transform",
            {
                method: "POST",
                body: form
            }
        );

        const result = await response.json();

        if (!response.ok) {

            throw new Error(
                result.message ||
                "AI transformation failed."
            );

        }

        $("aiMessage").textContent =
            result.message ||
            "AI service response received.";

    } catch (error) {

        $("aiMessage").textContent =
            error.message;

    } finally {

        $("generate").disabled = !originalImage;

    }

});

// --------------------------------------------------
// 25. AI SERVICE STATUS
// --------------------------------------------------

async function checkAIStatus() {

    try {

        const response = await fetch(
            "/api/ai/status"
        );

        const result = await response.json();

        if (result.available) {

            $("aiStatus").textContent =
                "AI service connected";

        } else {

            $("aiStatus").textContent =
                "AI service unavailable";

        }

    } catch {

        $("aiStatus").textContent =
            "AI service offline";

    }

}

// --------------------------------------------------
// 26. INITIALIZE APPLICATION
// --------------------------------------------------

function enableInitialState() {

    setEditingEnabled(false);

    $("startCamera").disabled = false;

    $("stopCamera").disabled = true;

    updateEffectButtons();

    createFilterControls();

    updateFilterButtons();

    checkAIStatus();

}

enableInitialState();