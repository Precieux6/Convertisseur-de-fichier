/**
 * FileConvert Pro - Logic & API Handler
 */

document.addEventListener('DOMContentLoaded', () => {
    // URL de l'API en ligne hébergée sur Render
    const API_BASE_URL = 'https://convertisseur-de-fichier.onrender.com';

    // DOM Elements
    const dropZone = document.getElementById('drop-zone');
    const fileInput = document.getElementById('file-upload');
    const fileCounter = document.getElementById('file-counter');
    const fileListContainer = document.getElementById('file-list-container');
    const fileList = document.getElementById('file-list');
    const formatSelect = document.getElementById('format-select');
    
    // Checkboxes PDF
    const secureCheckbox = document.getElementById('secure-pdf');
    const passwordField = document.getElementById('password-field');
    const pdfPasswordInput = document.getElementById('pdf-password');
    const compressCheckbox = document.getElementById('compress-pdf');
    const mergeCheckbox = document.getElementById('merge-pdf');
    
    // Nouveaux éléments pour la division
    const splitCheckbox = document.getElementById('split-pdf');
    const splitOptions = document.getElementById('split-options');
    const pageRangeInput = document.getElementById('page-range');

    const converterForm = document.getElementById('converter-form');
    const submitBtn = document.getElementById('submit-btn');

    let selectedFiles = [];

    // Drag & Drop
    dropZone.addEventListener('click', () => fileInput.click());

    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        dropZone.addEventListener(eventName, preventDefaults, false);
    });

    function preventDefaults(e) {
        e.preventDefault();
        e.stopPropagation();
    }

    ['dragenter', 'dragover'].forEach(eventName => {
        dropZone.classList.add('border-indigo-500', 'bg-indigo-50/50');
    });

    ['dragleave', 'drop'].forEach(eventName => {
        dropZone.classList.remove('border-indigo-500', 'bg-indigo-50/50');
    });

    dropZone.addEventListener('drop', (e) => {
        const dt = e.dataTransfer;
        handleFiles(dt.files);
    });

    fileInput.addEventListener('change', (e) => {
        handleFiles(e.target.files);
    });

    function handleFiles(files) {
        const newFiles = Array.from(files);
        selectedFiles = [...selectedFiles, ...newFiles];
        updateFileList();
    }

    function updateFileList() {
        fileList.innerHTML = '';
        if (selectedFiles.length === 0) {
            fileListContainer.classList.add('hidden');
            return;
        }

        fileListContainer.classList.remove('hidden');
        fileCounter.textContent = selectedFiles.length;

        selectedFiles.forEach((file, index) => {
            const li = document.createElement('li');
            li.className = 'py-2 flex items-center justify-between text-xs text-slate-600';
            li.innerHTML = `
                <span class="truncate max-w-xs font-medium text-slate-800">${file.name}</span>
                <div class="flex items-center gap-3">
                    <span class="text-slate-400">${(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                    <button type="button" class="text-red-500 hover:text-red-700 remove-btn" data-index="${index}">
                        <i class="fas font-trash"></i>
                    </button>
                </div>
            `;
            fileList.appendChild(li);
        });

        document.querySelectorAll('.remove-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'));
                selectedFiles.splice(idx, 1);
                updateFileList();
            });
        });
    }

    // Affichage conditionnel des sous-champs
    secureCheckbox.addEventListener('change', () => {
        passwordField.classList.toggle('hidden', !secureCheckbox.checked);
    });

    splitCheckbox.addEventListener('change', () => {
        splitOptions.classList.toggle('hidden', !splitCheckbox.checked);
    });

    // Soumission du formulaire
    converterForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        if (selectedFiles.length === 0) {
            alert('Veuillez sélectionner au moins un fichier.');
            return;
        }

        const formData = new FormData();
        selectedFiles.forEach(file => {
            formData.append('files', file);
        });

        formData.append('output_format', formatSelect.value);
        formData.append('secure', secureCheckbox.checked);
        formData.append('password', pdfPasswordInput.value || '');
        formData.append('compress', compressCheckbox.checked);
        formData.append('merge', mergeCheckbox.checked);
        formData.append('split', splitCheckbox.checked);
        formData.append('page_range', pageRangeInput.value || '');

        submitBtn.disabled = true;
        submitBtn.innerHTML = `<i class="fas font-spinner fa-spin"></i> Traitement en cours...`;

        try {
            const response = await fetch(`${API_BASE_URL}/convert`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errData = await response.json();
                throw new Error(errData.detail || 'Erreur lors du traitement');
            }

            const blob = await response.blob();
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            
            // Nom de fichier de sortie
            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = `resultat.${formatSelect.value}`;
            if (contentDisposition && contentDisposition.includes('filename=')) {
                filename = contentDisposition.split('filename=')[1].replace(/"/g, '');
            }
            a.download = filename;
            
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);

            alert('Traitement réussi ! Votre fichier à été téléchargé.');

        } catch (err) {
            alert(`Erreur : ${err.message}`);
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = `<i class="fas font-gear"></i> Lancer la Conversion`;
        }
    });
});
