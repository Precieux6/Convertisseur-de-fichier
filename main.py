import os
import shutil
import zipfile
import uuid
import re
import subprocess
import fitz  # PyMuPDF
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import img2pdf
import logging

# Configuration du logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(title="FileConvert Pro API", version="2.2.0")

# Configuration CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_processing"
os.makedirs(TEMP_DIR, exist_ok=True)

# Limite de taille par fichier : 100 Mo
MAX_FILE_SIZE_MB = 100
MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024

# Extensions et MIME types autorisés
ALLOWED_EXTENSIONS = {
    '.pdf', '.docx', '.doc', '.epub', '.mobi', '.azw3', '.txt',
    '.jpg', '.jpeg', '.png', '.webp', '.heic', '.bmp'
}

ALLOWED_MIME_TYPES = {
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/msword',
    'application/epub+zip',
    'application/x-mobi8-ebook',
    'application/vnd.amazon.ebook',
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/bmp'
}

# ============================================================
# UTILITAIRES DE NETTOYAGE ET VALIDATION
# ============================================================

def cleanup_old_jobs(max_age_hours=2):
    """Nettoie les jobs temporaires plus vieux que max_age_hours."""
    try:
        cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
        for job_dir in os.listdir(TEMP_DIR):
            job_path = os.path.join(TEMP_DIR, job_dir)
            if os.path.isdir(job_path):
                creation_time = datetime.fromtimestamp(os.path.getctime(job_path))
                if creation_time < cutoff_time:
                    shutil.rmtree(job_path, ignore_errors=True)
                    logger.info(f"Nettoyage : {job_dir} supprimé")
    except Exception as e:
        logger.warning(f"Erreur lors du nettoyage : {str(e)}")


def sanitize_filename(filename: str) -> str:
    """Nettoie le nom de fichier pour éviter les injections."""
    # Enlever les chemins relatifs/absolus
    filename = os.path.basename(filename)
    # Remplacer les caractères dangereux
    filename = re.sub(r'[^\w\s.-]', '', filename)
    return filename or "file"


def validate_file(file: UploadFile) -> bool:
    """Valide l'extension et le MIME type du fichier."""
    ext = os.path.splitext(file.filename)[1].lower()
    
    # Vérifier l'extension
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=400,
            detail=f"Extension non autorisée : {ext}. Formats acceptés : {', '.join(ALLOWED_EXTENSIONS)}"
        )
    
    # Vérifier le MIME type
    if file.content_type and file.content_type not in ALLOWED_MIME_TYPES:
        logger.warning(f"MIME type suspecte : {file.content_type} pour {file.filename}")
    
    return True


def cleanup_directory(directory_path: str):
    """Nettoie un dossier temporaire."""
    try:
        if os.path.exists(directory_path):
            shutil.rmtree(directory_path, ignore_errors=True)
    except Exception as e:
        logger.error(f"Erreur cleanup : {str(e)}")


# ============================================================
# FONCTIONS DE CONVERSION
# ============================================================

def convert_docx_to_pdf_libreoffice(docx_path: str, output_dir: str) -> str:
    """Convertit DOCX/DOC en PDF via LibreOffice Headless."""
    try:
        cmd = [
            "libreoffice",
            "--headless",
            "--convert-to", "pdf",
            docx_path,
            "--outdir", output_dir
        ]
        subprocess.run(cmd, check=True, timeout=60)
        
        base_name = os.path.splitext(os.path.basename(docx_path))[0]
        pdf_path = os.path.join(output_dir, f"{base_name}.pdf")
        
        if not os.path.exists(pdf_path):
            raise FileNotFoundError(f"Conversion échouée : {pdf_path} non trouvé")
        
        return pdf_path
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=504, detail="Conversion LibreOffice timeout (60s)")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur LibreOffice : {str(e)}")


def encrypt_pdf(pdf_path: str, password: str, output_path: str):
    """Chiffre un PDF avec un mot de passe."""
    try:
        doc = fitz.open(pdf_path)
        doc.set_encryption(password, password, permissions=-1)
        doc.save(output_path)
        doc.close()
        logger.info(f"PDF chiffré : {output_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur chiffrement PDF : {str(e)}")


def compress_pdf(pdf_path: str, output_path: str):
    """Compresse un PDF en réduisant la résolution des images."""
    try:
        doc = fitz.open(pdf_path)
        for page_num, page in enumerate(doc):
            # Réduire les images de la page
            for img_index in page.get_images():
                xref = page.get_image_info(img_index)[-1]
                doc.fullcopy_page(xref, shrink=2)
        doc.save(output_path, incremental=True, encryption=fitz.PDF_ENCRYPT_NONE)
        doc.close()
        logger.info(f"PDF compressé : {output_path}")
    except Exception as e:
        logger.warning(f"Compression PDF échouée (retour à l'original) : {str(e)}")
        # Copier l'original si la compression échoue
        shutil.copy2(pdf_path, output_path)


