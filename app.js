// URL de l'API (à adapter selon votre déploiement)
const API_URL = "https://convertisseur-de-fichier-1.onrender.com";

// Configuration
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

// Extensions autorisées
const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc', '.epub', '.mobi', '.azw3', '.txt', '.jpg', '.jpeg', '.png', '.webp', '.heic', '.bmp'];

let selectedFiles = [];
let isProcessing = false;

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
        const ext = getFileExtension(file.name).toLowerCase();

        // Vérifier l'extension
        if (!ALLOWED_EXTENSIONS.includes(ext)) {
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
                ✕ Supprimer
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

async function processFiles() {
    if (isProcessing) {
        showAlert("Attention", "Traitement déjà en cours...", "warning");
        return;
    }

    if (selectedFiles.length === 0) {
        showAlert("Erreur", "Veuillez sélectionner au moins un fichier.", "error");
        return;
    }

    // Validation des options
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

    // Afficher la barre de progression
    if (statusContainer) {
        statusContainer.classList.remove("hidden");
        updateProgressBar(0, "Préparation du traitement...");
    }

    try {
        const formData = new FormData();

        // Ajouter les fichiers
        selectedFiles.forEach(file => formData.append("files", file));

        // Ajouter les options
        formData.append("output_format", outputFormatSelect?.value || "pdf");
        formData.append("merge", (mergeCheckbox?.checked || false).toString());
        formData.append("split", (splitCheckbox?.checked || false).toString());
        formData.append("page_range", pageRangeInput?.value || "");
        formData.append("secure", (secureCheckbox?.checked || false).toString());
        formData.append("password", passwordInput?.value || "");
        formData.append("compress", (compressCheckbox?.checked || false).toString());

        // Afficher les options sélectionnées
        const options = [];
        if (mergeCheckbox?.checked) options.push("fusion");
        if (splitCheckbox?.checked) options.push("division");
        if (compressCheckbox?.checked) options.push("compression");
        if (secureCheckbox?.checked) options.push("chiffrement");

        const optionsText = options.length > 0 ? ` (${options.join(", ")})` : "";
        updateProgressBar(10, `Envoi des fichiers${optionsText}...`);

        // Envoyer la requête
        const response = await fetch(`${API_URL}/convert`, {
            method: "POST",
            body: formData,
            timeout: 600000 // 10 minutes timeout
        });

        updateProgressBar(50, "Traitement en cours...");

        if (!response.ok) {
            let errorMessage = "Une erreur est survenue lors du traitement.";
            try {
                const errorData = await response.json();
                errorMessage = errorData.detail || errorMessage;
            } catch {
                errorMessage = `Erreur HTTP ${response.status}`;
            }
            throw new Error(errorMessage);
        }

        updateProgressBar(80, "Finalisation du téléchargement...");

        // Extraire le nom du fichier
        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = "fichier_converti";
        if (contentDisposition) {
            const match = contentDisposition.match(/filename\*?=(?:"([^"]*)"|([^;,\n]*))/) ||
                         contentDisposition.match(/filename="?([^"]+)"?/);
            if (match) {
                filename = decodeURIComponent(match[1] || match[2] || filename);
            }
        }

        // Télécharger le fichier
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        updateProgressBar(100, "✓ Conversion réussie ! Téléchargement en cours...");

        // Afficher le message de succès
        if (statusContainer) {
            setTimeout(() => {
                statusContainer.innerHTML = `
                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                        <i class="fa-solid fa-check-circle text-green-600 text-xl mt-0.5 flex-shrink-0"></i>
                        <div>
                            <p class="font-semibold text-green-800">✓ Conversion réussie !</p>
                            <p class="text-sm text-green-700">Fichier téléchargé : <strong>${escapeHtml(filename)}</strong></p>
                        </div>
                    </div>
                `;
            }, 500);
        }

        // Réinitialiser après 4 secondes
        setTimeout(() => {
            resetForm();
        }, 4000);

    } catch (error) {
        showAlert("Erreur", error.message, "error");
        console.error("Erreur traitement :", error);
    } finally {
        isProcessing = false;
        if (convertBtn) convertBtn.disabled = false;
    }
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
    return filename.slice((filename.lastIndexOf(".") - 1 >>> 0) + 2);
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

console.log("✓ FileConvert Pro v2.2.0 - Frontend initialisé");
