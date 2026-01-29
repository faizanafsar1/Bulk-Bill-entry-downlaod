"use client";

import { useState } from "react";

type BillType = "electric" | "gas";

interface BillUpdate {
    number: string;
    amount: number;
    status: "success" | "failed" | "zero";
    extractedText?: string;
    attempts: number;
    index: number;
    type?: BillType;
}

export default function CalculateAmountPage() {
    const [file, setFile] = useState<File | null>(null);
    const [billType, setBillType] = useState<BillType>("electric");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);
    const [bills, setBills] = useState<Map<string, BillUpdate>>(new Map());
    const [progress, setProgress] = useState({ total: 0, processed: 0, message: "" });
    const [currentProcessing, setCurrentProcessing] = useState<string | null>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setMessage(null);
            setResult(null);
        }
    };

    const handleBillTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        setBillType(e.target.value as BillType);
        setMessage(null);
        setResult(null);
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!file) {
            setMessage("Please select a file first.");
            return;
        }

        setLoading(true);
        setMessage(null);
        setResult(null);
        setBills(new Map());
        setProgress({ total: 0, processed: 0, message: "" });
        setCurrentProcessing(null);

        try {
            const formData = new FormData();
            formData.append("file", file);

            // Choose API endpoint based on bill type
            const apiEndpoint = billType === "electric"
                ? "/api/calculate-electric-bills"
                : "/api/calculate-gas-bills";

            const response = await fetch(apiEndpoint, {
                method: "POST",
                body: formData,
            });

            if (!response.ok) {
                throw new Error("Failed to start processing");
            }

            // Read the SSE stream
            const reader = response.body?.getReader();
            const decoder = new TextDecoder();
            let buffer = "";

            if (!reader) {
                throw new Error("No response body");
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });

                // Process complete SSE messages (separated by \n\n)
                const messages = buffer.split("\n\n");
                buffer = messages.pop() || ""; // Keep incomplete message in buffer

                for (const message of messages) {
                    if (message.trim() === "") continue;

                    let event = "message";
                    let data = "";

                    // Parse SSE format
                    const lines = message.split("\n");
                    for (const line of lines) {
                        if (line.startsWith("event: ")) {
                            event = line.substring(7).trim();
                        } else if (line.startsWith("data: ")) {
                            data = line.substring(6).trim();
                        }
                    }

                    if (data) {
                        try {
                            const parsedData = JSON.parse(data);
                            handleSSEEvent(event, parsedData);
                        } catch (e) {
                            console.error("Failed to parse SSE data:", e, data);
                        }
                    }
                }
            }

            setMessage("File processed successfully!");
        } catch (err: any) {
            setMessage(err.message || "Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    const handleSSEEvent = (event: string, data: any) => {
        switch (event) {
            case "connected":
                console.log("Connected to server");
                break;
            case "progress":
                setProgress({
                    total: data.total,
                    processed: data.processed,
                    message: data.message
                });
                break;
            case "processing":
                setCurrentProcessing(data.number);
                break;
            case "billUpdate":
                setBills(prev => {
                    const newBills = new Map(prev);
                    newBills.set(data.number, {
                        number: data.number,
                        amount: data.amount,
                        status: data.status,
                        extractedText: data.extractedText,
                        attempts: data.attempts,
                        index: data.index,
                        type: data.type
                    });
                    return newBills;
                });
                setCurrentProcessing(null);
                break;
            case "retry":
                console.log("Retry:", data);
                break;
            case "complete":
                setResult(data);
                setLoading(false);
                break;
            case "error":
                setMessage(data.error || "An error occurred");
                setLoading(false);
                break;
        }
    };

    const getBillTypeLabel = () => {
        return billType === "electric" ? "Electric (IESCO)" : "Gas (SNGPL)";
    };

    const getBillTypeColor = () => {
        return billType === "electric" ? "teal" : "orange";
    };

    return (
        <div className="flex flex-col items-center mt-10 space-y-4 px-4">
            <h1 className="text-2xl font-bold mb-4">Calculate Bill Amount</h1>

            <form className="flex flex-col items-center space-y-6 w-full max-w-md" onSubmit={handleSubmit}>


                <div className="w-full">
                    <label htmlFor="billType" className="block font-medium mb-2 text-gray-700">
                        Select Bill Type
                    </label>
                    <select
                        id="billType"
                        value={billType}
                        onChange={handleBillTypeChange}
                        className={`w-full px-4 py-3 rounded-lg border-2 text-lg font-medium transition-all cursor-pointer focus:outline-none focus:ring-2 ${billType === "electric"
                            ? "border-teal-500 bg-teal-50 text-teal-800 focus:ring-teal-300"
                            : "border-orange-500 bg-orange-50 text-orange-800 focus:ring-orange-300"
                            }`}
                        disabled={loading}
                    >
                        <option value="electric">⚡ Electric Bills (IESCO - 14 digit)</option>
                        <option value="gas">🔥 Gas Bills (SNGPL - 11 digit)</option>
                    </select>
                    <p className="text-sm text-gray-500 mt-1">
                        {billType === "electric"
                            ? "For 14-digit reference numbers"
                            : "For 11-digit consumer numbers (requires captcha)"}
                    </p>
                </div>

                {/* File Upload */}
                <div className="w-full">
                    <label htmlFor="file" className="block font-medium mb-2 text-gray-700">
                        Upload TXT File
                    </label>
                    <div className={`border-2 border-dashed rounded-lg p-6 text-center transition-all ${billType === "electric"
                        ? "border-teal-300 hover:border-teal-500"
                        : "border-orange-300 hover:border-orange-500"
                        }`}>
                        <input
                            id="file"
                            type="file"
                            accept=".txt"
                            onChange={handleFileChange}
                            className="hidden"
                            required
                            disabled={loading}
                        />
                        <label htmlFor="file" className="cursor-pointer">
                            <div className="flex flex-col items-center space-y-2">
                                <svg className={`w-12 h-12 ${billType === "electric" ? "text-teal-500" : "text-orange-500"}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                                </svg>
                                <span className="text-gray-600">Click to select a TXT file</span>
                            </div>
                        </label>
                    </div>
                    {file && (
                        <div className={`mt-3 p-3 rounded-lg flex items-center space-x-2 ${billType === "electric" ? "bg-teal-50" : "bg-orange-50"
                            }`}>
                            <svg className={`w-5 h-5 ${billType === "electric" ? "text-teal-600" : "text-orange-600"}`} fill="currentColor" viewBox="0 0 20 20">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                            </svg>
                            <span className={`text-sm font-medium ${billType === "electric" ? "text-teal-800" : "text-orange-800"}`}>
                                {file.name}
                            </span>
                            <span className="text-sm text-gray-500">
                                ({(file.size / 1024).toFixed(2)} KB)
                            </span>
                        </div>
                    )}
                </div>

                {/* Submit Button */}
                <button
                    type="submit"
                    disabled={loading || !file}
                    className={`w-full px-6 py-3 rounded-lg transition text-lg font-semibold ${loading || !file
                        ? "bg-gray-400 cursor-not-allowed text-gray-200"
                        : billType === "electric"
                            ? "bg-teal-600 hover:bg-teal-700 text-white shadow-lg hover:shadow-xl"
                            : "bg-orange-600 hover:bg-orange-700 text-white shadow-lg hover:shadow-xl"
                        }`}
                >
                    {loading ? (
                        <span className="flex items-center justify-center space-x-2">
                            <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                            </svg>
                            <span>Processing {getBillTypeLabel()}...</span>
                        </span>
                    ) : (
                        <span>
                            {billType === "electric" ? "⚡" : "🔥"} Calculate {getBillTypeLabel()}
                        </span>
                    )}
                </button>
            </form>

            {loading && (
                <div className="flex flex-col items-center mt-4 w-full max-w-4xl">
                    <div className="flex items-center space-x-3 mb-4">
                        <svg
                            className={`animate-spin h-6 w-6 ${billType === "electric" ? "text-teal-600" : "text-orange-600"}`}
                            xmlns="http://www.w3.org/2000/svg"
                            fill="none"
                            viewBox="0 0 24 24"
                        >
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                        </svg>
                        <span className={`text-sm font-medium ${billType === "electric" ? "text-teal-700" : "text-orange-700"}`}>
                            {progress.message || "Processing file..."}
                        </span>
                    </div>

                    {progress.total > 0 && (
                        <div className="w-full bg-gray-200 rounded-full h-2.5 mb-4">
                            <div
                                className={`h-2.5 rounded-full transition-all duration-300 ${billType === "electric" ? "bg-teal-600" : "bg-orange-600"
                                    }`}
                                style={{ width: `${(progress.processed / progress.total) * 100}%` }}
                            ></div>
                        </div>
                    )}

                    {/* Real-time Bills List */}
                    {bills.size > 0 && (
                        <div className="w-full p-4 bg-white rounded-lg shadow-md border-2 border-gray-200 max-h-96 overflow-y-auto">
                            <h3 className="text-lg font-bold text-gray-800 mb-3 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                </svg>
                                Processing {getBillTypeLabel()} ({progress.processed}/{progress.total})
                            </h3>
                            <div className="space-y-2">
                                {Array.from(bills.values())
                                    .sort((a, b) => a.index - b.index)
                                    .map((bill) => {
                                        const isSuccess = bill.status === "success";
                                        const isZero = bill.status === "zero";

                                        return (
                                            <div
                                                key={bill.number}
                                                className={`p-3 rounded-lg border animate-pulse ${isSuccess
                                                    ? "bg-green-50 border-green-300"
                                                    : isZero
                                                        ? "bg-yellow-50 border-yellow-300"
                                                        : "bg-red-50 border-red-300"
                                                    }`}
                                            >
                                                <div className="flex items-center justify-between">
                                                    <div className="flex items-center space-x-3">
                                                        <span className={`font-bold text-sm ${isSuccess ? "text-green-700" : isZero ? "text-yellow-700" : "text-red-700"
                                                            }`}>
                                                            #{bill.index}
                                                        </span>
                                                        <span className={`font-semibold ${isSuccess ? "text-green-800" : isZero ? "text-yellow-800" : "text-red-800"
                                                            }`}>
                                                            {bill.number}
                                                        </span>
                                                    </div>
                                                    <div className="flex items-center space-x-4">
                                                        <span className={`font-bold text-lg ${isSuccess ? "text-green-700" : isZero ? "text-yellow-700" : "text-red-700"
                                                            }`}>
                                                            Rs. {bill.amount.toLocaleString()}
                                                        </span>
                                                        <span className={`px-2 py-1 rounded text-xs font-medium ${isSuccess
                                                            ? "bg-green-200 text-green-800"
                                                            : isZero
                                                                ? "bg-yellow-200 text-yellow-800"
                                                                : "bg-red-200 text-red-800"
                                                            }`}>
                                                            {isSuccess ? "✓" : isZero ? "⚠" : "✗"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}

                                {currentProcessing && (
                                    <div className={`p-3 rounded-lg border-2 animate-pulse ${billType === "electric"
                                        ? "border-teal-300 bg-teal-50"
                                        : "border-orange-300 bg-orange-50"
                                        }`}>
                                        <div className="flex items-center space-x-3">
                                            <svg className={`animate-spin h-4 w-4 ${billType === "electric" ? "text-teal-600" : "text-orange-600"
                                                }`} fill="none" viewBox="0 0 24 24">
                                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"></path>
                                            </svg>
                                            <span className={`font-semibold ${billType === "electric" ? "text-teal-800" : "text-orange-800"
                                                }`}>
                                                Processing: {currentProcessing}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {message && (
                <div className={`mt-4 text-sm text-center ${message.includes("success") ? "text-green-600" : "text-red-600"
                    }`}>
                    {message}
                </div>
            )}

            {result && result.summary && (
                <div className="mt-6 p-6 bg-white rounded-lg shadow-lg max-w-4xl w-full space-y-6">
                    <h2 className="text-2xl font-bold mb-4 text-center">
                        {billType === "electric" ? "⚡" : "🔥"} {getBillTypeLabel()} - Calculation Summary
                    </h2>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className={`p-4 rounded-lg ${billType === "electric" ? "bg-teal-50" : "bg-orange-50"}`}>
                            <div className="text-sm text-gray-600">Total Bills</div>
                            <div className={`text-2xl font-bold ${billType === "electric" ? "text-teal-700" : "text-orange-700"}`}>
                                {result.summary.totalBills}
                            </div>
                        </div>
                        <div className="p-4 bg-green-50 rounded-lg">
                            <div className="text-sm text-gray-600">Calculated Bills</div>
                            <div className="text-2xl font-bold text-green-700">{result.summary.calculatedBills}</div>
                        </div>
                    </div>

                    {/* Total Amount - Bold and Large */}
                    <div className={`p-6 rounded-lg text-center border-2 ${billType === "electric"
                        ? "bg-teal-50 border-teal-200"
                        : "bg-orange-50 border-orange-200"
                        }`}>
                        <div className="text-sm text-gray-600 mb-2">Total Calculated Amount</div>
                        <div className={`text-4xl font-bold ${billType === "electric" ? "text-teal-700" : "text-orange-700"}`}>
                            Rs. {result.summary.totalAmount.toLocaleString()}
                        </div>
                    </div>

                    {/* All Bills List */}
                    {result.results && result.results.details && result.results.details.length > 0 && (
                        <div className="p-4 bg-gray-50 rounded-lg border-2 border-gray-200">
                            <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center">
                                <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                                </svg>
                                All {getBillTypeLabel()} Bills
                            </h3>
                            <div className="max-h-96 overflow-y-auto space-y-2">
                                {result.results.details.map((bill: any, index: number) => {
                                    const isSuccess = bill.status === "success";
                                    const isZero = bill.status === "zero";

                                    return (
                                        <div
                                            key={index}
                                            className={`p-3 rounded-lg border ${isSuccess
                                                ? "bg-green-50 border-green-300"
                                                : isZero
                                                    ? "bg-yellow-50 border-yellow-300"
                                                    : "bg-red-50 border-red-300"
                                                }`}
                                        >
                                            <div className="flex items-center justify-between">
                                                <div className="flex items-center space-x-3">
                                                    <span className={`font-bold text-sm ${isSuccess ? "text-green-700" : isZero ? "text-yellow-700" : "text-red-700"
                                                        }`}>
                                                        #{index + 1}
                                                    </span>
                                                    <span className={`font-semibold ${isSuccess ? "text-green-800" : isZero ? "text-yellow-800" : "text-red-800"
                                                        }`}>
                                                        Bill Number: {bill.number}
                                                    </span>
                                                </div>
                                                <div className="flex items-center space-x-4">
                                                    <span className={`font-bold text-lg ${isSuccess ? "text-green-700" : isZero ? "text-yellow-700" : "text-red-700"
                                                        }`}>
                                                        Rs. {bill.amount ? bill.amount.toLocaleString() : "0"}
                                                    </span>
                                                    <span className={`px-2 py-1 rounded text-xs font-medium ${isSuccess
                                                        ? "bg-green-200 text-green-800"
                                                        : isZero
                                                            ? "bg-yellow-200 text-yellow-800"
                                                            : "bg-red-200 text-red-800"
                                                        }`}>
                                                        {isSuccess ? "✓ Success" : isZero ? "⚠ Zero" : "✗ Failed"}
                                                    </span>
                                                </div>
                                            </div>
                                            {bill.extractedText && bill.extractedText !== bill.number && (
                                                <div className={`text-xs mt-1 ${isSuccess ? "text-green-600" : isZero ? "text-yellow-600" : "text-red-600"
                                                    }`}>
                                                    {bill.extractedText}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Zero Amount Bills Warning */}
                    {result.summary.zeroAmountBills && result.summary.zeroAmountBills.length > 0 && (
                        <div className="p-4 bg-red-50 border-2 border-red-300 rounded-lg">
                            <div className="flex items-center mb-3">
                                <svg className="w-6 h-6 text-red-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <h3 className="text-lg font-bold text-red-700">Warning: Bills with Amount 0</h3>
                            </div>
                            <div className="space-y-2">
                                {result.summary.zeroAmountBills.map((bill: any, index: number) => (
                                    <div key={index} className="p-3 bg-red-100 rounded border border-red-300">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-red-800">
                                                Number: {bill.number}
                                            </span>
                                            <span className="font-bold text-red-600">
                                                Amount: Rs. {bill.amount}
                                            </span>
                                        </div>
                                        {bill.extractedText && (
                                            <div className="text-xs text-red-600 mt-1">
                                                Extracted: {bill.extractedText}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 text-sm text-red-700 font-medium">
                                ⚠️ Please check these bills manually
                            </div>
                        </div>
                    )}

                    {/* Failed Bills Warning */}
                    {result.summary.failedBills && result.summary.failedBills.length > 0 && (
                        <div className="p-4 bg-orange-50 border-2 border-orange-300 rounded-lg">
                            <div className="flex items-center mb-3">
                                <svg className="w-6 h-6 text-orange-600 mr-2" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                                <h3 className="text-lg font-bold text-orange-700">Failed Bills (After Retry Attempts)</h3>
                            </div>
                            <div className="space-y-2">
                                {result.summary.failedBills.map((bill: any, index: number) => (
                                    <div key={index} className="p-3 bg-orange-100 rounded border border-orange-300">
                                        <div className="flex items-center justify-between">
                                            <span className="font-semibold text-orange-800">
                                                Number: {bill.number}
                                            </span>
                                            <span className="font-bold text-orange-600">
                                                Status: {bill.status === "max_retries" ? "Not Correct" : "Failed"}
                                            </span>
                                        </div>
                                        <div className="text-xs text-orange-600 mt-1">
                                            Attempts: {bill.attempts} | {bill.extractedText || "Failed to process"}
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-3 text-sm text-orange-700 font-medium">
                                ⚠️ These bills failed after retry attempts. Please check manually.
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