def merge_pdfs(pdf_paths: List[str], output_path: str):
    """Fusionne plusieurs PDF en un seul."""
    try:
        merged_doc = fitz.open()
        for pdf_path in pdf_paths:
            doc = fitz.open(pdf_path)
            merged_doc.insert_pdf(doc)
            doc.close()
        merged_doc.save(output_path)
        merged_doc.close()
        logger.info(f"PDFs fusionnés : {output_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur fusion PDF : {str(e)}")


def split_pdf_pages(pdf_path: str, page_range_str: str, output_dir: str) -> str:
    """Extrait des pages spécifiques d'un PDF."""
    try:
        doc = fitz.open(pdf_path)
        page_indices = parse_page_range(page_range_str, len(doc))
        
        if not page_indices:
            raise ValueError("Aucune page valide sélectionnée")
        
        new_doc = fitz.open()
        for idx in page_indices:
            new_doc.insert_pdf(doc, from_page=idx, to_page=idx)
        
        output_path = os.path.join(output_dir, "extracted_pages.pdf")
        new_doc.save(output_path)
        new_doc.close()
        doc.close()
        
        logger.info(f"Pages extraites : {output_path}")
        return output_path
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur extraction pages : {str(e)}")


def parse_page_range(page_range_str: str, max_pages: int) -> List[int]:
    """Parse '1-3, 5, 8-10' en liste [0, 1, 2, 4, 7, 8, 9]."""
    pages = set()
    if not page_range_str or not page_range_str.strip():
        return list(range(max_pages))  # Retourner toutes les pages
    
    parts = page_range_str.split(',')
    for part in parts:
        part = part.strip()
        if not part:
            continue
        
        try:
            if '-' in part:
                start, end = map(int, part.split('-'))
                start_idx = max(0, start - 1)
                end_idx = min(max_pages, end)
                pages.update(range(start_idx, end_idx))
            else:
                page_idx = int(part) - 1
                if 0 <= page_idx < max_pages:
                    pages.add(page_idx)
        except ValueError:
            logger.warning(f"Format de page invalide : {part}")
            continue
    
    return sorted(list(pages)) if pages else list(range(max_pages))


def convert_images_to_pdf(image_paths: List[str], output_pdf_path: str):
    """Convertit des images en PDF."""
    try:
        converted_images = []
        for img_path in image_paths:
            ext = os.path.splitext(img_path)[1].lower()
            # Convertir les formats non-standard
            if ext in [".heic", ".webp"]:
                img = Image.open(img_path)
                jpg_path = img_path + ".jpg"
                img.convert("RGB").save(jpg_path, "JPEG")
                converted_images.append(jpg_path)
            else:
                converted_images.append(img_path)
        
        # Convertir en PDF
        with open(output_pdf_path, "wb") as f:
            f.write(img2pdf.convert(converted_images))
        
        logger.info(f"Images converties en PDF : {output_pdf_path}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur conversion images : {str(e)}")


# ============================================================
# ENDPOINTS API
# ============================================================

@app.get("/health")
async def health_check():
    """Vérifier la santé du serveur."""
    cleanup_old_jobs()
    return {"status": "ok", "version": "2.2.0"}


