// URL de l'API (à adapter selon votre déploiement)
const API_URL = "https://convertisseur-de-fichier-1.onrender.com";

// Configuration
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Extensions autorisées
const ALLOWED_EXTENSIONS = new Set(['pdf', 'docx', 'doc', 'epub', 'mobi', 'azw3', 'txt', 'jpg', 'jpeg', 'png', 'webp', 'heic', 'bmp', 'avif']);

let selectedFiles = [];
let isProcessing = false;
let currentBlob = null;
let defaultExtension = "";

// ============================================================
// ÉLÉMENTS DU DOM
// ============================================================

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("file-list");
const fileListContainer = document.getElementById("file-list-container");
const fileCounter = document.getElementById("file-counter");
const convertBtn = document.getElementById("submit-btn");
const statusContainer = document.getElementById("progress-container");
const outputFormatSelect = document.getElementById("format-select");

// Checkboxes et inputs
const mergeCheckbox = document.getElementById("merge-pdf");
const splitCheckbox = document.getElementById("split-pdf");
const pageRangeInput = document.getElementById("page-range");
const splitOptions = document.getElementById("split-options");
const secureCheckbox = document.getElementById("secure-pdf");
const passwordInput = document.getElementById("pdf-password");
const passwordField = document.getElementById("password-field");
const compressCheckbox = document.getElementById("compress-pdf");

// Validation initiale
const requiredElements = { dropZone, fileInput, convertBtn, outputFormatSelect };
for (const [name, element] of Object.entries(requiredElements)) {
    if (!element) {
        console.error(`❌ Élément DOM manquant : ${name}`);
    }
}

// ============================================================
// EVENT LISTENERS - DRAG & DROP
// ============================================================

if (dropZone && fileInput) {
    // Clic sur la zone pour ouvrir le sélecteur
    dropZone.addEventListener("click", () => fileInput.click());
    
    // Support tactile pour mobile
    dropZone.addEventListener("touchend", (e) => {
        e.preventDefault();
        fileInput.click();
    });

    // Drag over
    dropZone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropZone.classList.add("border-indigo-500", "bg-indigo-50");
    });

    // Drag leave
    dropZone.addEventListener("dragleave", () => {
        dropZone.classList.remove("border-indigo-500", "bg-indigo-50");
    });

    // Drop
    dropZone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropZone.classList.remove("border-indigo-500", "bg-indigo-50");
        if (e.dataTransfer.files.length > 0) {
            handleFiles(e.dataTransfer.files);
        }
    });
}

// Change événement du file input
if (fileInput) {
    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handleFiles(e.target.files);
        }
    });
}

// ============================================================
// AFFICHAGE/MASQUAGE DES OPTIONS AVANCÉES
// ============================================================

if (secureCheckbox && passwordField) {
    secureCheckbox.addEventListener("change", () => {
        passwordField.classList.toggle("hidden", !secureCheckbox.checked);
        if (!secureCheckbox.checked) {
            passwordInput.value = "";
        }
    });
}

if (splitCheckbox && splitOptions) {
    splitCheckbox.addEventListener("change", () => {
        splitOptions.classList.toggle("hidden", !splitCheckbox.checked);
        if (!splitCheckbox.checked) {
            pageRangeInput.value = "";
        }
    });
}

// Validation du page range en temps réel
if (pageRangeInput) {
    pageRangeInput.addEventListener("input", (e) => {
        // Permettre les chiffres, tirets et virgules
        e.target.value = e.target.value.replace(/[^\d\-,\s]/g, "");
    });
}

// ============================================================
// GESTION DES FICHIERS
// ============================================================

function handleFiles(fileList) {
    const rejectedFiles = [];
    const duplicates = [];

    for (let file of fileList) {
        // Extraction propre de l'extension en minuscules
        const parts = file.name.split('.');
        const ext = parts.length > 1 ? parts.pop().trim().toLowerCase() : '';

        // Vérification dans le Set
        if (!ALLOWED_EXTENSIONS.has(ext)) {
            rejectedFiles.push({
                name: file.name,
                reason: `Format non supporté (${ext})`
            });
            continue;
        }

        // Vérifier la taille
        if (file.size > MAX_FILE_SIZE_BYTES) {
            const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
            rejectedFiles.push({
                name: file.name,
                reason: `Taille trop grande (${sizeInMB}Mo > ${MAX_FILE_SIZE_MB}Mo)`
            });
            continue;
        }

        // Vérifier les doublons
        if (selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
            duplicates.push(file.name);
            continue;
        }

        // Ajouter le fichier
        selectedFiles.push(file);
    }

    // Afficher les avertissements
    if (rejectedFiles.length > 0) {
        const messages = rejectedFiles
            .map(f => `${f.name}: ${f.reason}`)
            .join("\n");
        
        showAlert(
            "Fichiers rejetés",
            `${rejectedFiles.length} fichier(s) ne peuvent pas être traité(s) :\n\n${messages}`,
            "warning"
        );
    }

    if (duplicates.length > 0) {
        showAlert(
            "Doublons",
            `${duplicates.length} fichier(s) en double ignoré(s).`,
            "info"
        );
    }

    updateFileList();
}

