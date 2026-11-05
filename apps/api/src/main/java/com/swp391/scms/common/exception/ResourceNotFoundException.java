package com.swp391.scms.common.exception;

import org.springframework.http.HttpStatus;

/**
 * Thrown when a requested resource is not found (HTTP 404).
 */
public class ResourceNotFoundException extends AppException {

    public ResourceNotFoundException(String message) {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", message);
    }

    public ResourceNotFoundException(String resourceName, Object identifier) {
        super(HttpStatus.NOT_FOUND, "NOT_FOUND", "error.not_found", new Object[]{resourceName, identifier}, null);
    }

    public ResourceNotFoundException(String errorCode, String messageKey, Object[] messageArgs, String fallbackMessage) {
        super(HttpStatus.NOT_FOUND, errorCode, messageKey, messageArgs, fallbackMessage);
    }
}