@app.post("/convert")
async def convert_files(
    files: List[UploadFile] = File(...),
    output_format: str = Form(default="pdf"),
    merge: bool = Form(default=False),
    split: bool = Form(default=False),
    page_range: str = Form(default=""),
    secure: bool = Form(default=False),
    password: str = Form(default=""),
    compress: bool = Form(default=False)
):
    """
    Endpoint principal de conversion.
    Supporte :
    - Conversion de formats
    - Fusion de PDFs
    - Division de PDFs
    - Chiffrement PDF
    - Compression PDF
    """
    
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni")
    
    # Valider chaque fichier
    for file in files:
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        
        if file_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=413,
                detail=f"Fichier {file.filename} trop volumineux ({file_size / 1024 / 1024:.1f}Mo > {MAX_FILE_SIZE_MB}Mo)"
            )
        
        validate_file(file)
    
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(TEMP_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    try:
        # 1️⃣ Sauvegarder les fichiers
        saved_paths = []
        for file in files:
            safe_filename = sanitize_filename(file.filename)
            file_path = os.path.join(job_dir, safe_filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_paths.append(file_path)
        
        # 2️⃣ Traiter les fichiers
        processed_paths = []
        image_batch = []
        pdf_batch = []
        
        for path in saved_paths:
            ext = os.path.splitext(path)[1].lower()
            
            # Traiter Word
            if ext in [".docx", ".doc"]:
                pdf_path = convert_docx_to_pdf_libreoffice(path, job_dir)
                pdf_batch.append(pdf_path)
            
            # Traiter les images
            elif ext in [".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp"]:
                image_batch.append(path)
            
            # Traiter PDFs
            elif ext == ".pdf":
                pdf_batch.append(path)
            
            # Autres formats (passthrough pour l'instant)
            else:
                processed_paths.append(path)
        
        # Convertir les images en PDF
        if image_batch:
            images_pdf_path = os.path.join(job_dir, "images_converted.pdf")
            convert_images_to_pdf(image_batch, images_pdf_path)
            pdf_batch.append(images_pdf_path)
        
        # 3️⃣ Opérations PDF avancées
        final_pdf = None
        
        if pdf_batch:
            # Fusion si demandée ET si plusieurs fichiers
            if merge and len(pdf_batch) > 1:
                merged_path = os.path.join(job_dir, "merged.pdf")
                merge_pdfs(pdf_batch, merged_path)
                final_pdf = merged_path
            elif len(pdf_batch) == 1:
                final_pdf = pdf_batch[0]
            elif len(pdf_batch) > 1:
                # Pas de fusion demandée mais plusieurs PDFs → zipper
                processed_paths.extend(pdf_batch)
            
            # Division si demandée
            if split and final_pdf and page_range:
                split_path = os.path.join(job_dir, "split.pdf")
                final_pdf = split_pdf_pages(final_pdf, page_range, job_dir)
            
            # Compression si demandée
            if compress and final_pdf:
                compressed_path = os.path.join(job_dir, "compressed.pdf")
                compress_pdf(final_pdf, compressed_path)
                final_pdf = compressed_path
            
            # Chiffrement si demandé
            if secure and password and final_pdf:
                encrypted_path = os.path.join(job_dir, "encrypted.pdf")
                encrypt_pdf(final_pdf, password, encrypted_path)
                final_pdf = encrypted_path
            
            # Ajouter le PDF final à la liste
            if final_pdf:
                processed_paths.append(final_pdf)
            else:
                processed_paths.extend(pdf_batch)
        
        # 4️⃣ Retourner les fichiers
        if not processed_paths:
            raise HTTPException(status_code=500, detail="Aucun fichier traité")
        
        # Un seul fichier : le retourner directement
        if len(processed_paths) == 1:
            return FileResponse(
                processed_paths[0],
                media_type="application/pdf",
                filename=os.path.basename(processed_paths[0])
            )
        
        # Plusieurs fichiers : zipper
        zip_base_path = os.path.join(TEMP_DIR, f"converted_{job_id}")
        zip_file_path = shutil.make_archive(zip_base_path, 'zip', job_dir)
        
        return FileResponse(
            zip_file_path,
            media_type="application/zip",
            filename="fichiers_convertis.zip"
        )
    
    except HTTPException:
        cleanup_directory(job_dir)
        raise
    except Exception as e:
        logger.error(f"Erreur conversion : {str(e)}")
        cleanup_directory(job_dir)
        raise HTTPException(status_code=500, detail=f"Erreur serveur : {str(e)}")


@app.post("/split-pdf")
async def split_pdf_endpoint(
    file: UploadFile = File(...),
    pages: str = Form(...)
):
    """Découpe un PDF selon une plage de pages."""
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Fichier trop volumineux ({file_size / 1024 / 1024:.1f}Mo > {MAX_FILE_SIZE_MB}Mo)"
        )
    
    validate_file(file)
    
    job_id = str(uuid.uuid4())
    job_dir = os.path.join(TEMP_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)
    
    try:
        safe_filename = sanitize_filename(file.filename)
        input_pdf_path = os.path.join(job_dir, safe_filename)
        with open(input_pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
        
        output_path = split_pdf_pages(input_pdf_path, pages, job_dir)
        
        return FileResponse(
            output_path,
            media_type="application/pdf",
            filename=f"split_{safe_filename}"
        )
    
    except HTTPException:
        cleanup_directory(job_dir)
        raise
    except Exception as e:
        logger.error(f"Erreur split-pdf : {str(e)}")
        cleanup_directory(job_dir)
        raise HTTPException(status_code=500, detail=f"Erreur : {str(e)}")


@app.on_event("startup")
async def startup_event():
    """Événement au démarrage du serveur."""
    logger.info("FileConvert Pro API v2.2.0 démarrée")
    cleanup_old_jobs()


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=10000)
