import os
import shutil
import subprocess
import fitz  # PyMuPDF
from typing import List, Optional
from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

app = FastAPI(title="Convertisseur Universel Pro API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_processing"
os.makedirs(TEMP_DIR, exist_ok=True)

def convert_to_pdf_pivot(input_path: str) -> str:
    """ Convertit n'importe quel fichier (DOCX, EPUB, MOBI, TXT) en PDF temporaire """
    ext = os.path.splitext(input_path)[1].lower()
    if ext == ".pdf":
        return input_path

    pdf_output_path = f"{os.path.splitext(input_path)[0]}_pivot.pdf"

    try:
        # Conversion DOCX / TXT -> PDF via LibreOffice (si disponible sur le serveur Render)
        if ext in [".docx", ".doc", ".txt", ".rtf"]:
            cmd = ["soffice", "--headless", "--convert-to", "pdf", input_path, "--outdir", TEMP_DIR]
            subprocess.run(cmd, check=True)
            filename = os.path.basename(input_path)
            return os.path.join(TEMP_DIR, f"{os.path.splitext(filename)[0]}.pdf")

        # Conversion EPUB / MOBI / AZW3 (Kindle) -> PDF via Calibre CLI
        elif ext in [".epub", ".mobi", ".azw3", ".kfx"]:
            cmd = ["ebook-convert", input_path, pdf_output_path]
            subprocess.run(cmd, check=True)
            return pdf_output_path

    except Exception as e:
        # Si le convertisseur système n'est pas disponible, basculer sur une ouverture via PyMuPDF
        try:
            doc = fitz.open(input_path)
            pdf_bytes = doc.convert_to_pdf()
            with open(pdf_output_path, "wb") as f:
                f.write(pdf_bytes)
            return pdf_output_path
        except Exception:
            raise HTTPException(
                status_code=400, 
                detail=f"Impossible de traiter le fichier {os.path.basename(input_path)}. Format incompatible ou corrompu."
            )

    return input_path

@app.get("/")
def read_root():
    return {"status": "L'API de conversion est fonctionnelle et prête !"}

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
        raise HTTPException(status_code=400, detail="Aucun fichier fourni.")

    saved_paths = []
    pdf_pivot_paths = []

    try:
        # 1. Sauvegarde locale des fichiers
        for upload in files:
            file_path = os.path.join(TEMP_DIR, upload.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(upload.file, buffer)
            saved_paths.append(file_path)

        # 2. Conversion universelle de TOUS les fichiers en PDF PIVOT
        for fp in saved_paths:
            pdf_pivot_paths.append(convert_to_pdf_pivot(fp))

        # 3. Traitement de la Division (Split)
        if split and page_range and len(pdf_pivot_paths) == 1:
            doc = fitz.open(pdf_pivot_paths[0])
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

            split_output = os.path.join(TEMP_DIR, "split_output.pdf")
            new_doc.save(split_output)
            doc.close()
            new_doc.close()
            pdf_pivot_paths = [split_output]

        # 4. Traitement de la Fusion (Merge Multi-Formats)
        if merge and len(pdf_pivot_paths) > 1:
            merged_doc = fitz.open()
            for pdf_path in pdf_pivot_paths:
                doc = fitz.open(pdf_path)
                merged_doc.insert_pdf(doc)
                doc.close()
            
            merged_output = os.path.join(TEMP_DIR, "merged_output.pdf")
            merged_doc.save(merged_output)
            merged_doc.close()
            pdf_pivot_paths = [merged_output]

        final_pdf = pdf_pivot_paths[0]
        final_output_path = os.path.join(TEMP_DIR, f"resultat_final.{output_format}")

        # 5. Export au format de destination choisi
        if output_format.lower() == "pdf":
            doc = fitz.open(final_pdf)
            deflate = True if compress else False
            if secure and password:
                doc.save(final_output_path, deflate=deflate, encryption=fitz.PDF_ENCRYPT_ALGORITHM_AES_128, user_pw=password)
            else:
                doc.save(final_output_path, deflate=deflate)
            doc.close()

        elif output_format.lower() in ["epub", "mobi", "azw3", "docx"]:
            try:
                cmd = ["ebook-convert", final_pdf, final_output_path]
                subprocess.run(cmd, check=True)
            except Exception:
                shutil.copy(final_pdf, final_output_path)
        else:
            shutil.copy(final_pdf, final_output_path)

        return FileResponse(
            final_output_path,
            filename=f"document_modifie.{output_format}",
            media_type="application/octet-stream"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de traitement : {str(e)}")
