
import os
import tempfile
import logging
from pathlib import Path
from functools import lru_cache
from io import BytesIO

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import Response
from gradio_client import Client, handle_file
from PIL import Image
from starlette.concurrency import run_in_threadpool

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ai-face-studio")

app = FastAPI(title="AI Face Studio AI Service")

SPACE_ID = os.getenv("HF_SPACE_ID", "AIRI-Institute/HairFastGAN")
API_NAME = "/swap_hair"
MAX_SIZE = 10 * 1024 * 1024


@lru_cache(maxsize=1)
def get_client():
    token = os.getenv("HF_TOKEN")

    if token:
        return Client(SPACE_ID, hf_token=token)

    return Client(SPACE_ID)


@app.get("/health")
def health():
    return {
        "available": True,
        "service": "AI Face Studio Hairstyle Service",
        "modelConfigured": True,
        "model": "HairFastGAN",
        "cloudProvider": "Hugging Face Spaces",
        "endpoint": API_NAME,
        "paidFallback": False
    }


def validate_image(data):
    try:
        with Image.open(BytesIO(data)) as image:
            image.verify()
    except Exception:
        raise HTTPException(
            status_code=400,
            detail="Invalid image. Upload a valid JPG or PNG."
        )


def get_output_path(value):
    if isinstance(value, str) and os.path.isfile(value):
        return value

    if isinstance(value, dict):
        path = value.get("path")

        if path and os.path.isfile(path):
            return path

        for item in value.values():
            found = get_output_path(item)
            if found:
                return found

    if isinstance(value, (tuple, list)):
        for item in value:
            found = get_output_path(item)
            if found:
                return found

    return None


def generate_hairstyle(face_bytes, shape_bytes):
    with tempfile.TemporaryDirectory() as temp_dir:

        face_path = Path(temp_dir) / "face.png"
        shape_path = Path(temp_dir) / "shape.png"

        face_path.write_bytes(face_bytes)
        shape_path.write_bytes(shape_bytes)

        client = get_client()
        align_options = ["Shape", "Color"]

        logger.info("Preparing face photo")

        prepared_face = client.predict(
            handle_file(str(face_path)),
            align_options,
            api_name="/resize_inner"
        )

        logger.info("Preparing hairstyle reference")

        prepared_shape = client.predict(
            handle_file(str(shape_path)),
            align_options,
            api_name="/resize_inner_1"
        )

        logger.info("Preparing hair color reference")

        prepared_color = client.predict(
            handle_file(str(shape_path)),
            align_options,
            api_name="/resize_inner_2"
        )

        for name, path in [
            ("face", prepared_face),
            ("shape", prepared_shape),
            ("color", prepared_color)
        ]:
            if not isinstance(path, str) or not os.path.isfile(path):
                raise RuntimeError(
                    f"Preprocessing failed for {name}: {path}"
                )

        logger.info("Generating hairstyle with HairFastGAN")

        result = client.predict(
            handle_file(prepared_face),
            handle_file(prepared_shape),
            handle_file(prepared_color),
            "Article",
            0,
            15,
            api_name=API_NAME
        )

        if not isinstance(result, (tuple, list)) or len(result) < 2:
            raise RuntimeError(
                f"Unexpected model response: {result}"
            )

        image_result, error_message = result

        if error_message:
            raise RuntimeError(str(error_message))

        output_path = get_output_path(image_result)

        if not output_path:
            raise RuntimeError(
                f"No output image found: {image_result}"
            )

        output_bytes = Path(output_path).read_bytes()

        with Image.open(BytesIO(output_bytes)) as image:
            image.verify()

        logger.info("Hairstyle generation completed")

        return output_bytes


@app.post("/hairstyle/transfer")
async def transfer_hairstyle(
    face: UploadFile = File(...),
    shape: UploadFile = File(...)
):
    face_bytes = await face.read()
    shape_bytes = await shape.read()

    if not face_bytes or not shape_bytes:
        raise HTTPException(
            status_code=400,
            detail="Upload both photos."
        )

    if len(face_bytes) > MAX_SIZE or len(shape_bytes) > MAX_SIZE:
        raise HTTPException(
            status_code=413,
            detail="Each photo must be smaller than 10 MB."
        )

    validate_image(face_bytes)
    validate_image(shape_bytes)

    try:
        result_bytes = await run_in_threadpool(
            generate_hairstyle,
            face_bytes,
            shape_bytes
        )

        return Response(
            content=result_bytes,
            media_type="image/png",
            headers={
                "Content-Disposition":
                    'inline; filename="hairstyle-result.png"'
            }
        )

    except Exception as exc:
        logger.exception("Hairstyle generation failed")

        raise HTTPException(
            status_code=502,
            detail=f"HairFastGAN processing failed: {str(exc)[:500]}"
        )


@app.post("/transform")
def transform_placeholder():
    raise HTTPException(
        status_code=503,
        detail="No general-purpose image transformation model is configured."
    )