function removeFile(index) {
    if (index >= 0 && index < selectedFiles.length) {
        selectedFiles.splice(index, 1);
        updateFileList();
    }
}

function updateFileList() {
    if (!fileList || !fileListContainer) return;

    fileList.innerHTML = "";

    if (selectedFiles.length === 0) {
        fileListContainer.classList.add("hidden");
        if (convertBtn) convertBtn.disabled = true;
        return;
    }

    fileListContainer.classList.remove("hidden");
    if (convertBtn) convertBtn.disabled = false;
    if (fileCounter) fileCounter.textContent = selectedFiles.length;

    selectedFiles.forEach((file, index) => {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        const sizeInKB = (file.size / 1024).toFixed(1);
        const displaySize = file.size > 1024 * 1024 ? `${sizeInMB} Mo` : `${sizeInKB} Ko`;
        
        const fileItem = document.createElement("li");
        fileItem.className = "flex justify-between items-center py-2 px-3 hover:bg-slate-100 transition-colors group";
        fileItem.innerHTML = `
            <div class="flex-1 min-w-0">
                <p class="text-sm font-semibold text-slate-800 truncate">${escapeHtml(file.name)}</p>
                <p class="text-xs text-slate-500">${displaySize}</p>
            </div>
            <button 
                type="button" 
                onclick="removeFile(${index})" 
                class="ml-2 px-3 py-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors font-semibold text-sm group-hover:opacity-100 opacity-70"
                title="Supprimer ce fichier"
            >
                <i class="fa-solid fa-trash-can text-lg"></i>
            </button>
        `;
        fileList.appendChild(fileItem);
    });
}

// ============================================================
// TRAITEMENT DES FICHIERS
// ============================================================

if (convertBtn) {
    convertBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        await processFiles();
    });
}

// Écouteur d'événement pour le téléchargement manuel
document.addEventListener("DOMContentLoaded", () => {
    const downloadBtn = document.getElementById("download-btn");
    if (downloadBtn) {
        downloadBtn.addEventListener("click", () => {
            if (!currentBlob) return;

            const nameInput = document.getElementById("custom-filename-input");
            const userEnteredName = nameInput ? nameInput.value.trim() : "";
            const finalFilename = (userEnteredName || "fichier_converti") + defaultExtension;

            const downloadUrl = window.URL.createObjectURL(currentBlob);
            const a = document.createElement("a");
            a.href = downloadUrl;
            a.download = finalFilename;
            document.body.appendChild(a);
            a.click();
            a.remove();
            window.URL.revokeObjectURL(downloadUrl);
        });
    }
});

