import { NextRequest } from "next/server";
import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";
import { solveCaptchaOnly, fetchBillWithSession, CaptchaSession } from "../../lib/CaptchaSolver";

const isVercel = !!process.env.VERCEL;
const localChromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

// Global stores (persist across requests) - same pattern as getgasbill
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
    // Browsers already exist, just return
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

// Get a working captcha session by trying all browsers in parallel
async function getWorkingSession(): Promise<CaptchaSession | null> {
  const allPages = Array.from(pages.values());
  const results = await Promise.all(
    allPages.map((page) => solveCaptchaOnly(page).catch(() => null))
  );
  return results.find((r) => r !== null) || null;
}

function sendSSE(controller: ReadableStreamDefaultController, event: string, data: any) {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

// Extract bill amount from HTML using regex
function extractBillAmount(html: string, consumerNo: string): string | null {
  try {
    const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    const rows: string[] = [];
    let match;

    while ((match = trRegex.exec(html)) !== null) {
      rows.push(match[0]);
    }

    let targetRowIndex = -1;
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].includes(consumerNo)) {
        targetRowIndex = i;
        break;
      }
    }

    if (targetRowIndex === -1) return null;

    const amountRowIndex = targetRowIndex + 2;
    if (amountRowIndex >= rows.length) return null;

    const amountRow = rows[amountRowIndex];
    const tdRegex = /<td[^>]*>([\s\S]*?)<\/td>/i;
    const tdMatch = amountRow.match(tdRegex);

    if (!tdMatch) return null;

    const rawContent = tdMatch[1];
    return rawContent.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ").trim() || null;
  } catch (error) {
    return null;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      try {
        const formData = await req.formData();
        const file = formData.get("file") as File;

        sendSSE(controller, "connected", { message: "Connected" });

        if (!file) {
          sendSSE(controller, "error", { error: "No file provided" });
          controller.close();
          return;
        }

        const text = Buffer.from(await file.arrayBuffer()).toString("utf8");
        const lines = text.split("\n").slice(1);
        const numbers = lines
          .map((line) => line.split(",")[2])
          .filter((n) => n && n.trim() !== "")
          .map((n) => n.trim());

        if (numbers.length === 0) {
          sendSSE(controller, "error", { error: "No reference numbers found" });
          controller.close();
          return;
        }

        // Filter only 11-digit gas bill numbers
        const gasNumbers = numbers.filter((num) => {
          const digitsOnly = num.replace(/\D/g, "");
          return digitsOnly.length === 11;
        });

        if (gasNumbers.length === 0) {
          sendSSE(controller, "error", { error: "No valid gas bill numbers found (11-digit required)" });
          controller.close();
          return;
        }

        sendSSE(controller, "progress", {
          total: gasNumbers.length,
          processed: 0,
          message: `Found ${gasNumbers.length} gas bills. Initializing browsers...`,
        });

        // Initialize global browsers (same pattern as getgasbill)
        await initializeBrowsers();

        sendSSE(controller, "progress", {
          total: gasNumbers.length,
          processed: 0,
          message: `Solving captcha (trying 10 browsers in parallel)...`,
        });

        // STEP 1: Solve captcha ONCE using all 10 browsers in parallel
        const session = await getWorkingSession();

        if (!session) {
          sendSSE(controller, "error", { error: "Captcha failed on all browsers" });
          controller.close();
          return;
        }

        sendSSE(controller, "progress", {
          total: gasNumbers.length,
          processed: 0,
          message: `Captcha solved! Fetching ${gasNumbers.length} bills in parallel...`,
        });

        // Results storage
        const results: Map<string, { 
          number: string; 
          amount: number; 
          extractedText?: string; 
          status: string; 
          attempts: number;
          type: "gas";
        }> = new Map();

        gasNumbers.forEach((n) => {
          results.set(n, { number: n, amount: 0, status: "pending", attempts: 0, type: "gas" });
        });

        let processed = 0;
        let successCount = 0;
        let totalAmount = 0;

        // STEP 2: Fetch ALL bills in parallel using the same session
        const billPromises = gasNumbers.map(async (consumerNo) => {
          try {
            const html = await fetchBillWithSession(consumerNo, session);
            const entry = results.get(consumerNo)!;
            
            processed++;
            entry.attempts = 1;

            // Extract amount
            const amountStr = extractBillAmount(html, consumerNo);
            if (amountStr) {
              const amount = parseFloat(amountStr.replace(/,/g, "")) || 0;
              entry.amount = amount;
              entry.extractedText = amountStr;
              entry.status = amount > 0 ? "success" : "zero";
              if (amount > 0) {
                successCount++;
                totalAmount += amount;
              }
            } else {
              entry.status = "failed";
              entry.extractedText = "Could not extract amount";
            }

            // Send real-time update
            sendSSE(controller, "billUpdate", {
              number: consumerNo,
              amount: entry.amount,
              status: entry.status,
              extractedText: entry.extractedText,
              attempts: entry.attempts,
              type: "gas",
              index: processed,
            });

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            sendSSE(controller, "progress", {
              total: gasNumbers.length,
              processed,
              successCount,
              totalAmount,
              message: `Gas: ${processed}/${gasNumbers.length} (${successCount} success, Rs. ${totalAmount.toLocaleString()}) - ${elapsed}s`,
            });

            return { consumerNo, success: true };
          } catch (err: any) {
            const entry = results.get(consumerNo)!;
            processed++;
            entry.attempts = 1;
            entry.status = "failed";
            entry.extractedText = err.message || "Request failed";

            sendSSE(controller, "billUpdate", {
              number: consumerNo,
              amount: 0,
              status: "failed",
              extractedText: entry.extractedText,
              attempts: 1,
              type: "gas",
              index: processed,
            });

            return { consumerNo, success: false, error: err.message };
          }
        });

        await Promise.all(billPromises);

        // STEP 3: Retry failed bills (Invalid Captcha) ONCE with new session
        const failedBills = Array.from(results.values()).filter(
          (r) => r.status === "failed" && r.extractedText === "Invalid Captcha"
        );

        if (failedBills.length > 0) {
          sendSSE(controller, "progress", {
            total: gasNumbers.length,
            processed,
            message: `Retrying ${failedBills.length} failed bills with new captcha...`,
          });

          const retrySession = await getWorkingSession();

          if (retrySession) {
            const retryPromises = failedBills.map(async (bill) => {
              try {
                const html = await fetchBillWithSession(bill.number, retrySession);
                const entry = results.get(bill.number)!;
                entry.attempts = 2;

                const amountStr = extractBillAmount(html, bill.number);
                if (amountStr) {
                  const amount = parseFloat(amountStr.replace(/,/g, "")) || 0;
                  entry.amount = amount;
                  entry.extractedText = amountStr;
                  entry.status = amount > 0 ? "success" : "zero";
                  if (amount > 0) {
                    successCount++;
                    totalAmount += amount;
                  }
                }

                sendSSE(controller, "billUpdate", {
                  number: bill.number,
                  amount: entry.amount,
                  status: entry.status,
                  extractedText: entry.extractedText,
                  attempts: entry.attempts,
                  type: "gas",
                  index: gasNumbers.indexOf(bill.number) + 1,
                });
              } catch (err: any) {
                const entry = results.get(bill.number)!;
                entry.attempts = 2;
                entry.extractedText = err.message;
              }
            });

            await Promise.all(retryPromises);
          }
        }

        // Final statistics
        const allResults = Array.from(results.values());
        const finalSuccessCount = allResults.filter((r) => r.status === "success").length;
        const failedCount = allResults.filter((r) => r.status === "failed").length;
        const zeroCount = allResults.filter((r) => r.status === "zero").length;
        const finalTotalAmount = allResults
          .filter((r) => r.status === "success")
          .reduce((sum, r) => sum + r.amount, 0);
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

        sendSSE(controller, "complete", {
          success: true,
          message: `Done in ${elapsed}s - Gas Bills: ${finalSuccessCount}/${gasNumbers.length}`,
          summary: {
            totalBills: gasNumbers.length,
            electricBills: 0,
            gasBills: gasNumbers.length,
            calculatedBills: finalSuccessCount,
            totalAmount: finalTotalAmount,
            zeroAmountBills: allResults.filter((r) => r.status === "zero"),
            failedBills: allResults.filter((r) => r.status === "failed"),
          },
          results: {
            total: gasNumbers.length,
            successful: finalSuccessCount,
            failed: failedCount,
            zero: zeroCount,
            details: allResults,
          },
        });

        controller.close();
      } catch (err: any) {
        console.error("Error:", err);
        sendSSE(controller, "error", { error: err.message || "Internal error" });
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
