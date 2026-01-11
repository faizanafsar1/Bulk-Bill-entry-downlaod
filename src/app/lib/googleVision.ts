import { ImageAnnotatorClient } from "@google-cloud/vision";

const client = new ImageAnnotatorClient();

export async function detectTextFromImage(imagePath: string) {
  console.log("imagePath inside detectTextFromImage", imagePath);
  const [result] = await client.textDetection(imagePath);

  const detections = result.textAnnotations;

  return detections?.[0]?.description || "";
}
