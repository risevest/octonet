export class HttpError extends Error {
  constructor(url: string, readonly rawError: any) {
    super(`Request to ${url} failed`);
  }
}

export class APIError extends Error {
  constructor(url: string, readonly status: number, readonly data: any) {
    super(`Request to ${url} failed with status ${status}`);
  }
}
