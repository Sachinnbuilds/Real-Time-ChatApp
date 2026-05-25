package com.substring.chat.exceptions;

import org.springframework.http.HttpStatus;

public class AppException extends RuntimeException {
    private final String code;
    private final String hint;
    private final HttpStatus status;

    public AppException(String code, String message, String hint, HttpStatus status) {
        super(message);
        this.code = code;
        this.hint = hint;
        this.status = status;
    }

    public String getCode() {
        return code;
    }

    public String getHint() {
        return hint;
    }

    public HttpStatus getStatus() {
        return status;
    }
}
