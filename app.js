const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const imageLoader = document.getElementById('imageLoader');
const startButton = document.getElementById('startButton');
const statusDiv = document.getElementById('status');
const outputSeq = document.getElementById('outputSeq');

// Dynamic Label Slider Updates
const setupSlider = (id, valId) => {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    el.addEventListener('input', () => valEl.textContent = el.value);
};
setupSlider('pinCount', 'pinCountVal');
setupSlider('lineCount', 'lineCountVal');
setupSlider('lineWeight', 'lineWeightVal');

let sourceImage = new Image();
let isProcessing = false;

// Load Default Procedural Face Placeholder immediately
window.addEventListener('DOMContentLoaded', () => {
    createPlaceholderImage();
});

// Fixed Image Loader incorporating dataURI & crossOrigin configurations
imageLoader.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event){
        sourceImage = new Image();
        sourceImage.crossOrigin = "anonymous"; // Safe context flag preventing canvas taint errors
        sourceImage.onload = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(sourceImage, 0, 0, canvas.width, canvas.height);
            statusDiv.textContent = "Image loaded successfully! Ready to generate.";
        }
        sourceImage.src = event.target.result;
    }
    reader.readAsDataURL(file);
});

startButton.addEventListener('click', () => {
    if (isProcessing) return;
    runStringArtAlgorithm();
});

function createPlaceholderImage() {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#333333";
    ctx.beginPath();
    ctx.arc(225, 225, 120, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(170, 200, 30, 0, Math.PI * 2);
    ctx.arc(280, 200, 30, 0, Math.PI * 2);
    ctx.fill();

    sourceImage.src = canvas.toDataURL();
}

async function runStringArtAlgorithm() {
    isProcessing = true;
    startButton.disabled = true;
    imageLoader.disabled = true;

    const numPins = parseInt(document.getElementById('pinCount').value);
    const maxLines = parseInt(document.getElementById('lineCount').value);
    const lineWeight = parseInt(document.getElementById('lineWeight').value);

    const width = canvas.width;
    const height = canvas.height;
    const radius = width / 2 - 10;
    const cx = width / 2;
    const cy = height / 2;

    // Refresh rendering viewport bounds
    ctx.clearRect(0, 0, width, height);
    ctx.drawImage(sourceImage, 0, 0, width, height);
    
    let imgData = ctx.getImageData(0, 0, width, height);
    let data = imgData.data;
    
    // Convert 4-channel image stream into 1D flat inverted grayscale array structure
    let workingMap = new Float32Array(width * height);
    for (let i = 0; i < data.length; i += 4) {
        let gray = 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];
        workingMap[i / 4] = 255 - gray; 
    }

    // Map circular anchor boundary placements
    let pinCoords = [];
    for (let i = 0; i < numPins; i++) {
        let angle = i * (2 * Math.PI / numPins);
        pinCoords.push({
            x: Math.round(cx + radius * Math.cos(angle)),
            y: Math.round(cy + radius * Math.sin(angle))
        });
    }

    // Reset view canvas to build the thread structure line-by-line
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.4)";
    ctx.lineWidth = 0.6;

    let currentPin = 0;
    let sequence = [currentPin];
    outputSeq.value = currentPin.toString();

    let lineIndex = 0;
    const minPinDistanceBuffer = 15; // Eliminates overlapping border track clustering

    function processBatch() {
        let batchSize = 40; // Updates UI frame states every 40 generations
        
        for (let b = 0; b < batchSize; b++) {
            if (lineIndex >= maxLines) {
                finalizeAlgorithm();
                return;
            }

            let bestPin = -1;
            let maxDarknessScore = -Infinity;
            let bestLinePixels = [];

            for (let nextPin = 0; nextPin < numPins; nextPin++) {
                let pinDiff = Math.abs(currentPin - nextPin);
                if (pinDiff > numPins / 2) pinDiff = numPins - pinDiff;
                if (pinDiff < minPinDistanceBuffer) continue;

                let pixels = getLinePixelIndices(pinCoords[currentPin], pinCoords[nextPin], width);
                
                let totalDarkness = 0;
                for (let i = 0; i < pixels.length; i++) {
                    totalDarkness += workingMap[pixels[i]];
                }
                let avgDarkness = totalDarkness / pixels.length;

                if (avgDarkness > maxDarknessScore) {
                    maxDarknessScore = avgDarkness;
                    bestPin = nextPin;
                    bestLinePixels = pixels;
                }
            }

            if (bestPin === -1) {
                finalizeAlgorithm();
                return;
            }

            // Draw current string line
            ctx.beginPath();
            ctx.moveTo(pinCoords[currentPin].x, pinCoords[currentPin].y);
            ctx.lineTo(pinCoords[bestPin].x, pinCoords[bestPin].y);
            ctx.stroke();

            // Error subtraction: lighten matrix entries under line trajectory path
            for (let i = 0; i < bestLinePixels.length; i++) {
                workingMap[bestLinePixels[i]] -= lineWeight;
                if (workingMap[bestLinePixels[i]] < 0) workingMap[bestLinePixels[i]] = 0;
            }

            currentPin = bestPin;
            sequence.push(currentPin);
            lineIndex++;
        }

        statusDiv.textContent = `Rendering Line: ${lineIndex} / ${maxLines}`;
        outputSeq.value = sequence.join(', ');
        outputSeq.scrollTop = outputSeq.scrollHeight;

        requestAnimationFrame(processBatch);
    }

    function finalizeAlgorithm() {
        isProcessing = false;
        startButton.disabled = false;
        imageLoader.disabled = false;
        statusDiv.textContent = `Completed! ${lineIndex} string tracks mapped successfully.`;
    }

    requestAnimationFrame(processBatch);
}

// Flat 1D Array implementation of Bresenham's Vector Line Path Tracer
function getLinePixelIndices(p0, p1, width) {
    let indices = [];
    let x0 = p0.x;
    let y0 = p0.y;
    let x1 = p1.x;
    let y1 = p1.y;

    let dx = Math.abs(x1 - x0);
    let dy = Math.abs(y1 - y0);
    let sx = (x0 < x1) ? 1 : -1;
    let sy = (y0 < y1) ? 1 : -1;
    let err = dx - dy;

    while (true) {
        if (x0 >= 0 && x0 < width && y0 >= 0 && y0 < canvas.height) {
            indices.push(y0 * width + x0);
        }

        if ((x0 === x1) && (y0 === y1)) break;
        let e2 = 2 * err;
        if (e2 > -dy) { err -= dy; x0 += sx; }
        if (e2 < dx) { err += dx; y0 += sy; }
    }
    return indices;
}
