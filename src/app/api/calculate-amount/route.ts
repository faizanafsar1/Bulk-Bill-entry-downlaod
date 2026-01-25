import { NextRequest } from "next/server";

const API_URL = "https://bill.pitc.com.pk/iescobill/general";
const BATCH_SIZE = 20; // Process 20 bills at a time

// Default headers for the API request
const DEFAULT_HEADERS = {
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
  "accept-language": "en-US,en;q=0.9,ur-PK;q=0.8,ur;q=0.7",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "referer": "https://bill.pitc.com.pk/iescobill",
  "sec-ch-ua": `"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"`,
  "sec-ch-ua-mobile": "?1",
  "sec-ch-ua-platform": `"Android"`,
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "same-origin",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1",
  "user-agent": "Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Mobile Safari/537.36",
};

// Session cookie - will be updated dynamically
let sessionCookie = "";

// Get fresh session cookies from the main page
async function refreshSession(): Promise<string> {
  try {
    const response = await fetch("https://bill.pitc.com.pk/iescobill", {
      method: "GET",
      headers: {
        "user-agent": DEFAULT_HEADERS["user-agent"],
        "accept": DEFAULT_HEADERS["accept"],
      },
    });

    const setCookieHeaders = response.headers.getSetCookie();
    const cookies = setCookieHeaders
      .map(cookie => cookie.split(";")[0])
      .join("; ");

    console.log("Got fresh session cookies");
    return cookies;
  } catch (error) {
    console.error("Failed to refresh session:", error);
    return "";
  }
}

