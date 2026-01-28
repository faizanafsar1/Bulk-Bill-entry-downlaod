import { detectText } from "@/src/hooks/TextDetector";
import fetch from "node-fetch";
import { Page } from "puppeteer-core";

export interface CaptchaSession {
  sessionId: string;
  captchaText: string;
}

/**
 * Solves captcha and returns session info (session ID + captcha text)
 * Does NOT fetch the bill - just returns credentials for reuse
 */
export async function solveCaptchaOnly(page: Page): Promise<CaptchaSession> {
  try {
    // Enable request interception to block CSS, fonts, media (but allow images)
    await page.setRequestInterception(true);

    // Remove previous request listeners to avoid duplicates if page is reused
    page.removeAllListeners("request");

    page.on("request", (req) => {
      const type = req.resourceType();

      if (
        type === "stylesheet" ||  // block CSS
        type === "font" ||        // block fonts
        type === "media"          // block video/audio
      ) {
        return req.abort();
      }

      // Allow all other requests (including images)
      req.continue();
    });

    // Navigate to the captcha page
    await page.goto("https://www.sngpl.com.pk/login.jsp?mdids=85", {
      waitUntil: "domcontentloaded",
    });

    // Wait for essential selectors
    await page.waitForSelector("#consumer");
    await page.waitForSelector("#captchaimg");

    // Extract captcha image as base64
    const ssBase64 = await page.evaluate(() => {
      const img = document.querySelector<HTMLImageElement>("#captchaimg");
      if (!img) return null;

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;

      const ctx = canvas.getContext("2d");
      ctx?.drawImage(img, 0, 0);

      return canvas.toDataURL("image/png");
    });

    if (!ssBase64) throw new Error("Captcha image not found");

    // Detect text from captcha image
    const result = await detectText(ssBase64);
    const captchaText = result.toUpperCase().replace(/\s+/g, "");

    // Get cookies for authenticated request
    const cookies = await page.cookies();
    const jsession = cookies.find((c) => c.name === "JSESSIONID");

    if (!jsession) throw new Error("Session ID not found");

    return {
      sessionId: jsession.value,
      captchaText,
    };
  } catch (error) {
    throw error;
  }
}

/**
 * Fetches a bill using an existing session (no captcha solving)
 */
export async function fetchBillWithSession(
  consumerNo: string,
  session: CaptchaSession
): Promise<string> {
  const res = await fetch("https://www.sngpl.com.pk/viewbill", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Cookie: `JSESSIONID=${session.sessionId}`,
    },
    body: `proc=viewbill&consumer=${consumerNo}&contype=NewCon&txtCaptcha=${session.captchaText}`,
  });

  if (!res.ok) {
    throw new Error("Request failed");
  }

  const text = await res.text();

  if (text === "Invalid Captcha") {
    throw new Error("Invalid Captcha");
  }

  return text;
}

/**
 * Original function - solves captcha AND fetches the bill
 */
export async function solveCaptcha(page: Page, consumerNo: string): Promise<string> {
  const session = await solveCaptchaOnly(page);
  return fetchBillWithSession(consumerNo, session);
}
