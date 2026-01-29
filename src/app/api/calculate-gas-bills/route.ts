import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { detectText } from "@/src/hooks/TextDetector";

const BASE_URL = "https://www.sngpl.com.pk";
const LOGIN_URL = `${BASE_URL}/login.jsp?mdids=85`;
const VIEWBILL_URL = `${BASE_URL}/viewbill`;

interface CaptchaSession {
  sessionId: string;
  captchaText: string;
}

/**
 * Fetches the login page and extracts session cookie + captcha image
 */
async function getSessionAndCaptcha(): Promise<CaptchaSession> {
  const response = await fetch(LOGIN_URL, {
    method: "GET",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch login page");
  }

  // Extract JSESSIONID from cookies
  const setCookie = response.headers.get("set-cookie");
  const sessionMatch = setCookie?.match(/JSESSIONID=([^;]+)/);
  
  if (!sessionMatch) {
    throw new Error("Session ID not found in cookies");
  }

  const sessionId = sessionMatch[1];
  const html = await response.text();
  
  // Parse HTML with cheerio
  const $ = cheerio.load(html);
  const captchaImg = $("#captchaimg");
  
  if (!captchaImg.length) {
    throw new Error("Captcha image not found");
  }

  const captchaSrc = captchaImg.attr("src");
  
  if (!captchaSrc) {
    throw new Error("Captcha image src not found");
  }

  // Fetch the captcha image with the session cookie
  const captchaUrl = captchaSrc.startsWith("http") 
    ? captchaSrc 
    : `${BASE_URL}${captchaSrc.startsWith("/") ? "" : "/"}${captchaSrc}`;

  const captchaResponse = await fetch(captchaUrl, {
    headers: {
      "Cookie": `JSESSIONID=${sessionId}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });

  if (!captchaResponse.ok) {
    throw new Error("Failed to fetch captcha image");
  }

  const captchaBuffer = await captchaResponse.arrayBuffer();
  const captchaBase64 = `data:image/png;base64,${Buffer.from(captchaBuffer).toString("base64")}`;

  // Detect and clean captcha text
  const rawCaptchaText = await detectText(captchaBase64);
  const captchaText = rawCaptchaText
    .trim()
    .replace(/[\s\n\r]+/g, "")
    .toUpperCase();

  return {
    sessionId,
    captchaText,
  };
}

/**
 * Verify a captcha session works by making a test request
 */
async function verifySession(session: CaptchaSession, testConsumerNo: string): Promise<boolean> {
  try {
    const response = await fetch(VIEWBILL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": `JSESSIONID=${session.sessionId}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: `proc=viewbill&consumer=${testConsumerNo}&contype=NewCon&txtCaptcha=${session.captchaText}`,
    });

    const text = await response.text();
    return text !== "Invalid Captcha";
  } catch {
    return false;
  }
}

/**
 * Get a working captcha session by trying 5 parallel requests, retry if all fail
 * Verifies the captcha actually works before returning
 */
async function getWorkingSession(testConsumerNo: string): Promise<CaptchaSession | null> {
  for (let batch = 1; batch <= 2; batch++) {
    console.log(`Starting captcha batch ${batch} of 5 parallel requests...`);
    
    const attempts = Array(5).fill(null).map(async () => {
      try {
        const session = await getSessionAndCaptcha();
        // Verify the captcha actually works
        const isValid = await verifySession(session, testConsumerNo);
        if (isValid) {
          console.log(`Captcha verified: "${session.captchaText}"`);
          return session;
        }
        console.log(`Captcha failed verification: "${session.captchaText}"`);
        return null;
      } catch {
        return null;
      }
    });

    const results = await Promise.all(attempts);
    
    const passed = results.filter((r) => r !== null).length;
    const failed = results.filter((r) => r === null).length;
    console.log(`Captcha batch ${batch} - Verified: ${passed}, Failed: ${failed}`);

    const success = results.find((r) => r !== null);
    if (success) {
      return success;
    }

    if (batch < 2) {
      console.log("First captcha batch failed verification, retrying with second batch...");
    }
  }
  
  return null;
}

/**
 * Fetches the bill using session and solved captcha
 */
async function fetchBillWithSession(
  consumerNo: string,
  session: CaptchaSession
): Promise<string> {
  const response = await fetch(VIEWBILL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": `JSESSIONID=${session.sessionId}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: `proc=viewbill&consumer=${consumerNo}&contype=NewCon&txtCaptcha=${session.captchaText}`,
  });

  if (!response.ok) {
    throw new Error("Request failed");
  }

  const text = await response.text();

  if (text === "Invalid Captcha") {
    throw new Error("Invalid Captcha");
  }

  return text;
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
          message: `Found ${gasNumbers.length} gas bills. Solving captcha...`,
        });

        sendSSE(controller, "progress", {
          total: gasNumbers.length,
          processed: 0,
          message: `Solving captcha (trying 5 requests in parallel)...`,
        });

        // STEP 1: Solve captcha ONCE using 5 parallel requests (retry if all fail)
        // Use the first gas number to verify the captcha works
        const session = await getWorkingSession(gasNumbers[0]);

        if (!session) {
          sendSSE(controller, "error", { error: "Captcha failed on all attempts" });
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

          const retrySession = await getWorkingSession(failedBills[0].number);

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
