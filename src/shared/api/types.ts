import { AxiosRequestConfig } from 'axios';

export interface CustomRequestConfig extends AxiosRequestConfig {
  skipAuth?: boolean;
  skipIdempotency?: boolean;
  idempotent?: boolean;
  _retry?: boolean;
}

export interface ApiSuccessResponse<T> {
  success: true;
  data: T;
  meta?: {
    page?: number;
    pageSize?: number;
    total?: number;
    totalPages?: number;
  };
}

export interface ApiErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    validationErrors?: Record<string, string[]>;
    details?: unknown;
  };
}

