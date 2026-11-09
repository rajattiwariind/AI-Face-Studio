package com.aifacestudio.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.client.RestClient;
import org.springframework.web.multipart.MultipartFile;

import java.util.Map;
import java.util.Set;

@RestController
@RequestMapping("/api")
public class StudioController {
    private static final long MAX_BYTES = 15L * 1024 * 1024;
    private static final Set<String> TYPES = Set.of("image/jpeg", "image/png");
    private final RestClient restClient = RestClient.create();

    @Value("${ai.service.url:http://localhost:8000}")
    private String aiServiceUrl;

    @PostMapping(value = "/images/validate", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> validate(@RequestParam("image") MultipartFile image) {
        if (image == null || image.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("message", "Choose an image first."));
        if (image.getSize() > MAX_BYTES)
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("message", "Image must be 15 MB or smaller."));
        if (!TYPES.contains(image.getContentType()))
            return ResponseEntity.badRequest().body(Map.of("message", "Only JPG, PNG and WEBP are accepted."));
        try {
            var decoded = javax.imageio.ImageIO.read(image.getInputStream());
            if (decoded == null)
                return ResponseEntity.badRequest().body(Map.of("message", "The file could not be decoded as an image."));
            long pixels = (long) decoded.getWidth() * decoded.getHeight();
            if (pixels > 25_000_000L)
                return ResponseEntity.badRequest().body(Map.of("message", "Image exceeds the 25-megapixel limit."));
            return ResponseEntity.ok(Map.of("message", "Image validated.", "width", decoded.getWidth(),
                    "height", decoded.getHeight(), "bytes", image.getSize()));
        } catch (Exception ex) {
            return ResponseEntity.badRequest().body(Map.of("message", "Unable to read this image."));
        }
    }

    @GetMapping("/ai/status")
    public ResponseEntity<?> aiStatus() {
        try {
            Map<?, ?> status = restClient.get().uri(aiServiceUrl + "/health").retrieve().body(Map.class);
            return ResponseEntity.ok(status == null ? Map.of("available", false) : status);
        } catch (Exception ex) {
            return ResponseEntity.ok(Map.of("available", false,
                    "message", "The optional Python AI service is not running. Local editing remains available."));
        }
    }

    @PostMapping(value = "/ai/transform", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<?> transform(@RequestParam("image") MultipartFile image,
                                       @RequestParam("feature") String feature,
                                       @RequestParam(value = "style", required = false, defaultValue = "") String style) {
        if (image == null || image.isEmpty())
            return ResponseEntity.badRequest().body(Map.of("message", "Choose a photo first."));
        if (image.getSize() > MAX_BYTES)
            return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE).body(Map.of("message", "Image must be 15 MB or smaller."));
        try {
            return restClient.post().uri(aiServiceUrl + "/transform")
                    .contentType(MediaType.MULTIPART_FORM_DATA)
                    .body(org.springframework.util.MultiValueMap.fromMultiValue(Map.of(
                            "image", java.util.List.of(new org.springframework.core.io.ByteArrayResource(image.getBytes()) {
                                @Override public String getFilename() { return image.getOriginalFilename() == null ? "upload.jpg" : image.getOriginalFilename(); }
                            }),
                            "feature", java.util.List.of(feature),
                            "style", java.util.List.of(style)
                    )))
                    .retrieve().toEntity(byte[].class);
        } catch (org.springframework.web.client.HttpStatusCodeException ex) {
            return ResponseEntity.status(ex.getStatusCode()).contentType(MediaType.APPLICATION_JSON)
                    .body(ex.getResponseBodyAsByteArray());
        } catch (Exception ex) {
            return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(Map.of(
                    "message", "AI generation is not available right now. No paid service was called.",
                    "reason", "Start/configure the optional free AI service when free compute is available."
            ));
        }
    }
}
