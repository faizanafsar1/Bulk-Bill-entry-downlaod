// Electric Bill Calculator (IESCO) - 14 digit reference numbers

const API_URL = "https://bill.pitc.com.pk/iescobill/general";

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

let electricSessionCookie = "";

// Get fresh session cookies for electric bill
export async function getElectricSession(): Promise<string> {
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

    console.log("Got electric bill session cookies");
    electricSessionCookie = cookies;
    return cookies;
  } catch (error) {
    console.error("Failed to get electric session:", error);
    return "";
  }
}

// Fetch electric bill data
export async function fetchElectricBill(
  refNumber: string,
  cookies?: string
): Promise<{ success: boolean; number: string; amount: number; extractedText?: string; error?: string }> {
  try {
    const sessionCookies = cookies || electricSessionCookie;
    const url = `${API_URL}?refno=${encodeURIComponent(refNumber)}`;

    const response = await fetch(url, {
      method: "POST",
      headers: {
        ...DEFAULT_HEADERS,
        "cookie": sessionCookies,
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      return { success: false, number: refNumber, amount: 0, error: `HTTP ${response.status}` };
    }

    const html = await response.text();

    let amount = 0;
    let extractedText = "";

    // Method 1: Look for PAYABLE WITHIN DUE DATE followed by the content td
    const payableMatch = html.match(/PAYABLE\s*WITHIN\s*DUE\s*DATE[\s\S]*?<td[^>]*class="[^"]*content[^"]*"[^>]*>([\s\S]*?)<\/td>/i);
    if (payableMatch) {
      // Extract just the number from the content (remove whitespace, br, span, tags)
      const content = payableMatch[1].replace(/<[^>]*>/g, "").trim();
      // Get all digits (with optional commas and decimal)
      const numberMatch = content.match(/([\d,]+\.?\d*)/);
      if (numberMatch) {
        extractedText = numberMatch[1].trim();
      }
    }

    // Method 2: Alternative - look for border-b nestedtd2width content class directly
    if (!extractedText) {
      const contentMatch = html.match(/class="border-b\s+nestedtd2width\s+content"[^>]*>([\s\S]*?)<\/td>/i);
      if (contentMatch) {
        const content = contentMatch[1].replace(/<[^>]*>/g, "").trim();
        const numberMatch = content.match(/([\d,]+\.?\d*)/);
        if (numberMatch) {
          extractedText = numberMatch[1].trim();
        }
      }
    }

    // Method 3: Fallback - find any number after PAYABLE WITHIN DUE DATE
    if (!extractedText) {
      const billSection = html.match(/PAYABLE\s*WITHIN\s*DUE\s*DATE[\s\S]{0,500}/i);
      if (billSection) {
        const cleanSection = billSection[0].replace(/<[^>]*>/g, " ");
        const amountMatch = cleanSection.match(/([\d,]+\.?\d*)/);
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

export { electricSessionCookie };
