from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
import shutil
import os
import subprocess
from pdf2docx import Converter

app = FastAPI(title="API de Conversion de Documents KDP")

# Configuration CORS pour autoriser les requêtes depuis votre front-end Web
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # En production, remplacez "*" par l'URL de votre front-end
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

TEMP_DIR = "temp_files"
os.makedirs(TEMP_DIR, exist_ok=True)


@app.get("/")
def read_root():
    return {"message": "API de conversion active"}


@app.post("/convert/pdf-to-docx")
async def convert_pdf_to_docx(file: UploadFile = File(...)):
    """Conversion d'un PDF en DOCX"""
    if not file.filename.endswith(".pdf"):
        raise HTTPException(
            status_code=400, detail="Le fichier doit être au format PDF."
        )

    input_path = os.path.join(TEMP_DIR, file.filename)
    output_filename = file.filename.rsplit(".", 1)[0] + ".docx"
    output_path = os.path.join(TEMP_DIR, output_filename)

    try:
        # Enregistrement temporaire du fichier envoyé par l'utilisateur
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Exécution de la conversion PDF -> DOCX
        cv = Converter(input_path)
        cv.convert(output_path)
        cv.close()

        # Renvoi du fichier converti au client
        return FileResponse(
            path=output_path,
            filename=output_filename,
            media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        )

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Erreur de conversion : {str(e)}"
        )

    finally:
        # Nettoyage du fichier source temporaire
        if os.path.exists(input_path):
            os.remove(input_path)


@app.post("/convert/pandoc")
async def convert_with_pandoc(
    from_format: str, to_format: str, file: UploadFile = File(...)
):
    """Conversion générique en utilisant Pandoc (ex: EPUB -> DOCX)"""
    input_path = os.path.join(TEMP_DIR, file.filename)
    output_filename = f"converted.{to_format}"
    output_path = os.path.join(TEMP_DIR, output_filename)

    try:
        with open(input_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)

        # Appel de l'outil CLI Pandoc installé sur la machine/serveur
        cmd = ["pandoc", input_path, "-f", from_format, "-t", to_format, "-o", output_path]
        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode != 0:
            raise Exception(result.stderr)

        return FileResponse(path=output_path, filename=output_filename)

    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Erreur lors de l'exécution de Pandoc : {str(e)}"
        )

    finally:
        if os.path.exists(input_path):
            os.remove(input_path)