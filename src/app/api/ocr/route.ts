import { NextRequest, NextResponse } from "next/server";
import { detectTextServer } from "@/src/lib/ocrServer";

export async function POST(req: NextRequest) {
  try {
    const { base64Image } = await req.json();

    if (!base64Image) {
      return NextResponse.json({ error: "No image provided" }, { status: 400 });
    }

    const text = await detectTextServer(base64Image);
    return NextResponse.json({ text });
  } catch (error) {
    console.error("OCR route error:", error);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
