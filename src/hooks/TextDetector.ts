async function imageUrlToBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function detectText(base64Image: string): Promise<string> {
  try {
    const response = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ base64Image }),
    });

    if (!response.ok) {
      console.error("OCR API error:", response.status, response.statusText);
      return "";
    }

    const result = await response.json();
    return result.text || "";
  } catch (error) {
    console.error("OCR.space error:", error);
    return "";
  }
}

export { detectText, imageUrlToBase64 };
