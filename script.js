pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const BOOK_PATH = 'Mimundoazul.pdf'; // Nombre actualizado del archivo PDF

// Elementos DOM
const bookContainer = document.getElementById('flip-book');
const loading = document.getElementById('loading');
const pageInfo = document.getElementById('page-info');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const btnZoomIn = document.getElementById('btn-zoom-in');
const btnZoomOut = document.getElementById('btn-zoom-out');
const btnRead = document.getElementById('btn-read');
const btnStopRead = document.getElementById('btn-stop-read');
const srAnnouncer = document.getElementById('screen-reader-announcer');

let pageFlip = null;
let pdfDoc = null;
let currentZoom = 1.0;
let textContents = []; // Guarda el texto por página para síntesis de voz
const synth = window.speechSynthesis;

// 1. Cargar PDF automáticamente al iniciar
document.addEventListener('DOMContentLoaded', () => {
    loadRepoPDF();
});

async function loadRepoPDF() {
    try {
        loading.textContent = 'Cargando "Mimundoazul"... Por favor espere.';
        pdfDoc = await pdfjsLib.getDocument(BOOK_PATH).promise;
        
        const totalPages = pdfDoc.numPages;
        textContents = new Array(totalPages).fill('');

        // Obtener dimensiones de la primera página
        const firstPage = await pdfDoc.getPage(1);
        const viewport = firstPage.getViewport({ scale: 1.5 });

        // Extraer contenido y renderizar páginas
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            const page = await pdfDoc.getPage(pageNum);
            
            // Extraer texto para la lectura en voz alta
            const textContent = await page.getTextContent();
            const pageText = textContent.items.map(item => item.str).join(' ');
            textContents[pageNum - 1] = pageText.trim() || `Página ${pageNum}`;

            // Renderizar canvas
            const pageViewport = page.getViewport({ scale: 1.5 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d');
            canvas.height = pageViewport.height;
            canvas.width = pageViewport.width;

            await page.render({ canvasContext: context, viewport: pageViewport }).promise;

            const pageDiv = document.createElement('div');
            pageDiv.className = 'page';
            pageDiv.appendChild(canvas);
            bookContainer.appendChild(pageDiv);
        }

        loading.style.display = 'none';
        bookContainer.style.display = 'block';

        // Inicializar efecto de paso de página (PageFlip)
        pageFlip = new St.PageFlip(bookContainer, {
            width: viewport.width,
            height: viewport.height,
            size: "stretch",
            minWidth: 300,
            maxWidth: viewport.width * 1.5,
            minHeight: 400,
            maxHeight: viewport.height * 1.5,
            showCover: true,
            maxShadowOpacity: 0.6,
            usePortrait: true
        });

        const pages = document.querySelectorAll('.page');
        pageFlip.loadFromHTML(pages);

        // Suscribirse a eventos de cambio de página
        pageFlip.on('flip', (e) => {
            playPageTurnSound();
            updatePageInfo();
            announceToScreenReader(`Página ${e.data + 1}`);
            if (synth.speaking) {
                synth.cancel();
                btnStopRead.disabled = true;
                btnRead.disabled = false;
            }
        });

        updatePageInfo();
        announceToScreenReader('El cuento "Mimundoazul" se ha cargado correctamente.');

    } catch (error) {
        console.error('Error al cargar el PDF:', error);
        loading.textContent = 'No se pudo cargar el archivo "Mimundoazul.pdf". Verifica que esté guardado con ese nombre en la raíz del repositorio.';
    }
}

// 2. Navegación (Página Siguiente / Anterior)
btnPrev.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipPrev();
});

btnNext.addEventListener('click', () => {
    if (pageFlip) pageFlip.flipNext();
});

function updatePageInfo() {
    if (!pageFlip) return;
    const current = pageFlip.getCurrentPageIndex() + 1;
    const total = pageFlip.getPageCount();
    pageInfo.textContent = `Página ${current} de ${total}`;
}

// 3. Efecto Especial: Sonido sintético de pasar página
function playPageTurnSound() {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        
        const bufferSize = ctx.sampleRate * 0.15; // 150ms
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        for (let i = 0; i < bufferSize; i++) {
            data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.3));
        }

        const noise = ctx.createBufferSource();
        noise.buffer = buffer;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = 1000;

        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.3, ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        noise.start();
    } catch (e) {
        // Audio deshabilitado por el navegador hasta interactuar
    }
}

// 4. Controles para Agrandar y Achicar el Texto / Zoom para baja visión
btnZoomIn.addEventListener('click', () => {
    if (currentZoom < 1.6) {
        currentZoom += 0.15;
        applyZoom();
    }
});

btnZoomOut.addEventListener('click', () => {
    if (currentZoom > 0.7) {
        currentZoom -= 0.15;
        applyZoom();
    }
});

function applyZoom() {
    bookContainer.style.transform = `scale(${currentZoom})`;
    announceToScreenReader(`Tamaño de vista ${Math.round(currentZoom * 100)} por ciento`);
}

// 5. Lectura en voz alta (Síntesis de voz en español)
btnRead.addEventListener('click', () => {
    if (!pageFlip || !synth) return;

    const pageIdx = pageFlip.getCurrentPageIndex();
    const textToRead = textContents[pageIdx];

    if (!textToRead) {
        announceToScreenReader('No hay texto para leer en esta página.');
        return;
    }

    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(textToRead);
    utterance.lang = 'es-ES';
    utterance.rate = 0.9;

    utterance.onstart = () => {
        btnRead.disabled = true;
        btnStopRead.disabled = false;
        announceToScreenReader('Iniciando lectura en voz alta.');
    };

    utterance.onend = () => {
        btnRead.disabled = false;
        btnStopRead.disabled = true;
        announceToScreenReader('Lectura en voz alta finalizada.');
    };

    utterance.onerror = () => {
        btnRead.disabled = false;
        btnStopRead.disabled = true;
    };

    synth.speak(utterance);
});

btnStopRead.addEventListener('click', () => {
    if (synth) {
        synth.cancel();
        btnRead.disabled = false;
        btnStopRead.disabled = true;
        announceToScreenReader('Lectura cancelada.');
    }
});

// 6. Asistente para Lector de Pantalla
function announceToScreenReader(message) {
    if (srAnnouncer) {
        srAnnouncer.textContent = message;
    }
}
