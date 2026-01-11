const API_KEY = process.env.NEXT_PUBLIC_API_KEY || "";
import img from "../../public/assets/images/captcha-image.jpg";
import sharp from "sharp";
import path from "path";
// import cv from "opencv4nodejs";
import fs from "fs";
import { execFile } from "child_process";
async function imageUrlToBase64(imageUrl: string): Promise<string> {
  const response = await fetch(imageUrl);
  const blob = await response.blob();

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      resolve(reader.result as string); // includes 'data:image/jpeg;base64,...'
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

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
    console.log("OCR.space result:", result);

    return result.ParsedResults?.[0]?.ParsedText || "";
  } catch (error) {
    console.error("OCR.space error:", error);

    return "";
  }
}

async function testOCR() {
  const inputPath = path.join(process.cwd(), "public", "assets", "images", "captcha-image.jpg");

  const outputPath = path.join(process.cwd(), "public", "assets", "images", "captcha-enhanced.jpg");
  const scriptPath = path.join(process.cwd(), "scripts", "enhance.py");
  await new Promise((resolve, reject) => {
    execFile("python", [scriptPath, inputPath, outputPath], (error) => {
      if (error) reject(error);
      else resolve(true);
    });
  });
}

// async function testOCR() {
//   console.log("testOCR running");
//   sharp(img as any)
//     .grayscale()
//     .threshold(128)
//     .sharpen()
//     .jpeg({ quality: 90 }) // output as JPEG with quality 90%
//     .toFile("../../public/assets/images/captcha_processed.jpg");

//   // const base64Image = await imageUrlToBase64("/assets/images/captcha-image.jpg");
//   // const text = await detectText(base64Image);
//   // console.log("Detected Text:", text);
// }

export { detectText, imageUrlToBase64, testOCR };
