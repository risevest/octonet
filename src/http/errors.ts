export class NoRequestIDError extends Error {
  constructor(url: string) {
    super(`Request to ${url} requires a request ID`);
  }
}

export class NoAuthorizationTokenError extends Error {
  constructor(url: string) {
    super(`Request to ${url} requires an authorization token`);
  }
}

export class HttpError extends Error {
  constructor(url: string, readonly rawError: any) {
    super(`Request to ${url} failed`);
  }
}

export class TimeoutError extends Error {
  constructor(url: string, timeout: number) {
    super(`Request to ${url} failed: request timed out after ${Math.floor(timeout / 1000)}`);
  }
}

export class APIError extends Error {
  constructor(url: string, readonly status: number, readonly data: any) {
    super(`Request to ${url} failed with status ${status}`);
  }
}
