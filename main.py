import os
import shutil
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
    """ Convertit le fichier en PDF pivot si nécessaire """
    ext = os.path.splitext(input_path)[1].lower()
    if ext == ".pdf":
        return input_path

    pdf_output_path = f"{os.path.splitext(input_path)[0]}_pivot.pdf"

    try:
        # 1. Utilisation directe de PyMuPDF pour les formats supportés (Images, Story / Document)
        doc = fitz.open(input_path)
        pdf_bytes = doc.convert_to_pdf()
        with open(pdf_output_path, "wb") as f:
            f.write(pdf_bytes)
        doc.close()
        return pdf_output_path
    except Exception:
        # En cas d'échec de conversion pivot directe, on garde le fichier tel quel si les opérations PDF ne sont pas demandées
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
    processed_paths = []

    try:
        # 1. Enregistrement des fichiers
        for upload in files:
            file_path = os.path.join(TEMP_DIR, upload.filename)
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(upload.file, buffer)
            saved_paths.append(file_path)

        # 2. Si des options spécifiques PDF sont demandées (split/merge/compress/secure)
        if split or merge or compress or secure or output_format.lower() == "pdf":
            # Transformer en PDF pivot
            for fp in saved_paths:
                processed_paths.append(convert_to_pdf_pivot(fp))

            # Option Division (Split)
            if split and page_range and len(processed_paths) == 1:
                if not processed_paths[0].endswith(".pdf"):
                    raise HTTPException(status_code=400, detail="Le fichier fourni ne peut pas être découpé en pages PDF.")
                
                doc = fitz.open(processed_paths[0])
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
                processed_paths = [split_output]

            # Option Fusion (Merge)
            if merge and len(processed_paths) > 1:
                merged_doc = fitz.open()
                for pdf_path in processed_paths:
                    if pdf_path.endswith(".pdf"):
                        doc = fitz.open(pdf_path)
                        merged_doc.insert_pdf(doc)
                        doc.close()
                
                merged_output = os.path.join(TEMP_DIR, "merged_output.pdf")
                merged_doc.save(merged_output)
                merged_doc.close()
                processed_paths = [merged_output]

            final_file = processed_paths[0]
            final_output_path = os.path.join(TEMP_DIR, f"resultat_final.{output_format}")

            # Traitement de la sortie PDF (Mot de passe & Compression)
            if output_format.lower() == "pdf" and final_file.endswith(".pdf"):
                doc = fitz.open(final_file)
                deflate = True if compress else False
                if secure and password:
                    doc.save(final_output_path, deflate=deflate, encryption=fitz.PDF_ENCRYPT_ALGORITHM_AES_128, user_pw=password)
                else:
                    doc.save(final_output_path, deflate=deflate)
                doc.close()
            else:
                shutil.copy(final_file, final_output_path)

        else:
            # Conversion simple sans manipulation de pages
            final_output_path = os.path.join(TEMP_DIR, f"resultat_final.{output_format}")
            shutil.copy(saved_paths[0], final_output_path)

        return FileResponse(
            final_output_path,
            filename=f"document_converti.{output_format}",
            media_type="application/octet-stream"
        )

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Erreur de traitement : {str(e)}")
