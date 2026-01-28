import { NextRequest } from "next/server";
import { getElectricSession, fetchElectricBill } from "./electricBill";
import { fetchGasBillWithCaptcha } from "./gasBill";
import puppeteer, { Browser, Page } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

const BATCH_SIZE = 20;
const isVercel = !!process.env.VERCEL;
const localChromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function sendSSE(controller: ReadableStreamDefaultController, event: string, data: any) {
  controller.enqueue(new TextEncoder().encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
}

// Separate numbers by type based on digit count
function categorizeNumbers(numbers: string[]): { electric: string[]; gas: string[] } {
  const electric: string[] = [];
  const gas: string[] = [];

  for (const num of numbers) {
    const digitsOnly = num.replace(/\D/g, "");
    if (digitsOnly.length === 14) {
      electric.push(num);
    } else if (digitsOnly.length === 11) {
      gas.push(num);
    }
    // Ignore numbers that don't match either pattern
  }

  return { electric, gas };
}

export async function POST(req: NextRequest): Promise<Response> {
  const startTime = Date.now();

  const stream = new ReadableStream({
    async start(controller) {
      let gasBrowser: Browser | null = null;

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

        // Categorize numbers by type (14 digit = electric, 11 digit = gas)
        const { electric, gas } = categorizeNumbers(numbers);

        sendSSE(controller, "progress", {
          total: numbers.length,
          processed: 0,
          message: `Found ${electric.length} electric bills (14-digit), ${gas.length} gas bills (11-digit)`,
        });

        // Results storage
        const results: Map<string, { 
          number: string; 
          amount: number; 
          extractedText?: string; 
          status: string; 
          attempts: number;
          type: "electric" | "gas";
        }> = new Map();

        numbers.forEach((n) => {
          const digitsOnly = n.replace(/\D/g, "");
          const type = digitsOnly.length === 14 ? "electric" : "gas";
          results.set(n, { number: n, amount: 0, status: "pending", attempts: 0, type });
        });

        let processed = 0;
        let successCount = 0;
        let totalAmount = 0;
        const retryList: string[] = [];

        // ========== PROCESS ELECTRIC BILLS (14-digit) ==========
        if (electric.length > 0) {
          sendSSE(controller, "progress", {
            total: numbers.length,
            processed,
            message: `Processing ${electric.length} electric bills...`,
          });

          // Get electric session
          const electricCookies = await getElectricSession();
          if (!electricCookies) {
            sendSSE(controller, "progress", {
              total: numbers.length,
              processed,
              message: "Warning: Failed to get electric session",
            });
          }

          // Create batches for electric bills
          const electricBatches: string[][] = [];
          for (let i = 0; i < electric.length; i += BATCH_SIZE) {
            electricBatches.push(electric.slice(i, i + BATCH_SIZE));
          }

          // Process electric bills in batches
          for (const batch of electricBatches) {
            const batchResults = await Promise.all(
              batch.map((refNumber) => fetchElectricBill(refNumber, electricCookies))
            );

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
                entry.status = "pending_retry";
                entry.extractedText = result.error || "Zero/Failed";
                retryList.push(result.number);
              }

              sendSSE(controller, "billUpdate", {
                number: result.number,
                amount: entry.amount,
                status: entry.status,
                extractedText: entry.extractedText,
                attempts: entry.attempts,
                type: "electric",
                index: processed,
              });
            }

            const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
            sendSSE(controller, "progress", {
              total: numbers.length,
              processed,
              successCount,
              totalAmount,
              message: `Electric: ${processed}/${electric.length} (${successCount} success, Rs. ${totalAmount.toLocaleString()}) - ${elapsed}s`,
            });
          }

          // Retry failed electric bills
          const electricRetries = retryList.filter(n => {
            const digitsOnly = n.replace(/\D/g, "");
            return digitsOnly.length === 14;
          });

          if (electricRetries.length > 0) {
            sendSSE(controller, "progress", {
              total: numbers.length,
              processed,
              message: `Retrying ${electricRetries.length} failed electric bills...`,
            });

            const retryBatches: string[][] = [];
            for (let i = 0; i < electricRetries.length; i += BATCH_SIZE) {
              retryBatches.push(electricRetries.slice(i, i + BATCH_SIZE));
            }

            for (const retryBatch of retryBatches) {
              const retryResults = await Promise.all(
                retryBatch.map((refNumber) => fetchElectricBill(refNumber, electricCookies))
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

                sendSSE(controller, "billUpdate", {
                  number: result.number,
                  amount: entry.amount,
                  status: entry.status,
                  extractedText: entry.extractedText,
                  attempts: entry.attempts,
                  type: "electric",
                  index: processed,
                });
              }
            }
          }
        }

        // ========== PROCESS GAS BILLS (11-digit) ==========
        if (gas.length > 0) {
          sendSSE(controller, "progress", {
            total: numbers.length,
            processed,
            message: `Processing ${gas.length} gas bills (requires captcha)...`,
          });

          // Launch browser for gas bills (requires captcha)
          const executablePath = isVercel ? await chromium.executablePath() : localChromePath;
          gasBrowser = await puppeteer.launch({
            headless: isVercel ? true : false,
            args: isVercel 
              ? [...chromium.args, '--disable-dev-shm-usage', '--no-sandbox'] 
              : ['--disable-dev-shm-usage'],
            executablePath,
          });

          // Create pages for parallel gas bill processing (limited to 5 due to captcha complexity)
          const gasPages: Page[] = [];
          const GAS_PARALLEL = 5;
          for (let i = 0; i < Math.min(GAS_PARALLEL, gas.length); i++) {
            const page = await gasBrowser.newPage();
            gasPages.push(page);
          }

          // Process gas bills
          const gasQueue = [...gas];
          
          async function processGasWorker(page: Page) {
            while (gasQueue.length > 0) {
              const consumerNo = gasQueue.shift();
              if (!consumerNo) break;

              const entry = results.get(consumerNo)!;
              const result = await fetchGasBillWithCaptcha(page, consumerNo);
              
              processed++;
              entry.attempts = 1;

              if (result.success && result.amount > 0) {
                entry.amount = result.amount;
                entry.extractedText = result.extractedText;
                entry.status = "success";
                successCount++;
                totalAmount += result.amount;
              } else if (result.error === "Invalid Captcha") {
                // Retry once for captcha failure
                const retryResult = await fetchGasBillWithCaptcha(page, consumerNo);
                entry.attempts = 2;
                
                if (retryResult.success && retryResult.amount > 0) {
                  entry.amount = retryResult.amount;
                  entry.extractedText = retryResult.extractedText;
                  entry.status = "success";
                  successCount++;
                  totalAmount += retryResult.amount;
                } else {
                  entry.status = "failed";
                  entry.extractedText = retryResult.error || "Captcha failed";
                }
              } else {
                entry.status = result.amount === 0 ? "zero" : "failed";
                entry.extractedText = result.error || result.extractedText;
              }

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
                total: numbers.length,
                processed,
                successCount,
                totalAmount,
                message: `Gas: Processing... (${successCount} success, Rs. ${totalAmount.toLocaleString()}) - ${elapsed}s`,
              });
            }
          }

          // Run gas workers in parallel
          await Promise.all(gasPages.map(page => processGasWorker(page)));

          // Close gas pages
          for (const page of gasPages) {
            await page.close().catch(() => {});
          }
        }

        // Close gas browser
        if (gasBrowser) {
          await gasBrowser.close().catch(() => {});
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

        const electricSuccess = allResults.filter((r) => r.type === "electric" && r.status === "success").length;
        const gasSuccess = allResults.filter((r) => r.type === "gas" && r.status === "success").length;

        sendSSE(controller, "complete", {
          success: true,
          message: `Done in ${elapsed}s - Electric: ${electricSuccess}/${electric.length}, Gas: ${gasSuccess}/${gas.length}`,
          summary: {
            totalBills: numbers.length,
            electricBills: electric.length,
            gasBills: gas.length,
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
        
        // Cleanup browser on error
        if (gasBrowser) {
          await gasBrowser.close().catch(() => {});
        }
        
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
