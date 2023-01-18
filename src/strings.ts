export function dateReviver(_key: string, json: string) {
  if (typeof json !== "string" || isNaN(Date.parse(json))) {
    return json;
  }

  return new Date(json);
}
