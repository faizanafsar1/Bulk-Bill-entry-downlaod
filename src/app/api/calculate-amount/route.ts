import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const isVercel = !!process.env.VERCEL;
const localChromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Global stores (persist across requests) - single browser instance
let browserInstance: Browser | null = null;
let page: Page | null = null;

async function launchBrowserInstance(): Promise<Browser> {
  const executablePath = isVercel ? await chromium.executablePath() : localChromePath;
  return puppeteer.launch({
    headless: isVercel ? true : false, // Headless on Vercel, visible locally
    args: isVercel ? chromium.args : [],
    executablePath,
  });
}

async function initializeBrowser(): Promise<void> {
  // Create browser instance if it doesn't exist
  if (!browserInstance) {
    try {
      console.log(`Creating single browser instance`);
      browserInstance = await launchBrowserInstance();
      page = await browserInstance.newPage();
      console.log(`Browser instance created successfully`);
    } catch (error: any) {
      console.error(`Failed to create browser instance:`, error);
      throw new Error(`Failed to initialize browser: ${error.message}`);
    }
  } else if (!page) {
    // Browser exists but page doesn't, create a new page
    try {
      page = await browserInstance.newPage();
      console.log(`Page created for existing browser`);
    } catch (error: any) {
      console.error(`Failed to create page:`, error);
      throw new Error(`Failed to create page: ${error.message}`);
    }
  }
  
  console.log(`Browser ready with 1 page`);
}

