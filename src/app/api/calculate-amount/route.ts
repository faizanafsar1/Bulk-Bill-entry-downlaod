import { NextRequest, NextResponse } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const isVercel = !!process.env.VERCEL;
const localChromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Global stores (persist across requests)
const browserInstances: Map<number, Browser> = new Map();
const pages: Map<number, Page> = new Map();

async function launchBrowserInstance(): Promise<Browser> {
  const executablePath = isVercel ? await chromium.executablePath() : localChromePath;
  return puppeteer.launch({
    headless: isVercel ? true : false, // Headless on Vercel, visible locally
    args: isVercel ? chromium.args : [],
    executablePath,
  });
}

async function initializeBrowsers(count: number): Promise<void> {
  // Close existing browsers if count is different
  if (browserInstances.size !== count) {
    // Close all existing browsers
    await Promise.all(
      Array.from(browserInstances.values()).map((browser) => browser.close())
    );
    browserInstances.clear();
    pages.clear();
  } else if (browserInstances.size > 0) {
    // Just refresh existing pages
    await Promise.all(
      Array.from(pages.values()).map((page) =>
        page.reload({ waitUntil: "networkidle2" })
      )
    );
    return;
  }

  // Create browsers according to count
  for (let i = 0; i < count; i++) {
    try {
      console.log(`Creating browser instance ${i + 1}/${count}`);
      const browser = await launchBrowserInstance();
      const page = await browser.newPage();
      browserInstances.set(i, browser);
      pages.set(i, page);
      console.log(`Browser instance ${i + 1} created successfully`);
    } catch (error: any) {
      console.error(`Failed to create browser instance ${i + 1}:`, error);
      throw new Error(`Failed to initialize browser ${i + 1}: ${error.message}`);
    }
  }
  
  console.log(`Successfully initialized ${browserInstances.size} browser instances`);
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
    await page.type("#searchTextBox", number, { delay: 50 });

    // Wait for and click submit button
    await page.waitForSelector("#btnSearch", { 
      timeout: isVercel ? 15000 : 20000,
      visible: true 
    });
    await page.click("#btnSearch");

    console.log(`[${number}] Submit button clicked`);
    
    // Wait for the barcode element with longer timeout on Vercel
    await page.waitForSelector("#normal_bill_barcode", { 
      timeout: isVercel ? 30000 : 40000,
      visible: true 
    });
    console.log(`[${number}] Barcode found`);
    
    // Wait for the content element to appear
    await page.waitForSelector(".nestedtd2width.content", { 
      timeout: isVercel ? 20000 : 30000,
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

    // Initialize browsers - we'll reuse them for retries
    // Limit to max 5 browsers on Vercel to avoid memory/timeout issues
    const maxBrowsers = isVercel 
      ? Math.min(numbers.length, 5) 
      : Math.min(numbers.length, 10);
    
    console.log(`Initializing ${maxBrowsers} browsers for ${numbers.length} bills (isVercel: ${isVercel})`);
    await initializeBrowsers(maxBrowsers);
    
    // Verify pages are available
    if (pages.size === 0) {
      throw new Error("Failed to initialize browser pages");
    }
    console.log(`Successfully initialized ${pages.size} pages`);

    // Single pass processing (no retries)
    console.log(`Processing ${numbers.length} bills in single pass`);
    const allBills = Array.from(billResults.keys());
    const batchSize = maxBrowsers;
    const allResults: Array<{ success: boolean; number: string; amount?: number; extractedText?: string; error?: string }> = [];

    for (let i = 0; i < allBills.length; i += batchSize) {
      const batch = allBills.slice(i, i + batchSize);
      
      const batchResults = await Promise.all(
        batch.map(async (number, index) => {
          const pageIndex = index % maxBrowsers;
          const page = pages.get(pageIndex);
          if (!page) {
            return { number, success: false, error: "No page available" };
          }
          
          try {
            return await searchNumber(page, number, searchUrl);
          } catch (error: any) {
            console.error(`Error processing ${number}:`, error);
            return { 
              number, 
              success: false, 
              error: error.message || "Page error" 
            };
          }
        })
      );

      allResults.push(...batchResults);

      // Small delay between batches
      if (i + batchSize < allBills.length) {
        await new Promise((resolve) => setTimeout(resolve, isVercel ? 500 : 1000));
      }
    }

    // Update results map (single attempt)
    allResults.forEach((result) => {
      const existing = billResults.get(result.number);
      if (existing) {
        existing.attempts = 1;
        
        if (result.success && "amount" in result) {
          const amount = result.amount || 0;
          existing.amount = amount;
          existing.extractedText = result.extractedText;
          
          if (amount > 0) {
            existing.status = "success";
          } else {
            existing.status = "zero";
          }
        } else {
          existing.status = "failed";
          if (result.error) {
            existing.extractedText = result.error;
          }
        }
      }
    });

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
