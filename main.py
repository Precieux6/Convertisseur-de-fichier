import os
import shutil
import zipfile
import uuid
import re
import fitz  # PyMuPDF
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware

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


@app.get("/")
def read_root():
    return {"message": "API FileConvert Pro est en ligne."}


@app.post("/convert")
async def convert_files(
    files: List[UploadFile] = File(...),
    output_format: str = Form("pdf"),
    secure: bool = Form(False),
    password: Optional[str] = Form(""),
    compress: bool = Form(False),
    merge: bool = Form(False),
    split: bool = Form(False),
    page_range: Optional[str] = Form("")
):
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier n'a été téléversé.")

    # -------------------------------------------------------------
    # VÉRIFICATION STRICTE DE LA TAILLE DE CHAQUE FICHIER (100 Mo MAX)
    # -------------------------------------------------------------
    for upload in files:
        upload.file.seek(0, 2)
        file_size = upload.file.tell()
        upload.file.seek(0)  # Remettre le curseur au début

        if file_size > MAX_FILE_SIZE_BYTES:
            size_in_mb = round(file_size / (1024 * 1024), 2)
            raise HTTPException(
                status_code=400,
                detail=f"Le fichier '{upload.filename}' est trop lourd ({size_in_mb} Mo). "
                       f"La limite maximale autorisée est de {MAX_FILE_SIZE_MB} Mo par fichier "
                       f"pour garantir la stabilité du serveur."
            )

    job_id = str(uuid.uuid4())
    job_dir = os.path.join(TEMP_DIR, job_id)
    os.makedirs(job_dir, exist_ok=True)

    saved_paths = []
    processed_paths = []

    try:
        # Enregistrement local des fichiers téléversés
        for upload in files:
            file_path = os.path.join(job_dir, upload.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(upload.file, buffer)
            saved_paths.append(file_path)

        out_fmt = output_format.lower().strip()

        # CAS 1 : Fusion de plusieurs fichiers en un seul PDF
        if merge and len(saved_paths) > 1 and out_fmt == "pdf":
            merged_doc = fitz.open()
            for path in saved_paths:
                ext = os.path.splitext(path)[1].lower()
                if ext == ".pdf":
                    doc = fitz.open(path)
                    merged_doc.insert_pdf(doc)
                    doc.close()
                else:
                    try:
                        img_doc = fitz.open(path)
                        pdf_bytes = img_doc.convert_to_pdf()
                        pdf_mem = fitz.open("pdf", pdf_bytes)
                        merged_doc.insert_pdf(pdf_mem)
                        img_doc.close()
                        pdf_mem.close()
                    except Exception as e:
                        print(f"Erreur d'intégration de {path} dans la fusion: {e}")

            output_merged_path = os.path.join(job_dir, "document_fusionne.pdf")
            
            if secure and password:
                perm = int(fitz.PDF_PERM_ACCESSIBILITY)
                encrypt_meth = fitz.PDF_ENCRYPT_AES_256
                merged_doc.save(
                    output_merged_path,
                    user_pw=password,
                    owner_pw=password,
                    permissions=perm,
                    encryption=encrypt_meth
                )
            else:
                merged_doc.save(output_merged_path)

            merged_doc.close()
            processed_paths.append(output_merged_path)

        # CAS 2 : Traitement individuel de chaque fichier
        else:
            for path in saved_paths:
                filename = os.path.basename(path)
                name_without_ext, ext = os.path.splitext(filename)
                ext = ext.lower()

                if ext == ".pdf":
                    doc = fitz.open(path)

                    if split and page_range:
                        selected_pages = parse_page_range(page_range, len(doc))
                        if selected_pages:
                            new_doc = fitz.open()
                            for p_idx in selected_pages:
                                new_doc.insert_pdf(doc, from_page=p_idx, to_page=p_idx)
                            
                            split_path = os.path.join(job_dir, f"{name_without_ext}_extrait.pdf")
                            if secure and password:
                                new_doc.save(split_path, user_pw=password, owner_pw=password, encryption=fitz.PDF_ENCRYPT_AES_256)
                            else:
                                new_doc.save(split_path)
                            new_doc.close()
                            processed_paths.append(split_path)
                            doc.close()
                            continue

                    if out_fmt in ["jpg", "png"]:
                        for i, page in enumerate(doc):
                            pix = page.get_pixmap(dpi=150)
                            img_name = f"{name_without_ext}_page_{i+1}.{out_fmt}"
                            img_path = os.path.join(job_dir, img_name)
                            pix.save(img_path)
                            processed_paths.append(img_path)
                        doc.close()
                    
                    elif out_fmt == "txt":
                        txt_path = os.path.join(job_dir, f"{name_without_ext}.txt")
                        full_text = ""
                        for page in doc:
                            full_text += page.get_text() + "\n--- PAGE BREAK ---\n"
                        with open(txt_path, "w", encoding="utf-8") as f:
                            f.write(full_text)
                        processed_paths.append(txt_path)
                        doc.close()

                    else:
                        out_pdf_path = os.path.join(job_dir, f"{name_without_ext}_converti.pdf")
                        if secure and password:
                            doc.save(out_pdf_path, user_pw=password, owner_pw=password, encryption=fitz.PDF_ENCRYPT_AES_256)
                        else:
                            doc.save(out_pdf_path)
                        doc.close()
                        processed_paths.append(out_pdf_path)

                elif ext in [".jpg", ".jpeg", ".png", ".bmp", ".webp"]:
                    if out_fmt == "pdf":
                        out_pdf_path = os.path.join(job_dir, f"{name_without_ext}.pdf")
                        img_doc = fitz.open(path)
                        pdf_bytes = img_doc.convert_to_pdf()
                        pdf_mem = fitz.open("pdf", pdf_bytes)
                        if secure and password:
                            pdf_mem.save(out_pdf_path, user_pw=password, owner_pw=password, encryption=fitz.PDF_ENCRYPT_AES_256)
                        else:
                            pdf_mem.save(out_pdf_path)
                        img_doc.close()
                        pdf_mem.close()
                        processed_paths.append(out_pdf_path)
                    else:
                        processed_paths.append(path)

                else:
                    processed_paths.append(path)

        if not processed_paths:
            raise HTTPException(status_code=500, detail="Aucun fichier n'a pu être généré.")

        if len(processed_paths) == 1:
            final_file = processed_paths[0]
            download_name = os.path.basename(final_file)
            return FileResponse(
                path=final_file,
                filename=download_name,
                media_type="application/octet-stream"
            )
        else:
            zip_filename = f"fichiers_convertis_{job_id[:8]}.zip"
            zip_path = os.path.join(job_dir, zip_filename)
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zipf:
                for file_p in processed_paths:
                    zipf.write(file_p, arcname=os.path.basename(file_p))

            return FileResponse(
                path=zip_path,
                filename=zip_filename,
                media_type="application/zip"
            )

    except HTTPException:
        cleanup_directory(job_dir)
        raise

    except Exception as e:
        cleanup_directory(job_dir)
        raise HTTPException(status_code=500, detail=f"Erreur lors du traitement : {str(e)}")
