"use client";

import { useState } from "react";

export default function GetGasBillPage() {
  const [consumerNumber, setConsumerNumber] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [progressStep, setProgressStep] = useState<number>(0);
  const [billData, setBillData] = useState<string | null>(null);
  const [showPrintButton, setShowPrintButton] = useState(false);

  const loaderMessages = ["opening sngpl website", "solving captcha", "fetching bill"];

  const showStepwiseProgress = () =>
    new Promise<void>((resolve) => {
      setProgressStep(1);
      setTimeout(() => {
        setProgressStep(2);
        setTimeout(() => {
          setProgressStep(3);
          setTimeout(() => {
            // After final message, resolve promise
            resolve();
          }, 4000);
        }, 4000);
      }, 4000);
    });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);
    setProgressStep(0);
    setShowPrintButton(false);
    setBillData(null);

    try {
      showStepwiseProgress();

      const res = await fetch("/api/getgasbill", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ no: consumerNumber }),
      });

      if (res.ok) {
        const data = await res.json();
        setBillData(data.billData);
        setShowPrintButton(true);
        setMessage("Success! Bill information fetched.");
      } else {
        setMessage("Failed to fetch gas bill. Please try again.");
      }
    } catch (err) {
      setMessage("Network error.");
    } finally {
      setLoading(false);
      setProgressStep(0);
    }
  };

  const handlePrintBill = () => {
    if (billData) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(billData, "text/html");

      // Select the img inside body > div.sheet > img
      const img = doc.querySelector("body > div.sheet > img");
      if (img) {
        // Replace the src with your new URL
        (img as HTMLImageElement).src = "/assets/images/Billimage.jpg";
      }

      // Serialize the updated DOM back to a string
      const updatedBillData = doc.documentElement.outerHTML;
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.open();
        printWindow.document.write(`${updatedBillData}`);
        printWindow.document.close();
        printWindow.focus();
      }
    }
  };

  return (
    <div className="flex flex-col items-center mt-10 space-y-4">
      <form className="flex flex-col items-center space-y-3" onSubmit={handleSubmit}>
        <label htmlFor="consumerNumber" className="font-medium">
          Enter your consumer number
        </label>
        <input
          id="consumerNumber"
          type="text"
          value={consumerNumber}
          onChange={(e) => setConsumerNumber(e.target.value)}
          className="border px-3 py-2 rounded-lg text-sm"
          placeholder="Consumer number"
          required
        />
        <button
          type="submit"
          disabled={loading}
          className={`px-6 py-2 rounded-lg transition ${loading ? "bg-gray-400 cursor-not-allowed" : "bg-teal-600 hover:bg-teal-700 text-white"
            }`}
        >
          {loading ? "Submitting..." : "Submit"}
        </button>
      </form>
      {loading && progressStep > 0 && progressStep <= 3 && (
        <div className="flex flex-col items-center mt-4">
          <svg
            className="animate-spin h-6 w-6 text-teal-600 mb-2"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
          </svg>
          <span className="text-teal-700 text-sm font-medium">{loaderMessages[progressStep - 1]}</span>
        </div>
      )}
      {showPrintButton && billData && (
        <button
          type="button"
          className="mt-4 px-6 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white shadow transition"
          onClick={handlePrintBill}
        >
          Print Bill
        </button>
      )}
      {message && <div className="mt-4 text-sm text-center text-red-600">{message}</div>}
    </div>
  );
}
