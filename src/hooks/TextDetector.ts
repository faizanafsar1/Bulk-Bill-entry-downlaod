const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";

// async function imageUrlToBase64(imageUrl: string): Promise<string> {
//   const response = await fetch(imageUrl);
//   const blob = await response.blob();

//   return new Promise((resolve, reject) => {
//     const reader = new FileReader();
//     reader.onloadend = () => {
//       resolve(reader.result as string); // includes 'data:image/jpeg;base64,...'
//     };
//     reader.onerror = reject;
//     reader.readAsDataURL(blob);
//   });
// }

async function detectText(base64Image: string): Promise<string> {
  try {
    const formData = new FormData();
    formData.append("apikey", API_KEY);
    formData.append("base64Image", base64Image);
    formData.append("language", "eng");
    formData.append("OCREngine", "2");

    const response = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      body: formData,
    });

    const result = await response.json();
    // console.log("OCR.space result:", result);

    return result.ParsedResults?.[0]?.ParsedText || "";
  } catch (error) {
    console.error("OCR.space error:", error);
    return "";
  }
}

// async function testOCR() {
//   const base64Image = await imageUrlToBase64("/assets/images/captcha-image.jpg");
//   const text = await detectText(base64Image);
//   console.log("Detected Text:", text);
// }

// testOCR();

export { detectText };
