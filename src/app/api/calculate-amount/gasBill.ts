// Gas Bill Calculator (SNGPL) - 11 digit consumer numbers
// Note: Gas bills require captcha solving, which is more complex

import { Page } from "puppeteer-core";
import { detectText } from "@/src/hooks/TextDetector";

const GAS_LOGIN_URL = "https://www.sngpl.com.pk/login.jsp?mdids=85";
const GAS_BILL_URL = "https://www.sngpl.com.pk/viewbill";

// Solve captcha and fetch gas bill
export async function fetchGasBillWithCaptcha(
  page: Page,
  consumerNo: string
): Promise<{ success: boolean; number: string; amount: number; extractedText?: string; error?: string }> {
  try {
    // Enable request interception to block unnecessary resources
    await page.setRequestInterception(true);
    page.removeAllListeners("request");

    page.on("request", (req) => {
      const type = req.resourceType();
      if (type === "stylesheet" || type === "font" || type === "media") {
        req.abort();
      } else {
        req.continue();
      }
    });

    // Navigate to the captcha page
    await page.goto(GAS_LOGIN_URL, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });

    // Wait for essential selectors
    await page.waitForSelector("#consumer", { timeout: 10000 });
    await page.waitForSelector("#captchaimg", { timeout: 10000 });

    // Extract captcha image as base64
    const captchaBase64 = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>("#captchaimg");
      if (!img) return null;

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);

      return canvas.toDataURL("image/png");
    });

    if (!captchaBase64) {
      return { success: false, number: consumerNo, amount: 0, error: "Captcha image not found" };
    }

    // Detect text from captcha image using OCR
    const result = await detectText(captchaBase64);
    const captchaText = result.toUpperCase().replace(/\s+/g, "");

    // Get session cookies
    const cookies = await page.cookies();
    const jsession = cookies.find((c) => c.name === "JSESSIONID");

    if (!jsession) {
      return { success: false, number: consumerNo, amount: 0, error: "No session cookie" };
    }

    // Send POST request to view bill
    const response = await fetch(GAS_BILL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Cookie: `${jsession.name}=${jsession.value}`,
      },
      body: `proc=viewbill&consumer=${consumerNo}&contype=NewCon&txtCaptcha=${captchaText}`,
    });

    if (!response.ok) {
      return { success: false, number: consumerNo, amount: 0, error: `HTTP ${response.status}` };
    }

    const html = await response.text();

    if (html === "Invalid Captcha") {
      return { success: false, number: consumerNo, amount: 0, error: "Invalid Captcha" };
    }

    // Extract amount from response HTML
    // Look for payable amount patterns
    let amount = 0;
    let extractedText = "";

    // Try different patterns to extract the bill amount
    const patterns = [
      /Payable[^<]*Amount[^<]*<[^>]*>([^<]+)/i,
      /Total[^<]*Amount[^<]*<[^>]*>([^<]+)/i,
      /Bill[^<]*Amount[^<]*<[^>]*>([^<]+)/i,
      /Rs\.?\s*([\d,]+(?:\.\d{2})?)/i,
      /(\d{1,3}(?:,\d{3})*(?:\.\d{2})?)/g,
    ];

    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) {
        extractedText = match[1]?.trim() || match[0]?.trim() || "";
        if (extractedText) break;
      }
    }

    // Parse amount
    if (extractedText) {
      const cleaned = extractedText.replace(/,/g, "").replace(/[^\d.]/g, "");
      amount = parseFloat(cleaned) || 0;
    }

    // Verify consumer number appears in response
    const verified = html.includes(consumerNo);

    if (!verified && amount === 0) {
      return { success: false, number: consumerNo, amount: 0, error: "Consumer not found" };
    }

    return { success: true, number: consumerNo, amount, extractedText: extractedText || html.substring(0, 200) };

  } catch (error: any) {
    return { success: false, number: consumerNo, amount: 0, error: error.message || "Failed" };
  }
}

// Simple direct fetch for gas bill (without captcha - may not work for all cases)
export async function fetchGasBillDirect(
  consumerNo: string
): Promise<{ success: boolean; number: string; amount: number; extractedText?: string; error?: string }> {
  try {
    // Try direct API if available
    const response = await fetch(`https://www.sngpl.com.pk/api/bill?consumer=${consumerNo}`, {
      method: "GET",
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      },
      signal: AbortSignal.timeout(10000),
    });

    if (!response.ok) {
      return { success: false, number: consumerNo, amount: 0, error: "Direct API not available" };
    }

    const data = await response.json();
    
    return {
      success: true,
      number: consumerNo,
      amount: data.amount || 0,
      extractedText: JSON.stringify(data),
    };

  } catch (error: any) {
    // Direct API likely doesn't exist, need to use captcha method
    return { success: false, number: consumerNo, amount: 0, error: "Use captcha method" };
  }
}
