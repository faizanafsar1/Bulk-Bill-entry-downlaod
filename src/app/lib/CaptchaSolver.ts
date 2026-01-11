import { detectText } from "@/src/hooks/TextDetector";
import fetch from "node-fetch"; // Make sure fetch is available in your Node environment

export async function solveCaptcha(page: any, consumerNo: string) {
  return new Promise(async (resolve, reject) => {
    try {
      // Instead of newPage(), just use the passed page
      await page.goto("https://www.sngpl.com.pk/login.jsp?mdids=85", { waitUntil: "domcontentloaded" });

      await page.waitForSelector("#consumer");
      await page.waitForSelector("#captchaimg");

      const ssBase64 = await page.evaluate(() => {
        const img = document.querySelector("#captchaimg");
        if (!img) return null;
        const canvas = document.createElement("canvas");
        canvas.width = (img as HTMLImageElement)?.naturalWidth || 0;
        canvas.height = (img as HTMLImageElement)?.naturalHeight || 0;
        const ctx = canvas.getContext("2d");
        ctx?.drawImage(img as HTMLImageElement, 0, 0);
        return canvas.toDataURL("image/png").replace(/^data:image\/png;b1ase64,/, "");
      });

      const result = await detectText(ssBase64);
      const captchaText = result.toUpperCase().replace(/\s+/g, "");
      const cookies = await page.cookies();
      const jsession = cookies.find((c: any) => c.name === "JSESSIONID");
      const res = await fetch("https://www.sngpl.com.pk/viewbill", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Cookie: `${jsession?.name}=${jsession?.value}`,
        },
        body: `proc=viewbill&consumer=${consumerNo}&contype=NewCon&txtCaptcha=${captchaText}`,
      });

      // const res = await page.evaluate(
      //   async (consumerNo: string, captchaText: string) => {
      //     const res = await fetch("https://www.sngpl.com.pk/viewbill", {
      //       method: "POST",
      //       headers: {
      //         "Content-Type": "application/x-www-form-urlencoded",
      //       },
      //       body: `proc=viewbill&consumer=${consumerNo}&contype=NewCon&txtCaptcha=${captchaText}`,
      //     });
      //     return await res.text();
      //   },
      //   consumerNo,
      //   captchaText
      // );

      if (res.ok) {
        const text = await res.text();
        if (text === "Invalid Captcha") {
          return reject("Invalid Captcha");
        }
        resolve(text);
      } else {
        reject(new Error("Failed to solve captcha"));
        console.log("error inside solveCaptcha");
      }
    } catch (error) {
      reject(error);
    }
  });
}
