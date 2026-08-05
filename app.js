// URL de votre API déployée sur Render
const API_URL = "https://fileconvert-pro.onrender.com"; // Ajustez si nécessaire

// Limite maximale autorisée par fichier : 100 Mo
const MAX_FILE_SIZE_MB = 100;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

let selectedFiles = [];

// Éléments du DOM
const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const fileList = document.getElementById("fileList");
const convertBtn = document.getElementById("convertBtn");
const statusContainer = document.getElementById("statusContainer");
const outputFormatSelect = document.getElementById("outputFormat");

// Options
const mergeCheckbox = document.getElementById("mergeFiles");
const splitCheckbox = document.getElementById("splitFiles");
const pageRangeInput = document.getElementById("pageRange");
const secureCheckbox = document.getElementById("securePdf");
const passwordInput = document.getElementById("pdfPassword");

// -------------------------------------------------------------
// GESTION DU GLISSER-DÉPOSER ET DU SÉLECTEUR DE FICHIERS
// -------------------------------------------------------------

dropZone.addEventListener("click", () => fileInput.click());

dropZone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropZone.classList.add("border-primary", "bg-light");
});

dropZone.addEventListener("dragleave", () => {
    dropZone.classList.remove("border-primary", "bg-light");
});

dropZone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropZone.classList.remove("border-primary", "bg-light");
    if (e.dataTransfer.files.length > 0) {
        addFiles(e.dataTransfer.files);
    }
});

fileInput.addEventListener("change", (e) => {
    if (e.target.files.length > 0) {
        addFiles(e.target.files);
    }
});

// -------------------------------------------------------------
// AJOUT ET VÉRIFICATION DES FICHIERS (100 Mo MAX)
// -------------------------------------------------------------
function addFiles(files) {
    let rejectedFiles = [];

    for (let file of files) {
        if (file.size > MAX_FILE_SIZE_BYTES) {
            const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
            rejectedFiles.push(`${file.name} (${sizeInMB} Mo)`);
        } else {
            if (!selectedFiles.some(f => f.name === file.name && f.size === file.size)) {
                selectedFiles.push(file);
            }
        }
    }

    if (rejectedFiles.length > 0) {
        alert(
            `Les fichiers suivants dépassent la limite autorisée de ${MAX_FILE_SIZE_MB} Mo et ont été ignorés :\n\n` +
            rejectedFiles.join("\n") +
            `\n\nVeuillez réduire leur taille avant de réessayer.`
        );
    }

    updateFileList();
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
}

function updateFileList() {
    fileList.innerHTML = "";

    if (selectedFiles.length === 0) {
        convertBtn.disabled = true;
        return;
    }

    convertBtn.disabled = false;

    selectedFiles.forEach((file, index) => {
        const sizeInMB = (file.size / (1024 * 1024)).toFixed(2);
        const fileItem = document.createElement("div");
        fileItem.className = "d-flex justify-content-between align-items-center bg-white p-2 mb-2 rounded border";
        fileItem.innerHTML = `
            <div>
                <strong class="text-truncate d-inline-block" style="max-width: 250px;">${file.name}</strong>
                <small class="text-muted ms-2">(${sizeInMB} Mo)</small>
            </div>
            <button class="btn btn-sm btn-outline-danger" onclick="removeFile(${index})">
                <i class="bi bi-trash"></i> Supprimer
            </button>
        `;
        fileList.appendChild(fileItem);
    });
}

// -------------------------------------------------------------
// ENVOI ET TRAITEMENT PAR L'API
// -------------------------------------------------------------
convertBtn.addEventListener("click", async () => {
    if (selectedFiles.length === 0) return;

    const overSized = selectedFiles.filter(f => f.size > MAX_FILE_SIZE_BYTES);
    if (overSized.length > 0) {
        alert(`Certains fichiers dépassent la limite de ${MAX_FILE_SIZE_MB} Mo. Veuillez les retirer.`);
        return;
    }

    const formData = new FormData();
    selectedFiles.forEach(file => formData.append("files", file));

    formData.append("output_format", outputFormatSelect.value);
    formData.append("merge", mergeCheckbox ? mergeCheckbox.checked : false);
    formData.append("split", splitCheckbox ? splitCheckbox.checked : false);
    formData.append("page_range", pageRangeInput ? pageRangeInput.value : "");
    formData.append("secure", secureCheckbox ? secureCheckbox.checked : false);
    formData.append("password", passwordInput ? passwordInput.value : "");

    convertBtn.disabled = true;
    statusContainer.innerHTML = `
        <div class="alert alert-info d-flex align-items-center" role="alert">
            <div class="spinner-border spinner-border-sm me-3" role="status"></div>
            <div>Traitement en cours... Merci de patienter (le premier accès peut prendre jusqu'à 45s si le serveur était en veille).</div>
        </div>
    `;

    try {
        const response = await fetch(`${API_URL}/convert`, {
            method: "POST",
            body: formData
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.detail || "Une erreur est survenue lors du traitement.");
        }

        const contentDisposition = response.headers.get("Content-Disposition");
        let filename = "fichier_converti";
        if (contentDisposition) {
            const match = contentDisposition.match(/filename="?([^"]+)"?/);
            if (match && match[1]) filename = match[1];
        }

        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(downloadUrl);

        statusContainer.innerHTML = `
            <div class="alert alert-success" role="alert">
                <i class="bi bi-check-circle-fill me-2"></i> Conversion réussie ! Le téléchargement a démarré.
            </div>
        `;
    } catch (error) {
        statusContainer.innerHTML = `
            <div class="alert alert-danger" role="alert">
                <i class="bi bi-exclamation-triangle-fill me-2"></i> Erreur : ${error.message}
            </div>
        `;
    } finally {
        convertBtn.disabled = false;
    }
});
