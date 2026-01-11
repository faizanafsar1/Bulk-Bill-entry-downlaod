import { NextRequest, NextResponse } from "next/server";
import puppeteer from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { solveCaptcha } from "../../lib/CaptchaSolver";

let browserInstance: any = null;
let mainPage: any = null;

async function getBrowserAndPage(): Promise<any> {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: false, // set false for debugging
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      defaultViewport: null,
    });
  }

  if (!mainPage) {
    const pages = await browserInstance.pages();
    mainPage = pages.length > 0 ? pages[0] : await browserInstance.newPage();
  }

  return mainPage;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const consumerNo: string = body.no;

    if (!consumerNo) {
      return NextResponse.json({ error: "Consumer number not provided" }, { status: 400 });
    }

    const page = await getBrowserAndPage();

    const maxTries = 10;
    let billData: any = null;

    for (let i = 0; i < maxTries; i++) {
      try {
        billData = await solveCaptcha(page, consumerNo);
        if (billData) break;
      } catch (e) {
        console.warn(`Attempt ${i + 1} failed:`, e);
      }

      await page.reload({ waitUntil: "networkidle2" });
    }

    if (!billData) {
      return NextResponse.json({ error: "Failed to solve captcha after maximum attempts" }, { status: 400 });
    }

    return NextResponse.json({
      message: "Form submitted successfully",
      billData,
    });
  } catch (err: any) {
    console.error("Internal error:", err);
    return NextResponse.json({ error: err.message || "Internal error" }, { status: 500 });
  }
}
