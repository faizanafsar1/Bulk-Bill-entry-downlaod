import { NextRequest, NextResponse } from "next/server";
import * as cheerio from "cheerio";
import { detectText } from "@/src/hooks/TextDetector";

const BASE_URL = "https://www.sngpl.com.pk";
const LOGIN_URL = `${BASE_URL}/login.jsp?mdids=85`;
const VIEWBILL_URL = `${BASE_URL}/viewbill`;

interface CaptchaSession {
  sessionId: string;
  captchaBase64: string;
}

/**
 * Fetches the login page and extracts session cookie + captcha image
 */
async function getSessionAndCaptcha(): Promise<CaptchaSession> {
  const response = await fetch(LOGIN_URL, {
    method: "GET",
    cache: "no-store",  // Fresh request every time
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
    cache: "no-store",
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

  return {
    sessionId,
    captchaBase64,
  };
}

/**
 * Cleans captcha text: trim, remove extra spaces, newlines, and capitalize
 */
function cleanCaptchaText(text: string): string {
  return text
    .trim()                    // Remove leading/trailing whitespace
    .replace(/[\s\n\r]+/g, "") // Remove all spaces and newlines
    .toUpperCase();            // Capitalize
}

/**
 * Fetches the bill using session and solved captcha
 */
async function fetchBill(
  consumerNo: string,
  sessionId: string,
  captchaText: string
): Promise<string> {
  const cleanedCaptcha = cleanCaptchaText(captchaText);

  const response = await fetch(VIEWBILL_URL, {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Cookie": `JSESSIONID=${sessionId}`,
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: `proc=viewbill&consumer=${consumerNo}&contype=NewCon&txtCaptcha=${cleanedCaptcha}`,
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

/**
 * Attempts to solve captcha and fetch bill
 */
async function attemptBillFetch(consumerNo: string): Promise<string> {
  const { sessionId, captchaBase64 } = await getSessionAndCaptcha();
  const captchaText = await detectText(captchaBase64);
  return fetchBill(consumerNo, sessionId, captchaText);
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const { no: consumerNo } = await req.json();

    if (!consumerNo) {
      return NextResponse.json(
        { error: "Consumer number not provided" },
        { status: 400 }
      );
    }

    // Try up to 2 batches of 5 parallel requests each
    for (let batch = 1; batch <= 2; batch++) {
      console.log(`Starting batch ${batch} of 5 parallel requests...`);
      
      const attempts = Array(5).fill(null).map(() => 
        attemptBillFetch(consumerNo).catch(() => null)
      );

      const results = await Promise.all(attempts);
      
      // Count passed and failed captchas
      const passed = results.filter((r) => r !== null).length;
      const failed = results.filter((r) => r === null).length;
      console.log(`Batch ${batch} - Passed: ${passed}, Failed: ${failed}`);

      const success = results.find((r) => r !== null);

      if (success) {
        return NextResponse.json({
          message: "Success",
          billData: success,
        });
      }
      
      if (batch < 2) {
        console.log("First batch failed, retrying with second batch...");
      }
    }

    return NextResponse.json(
      { error: "Captcha failed on all attempts" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error(err);
    return NextResponse.json(
      { error: err.message || "Internal error" },
      { status: 500 }
    );
  }
}
