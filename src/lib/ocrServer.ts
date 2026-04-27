const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

/**
 * Calls OCR.space directly — safe to use only in server-side code (API routes).
 */
export async function detectTextServer(base64Image: string): Promise<string> {
  const formData = new FormData();
  formData.append("apikey", API_KEY);
  formData.append("base64Image", base64Image);
  formData.append("language", "eng");
  formData.append("OCREngine", "2");

  const response = await fetch("https://api.ocr.space/parse/image", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`OCR.space responded with ${response.status}`);
  }

  const result = await response.json();
  return result.ParsedResults?.[0]?.ParsedText || "";
}
