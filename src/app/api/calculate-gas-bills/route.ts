import { NextRequest } from "next/server";
import * as cheerio from "cheerio";
import { detectText } from "@/src/hooks/TextDetector";

const BASE_URL = "https://www.sngpl.com.pk";
const LOGIN_URL = `${BASE_URL}/login.jsp?mdids=85`;
const VIEWBILL_URL = `${BASE_URL}/viewbill`;

interface WorkingSession {
  sessionId: string;
  captchaText: string;
}

/**
 * Cleans captcha text: trim, remove extra spaces, newlines, and capitalize
 */
function cleanCaptchaText(text: string): string {
  return text
    .trim()
    .replace(/[\s\n\r]+/g, "")
    .toUpperCase();
}

/**
 * Fetches the login page and extracts session cookie + captcha image
 * Each request is completely fresh (like opening a new browser tab)
 */
async function getSessionAndCaptcha(): Promise<{ sessionId: string; captchaBase64: string }> {
  // Add timestamp to bust cache completely (like opening new tab)
  const cacheBuster = `_=${Date.now()}&r=${Math.random().toString(36).substring(7)}`;
  const freshLoginUrl = LOGIN_URL.includes('?') 
    ? `${LOGIN_URL}&${cacheBuster}` 
    : `${LOGIN_URL}?${cacheBuster}`;

  const response = await fetch(freshLoginUrl, {
    method: "GET",
    cache: "no-store",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });

  if (!response.ok) {
    throw new Error("Failed to fetch login page");
  }

  const setCookie = response.headers.get("set-cookie");
  const sessionMatch = setCookie?.match(/JSESSIONID=([^;]+)/);
  
  if (!sessionMatch) {
    throw new Error("Session ID not found in cookies");
  }

  const sessionId = sessionMatch[1];
  const html = await response.text();
  
  const $ = cheerio.load(html);
  const captchaImg = $("#captchaimg");
  
  if (!captchaImg.length) {
    throw new Error("Captcha image not found");
  }

  const captchaSrc = captchaImg.attr("src");
  
  if (!captchaSrc) {
    throw new Error("Captcha image src not found");
  }

  const captchaUrl = captchaSrc.startsWith("http") 
    ? captchaSrc 
    : `${BASE_URL}${captchaSrc.startsWith("/") ? "" : "/"}${captchaSrc}`;

  // Add cache buster to captcha URL too
  const cacheBusterCaptcha = `_=${Date.now()}&r=${Math.random().toString(36).substring(7)}`;
  const freshCaptchaUrl = captchaUrl.includes('?') 
    ? `${captchaUrl}&${cacheBusterCaptcha}` 
    : `${captchaUrl}?${cacheBusterCaptcha}`;

  const captchaResponse = await fetch(freshCaptchaUrl, {
    cache: "no-store",
    headers: {
      "Cookie": `JSESSIONID=${sessionId}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });

  if (!captchaResponse.ok) {
    throw new Error("Failed to fetch captcha image");
  }

  const captchaBuffer = await captchaResponse.arrayBuffer();
  const captchaBase64 = `data:image/png;base64,${Buffer.from(captchaBuffer).toString("base64")}`;

  return {
    sessionId,
    captchaBase64,
  };
}

/**
 * Attempts to fetch a bill and returns the working session
 */
async function attemptBillFetch(consumerNo: string): Promise<{ html: string; session: WorkingSession } | null> {
  try {
    const { sessionId, captchaBase64 } = await getSessionAndCaptcha();
    const rawCaptchaText = await detectText(captchaBase64);
    const captchaText = cleanCaptchaText(rawCaptchaText);
    
    console.log(`[attemptBillFetch] Captcha: "${captchaText}" for ${consumerNo}`);

    const response = await fetch(VIEWBILL_URL, {
      method: "POST",
      cache: "no-store",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "Cookie": `JSESSIONID=${sessionId}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      body: `proc=viewbill&consumer=${consumerNo}&contype=NewCon&txtCaptcha=${captchaText}`,
    });

    if (!response.ok) {
      console.log(`[attemptBillFetch] HTTP Error: ${response.status}`);
      return null;
    }

    const text = await response.text();
    console.log(`[attemptBillFetch] Response: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

    if (text === "Invalid Captcha") {
      return null;
    }

    return { 
      html: text, 
      session: { sessionId, captchaText } 
    };
  } catch (err) {
    console.log(`[attemptBillFetch] Error:`, err);
    return null;
  }
}

/**
 * Fetch a bill using an already-verified session
 */
async function fetchBillWithSession(consumerNo: string, session: WorkingSession): Promise<string> {
  const response = await fetch(VIEWBILL_URL, {
    method: "POST",
    cache: "no-store",
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
  console.log(`[fetchBill] ${consumerNo} | Response: "${text.substring(0, 100)}${text.length > 100 ? '...' : ''}"`);

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
  const MAX_ATTEMPTS = 10;

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

        // STEP 1: Fetch FIRST bill with SEQUENTIAL captcha attempts (max 10)
        // Each attempt is fresh (like opening new tab with cleared cache)
        const firstNumber = gasNumbers[0];
        let firstBillResult: { html: string; session: WorkingSession } | null = null;

        for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
          console.log(`Captcha attempt ${attempt}/${MAX_ATTEMPTS} (sequential, fresh request)...`);
          
          sendSSE(controller, "progress", {
            total: gasNumbers.length,
            processed: 0,
            message: `Captcha attempt ${attempt}/${MAX_ATTEMPTS} (fresh request)...`,
          });
          
          // Small delay between attempts (like waiting for page reload)
          if (attempt > 1) {
            await new Promise(resolve => setTimeout(resolve, 500));
          }
          
          // Run ONE request at a time (sequential) - completely fresh
          firstBillResult = await attemptBillFetch(firstNumber);
          
          if (firstBillResult) {
            console.log(`Captcha solved on attempt ${attempt}!`);
            sendSSE(controller, "progress", {
              total: gasNumbers.length,
              processed: 0,
              message: `Captcha solved on attempt ${attempt}!`,
            });
            break;
          }

          console.log(`Attempt ${attempt} failed.`);
        }

        if (!firstBillResult) {
          sendSSE(controller, "error", { error: "Captcha failed on all 10 attempts. Please try again." });
          controller.close();
          return;
        }

        // Process first bill result
        const firstEntry = results.get(firstNumber)!;
        processed++;
        firstEntry.attempts = 1;
        
        const firstAmountStr = extractBillAmount(firstBillResult.html, firstNumber);
        if (firstAmountStr) {
          const amount = parseFloat(firstAmountStr.replace(/,/g, "")) || 0;
          firstEntry.amount = amount;
          firstEntry.extractedText = firstAmountStr;
          firstEntry.status = amount > 0 ? "success" : "zero";
          if (amount > 0) {
            successCount++;
            totalAmount += amount;
          }
        } else {
          firstEntry.status = "failed";
          firstEntry.extractedText = "Could not extract amount";
        }

        sendSSE(controller, "billUpdate", {
          number: firstNumber,
          amount: firstEntry.amount,
          status: firstEntry.status,
          extractedText: firstEntry.extractedText,
          attempts: firstEntry.attempts,
          type: "gas",
          index: processed,
        });

        // STEP 2: Use the working session to fetch ALL remaining bills
        const remainingNumbers = gasNumbers.slice(1);
        let workingSession = firstBillResult.session;

        if (remainingNumbers.length > 0) {
          sendSSE(controller, "progress", {
            total: gasNumbers.length,
            processed,
            message: `Fetching ${remainingNumbers.length} remaining bills with same session...`,
          });

          // Fetch all remaining bills in parallel using the same session
          const billPromises = remainingNumbers.map(async (consumerNo) => {
            const entry = results.get(consumerNo)!;
            
            try {
              const html = await fetchBillWithSession(consumerNo, workingSession);
              
              processed++;
              entry.attempts = 1;

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
            } catch (err: any) {
              processed++;
              entry.attempts = 1;
              entry.status = "failed";
              entry.extractedText = err.message || "Request failed";
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
              total: gasNumbers.length,
              processed,
              successCount,
              totalAmount,
              message: `Gas: ${processed}/${gasNumbers.length} (${successCount} success, Rs. ${totalAmount.toLocaleString()}) - ${elapsed}s`,
            });
          });

          await Promise.all(billPromises);
        }

        // STEP 3: Retry failed bills (Invalid Captcha) with same session SEQUENTIALLY
        let failedBills = Array.from(results.values()).filter(
          (r) => r.status === "failed" && r.extractedText === "Invalid Captcha"
        );

        if (failedBills.length > 0) {
          sendSSE(controller, "progress", {
            total: gasNumbers.length,
            processed,
            message: `Retrying ${failedBills.length} failed bills with same session...`,
          });

          // Retry SEQUENTIALLY with same session
          for (const bill of failedBills) {
            try {
              const html = await fetchBillWithSession(bill.number, workingSession);
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
              } else {
                entry.status = "failed";
                entry.extractedText = "Could not extract amount";
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
            } catch {
              // Still failed, will be handled in next step
            }
          }

          // STEP 4: For bills that STILL failed, get new session SEQUENTIALLY (max 10 attempts)
          failedBills = Array.from(results.values()).filter(
            (r) => r.status === "failed" && r.extractedText === "Invalid Captcha"
          );

          if (failedBills.length > 0) {
            sendSSE(controller, "progress", {
              total: gasNumbers.length,
              processed,
              message: `${failedBills.length} bills still failed. Getting new captcha...`,
            });

            // Get new session SEQUENTIALLY (one at a time, max 10 attempts)
            let newSessionResult: { html: string; session: WorkingSession } | null = null;
            const firstFailedNumber = failedBills[0].number;

            for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
              console.log(`[Retry] Captcha attempt ${attempt}/${MAX_ATTEMPTS} (sequential, fresh request)...`);
              
              sendSSE(controller, "progress", {
                total: gasNumbers.length,
                processed,
                message: `New captcha attempt ${attempt}/${MAX_ATTEMPTS} for failed bills (fresh request)...`,
              });
              
              // Small delay between attempts (like waiting for page reload)
              if (attempt > 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
              }
              
              // Run ONE request at a time (sequential) - completely fresh
              newSessionResult = await attemptBillFetch(firstFailedNumber);
              
              if (newSessionResult) {
                console.log(`[Retry] Captcha solved on attempt ${attempt}!`);
                break;
              }

              console.log(`[Retry] Attempt ${attempt} failed.`);
            }

            if (newSessionResult) {
              // Process first failed bill result
              const firstFailedEntry = results.get(firstFailedNumber)!;
              firstFailedEntry.attempts++;
              
              const amountStr = extractBillAmount(newSessionResult.html, firstFailedNumber);
              if (amountStr) {
                const amount = parseFloat(amountStr.replace(/,/g, "")) || 0;
                firstFailedEntry.amount = amount;
                firstFailedEntry.extractedText = amountStr;
                firstFailedEntry.status = amount > 0 ? "success" : "zero";
                if (amount > 0) {
                  successCount++;
                  totalAmount += amount;
                }
              }

              sendSSE(controller, "billUpdate", {
                number: firstFailedNumber,
                amount: firstFailedEntry.amount,
                status: firstFailedEntry.status,
                extractedText: firstFailedEntry.extractedText,
                attempts: firstFailedEntry.attempts,
                type: "gas",
                index: gasNumbers.indexOf(firstFailedNumber) + 1,
              });

              // Fetch remaining failed bills SEQUENTIALLY with new session
              const remainingFailedBills = failedBills.slice(1);
              workingSession = newSessionResult.session;

              for (const bill of remainingFailedBills) {
                try {
                  const html = await fetchBillWithSession(bill.number, workingSession);
                  const entry = results.get(bill.number)!;
                  entry.attempts++;

                  const amtStr = extractBillAmount(html, bill.number);
                  if (amtStr) {
                    const amount = parseFloat(amtStr.replace(/,/g, "")) || 0;
                    entry.amount = amount;
                    entry.extractedText = amtStr;
                    entry.status = amount > 0 ? "success" : "zero";
                    if (amount > 0) {
                      successCount++;
                      totalAmount += amount;
                    }
                  } else {
                    entry.status = "failed";
                    entry.extractedText = "Could not extract amount";
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
                  entry.attempts++;
                  entry.extractedText = err.message || "Request failed";
                }
              }
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

        // Check if all bills failed
        const allFailed = finalSuccessCount === 0 && zeroCount === 0;

        if (allFailed) {
          sendSSE(controller, "error", {
            error: `All ${gasNumbers.length} bills failed. Please try again.`,
            summary: {
              totalBills: gasNumbers.length,
              failedBills: allResults.filter((r) => r.status === "failed"),
            },
          });
        } else {
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
        }

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
