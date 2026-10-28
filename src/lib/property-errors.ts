type PropertyWriteError = { code?: string; message: string };

/** Keep database uniqueness rules, but never expose constraint details. */
export function propertyWriteErrorMessage(error: PropertyWriteError): string {
  if (error.code === "23505" && error.message.includes("properties_name_key")) {
    return "This property name is already in use. Please choose a different name.";
  }
  if (error.code === "23505") {
    return "A property with these details already exists. Please check your entries.";
  }
  return error.message;
}