async function searchNumber(
  page: Page,
  number: string,
  searchUrl: string
): Promise<{ success: boolean; number: string; amount?: number; extractedText?: string; error?: string }> {
  try {
    // Set user agent to avoid blocking
    await page.setUserAgent(
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    
    // Set viewport
    await page.setViewport({ width: 1920, height: 1080 });
    
    // Enable request interception to block unnecessary resources (faster loading)
    await page.setRequestInterception(true);
    page.removeAllListeners("request");
    
    page.on("request", (req) => {
      const type = req.resourceType();
      // Block CSS, fonts, media, and other non-essential resources
      if (
        type === "stylesheet" ||
        type === "font" ||
        type === "media" ||
        type === "websocket" ||
        req.url().includes("analytics") ||
        req.url().includes("tracking")
      ) {
        req.abort();
      } else {
        // Add headers to requests
        const headers = {
          ...req.headers(),
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
        };
        req.continue({ headers });
      }
    });

    // Navigate to search page with longer timeout and retry logic
    let navigationSuccess = false;
    let lastError: Error | null = null;
    
    for (let retry = 0; retry < 3; retry++) {
      try {
        await page.goto(searchUrl, {
          waitUntil: "domcontentloaded",
          timeout: isVercel ? 30000 : 60000, // Increased timeout for Vercel
        });
        navigationSuccess = true;
        break;
      } catch (navError: any) {
        lastError = navError;
        console.log(`[${number}] Navigation attempt ${retry + 1} failed:`, navError.message);
        if (retry < 2) {
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
      }
    }
    
    if (!navigationSuccess) {
      throw new Error(`Failed to navigate after 3 attempts: ${lastError?.message || "Connection timeout"}`);
    }

    // Wait for search text box with retry
    await page.waitForSelector("#searchTextBox", { 
      timeout: isVercel ? 20000 : 30000,
      visible: true 
    });

    // Clear and fill the search text box
    await page.click("#searchTextBox", { clickCount: 3 }); // Select all
    await page.type("#searchTextBox", number, );

    // Wait for and click submit button
    await page.waitForSelector("#btnSearch", { 
      timeout: isVercel ? 15000 : 20000,
      visible: true 
    });
    await page.click("#btnSearch", { delay: 10 });

    console.log(`[${number}] Submit button clicked`);
    
    // Wait for the barcode element with longer timeout on Vercel
    await page.waitForSelector("#normal_bill_barcode", { 
      timeout: isVercel ? 3000 : 3000,
      visible: true 
    });
    console.log(`[${number}] Barcode found`);
    
    // Wait for the content element to appear
    await page.waitForSelector(".nestedtd2width.content", { 
      timeout: isVercel ? 3000 : 3000,
      visible: true 
    });
    console.log(`[${number}] Content element found`);
    
    // Extract innerHTML from element with class "nestedtd2width content"
    const extractedText = await page.evaluate(() => {
      const labelTd = [...document.querySelectorAll("td")]
      .find(td => td.querySelector("b")?.textContent?.trim() === "CURRENT BILL");
    
    const element = labelTd?.nextElementSibling?.textContent?.trim();
      console.log("innerHTML:", element);
      return element;
    });

    // Console log the extracted text
    console.log(`[Number: ${number}] Extracted text:`, extractedText);

    // Parse the amount from extracted text (remove commas, extract number)
    let amount = 0;
    if (extractedText) {
      // Remove commas and extract numeric value
      const cleanedText = extractedText.replace(/,/g, "").replace(/[^\d.]/g, "");
      amount = parseFloat(cleanedText) || 0;
    }

    return { success: true, number, extractedText, amount };
  } catch (error: any) {
    const errorMessage = error.message || "Search failed";
    
    // Check for specific connection errors
    if (errorMessage.includes("ERR_CONNECTION_TIMED_OUT") || 
        errorMessage.includes("net::ERR") ||
        errorMessage.includes("Navigation timeout")) {
      return {
        success: false,
        number,
        error: `Connection timeout to ${searchUrl}. The server may be slow or unreachable from Vercel.`,
      };
    }
    
    return {
      success: false,
      number,
      error: errorMessage,
    };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const startTime = Date.now();
  const MAX_EXECUTION_TIME = isVercel ? 50000 : 120000; // 50s on Vercel, 120s locally
  
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const searchUrl =  "https://bill.pitc.com.pk/iescobill";
    
    console.log("Calculate amount API called, isVercel:", isVercel);

    if (!file) {
      return NextResponse.json(
        { error: "No file provided" },
        { status: 400 }
      );
    }

    const arrayBuffer = await file.arrayBuffer();
    const data = Buffer.from(arrayBuffer).toString("utf8");
    const body = data.split("\n");
    const lines = body.slice(1);
    const numbers = lines
      .map((item) => item.split(",")[2])
      .filter((num) => num && num.trim() !== ""); // Filter out empty values

    if (numbers.length === 0) {
      return NextResponse.json(
        { error: "No numbers found in file" },
        { status: 400 }
      );
    }

    // Map to store numbers as IDs with their amounts
    const billResults = new Map<string, {
      number: string;
      amount: number;
      extractedText?: string;
      attempts: number;
      status: "success" | "failed" | "zero" | "max_retries";
    }>();

    // Initialize all bills with pending status
    numbers.forEach((num) => {
      billResults.set(num.trim(), {
        number: num.trim(),
        amount: 0,
        attempts: 0,
        status: "failed",
      });
    });

    // Initialize single browser instance
    console.log(`Initializing 1 browser for ${numbers.length} bills (isVercel: ${isVercel})`);
    await initializeBrowser();
    
    // Verify page is available
    if (!page) {
      throw new Error("Failed to initialize browser page");
    }
    console.log(`Successfully initialized browser with 1 page`);

    // Process bills sequentially (one at a time) with retry logic
    console.log(`Processing ${numbers.length} bills sequentially`);
    const allBills = Array.from(billResults.keys());

    for (const number of allBills) {
      const existing = billResults.get(number);
      if (!existing) continue;

      let result: { success: boolean; number: string; amount?: number; extractedText?: string; error?: string } | null = null;
      let attempts = 0;
      const maxAttempts = 3; // Initial attempt + 2 retries

      // Try up to 3 times (initial + 2 retries)
      while (attempts < maxAttempts) {
        attempts++;
        existing.attempts = attempts;
        
        console.log(`[Attempt ${attempts}/${maxAttempts}] Processing number: ${number}`);
        
        try {
          result = await searchNumber(page!, number, searchUrl);
          
          // Check if we need to retry: undefined amount, 0 amount, or error
          const hasError = !result.success || !!result.error;
          const hasInvalidAmount = result.amount === undefined || result.amount === 0;
          const needsRetry = hasError || hasInvalidAmount;
          
          if (!needsRetry && result.amount && result.amount > 0) {
            // Success with valid amount > 0
            existing.amount = result.amount;
            existing.extractedText = result.extractedText;
            existing.status = "success";
            console.log(`[${number}] Success: amount=${result.amount}`);
            break;
          } else {
            // Need to retry or finalize result
            if (attempts < maxAttempts) {
              console.log(`[${number}] Retry needed (attempt ${attempts}): success=${result.success}, amount=${result.amount}, error=${result.error || 'none'}`);
              // Small delay before retry
              await new Promise((resolve) => setTimeout(resolve, 1000));
            } else {
              // Max attempts reached - finalize result
              existing.amount = result.amount || 0;
              existing.extractedText = result.extractedText || result.error;
              if (result.amount === 0 && result.success) {
                existing.status = "zero";
              } else {
                existing.status = "failed";
              }
              console.log(`[${number}] Max attempts reached: status=${existing.status}, amount=${existing.amount}`);
              break;
            }
          }
        } catch (error: any) {
          console.error(`[${number}] Error on attempt ${attempts}:`, error);
          result = {
            number,
            success: false,
            error: error.message || "Page error"
          };
          
          if (attempts >= maxAttempts) {
            // Max attempts reached, mark as failed
            existing.status = "failed";
            existing.extractedText = result.error;
            existing.amount = 0;
            break;
          } else {
            // Retry on next iteration
            console.log(`[${number}] Will retry after error`);
            await new Promise((resolve) => setTimeout(resolve, 1000));
          }
        }
      }
    }

    // Convert map to array for response
    const results = Array.from(billResults.values());

    // Calculate statistics
    const successCount = results.filter((r) => r.status === "success").length;
    const failedCount = results.filter((r) => r.status === "failed" || r.status === "max_retries").length;
    const successfulResults = results.filter((r) => r.status === "success");
    const totalAmount = successfulResults.reduce((sum, r) => sum + r.amount, 0);
    const calculatedBills = successfulResults.length;
    const zeroAmountBills = results.filter((r) => r.amount === 0 || r.status === "zero");

    return NextResponse.json({
      success: true,
      message: `Processed ${numbers.length} numbers`,
      summary: {
        totalBills: numbers.length,
        calculatedBills: calculatedBills,
        totalAmount: totalAmount,
        zeroAmountBills: zeroAmountBills.map((r) => ({
          number: r.number,
          amount: r.amount,
          extractedText: r.extractedText || "",
          status: r.status,
          attempts: r.attempts,
        })),
        failedBills: results
          .filter((r) => r.status === "failed" || r.status === "max_retries")
          .map((r) => ({
            number: r.number,
            amount: r.amount,
            extractedText: r.extractedText || "Not correct after 3 attempts",
            status: r.status,
            attempts: r.attempts,
          })),
      },
      results: {
        total: numbers.length,
        successful: successCount,
        failed: failedCount,
        details: results.map((r) => ({
          number: r.number,
          amount: r.amount,
          extractedText: r.extractedText,
          status: r.status,
          attempts: r.attempts,
        })),
      },
    });
  } catch (err: any) {
    const elapsed = Date.now() - startTime;
    console.error("Error processing file:", {
      error: err.message,
      stack: err.stack,
      elapsed: `${elapsed}ms`,
      isVercel,
    });
    return NextResponse.json(
      { 
        error: err.message || "Internal server error",
        details: isVercel ? "Vercel execution error - check logs" : err.stack,
      },
      { status: 500 }
    );
  }
}
