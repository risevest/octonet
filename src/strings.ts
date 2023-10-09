// thanks to chatjibiti
const ISO_REGEX = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{3})?(Z|[+-]\d{2}:\d{2})?)?$/;

export function dateReviver(_key: string, json: string) {
  if (typeof json !== "string" || !ISO_REGEX.test(json)) {
    return json;
  }

  return new Date(json);
}
