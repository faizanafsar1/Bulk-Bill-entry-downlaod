"use client";

import { useState } from "react";

export default function CalculateAmountPage() {
    const [file, setFile] = useState<File | null>(null);
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState<string | null>(null);
    const [result, setResult] = useState<any>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e.target.files && e.target.files[0]) {
            setFile(e.target.files[0]);
            setMessage(null);
            setResult(null);
        }
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

        try {
            const formData = new FormData();
            formData.append("file", file);

            const res = await fetch("/api/calculate-amount", {
                method: "POST",
                body: formData,
            });

            if (res.ok) {
                const data = await res.json();
                setResult(data);
                setMessage("File processed successfully!");
            } else {
                const errorData = await res.json();
                setMessage(errorData.error || "Failed to process file. Please try again.");
            }
        } catch (err) {
            setMessage("Network error. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex flex-col items-center mt-10 space-y-4">
            <h1 className="text-2xl font-bold mb-4">Calculate Amount</h1>

            <form className="flex flex-col items-center space-y-4" onSubmit={handleSubmit}>
                <div className="flex flex-col items-center space-y-2">
                    <label htmlFor="file" className="font-medium">
                        Select a file to upload
                    </label>
                    <input
                        id="file"
                        type="file"
                        onChange={handleFileChange}
                        className="border px-3 py-2 rounded-lg text-sm"
                        required
                    />
                    {file && (
                        <p className="text-sm text-gray-600">
                            Selected: {file.name} ({(file.size / 1024).toFixed(2)} KB)
                        </p>
                    )}
                </div>

                <button
                    type="submit"
                    disabled={loading || !file}
                    className={`px-6 py-2 rounded-lg transition ${loading || !file
                        ? "bg-gray-400 cursor-not-allowed"
                        : "bg-teal-600 hover:bg-teal-700 text-white"
                        }`}
                >
                    {loading ? "Processing..." : "Upload & Calculate"}
                </button>
            </form>

            {loading && (
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
                    <span className="text-teal-700 text-sm font-medium">Processing file...</span>
                </div>
            )}

            {message && (
                <div className={`mt-4 text-sm text-center ${message.includes("success") ? "text-green-600" : "text-red-600"
                    }`}>
                    {message}
                </div>
            )}

            {result && result.html && (
                <div className="mt-6 p-6 bg-white rounded-lg shadow-lg max-w-6xl w-full space-y-6">
                    <h2 className="text-2xl font-bold mb-4 text-center">Page HTML Preview</h2>
                    <div className="mb-4">
                        <p className="text-sm text-gray-600">Number: <span className="font-semibold">{result.number}</span></p>
                    </div>
                    <div className="border rounded-lg overflow-hidden">
                        <iframe
                            srcDoc={result.html}
                            className="w-full h-[800px] border-0"
                            title="HTML Preview"
                            sandbox="allow-same-origin allow-scripts"
                        />
                    </div>
                    <details className="mt-4">
                        <summary className="cursor-pointer text-sm font-medium text-gray-700 hover:text-gray-900">
                            View Raw HTML
                        </summary>
                        <pre className="mt-2 p-4 bg-gray-100 rounded text-xs overflow-auto max-h-96">
                            {result.html}
                        </pre>
                    </details>
                </div>
            )}

            {result && result.summary && (
                <div className="mt-6 p-6 bg-white rounded-lg shadow-lg max-w-3xl w-full space-y-6">
                    <h2 className="text-2xl font-bold mb-4 text-center">Calculation Summary</h2>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-4 bg-blue-50 rounded-lg">
                            <div className="text-sm text-gray-600">Total Bills</div>
                            <div className="text-2xl font-bold text-blue-700">{result.summary.totalBills}</div>
                        </div>
                        <div className="p-4 bg-green-50 rounded-lg">
                            <div className="text-sm text-gray-600">Calculated Bills</div>
                            <div className="text-2xl font-bold text-green-700">{result.summary.calculatedBills}</div>
                        </div>
                    </div>

                    {/* Total Amount - Bold and Large */}
                    <div className="p-6 bg-teal-50 rounded-lg text-center border-2 border-teal-200">
                        <div className="text-sm text-gray-600 mb-2">Calculated Amount</div>
                        <div className="text-4xl font-bold text-teal-700">
                            Rs. {result.summary.totalAmount.toLocaleString()}
                        </div>
                    </div>

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
                                <h3 className="text-lg font-bold text-orange-700">Failed Bills (After 3 Attempts)</h3>
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
                                ⚠️ These bills failed after 3 retry attempts. Please check manually.
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
