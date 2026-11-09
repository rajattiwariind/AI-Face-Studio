# Optional Python AI adapter

This FastAPI service provides health/status and a safe transform endpoint. It deliberately returns HTTP 503 until a real model adapter is configured. It does not return the original photo pretending it was transformed and it does not call paid APIs.

## Run on Windows
1. Install Python 3.10 or newer.
2. Open a terminal in this `ai-service` folder.
3. Create an environment: `py -m venv .venv`
4. Activate: `.venv\\Scripts\\activate`
5. Install: `pip install -r requirements.txt`
6. Start: `uvicorn main:app --host 127.0.0.1 --port 8000`
7. Test: http://localhost:8000/health

The AI Studio still works for local photo editing if this optional service is not running.

## Model integration
Before enabling a generative model, verify its license, model card, input/output format, privacy terms, and free compute availability. Do not set `AI_MODEL_ENABLED=true` until an actual adapter is implemented and tested. A free-tier endpoint can have quotas, queues, sleep, or be discontinued; there is no promise of unlimited free generations.
