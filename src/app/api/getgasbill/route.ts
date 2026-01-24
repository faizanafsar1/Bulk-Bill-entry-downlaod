import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { solveCaptcha } from "../../lib/CaptchaSolver";

const isVercel = !!process.env.VERCEL;
const localChromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Global stores (persist across requests)
const browserInstances: Map<number, Browser> = new Map();
const pages: Map<number, Page> = new Map();

async function launchBrowserInstance(): Promise<Browser> {
  const executablePath = isVercel ? await chromium.executablePath() : localChromePath;
  return puppeteer.launch({
    headless: false,
    args: isVercel ? chromium.args : [],
    executablePath,
  });
}

async function initializeBrowsers(): Promise<void> {
  if (browserInstances.size > 0) {
    // Just refresh existing pages
    await Promise.all(
      Array.from(pages.values()).map((page) =>
        page.reload({ waitUntil: "networkidle2" })
      )
    );
    return;
  }

  // Create exactly 10 browsers, 1 tab each
  for (let i = 0; i < 10; i++) {
    const browser = await launchBrowserInstance();
    const page = await browser.newPage();
    browserInstances.set(i, browser);
    pages.set(i, page);
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {

  try {
    const { no: consumerNo } = await req.json();

    if (!consumerNo) {
      return NextResponse.json(
        { error: "Consumer number not provided" },
        { status: 400 }
      );
    }

    await initializeBrowsers();

    // ONE attempt per browser (10 total attempts max)
    const results = await Promise.all(
      Array.from(pages.values()).map((page) =>
        solveCaptcha(page, consumerNo).catch(() => null)
      )
    );

    const success = results.find((r) => r !== null);

    if (!success) {
      return NextResponse.json(
        { error: "Captcha failed on all browsers" },
        { status: 400 }
      );
    }

    return NextResponse.json({
      message: "Success",
      billData: success,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