// Fetch bill data using POST API
async function fetchBill(
  refNumber: string,
  cookies: string
): Promise<{ success: boolean; number: string; amount: number; extractedText?: string; error?: string }> {
  try {
    const url = `${API_URL}?refno=${encodeURIComponent(refNumber)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        "cookie": cookies,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { success: false, number: refNumber, amount: 0, error: `HTTP ${response.status}` };
    }

    const html = await response.text();

    let amount = 0;
    let extractedText = "";

    // Method 1: Look for CURRENT BILL label followed by value
    const currentBillMatch = html.match(/<b>\s*CURRENT\s*BILL\s*<\/b>\s*<\/td>\s*<td[^>]*>\s*([^<]+)/i);
    if (currentBillMatch) {
      extractedText = currentBillMatch[1].trim();
    }

    // Method 2: Alternative - look for nestedtd2width content class
    if (!extractedText) {
      const contentMatch = html.match(/class="nestedtd2width\s+content"[^>]*>([^<]+)/i);
      if (contentMatch) {
        extractedText = contentMatch[1].trim();
      }
    }

    // Method 3: Try to find any amount pattern near CURRENT BILL
    if (!extractedText) {
      const billSection = html.match(/CURRENT\s*BILL[\s\S]{0,200}/i);
      if (billSection) {
        const amountMatch = billSection[0].match(/>\s*(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)\s*</);
        if (amountMatch) {
          extractedText = amountMatch[1];
        }
      }
    }

    // Parse amount from extracted text
    if (extractedText) {
      const cleaned = extractedText.replace(/,/g, "").replace(/[^\d.]/g, "");
      amount = parseFloat(cleaned) || 0;
    }

    // Verify the reference number appears in the response
    const verified = html.includes(refNumber);

    if (!verified) {
      return { success: false, number: refNumber, amount: 0, error: "Reference not found" };
    }

    return { success: true, number: refNumber, amount, extractedText };

  } catch (error: any) {
    if (error.name === "TimeoutError") {
      return { success: false, number: refNumber, amount: 0, error: "Timeout" };
    }
    return { success: false, number: refNumber, amount: 0, error: error.message || "Failed" };
  }
}

function sendSSE(controller: ReadableStreamDefaultController, event: string, data: any) {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
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

        // Get session cookies
        sessionCookie = await refreshSession();
        if (!sessionCookie) {
          sendSSE(controller, "error", { error: "Failed to get session" });
          controller.close();
          return;
        }

        // Results storage
        const results: Map<string, { 
          number: string; 
          amount: number; 
          extractedText?: string; 
          status: string; 
          attempts: number;
        }> = new Map();

        numbers.forEach((n) => results.set(n, { 
          number: n, 
          amount: 0, 
          status: "pending", 
          attempts: 0 
        }));

        let processed = 0;
        let successCount = 0;
        let totalAmount = 0;
        const retryList: string[] = []; // Bills to retry

        // Create batches
        const batches: string[][] = [];
        for (let i = 0; i < numbers.length; i += BATCH_SIZE) {
          batches.push(numbers.slice(i, i + BATCH_SIZE));
        }

        sendSSE(controller, "progress", {
          total: numbers.length,
          processed: 0,
          message: `Processing ${numbers.length} bills (20 parallel)...`,
        });

        // FIRST PASS: Process all bills in batches - NO DELAYS
        for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
          const batch = batches[batchIndex];
          
          // Run 20 requests in parallel - no retry here
          const batchResults = await Promise.all(
            batch.map((refNumber) => fetchBill(refNumber, sessionCookie))
          );

          // Process results
          for (const result of batchResults) {
            const entry = results.get(result.number)!;
            processed++;
            entry.attempts = 1;

            if (result.success && result.amount > 0) {
              entry.amount = result.amount;
              entry.extractedText = result.extractedText;
              entry.status = "success";
              successCount++;
              totalAmount += result.amount;
            } else {
              // Add to retry list (failed or zero)
              entry.status = "pending_retry";
              entry.extractedText = result.error || "Zero/Failed";
              retryList.push(result.number);
            }

            // Send bill update
            sendSSE(controller, "billUpdate", {
              number: result.number,
              amount: entry.amount,
              status: entry.status,
              extractedText: entry.extractedText,
              attempts: entry.attempts,
              index: processed,
            });
          }

          // Progress update
          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          sendSSE(controller, "progress", {
            total: numbers.length,
            processed,
            successCount,
            totalAmount,
            message: `${processed}/${numbers.length} done (${successCount} success, Rs. ${totalAmount.toLocaleString()}) - ${elapsed}s`,
          });
        }

        // RETRY PASS: Only retry failed/zero bills
        if (retryList.length > 0) {
          sendSSE(controller, "progress", {
            total: numbers.length,
            processed,
            message: `Retrying ${retryList.length} failed bills...`,
          });

          // Retry all at once (or in batches if too many)
          const retryBatches: string[][] = [];
          for (let i = 0; i < retryList.length; i += BATCH_SIZE) {
            retryBatches.push(retryList.slice(i, i + BATCH_SIZE));
          }

          for (const retryBatch of retryBatches) {
            const retryResults = await Promise.all(
              retryBatch.map((refNumber) => fetchBill(refNumber, sessionCookie))
            );

            for (const result of retryResults) {
              const entry = results.get(result.number)!;
              entry.attempts = 2;

              if (result.success && result.amount > 0) {
                entry.amount = result.amount;
                entry.extractedText = result.extractedText;
                entry.status = "success";
                successCount++;
                totalAmount += result.amount;
              } else if (result.success && result.amount === 0) {
                entry.status = "zero";
                entry.extractedText = result.extractedText || "Zero amount";
              } else {
                entry.status = "failed";
                entry.extractedText = result.error;
              }

              // Update frontend
              sendSSE(controller, "billUpdate", {
                number: result.number,
                amount: entry.amount,
                status: entry.status,
                extractedText: entry.extractedText,
                attempts: entry.attempts,
                index: processed,
              });
            }
          }

          const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
          sendSSE(controller, "progress", {
            total: numbers.length,
            processed,
            successCount,
            totalAmount,
            message: `Retry done - ${successCount} success, Rs. ${totalAmount.toLocaleString()} - ${elapsed}s`,
          });
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
          message: `Done in ${elapsed}s - ${finalSuccessCount} success, ${zeroCount} zero, ${failedCount} failed`,
          summary: {
            totalBills: numbers.length,
            calculatedBills: finalSuccessCount,
            totalAmount: finalTotalAmount,
            zeroAmountBills: allResults.filter((r) => r.status === "zero"),
            failedBills: allResults.filter((r) => r.status === "failed"),
          },
          results: {
            total: numbers.length,
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
