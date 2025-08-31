const API_KEY = "K81404182788957";
const detectText = async (base64Image) => {
  try {
    const formData = new FormData();
    formData.append("apikey", API_KEY);
    formData.append("base64Image", base64Image);
    formData.append("language", "eng");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    console.log("OCR.space result:", result);

    return result.ParsedResults?.[0]?.ParsedText || "";
  } catch (error) {
    console.error("OCR.space error:", error);
    return "";
  }
};
export { detectText };
