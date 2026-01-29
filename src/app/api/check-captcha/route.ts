import { detectText } from '@/src/hooks/TextDetector';
import { NextRequest } from "next/server";
import sharp from "sharp";
import path from "path";
import fs from "fs";

export async function GET(req: NextRequest) {
  const inputPath = path.join(process.cwd(), "public/assets/images/captcha/captcha (4).jpg");
  const outputDir = path.join(process.cwd(), "public/assets/images/results");
  const outputPath = path.join(outputDir, "captcha-processed.jpg");

  // Create results folder if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  // Process image with sharp
  await sharp(inputPath)
    .grayscale()
    .modulate({
      brightness: 0.9,
    })
    .linear(
      1.5,
      -30
    )
    .toFile(outputPath);

  // Convert processed image to base64 (read from filesystem for server-side)
  const imageBuffer = fs.readFileSync(outputPath);
  const base64Image = `data:image/jpeg;base64,${imageBuffer.toString("base64")}`;

  // Detect text from processed base64 image
  const detectedText = await detectText(base64Image);
  console.log("detectedText: ", detectedText);

  return new Response(
    JSON.stringify({
      message: "Image processed and saved to /assets/images/results/captcha-processed.jpg",
      detectedText,
    }),
    { status: 200 }
  );
}