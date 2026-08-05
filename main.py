import os
import shutil
import zipfile
import uuid
import re
import subprocess
import fitz  # PyMuPDF
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from PIL import Image
import img2pdf

app = FastAPI(title="FileConvert Pro API", version="2.1.0")

# Configuration CORS pour autoriser l'accès depuis GitHub Pages
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


def convert_docx_to_pdf_libreoffice(docx_path: str, output_dir: str) -> str:
    """
    Convertit un fichier DOCX en PDF via LibreOffice Headless.
    Conserve fidèlement la mise en page, les tableaux complexes et les polices.
    """
    cmd = [
        "libreoffice",
        "--headless",
        "--convert-to", "pdf",
        docx_path,
        "--outdir", output_dir
    ]
    subprocess.run(cmd, check=True)
    
    base_name = os.path.splitext(os.path.basename(docx_path))[0]
    return os.path.join(output_dir, f"{base_name}.pdf")


def cleanup_directory(directory_path: str):
    """Nettoie un dossier temporaire."""
    if os.path.exists(directory_path):
        shutil.rmtree(directory_path, ignore_errors=True)


def parse_page_range(page_range_str: str, max_pages: int) -> List[int]:
    """Analyse les chaînes de type '1-3, 5, 8-10' pour retourner les numéros de pages (base 0)."""
    pages = set()
    parts = page_range_str.split(',')
    for part in parts:
        part = part.strip()
        if not part:
            continue
        if '-' in part:
            try:
                start, end = part.split('-')
                start_idx = max(0, int(start) - 1)
                end_idx = min(max_pages, int(end))
                for i in range(start_idx, end_idx):
                    pages.add(i)
            except ValueError:
                continue
        else:
            try:
                page_idx = int(part) - 1
                if 0 <= page_idx < max_pages:
                    pages.add(page_idx)
            except ValueError:
                continue
    return sorted(list(pages))


def convert_images_to_pdf(image_paths: List[str], output_pdf_path: str):
    """Convertit une liste d'images (JPG, PNG, WEBP, etc.) en un seul PDF."""
    converted_images = []
    for img_path in image_paths:
        ext = os.path.splitext(img_path)[1].lower()
        if ext in [".heic", ".webp"]:
            img = Image.open(img_path)
            jpg_path = img_path + ".jpg"
            img.convert("RGB").save(jpg_path, "JPEG")
            converted_images.append(jpg_path)
        else:
            converted_images.append(img_path)

    with open(output_pdf_path, "wb") as f:
        f.write(img2pdf.convert(converted_images))


@app.post("/convert")
async def convert_files(files: List[UploadFile] = File(...)):
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier fourni")

    # 1. Contrôle strict de la taille des fichiers (Max 100 Mo par fichier)
    for file in files:
        file.file.seek(0, 2)
        file_size = file.file.tell()
        file.file.seek(0)
        if file_size > MAX_FILE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail=f"Le fichier '{file.filename}' dépasse la limite autorisée de {MAX_FILE_SIZE_MB} Mo."
            )

    job_id = str(uuid.uuid4())
    job_dir = os.path.join(TEMP_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    try:
        saved_paths = []
        for file in files:
            file_path = os.path.join(job_dir, file.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
            saved_paths.append(file_path)

        processed_paths = []
        image_batch = []

        for path in saved_paths:
            ext = os.path.splitext(path)[1].lower()

            # 📄 Conversion Word (DOCX / DOC) via LibreOffice
            if ext in [".docx", ".doc"]:
                out_pdf_path = convert_docx_to_pdf_libreoffice(path, job_dir)
                processed_paths.append(out_pdf_path)

            # 🖼️ Conversion Images
            elif ext in [".jpg", ".jpeg", ".png", ".webp", ".heic"]:
                image_batch.append(path)

            else:
                processed_paths.append(path)

        # Regroupement des images en un seul PDF s'il y en a
        if image_batch:
            merged_pdf_path = os.path.join(job_dir, "converted_images.pdf")
            convert_images_to_pdf(image_batch, merged_pdf_path)
            processed_paths.append(merged_pdf_path)

        # Envoi d'un seul fichier directement
        if len(processed_paths) == 1:
            return FileResponse(
                processed_paths[0],
                media_type="application/pdf",
                filename=os.path.basename(processed_paths[0])
            )

        # Envoi sous forme d'archive ZIP si plusieurs fichiers générés
        zip_base_path = os.path.join(TEMP_DIR, f"converted_{job_id}")
        zip_file_path = shutil.make_archive(zip_base_path, 'zip', job_dir)

        return FileResponse(
            zip_file_path,
            media_type="application/zip",
            filename="fichiers_convertis.zip"
        )

    except Exception as e:
        cleanup_directory(job_dir)
        raise HTTPException(status_code=500, detail=f"Erreur de traitement : {str(e)}")


@app.post("/split-pdf")
async def split_pdf(file: UploadFile = File(...), pages: str = Form(...)):
    """Découpe un fichier PDF selon la plage de pages sélectionnée."""
    file.file.seek(0, 2)
    file_size = file.file.tell()
    file.file.seek(0)
    if file_size > MAX_FILE_SIZE_BYTES:
        raise HTTPException(status_code=400, detail=f"Fichier trop volumineux (> {MAX_FILE_SIZE_MB} Mo)")

    job_id = str(uuid.uuid4())
    job_dir = os.path.join(TEMP_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    try:
        input_pdf_path = os.path.join(job_dir, file.filename)
        with open(input_pdf_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        doc = fitz.open(input_pdf_path)
        page_indices = parse_page_range(pages, len(doc))

        if not page_indices:
            raise HTTPException(status_code=400, detail="Aucune page valide n'a été sélectionnée.")

        new_doc = fitz.open()
        for idx in page_indices:
            new_doc.insert_pdf(doc, from_page=idx, to_page=idx)

        output_pdf_path = os.path.join(job_dir, f"decoupe_{file.filename}")
        new_doc.save(output_pdf_path)
        new_doc.close()
        doc.close()

        return FileResponse(
            output_pdf_path,
            media_type="application/pdf",
            filename=f"decoupe_{file.filename}"
        )
    except Exception as e:
        cleanup_directory(job_dir)
        raise HTTPException(status_code=500, detail=f"Erreur lors de la découpe : {str(e)}")
