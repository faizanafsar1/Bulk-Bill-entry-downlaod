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
    headless: true,
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
    const browser = await launchBrowserInstance();
    const page = await browser.newPage();
    browserInstances.set(i, browser);
    pages.set(i, page);
  }
}

async function searchNumber(
  page: Page,
  number: string,
  searchUrl: string
): Promise<{ success: boolean; number: string; amount?: number; extractedText?: string; error?: string }> {
  try {
    // Navigate to search page
    await page.goto(searchUrl, {
      waitUntil: "domcontentloaded",
    });

    // Wait for search text box
    await page.waitForSelector("#searchTextBox", { timeout: 10000 });

    // Fill the search text box
    await page.type("#searchTextBox", number, { delay: 100 });

    // Wait for and click submit button
    await page.waitForSelector("#btnSearch", { timeout: 5000 });
    await page.click("#btnSearch");

    console.log("submit button clicked");
    
    // Wait for the barcode element
    await page.waitForSelector("#normal_bill_barcode", { timeout: 10000 });
    console.log("barcode found");
    
    // Wait for the content element to appear
    await page.waitForSelector(".nestedtd2width.content", { timeout: 10000 });
    console.log("content element found");
    
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
    return {
      success: false,
      number,
      error: error.message || "Search failed",
    };
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const searchUrl =  "https://bill.pitc.com.pk/iescobill";

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
    const maxBrowsers = Math.min(numbers.length, 10); // Use max 10 browsers for retries
    await initializeBrowsers(maxBrowsers);

    // Retry logic: Process bills with up to 3 attempts
    for (let attempt = 1; attempt <= 3; attempt++) {
      // Get bills that need retry (failed or zero amount that haven't succeeded yet)
      const billsToRetry = Array.from(billResults.entries())
        .filter(([_, result]) => {
          // Retry if: failed, or has zero amount and hasn't reached max attempts yet
          return (result.status === "failed" && result.attempts < attempt) ||
                 (result.amount === 0 && result.status !== "success" && result.attempts < attempt);
        })
        .map(([number, _]) => number);

      if (billsToRetry.length === 0) {
        break; // No more bills to retry
      }

      console.log(`Attempt ${attempt}: Processing ${billsToRetry.length} bills`);

      // Process all bills in batches using available browsers
      const batchSize = maxBrowsers;
      const allBatchResults: Array<{ success: boolean; number: string; amount?: number; extractedText?: string; error?: string }> = [];

      for (let i = 0; i < billsToRetry.length; i += batchSize) {
        const batch = billsToRetry.slice(i, i + batchSize);
        
        const batchResults = await Promise.all(
          batch.map(async (number, index) => {
            const pageIndex = index % maxBrowsers;
            const page = pages.get(pageIndex);
            if (!page) {
              return { number, success: false, error: "No page available" };
            }
            return await searchNumber(page, number, searchUrl);
          })
        );

        allBatchResults.push(...batchResults);

        // Small delay between batches
        if (i + batchSize < billsToRetry.length) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }

      // Update results map
      allBatchResults.forEach((result) => {
        const existing = billResults.get(result.number);
        if (existing) {
          existing.attempts = attempt;
          
          if (result.success && "amount" in result) {
            const amount = result.amount || 0;
            existing.amount = amount;
            existing.extractedText = result.extractedText;
            
            if (amount > 0) {
              existing.status = "success";
            } else {
              // If amount is 0, mark as zero only after 3 attempts
              existing.status = attempt === 3 ? "zero" : "failed";
            }
          } else {
            // Failed to extract or error occurred
            existing.status = attempt === 3 ? "max_retries" : "failed";
            if (result.error) {
              existing.extractedText = result.error;
            }
          }
        }
      });

      // Small delay between retry attempts
      if (attempt < 3) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
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
    console.error("Error processing file:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
