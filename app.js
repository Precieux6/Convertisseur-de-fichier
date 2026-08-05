/**
 * FileConvert Pro - Application Logic
 * Modern Client-Side File Converter & PDF Handler
 */

document.addEventListener('DOMContentLoaded', () => {
    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-upload');
    const fileCounter = document.getElementById('file-counter');
    const fileListContainer = document.getElementById('file-list-container');
    const formatSelect = document.getElementById('format-select');
    const pdfOptionsBox = document.getElementById('pdf-options-box');
    const secureCheckbox = document.getElementById('secure-pdf');
    const passwordField = document.getElementById('password-field');
    const converterForm = document.getElementById('converter-form');
    const progressContainer = document.getElementById('progress-container');
    const progressBar = document.getElementById('progress-bar');
    const progressPercent = document.getElementById('progress-percent');
    const progressStatus = document.getElementById('progress-status');
    const convertBtn = document.getElementById('convert-btn');
    const btnText = document.getElementById('btn-text');
    const toastContainer = document.getElementById('toast-container');

    // Preview DOM Elements
    const previewPlaceholder = document.getElementById('preview-placeholder');
    const previewContent = document.getElementById('preview-content');
    const previewFilename = document.getElementById('preview-filename');
    const previewFilesize = document.getElementById('preview-filesize');
    const previewFiletype = document.getElementById('preview-filetype');

    // Application State
    let selectedFiles = [];

    // Initialize Event Listeners
    initEvents();

    function initEvents() {
        // Dropzone Click
        dropZone.addEventListener('click', () => fileInput.click());

        // File Selection via Input
        fileInput.addEventListener('change', (e) => {
            handleFiles(Array.from(e.target.files));
        });

        // Drag & Drop Handling
        ['dragenter', 'dragover'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.add('dragover');
            }, false);
        });

        ['dragleave', 'drop'].forEach(eventName => {
            dropZone.addEventListener(eventName, (e) => {
                e.preventDefault();
                e.stopPropagation();
                dropZone.classList.remove('dragover');
            }, false);
        });

        dropZone.addEventListener('drop', (e) => {
            const dt = e.dataTransfer;
            const files = Array.from(dt.files);
            handleFiles(files);
        });

        // Dynamic Options visibility based on Format
        formatSelect.addEventListener('change', (e) => {
            const format = e.target.value;
            if (format === 'pdf') {
                pdfOptionsBox.classList.remove('opacity-40', 'pointer-events-none');
            } else {
                pdfOptionsBox.classList.add('opacity-40', 'pointer-events-none');
            }
        });

        // Toggle Password Input
        secureCheckbox.addEventListener('change', (e) => {
            if (e.target.checked) {
                passwordField.classList.remove('hidden');
            } else {
                passwordField.classList.add('hidden');
            }
        });

        // Form Submission
        converterForm.addEventListener('submit', handleFormSubmit);
    }

    /**
     * Process selected files
     */
    function handleFiles(files) {
        if (files.length === 0) return;

        // Filter or add files
        files.forEach(file => {
            // Avoid duplicate by name & size
            if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
                selectedFiles.push(file);
            }
        });

        updateUI();
        showToast(`${files.length} fichier(s) ajouté(s)`, 'info');
    }

    /**
     * Remove file from selection
     */
    window.removeFile = function(index) {
        selectedFiles.splice(index, 1);
        updateUI();
        showToast('Fichier retiré', 'warning');
    };

    /**
     * Update UI states (File list, counter, preview)
     */
    function updateUI() {
        // Counter
        if (selectedFiles.length > 0) {
            fileCounter.textContent = `${selectedFiles.length} fichier(s) sélectionné(s)`;
            fileCounter.classList.remove('hidden');
            fileListContainer.classList.remove('hidden');
        } else {
            fileCounter.classList.add('hidden');
            fileListContainer.classList.add('hidden');
        }

        // Render File Items
        fileListContainer.innerHTML = '';
        selectedFiles.forEach((file, index) => {
            const fileItem = document.createElement('div');
            fileItem.className = 'flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-200/80 text-sm animate-fadeIn';
            fileItem.innerHTML = `
                <div class="flex items-center space-x-3 truncate">
                    <i class="${getFileIcon(file.name)} text-indigo-500 text-lg"></i>
                    <span class="font-medium text-slate-700 truncate">${file.name}</span>
                    <span class="text-xs text-slate-400">(${formatBytes(file.size)})</span>
                </div>
                <button type="button" onclick="removeFile(${index})" class="text-slate-400 hover:text-rose-500 transition-colors p-1">
                    <i class="fa-solid fa-xmark text-base"></i>
                </button>
            `;
            fileListContainer.appendChild(fileItem);
        });

        // Update Dynamic Preview
        if (selectedFiles.length > 0) {
            const firstFile = selectedFiles[0];
            previewPlaceholder.classList.add('hidden');
            previewContent.classList.remove('hidden');

            previewFilename.textContent = firstFile.name;
            previewFilesize.textContent = formatBytes(firstFile.size);
            previewFiletype.textContent = firstFile.type || 'application/octet-stream';
        } else {
            previewPlaceholder.classList.remove('hidden');
            previewContent.classList.add('hidden');
        }
    }

    /**
     * Form Submission Handler with client-side PDF handling fallback
     */
    async function handleFormSubmit(e) {
        e.preventDefault();

        if (selectedFiles.length === 0) {
            showToast('Veuillez sélectionner au moins un fichier à convertir.', 'error');
            return;
        }

        const targetFormat = formatSelect.value;
        const isMergeChecked = document.getElementById('merge-pdf').checked;

        // Start Conversion Progress UI
        setLoadingState(true);

        try {
            // Client-side PDF Merger using pdf-lib if PDF & merge is enabled
            if (targetFormat === 'pdf' && isMergeChecked && selectedFiles.length > 1) {
                await processPdfMerge();
            } else {
                // Simulate Conversion Pipeline for server/APIs
                await simulateConversionPipeline();
            }
        } catch (err) {
            console.error(err);
            showToast("Une erreur s'est produite lors du traitement.", 'error');
        } finally {
            setLoadingState(false);
        }
    }

    /**
     * Merge PDFs in browser using PDF-Lib
     */
    async function processPdfMerge() {
        updateProgress(20, 'Lecture des fichiers PDF...');
        
        try {
            const { PDFDocument } = PDFLib;
            const mergedPdf = await PDFDocument.create();

            for (let i = 0; i < selectedFiles.length; i++) {
                const file = selectedFiles[i];
                if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
                    const arrayBuffer = await file.arrayBuffer();
                    const pdf = await PDFDocument.load(arrayBuffer);
                    const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
                    copiedPages.forEach((page) => mergedPdf.addPage(page));
                }
                const percent = 20 + Math.round(((i + 1) / selectedFiles.length) * 60);
                updateProgress(percent, `Fusion de ${file.name}...`);
            }

            updateProgress(90, 'Génération du PDF fusionné...');
            const mergedPdfBytes = await mergedPdf.save();

            // Create Download Trigger
            const blob = new Blob([mergedPdfBytes], { type: 'application/pdf' });
            downloadBlob(blob, 'Document_Fusionne_FileConvert.pdf');

            updateProgress(100, 'Fusion terminée avec succès !');
            showToast('PDFs fusionnés et téléchargés avec succès !', 'success');
        } catch (error) {
            console.error(error);
            showToast('Erreur lors de la fusion PDF local. Assurez-vous d'importer uniquement des PDF valides.', 'error');
        }
    }

    /**
     * Simulated Async Process
     */
    function simulateConversionPipeline() {
        return new Promise((resolve) => {
            let progress = 0;
            const interval = setInterval(() => {
                progress += 15;
                if (progress >= 100) {
                    progress = 100;
                    updateProgress(100, 'Conversion terminée !');
                    clearInterval(interval);
                    
                    // Trigger Mock File Download
                    setTimeout(() => {
                        mockDownloadConvertedFile();
                        showToast('Conversion réussie ! Le téléchargement a démarré.', 'success');
                        resolve();
                    }, 500);
                } else {
                    updateProgress(progress, `Conversion vers ${formatSelect.value.toUpperCase()} (${progress}%)...`);
                }
            }, 300);
        });
    }

    function mockDownloadConvertedFile() {
        const dummyContent = "Contenu converti par FileConvert Pro - 2026";
        const targetExt = formatSelect.value;
        const blob = new Blob([dummyContent], { type: 'text/plain' });
        downloadBlob(blob, `Document_Converti.${targetExt}`);
    }

    function downloadBlob(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    }

    function updateProgress(percent, statusText) {
        progressContainer.classList.remove('hidden');
        progressBar.style.width = `${percent}%`;
        progressPercent.textContent = `${percent}%`;
        if (statusText) progressStatus.textContent = statusText;
    }

    function setLoadingState(isLoading) {
        if (isLoading) {
            convertBtn.disabled = true;
            convertBtn.classList.add('opacity-75', 'cursor-not-allowed');
            btnText.textContent = 'Traitement en cours...';
        } else {
            convertBtn.disabled = false;
            convertBtn.classList.remove('opacity-75', 'cursor-not-allowed');
            btnText.textContent = 'Lancer la Conversion';
            setTimeout(() => {
                progressContainer.classList.add('hidden');
                progressBar.style.width = '0%';
            }, 3000);
        }
    }

    /**
     * Toast Notification Helper
     */
    function showToast(message, type = 'info') {
        const toast = document.createElement('div');
        const bgColors = {
            success: 'bg-emerald-600 text-white',
            error: 'bg-rose-600 text-white',
            warning: 'bg-amber-500 text-white',
            info: 'bg-slate-900 text-white'
        };

        const icons = {
            success: 'fa-circle-check',
            error: 'fa-triangle-exclamation',
            warning: 'fa-circle-exclamation',
            info: 'fa-circle-info'
        };

        toast.className = `flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl text-sm font-medium ${bgColors[type]} transition-all transform duration-300 translate-y-2 opacity-0 pointer-events-auto`;
        toast.innerHTML = `<i class="fa-solid ${icons[type]} text-base"></i> <span>${message}</span>`;

        toastContainer.appendChild(toast);

        // Animate In
        setTimeout(() => {
            toast.classList.remove('translate-y-2', 'opacity-0');
        }, 10);

        // Remove Toast
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300);
        }, 4000);
    }

    // Helper functions
    function formatBytes(bytes, decimals = 2) {
        if (bytes === 0) return '0 Octet';
        const k = 1024;
        const dm = decimals < 0 ? 0 : decimals;
        const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
    }

    function getFileIcon(filename) {
        const ext = filename.split('.').pop().toLowerCase();
        switch (ext) {
            case 'pdf': return 'fa-solid fa-file-pdf';
            case 'doc':
            case 'docx': return 'fa-solid fa-file-word';
            case 'epub':
            case 'mobi': return 'fa-solid fa-book';
            default: return 'fa-solid fa-file-lines';
        }
    }
});
