import axios, { AxiosError } from 'axios';
import { ApiErrorResponse } from './types';

export type ApiErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'SERVER_ERROR'
  | 'NETWORK_ERROR'
  | 'REQUEST_CANCELLED'
  | 'UNKNOWN_ERROR';

export class AppApiError extends Error {
  public readonly status: number;
  public readonly code: ApiErrorCode;
  public readonly validationErrors?: Record<string, string[]>;
  public readonly details?: unknown;

  constructor(params: {
    message: string;
    status: number;
    code: ApiErrorCode;
    validationErrors?: Record<string, string[]>;
    details?: unknown;
  }) {
    super(params.message);
    this.name = 'AppApiError';
    this.status = params.status;
    this.code = params.code;
    this.validationErrors = params.validationErrors;
    this.details = params.details;

    Object.setPrototypeOf(this, AppApiError.prototype);
  }

  get isValidation(): boolean {
    return this.code === 'VALIDATION_ERROR';
  }

  get isUnauthorized(): boolean {
    return this.status === 401 || this.code === 'UNAUTHORIZED';
  }

  get isForbidden(): boolean {
    return this.status === 403 || this.code === 'FORBIDDEN';
  }

  get isConflict(): boolean {
    return this.status === 409 || this.code === 'CONFLICT';
  }

  get isNotFound(): boolean {
    return this.status === 404 || this.code === 'NOT_FOUND';
  }

  get isServerError(): boolean {
    return this.status >= 500;
  }
}

export function isAppApiError(error: unknown): error is AppApiError {
  return error instanceof AppApiError;
}

/**
 * Maps raw AxiosError or unknown runtime error to a typed, standardized AppApiError.
 */
export function normalizeApiError(error: unknown): AppApiError {
  if (isAppApiError(error)) {
    return error;
  }

  if (axios.isCancel(error)) {
    return new AppApiError({
      message: 'Sorğu ləğv edildi.',
      status: 0,
      code: 'REQUEST_CANCELLED',
    });
  }

  if (axios.isAxiosError(error)) {
    const axiosErr = error as AxiosError<ApiErrorResponse>;
    const status = axiosErr.response?.status ?? 0;
    const responseData = axiosErr.response?.data;

    let code: ApiErrorCode = 'UNKNOWN_ERROR';
    let message =
      responseData?.error?.message ||
      axiosErr.message ||
      'Gözlənilməz xəta baş verdi.';

    if (status === 400 || status === 422) {
      code = 'VALIDATION_ERROR';
      message = responseData?.error?.message || 'Məlumatların düzgünlüyü təsdiqlənmədi.';
    } else if (status === 401) {
      code = 'UNAUTHORIZED';
      message = 'Sessiyanın vaxtı bitib və ya icazə verilmədi.';
    } else if (status === 403) {
      code = 'FORBIDDEN';
      message = 'Bu əməliyyatı icra etmək üçün səlahiyyətiniz yoxdur.';
    } else if (status === 404) {
      code = 'NOT_FOUND';
      message = 'Axtarılan məlumat tapılmadı.';
    } else if (status === 409) {
      code = 'CONFLICT';
      message = responseData?.error?.message || 'Məlumat bazasında ziddiyyət (konflikt) aşkar edildi.';
    } else if (status >= 500) {
      code = 'SERVER_ERROR';
      message = 'Serverdə daxili xəta baş verdi. Zəhmət olmasa bir qədər sonra cəhd edin.';
    } else if (!axiosErr.response) {
      code = 'NETWORK_ERROR';
      message = 'Şəbəkə bağlantısı xətası. İnternet əlaqənizi yoxlayın.';
    }

    return new AppApiError({
      message,
      status,
      code,
      validationErrors: responseData?.error?.validationErrors,
      details: responseData?.error?.details || axiosErr.response?.data,
    });
  }

  if (error instanceof Error) {
    return new AppApiError({
      message: error.message,
      status: 0,
      code: 'UNKNOWN_ERROR',
      details: error,
    });
  }

  return new AppApiError({
    message: 'Bilinməyən xəta baş verdi.',
    status: 0,
    code: 'UNKNOWN_ERROR',
    details: error,
  });
}

