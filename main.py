import os
import shutil
import fitz  # PyMuPDF
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title="Convertisseur & Suite PDF API")

# Configuration CORS pour autoriser GitHub Pages
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_processing"
os.makedirs(TEMP_DIR, exist_ok=True)

@app.get("/")
def read_root():
    return {"message": "L'API de conversion est fonctionnelle !"}

@app.post("/convert")
async def convert_files(
    files: List[UploadFile] = File(...),
    output_format: str = Form("docx"),
    secure: bool = Form(False),
    password: Optional[str] = Form(""),
    compress: bool = Form(False),
    merge: bool = Form(False),
    split: bool = Form(False),
    page_range: Optional[str] = Form("")
):
    if not files:
        raise HTTPException(status_code=400, detail="Aucun fichier envoyé.")

    saved_paths = []

    try:
        # Enregistrer les fichiers reçus localement
        for upload in files:
            file_path = os.path.join(TEMP_DIR, upload.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(upload.file, buffer)
            saved_paths.append(file_path)

        output_path = os.path.join(TEMP_DIR, f"resultat.{output_format}")

        # 1. Traitement : Division / Extraction de pages
        if split and page_range and len(saved_paths) == 1:
            src_pdf = saved_paths[0]
            doc = fitz.open(src_pdf)
            new_doc = fitz.open()

            selected_pages = []
            for part in page_range.split(','):
                part = part.strip()
                if '-' in part:
                    start, end = map(int, part.split('-'))
                    selected_pages.extend(range(start - 1, end))
                elif part.isdigit():
                    selected_pages.append(int(part) - 1)

            for pno in selected_pages:
                if 0 <= pno < len(doc):
                    new_doc.insert_pdf(doc, from_page=pno, to_page=pno)

            split_pdf_path = os.path.join(TEMP_DIR, "split_output.pdf")
            new_doc.save(split_pdf_path)
            doc.close()
            new_doc.close()
            saved_paths = [split_pdf_path]

        # 2. Traitement : Fusion de plusieurs PDF
        if merge and len(saved_paths) > 1:
            merged_doc = fitz.open()
            for pdf_path in saved_paths:
                doc = fitz.open(pdf_path)
                merged_doc.insert_pdf(doc)
                doc.close()
            merged_pdf_path = os.path.join(TEMP_DIR, "merged_output.pdf")
            merged_doc.save(merged_pdf_path)
            merged_doc.close()
            saved_paths = [merged_pdf_path]

        # 3. Sauvegarde finale
        target_file = saved_paths[0]

        if output_format.lower() == "pdf" or target_file.endswith(".pdf"):
            doc = fitz.open(target_file)
            deflate = True if compress else False

            # Appliquer les options uniquement si la sécurisation est activée avec un mot de passe
            if secure and password:
                doc.save(
                    output_path,
                    deflate=deflate,
                    encryption=fitz.PDF_ENCRYPT_ALGORITHM_AES_128,
                    user_pw=password
                )
            else:
                doc.save(output_path, deflate=deflate)
            
            doc.close()
        else:
            shutil.copy(target_file, output_path)

        return FileResponse(
            output_path,
            filename=f"document_converti.{output_format}",
            media_type="application/octet-stream"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
