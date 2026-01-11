import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer";
import { solveCaptcha } from "../../lib/CaptchaSolver";

let browserInstance: Browser | null = null;
let mainPage: Page | null = null;

// Get existing or launch new browser and get or create main page
async function getBrowserAndPage(): Promise<Page> {
  if (!browserInstance) {
    browserInstance = await puppeteer.launch({
      headless: false, // set false for debugging
      args: ["--start-maximized"],
      defaultViewport: null,
    });
  }
  if (!mainPage) {
    const pages = await browserInstance.pages();
    mainPage = pages.length > 0 ? pages[0] : await browserInstance.newPage();
  }
  return mainPage;
}

async function cleanup() {
  if (mainPage) {
    try {
      await mainPage.close();
    } catch {}
    mainPage = null;
  }
  if (browserInstance) {
    try {
      await browserInstance.close();
    } catch {}
    browserInstance = null;
  }
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
        // solveCaptcha now accepts a Page, not Browser
        billData = await solveCaptcha(page, consumerNo);
        if (billData) break;
      } catch (e) {
        console.warn(`Attempt ${i + 1} failed:`, e);
      }

      // Reload page to reset state before next attempt
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
