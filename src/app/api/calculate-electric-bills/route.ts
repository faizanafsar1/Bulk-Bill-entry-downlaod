import { NextRequest } from "next/server";
import { getElectricSession, fetchElectricBill } from "../calculate-amount/electricBill";

const BATCH_SIZE = 20;

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

        // Filter only 14-digit electric bill numbers
        const electricNumbers = numbers.filter((num) => {
          const digitsOnly = num.replace(/\D/g, "");
          return digitsOnly.length === 14;
        });

        if (electricNumbers.length === 0) {
          sendSSE(controller, "error", { error: "No valid electric bill numbers found (14-digit required)" });
          controller.close();
          return;
        }

        sendSSE(controller, "progress", {
          total: electricNumbers.length,
          processed: 0,
          message: `Found ${electricNumbers.length} electric bills (14-digit)`,
        });

        // Results storage
        const results: Map<string, { 
          number: string; 
          amount: number; 
          extractedText?: string; 
          status: string; 
          attempts: number;
          type: "electric";
        }> = new Map();

        electricNumbers.forEach((n) => {
          results.set(n, { number: n, amount: 0, status: "pending", attempts: 0, type: "electric" });
        });

        let processed = 0;
        let successCount = 0;
        let totalAmount = 0;
        const retryList: string[] = [];

        // Get electric session
        sendSSE(controller, "progress", {
          total: electricNumbers.length,
          processed,
          message: `Getting session for electric bills...`,
        });

        const electricCookies = await getElectricSession();
        if (!electricCookies) {
          sendSSE(controller, "progress", {
            total: electricNumbers.length,
            processed,
            message: "Warning: Failed to get electric session",
          });
        }

        // Create batches for electric bills
        const electricBatches: string[][] = [];
        for (let i = 0; i < electricNumbers.length; i += BATCH_SIZE) {
          electricBatches.push(electricNumbers.slice(i, i + BATCH_SIZE));
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
            total: electricNumbers.length,
            processed,
            successCount,
            totalAmount,
            message: `Electric: ${processed}/${electricNumbers.length} (${successCount} success, Rs. ${totalAmount.toLocaleString()}) - ${elapsed}s`,
          });
        }

        // Retry failed electric bills
        if (retryList.length > 0) {
          sendSSE(controller, "progress", {
            total: electricNumbers.length,
            processed,
            message: `Retrying ${retryList.length} failed electric bills...`,
          });

          const retryBatches: string[][] = [];
          for (let i = 0; i < retryList.length; i += BATCH_SIZE) {
            retryBatches.push(retryList.slice(i, i + BATCH_SIZE));
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
          message: `Done in ${elapsed}s - Electric Bills: ${finalSuccessCount}/${electricNumbers.length}`,
          summary: {
            totalBills: electricNumbers.length,
            electricBills: electricNumbers.length,
            gasBills: 0,
            calculatedBills: finalSuccessCount,
            totalAmount: finalTotalAmount,
            zeroAmountBills: allResults.filter((r) => r.status === "zero"),
            failedBills: allResults.filter((r) => r.status === "failed"),
          },
          results: {
            total: electricNumbers.length,
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
