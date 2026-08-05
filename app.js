// URL de l'API Backend sur Render
const API_URL = "https://convertisseur-de-fichier.onrender.com/convert";

// Éléments du DOM
const form = document.getElementById('converter-form');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-upload');
const fileListContainer = document.getElementById('file-list-container');
const fileList = document.getElementById('file-list');
const fileCounter = document.getElementById('file-counter');
const submitBtn = document.getElementById('submit-btn');

// Éléments de la barre de progression
const progressContainer = document.getElementById('progress-container');
const progressBar = document.getElementById('progress-bar');
const progressPercent = document.getElementById('progress-percent');
const progressStatus = document.getElementById('progress-status');

// Options
const securePdf = document.getElementById('secure-pdf');
const passwordField = document.getElementById('password-field');
const splitPdf = document.getElementById('split-pdf');
const splitOptions = document.getElementById('split-options');

let filesArray = [];

if (securePdf) {
    securePdf.addEventListener('change', () => {
        passwordField.classList.toggle('hidden', !securePdf.checked);
    });
}

if (splitPdf) {
    splitPdf.addEventListener('change', () => {
        splitOptions.classList.toggle('hidden', !splitPdf.checked);
    });
}

// Drag & Drop
dropZone.addEventListener('click', () => fileInput.click());

dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('border-indigo-500', 'bg-indigo-100/50');
});

dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-100/50');
});

dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('border-indigo-500', 'bg-indigo-100/50');
    if (e.dataTransfer.files.length > 0) {
        handleFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFiles(e.target.files);
    }
});

function handleFiles(files) {
    filesArray = Array.from(files);
    updateFileList();
}

function updateFileList() {
    fileList.innerHTML = '';
    if (filesArray.length === 0) {
        fileListContainer.classList.add('hidden');
        return;
    }
    fileListContainer.classList.remove('hidden');
    fileCounter.textContent = filesArray.length;

    filesArray.forEach((file, index) => {
        const li = document.createElement('li');
        li.className = 'py-2 flex items-center justify-between text-xs font-medium text-slate-700';
        li.innerHTML = `
            <span class="truncate max-w-[200px] sm:max-w-[300px] font-semibold text-slate-800">${file.name}</span>
            <div class="flex items-center gap-3">
                <span class="text-slate-400 font-mono">${(file.size / (1024 * 1024)).toFixed(2)} MB</span>
                <button type="button" class="text-rose-500 hover:text-rose-700 transition-colors p-1" onclick="removeFile(${index})">
                    <i class="fa-solid fa-trash-can"></i>
                </button>
            </div>
        `;
        fileList.appendChild(li);
    });
}

window.removeFile = function(index) {
    filesArray.splice(index, 1);
    updateFileList();
};

// Soumission du formulaire avec progression
form.addEventListener('submit', (e) => {
    e.preventDefault();

    if (filesArray.length === 0) {
        alert("Veuillez sélectionner au moins un fichier.");
        return;
    }

    const formData = new FormData();
    filesArray.forEach(file => formData.append('files', file));

    formData.append('output_format', document.getElementById('format-select').value);
    formData.append('secure', securePdf ? securePdf.checked : false);
    formData.append('password', document.getElementById('pdf-password')?.value || '');
    formData.append('compress', document.getElementById('compress-pdf')?.checked || false);
    formData.append('merge', document.getElementById('merge-pdf')?.checked || false);
    formData.append('split', splitPdf ? splitPdf.checked : false);
    formData.append('page_range', document.getElementById('page-range')?.value || '');

    // État du bouton
    submitBtn.disabled = true;
    submitBtn.classList.add('opacity-75', 'cursor-not-allowed');
    submitBtn.querySelector('span').textContent = 'Traitement en cours...';

    // Affichage barre de progression
    progressContainer.classList.remove('hidden');
    updateProgress(10, "Transmission des fichiers...");

    const xhr = new XMLHttpRequest();
    
    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
            const percentComplete = Math.round((event.loaded / event.total) * 85);
            updateProgress(percentComplete, `Conversion et modification (${percentComplete}%)...`);
        }
    };

    xhr.open('POST', API_URL, true);
    xhr.responseType = 'blob';

    xhr.onload = () => {
        if (xhr.status === 200) {
            updateProgress(100, "Terminé ! Téléchargement en cours...");

            const blob = xhr.response;
            const format = document.getElementById('format-select').value;
            let filename = `document_modifie.${format}`;

            const contentDisposition = xhr.getResponseHeader('Content-Disposition');
            if (contentDisposition && contentDisposition.includes('filename=')) {
                const match = contentDisposition.match(/filename="?([^";]+)"?/);
                if (match && match[1]) filename = match[1];
            }

            // Téléchargement automatique et silencieux
            const downloadUrl = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = downloadUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);

            setTimeout(() => {
                resetUI();
            }, 2000);

        } else {
            // Lecture du message d'erreur précis renvoyé par FastAPI
            const reader = new FileReader();
            reader.onload = function() {
                try {
                    const errorObj = JSON.parse(reader.result);
                    alert(`Erreur du serveur : ${errorObj.detail}`);
                } catch(err) {
                    alert("Une erreur inconnue est survenue lors du traitement.");
                }
            };
            reader.readAsText(xhr.response);
            resetUI();
        }
    };

    xhr.onerror = () => {
        updateProgress(0, "Erreur de connexion.");
        alert("Impossible de contacter le serveur. Vérifiez votre connexion.");
        resetUI();
    };

    xhr.send(formData);
});

function updateProgress(percent, statusText) {
    if (progressBar) progressBar.style.width = `${percent}%`;
    if (progressPercent) progressPercent.textContent = `${percent}%`;
    if (progressStatus) {
        progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-indigo-600"></i> ${statusText}`;
    }
}

function resetUI() {
    submitBtn.disabled = false;
    submitBtn.classList.remove('opacity-75', 'cursor-not-allowed');
    submitBtn.querySelector('span').textContent = 'Lancer le Traitement';
    progressContainer.classList.add('hidden');
    updateProgress(0, '');
}
