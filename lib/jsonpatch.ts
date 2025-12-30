import { applyPatch, validate, Operation } from "fast-json-patch";

export type JsonPatchOperation = Operation;

export function validatePatch(
  document: object,
  patch: JsonPatchOperation[]
): { valid: boolean; errors?: string[] } {
  const errors = validate(patch, document);
  if (errors) {
    return {
      valid: false,
      errors: [errors.message],
    };
  }
  return { valid: true };
}

export function applyJsonPatch<T extends object>(
  document: T,
  patch: JsonPatchOperation[]
): T {
  const result = applyPatch(document, patch, true, false);
  return result.newDocument as T;
}

export function createPatch(
  op: "add" | "remove" | "replace" | "copy" | "move" | "test",
  path: string,
  value?: any
): JsonPatchOperation {
  if (op === "remove") {
    return { op, path };
  }
  return { op, path, value } as JsonPatchOperation;
}