async function processFiles() {
    if (isProcessing) {
        showAlert("Attention", "Traitement déjà en cours...", "warning");
        return;
    }

    if (selectedFiles.length === 0) {
        showAlert("Erreur", "Veuillez sélectionner au moins un fichier.", "error");
        return;
    }

    if (splitCheckbox?.checked && !pageRangeInput?.value.trim()) {
        showAlert("Erreur", "Veuillez indiquer les pages à extraire (ex: 1-4, 6)", "error");
        return;
    }

    if (secureCheckbox?.checked && !passwordInput?.value.trim()) {
        showAlert("Erreur", "Veuillez entrer un mot de passe pour sécuriser le fichier.", "error");
        return;
    }

    isProcessing = true;
    if (convertBtn) convertBtn.disabled = true;

    const resultContainer = document.getElementById("result-container");
    const nameInput = document.getElementById("custom-filename-input");

    if (resultContainer) resultContainer.classList.add("hidden");
    if (statusContainer) {
        statusContainer.classList.remove("hidden");
        updateProgressBar(0, "Préparation des fichiers...");
    }

    const formData = new FormData();
    selectedFiles.forEach(file => formData.append("files", file));
    formData.append("output_format", outputFormatSelect?.value || "pdf");
    formData.append("merge", (mergeCheckbox?.checked || false).toString());
    formData.append("split", (splitCheckbox?.checked || false).toString());
    formData.append("page_range", pageRangeInput?.value || "");
    formData.append("secure", (secureCheckbox?.checked || false).toString());
    formData.append("password", passwordInput?.value || "");
    formData.append("compress", (compressCheckbox?.checked || false).toString());

    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_URL}/convert`, true);
    xhr.responseType = "blob";

    // Suivi de la progression en pourcentage réel (0% -> 100%)
    xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            updateProgressBar(percent, percent < 100 ? "Envoi du fichier..." : "Traitement serveur en cours...");
        }
    };

    xhr.onload = async () => {
        isProcessing = false;
        if (convertBtn) convertBtn.disabled = false;

        if (xhr.status === 200) {
            currentBlob = xhr.response;

            // Extraire le nom fourni par le serveur
            const contentDisposition = xhr.getResponseHeader("Content-Disposition");
            let filename = "fichier_converti";
            if (contentDisposition) {
                const match = contentDisposition.match(/filename\*?=(?:"([^"]*)"|([^;,\n]*))/) ||
                             contentDisposition.match(/filename="?([^"]+)"?/);
                if (match) {
                    filename = decodeURIComponent(match[1] || match[2] || filename);
                }
            }

            // Isoler l'extension du nom
            const lastDot = filename.lastIndexOf(".");
            if (lastDot !== -1) {
                defaultExtension = filename.substring(lastDot);
                filename = filename.substring(0, lastDot);
            } else {
                defaultExtension = "";
            }

            // Remplir l'input de renommage
            if (nameInput) nameInput.value = filename;

            // Masquer la barre et afficher le bloc de téléchargement
            if (statusContainer) statusContainer.classList.add("hidden");
            if (resultContainer) resultContainer.classList.remove("hidden");

        } else {
            let errorMsg = "Une erreur est survenue lors de la conversion.";
            try {
                const text = await xhr.response.text();
                const json = JSON.parse(text);
                errorMsg = json.detail || errorMsg;
            } catch (e) {
                errorMsg = `Erreur HTTP ${xhr.status}`;
            }
            showAlert("Erreur", errorMsg, "error");
        }
    };

    xhr.onerror = () => {
        isProcessing = false;
        if (convertBtn) convertBtn.disabled = false;
        showAlert("Erreur", "Une erreur réseau s'est produite.", "error");
    };

    xhr.send(formData);
}

function resetForm() {
    selectedFiles = [];
    updateFileList();
    if (fileInput) fileInput.value = "";
    if (statusContainer) statusContainer.classList.add("hidden");
    
    // Réinitialiser les checkboxes
    if (mergeCheckbox) mergeCheckbox.checked = false;
    if (splitCheckbox) {
        splitCheckbox.checked = false;
        if (splitOptions) splitOptions.classList.add("hidden");
    }
    if (secureCheckbox) {
        secureCheckbox.checked = false;
        if (passwordField) passwordField.classList.add("hidden");
        if (passwordInput) passwordInput.value = "";
    }
    if (compressCheckbox) compressCheckbox.checked = false;
    if (pageRangeInput) pageRangeInput.value = "";
}

// ============================================================
// UTILITAIRES
// ============================================================

function getFileExtension(filename) {
    const parts = filename.split('.');
    return parts.length > 1 ? parts.pop().trim().toLowerCase() : '';
}

function escapeHtml(text) {
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
}

function updateProgressBar(percent, message) {
    if (!statusContainer) return;

    const progressBar = statusContainer.querySelector("#progress-bar");
    const progressPercent = statusContainer.querySelector("#progress-percent");
    const progressStatus = statusContainer.querySelector("#progress-status");

    if (progressBar) {
        progressBar.style.width = `${Math.max(percent, 5)}%`;
    }
    if (progressPercent) {
        progressPercent.textContent = `${percent}%`;
    }
    if (progressStatus) {
        if (percent < 100) {
            progressStatus.innerHTML = `<i class="fa-solid fa-spinner fa-spin text-indigo-600"></i> ${message}`;
        } else {
            progressStatus.innerHTML = `<i class="fa-solid fa-check text-green-600"></i> ${message}`;
        }
    }
}

function showAlert(title, message, type = "info") {
    if (!statusContainer) return;

    const bgClass = {
        error: "bg-red-50 border-red-200",
        warning: "bg-yellow-50 border-yellow-200",
        info: "bg-blue-50 border-blue-200",
        success: "bg-green-50 border-green-200"
    }[type] || "bg-blue-50 border-blue-200";

    const textClass = {
        error: "text-red-800",
        warning: "text-yellow-800",
        info: "text-blue-800",
        success: "text-green-800"
    }[type] || "text-blue-800";

    const iconClass = {
        error: "fa-exclamation-circle text-red-600",
        warning: "fa-exclamation-triangle text-yellow-600",
        info: "fa-info-circle text-blue-600",
        success: "fa-check-circle text-green-600"
    }[type] || "fa-info-circle text-blue-600";

    statusContainer.classList.remove("hidden");
    statusContainer.innerHTML = `
        <div class="border ${bgClass} rounded-lg p-4 flex items-start gap-3">
            <i class="fa-solid ${iconClass} text-xl mt-0.5 flex-shrink-0"></i>
            <div>
                <p class="font-semibold ${textClass}">${escapeHtml(title)}</p>
                <p class="text-sm ${textClass} whitespace-pre-wrap">${escapeHtml(message)}</p>
            </div>
        </div>
    `;
}

window.openModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.remove('hidden');
};

window.closeModal = function(id) {
    const modal = document.getElementById(id);
    if (modal) modal.classList.add('hidden');
};

console.log("✓ FileConvert Pro v2.2.0 - Frontend initialisé");
