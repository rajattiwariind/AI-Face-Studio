
# AI Face Studio — Complete Free-First Starter

A browser-based AI Face Studio built with **Java Spring Boot, HTML, CSS, JavaScript, and Python FastAPI**.

AI Face Studio provides a photo-editing workspace with AR face effects, image adjustments, filters, and an optional Python AI service adapter designed for future generative AI integration.

The project follows a **₹0 operating approach**: no paid APIs, subscriptions, GPU rentals, or automatic paid fallbacks.

---

## Project Overview

AI Face Studio combines a Java backend with browser-based image editing and an optional Python service.

### Technology Stack

| Technology | Purpose |
|---|---|
| Java 21 | Backend development |
| Spring Boot | Web application and REST APIs |
| Maven | Dependency management |
| Thymeleaf | HTML template rendering |
| HTML5 | Application structure |
| CSS3 | Responsive interface |
| JavaScript | Interactive editing |
| Canvas API | Browser-based image processing |
| MediaPipe | Facial landmark detection for AR effects, if included in the configured frontend |
| Python 3.10+ | Optional AI service |
| FastAPI | Python API framework |

---

## Features

### Photo Editor
- Upload JPG, PNG, and WebP images.
- Drag-and-drop image upload.
- Browser-based Canvas editing.
- Brightness adjustment.
- Contrast adjustment.
- Saturation adjustment.
- Photo filters.
- Rotate left and right.
- Press-and-hold before comparison.
- Download edited images as PNG.

### AR Face Effects
- Face landmark tracking.
- Face-attached AR effects.
- Dog effect.
- Anime eyes.
- Devil effect.
- Angel effect.
- Butterfly effect.
- Glasses.
- Beauty glow.
- Hearts.

*AR effects require the relevant frontend tracking implementation and a compatible browser.*

### Backend
- Java Spring Boot application.
- Thymeleaf-based frontend.
- Server-side image validation.
- Image size limit: 15 MB.
- Image dimension limit: 25 megapixels.
- AI service health-check integration.
- AI transformation request handling.

### Optional Python AI Service
- FastAPI application.
- Health monitoring.
- Service status integration.
- Image transformation endpoint.
- Explicit unavailable response when no real model is configured.

---

## Project Requirements

Install the following software before running the application:

- Java Development Kit (JDK) 21.
- IntelliJ IDEA.
- Apache Maven.
- Python 3.10 or newer (optional).
- Git (recommended).

---

## Installation and Setup

### 1. Download the project

Extract the ZIP file:

`AI-Face-Studio-Complete-Starter`

### 2. Open in IntelliJ IDEA

1. Start IntelliJ IDEA.
2. Select **Open**.
3. Choose the extracted project folder.
4. Wait for Maven to import dependencies.

### 3. Configure Java

Set the Project SDK to Java 21.

Verify your installation:

```bash
java -version
mvn -version
```

### 4. Run the Spring Boot application

Locate:

```text
src/main/java/com/aifacestudio/AiFaceStudioApplication.java
```

Run the main application class from IntelliJ IDEA.

Alternatively, use the terminal:

```bash
mvn spring-boot:run
```

### 5. Open the application

Visit:

http://localhost:8080

---

## Optional Python AI Service

The Python service is optional. The main photo editor can operate without it.

### Run on Windows

Open PowerShell inside the `ai-service` directory.

**Create a virtual environment:**

```powershell
py -m venv .venv
```

**Activate it:**

```powershell
.venv\Scripts\activate
```

**Install dependencies:**

```powershell
pip install -r requirements.txt
```

**Start the service:**

```powershell
uvicorn main:app --host 127.0.0.1 --port 8000
```

**Test the health endpoint:**

http://localhost:8000/health

### Spring Boot Connection

Spring Boot checks the Python service at:

```text
http://localhost:8000
```

If your Python service runs at another address, update:

```properties
AI_SERVICE_URL=http://localhost:8000
```

Use the corresponding environment variable or configuration mechanism supported by your application.

---

## AI Model Integration

**Important: This starter does not include a trained generative AI model.**

Hairstyle, beard, age, and beauty transformations require a real generative model adapter.

Until an actual model is configured, the Python service returns an explicit unavailable response rather than pretending that an ordinary filter is an AI transformation.

The application does not:
- Pretend that filters are generative AI.
- Return the original image as a successful AI transformation.
- Call paid AI APIs.
- Automatically switch to paid services.

Before integrating a model, verify:
- Model license and commercial-use permissions.
- Model card and supported capabilities.
- Input and output formats.
- Photo privacy and data-handling policies.
- Availability of free inference compute.

Free cloud services may have queues, quotas, cold starts, downtime, or discontinued access.

---

## ₹0 Operating Policy

This project is designed to avoid mandatory operating costs.

| Resource | Policy |
|---|---|
| Paid AI APIs | Not included |
| Paid GPU rental | Not included |
| Paid subscriptions | Not required |
| Automatic paid fallback | Not included |
| Browser-based editing | Runs locally in the browser |
| Python AI service | Optional |

**Hardware note:** Large image-generation models are not recommended for local inference on an Intel HD 520 computer with 8 GB RAM. Free remote inference may be an alternative, but availability is not guaranteed.

---

## Security and Privacy

This repository is a development starter, not a production-ready application.

Before public deployment, consider implementing:

- User authentication and authorization.
- CSRF protection where applicable.
- API rate limiting.
- Strict file signature and content validation.
- Image metadata handling.
- Secure temporary file storage and deletion.
- Upload size and dimension limits.
- Privacy and consent controls for external AI providers.
- HTTPS and secure configuration management.

Do not upload private photographs to external AI providers without understanding their privacy policies and obtaining appropriate consent.

---

## Project Structure

```text
AI-Face-Studio/
│
├── ai-service/
│   ├── main.py
│   ├── requirements.txt
│   └── README.md
│
├── src/
│   └── main/
│       ├── java/
│       │   └── com/aifacestudio/
│       │       ├── AiFaceStudioApplication.java
│       │       └── ...
│       │
│       └── resources/
│           ├── templates/
│           │   └── index.html
│           │
│           ├── static/
│           │   ├── css/
│           │   │   └── style.css
│           │   │
│           │   └── js/
│           │       └── app.js
│           │
│           └── application.properties
│
├── pom.xml
└── README.md
```

*The structure above illustrates the main project layout. Actual files may vary by version.*

---

## Future Improvements

- Integration with a verified open-source generative model.
- Real hairstyle transfer.
- Beard style transformation.
- Age transformation.
- Background replacement.
- Additional AR lenses.
- Improved face tracking.
- Export quality and editing improvements.

These are planned improvements, not features guaranteed by the current starter.

---

## License

Choose and add an appropriate open-source license before distributing this project. Also verify the licenses of all third-party libraries and models.

---

**AI Face Studio** — A free-first foundation for browser-based photo editing and AI-powered face transformations.
