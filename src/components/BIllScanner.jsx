import React, { useRef, useState, useEffect } from "react";
import { toast } from "react-toastify";
import Tesseract from "tesseract.js";

export default function BillScanner() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [billNumbers, setBillNumbers] = useState([]);
  const [loading, setLoading] = useState(false); // 🔹 new state

  useEffect(() => {
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      } catch (err) {
        console.error("Camera access error:", err);
        alert("Please allow camera access!");
      }
    }
    startCamera();
  }, []);

  const handleExtractNumber = async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;

    setLoading(true); // ⬅️ Start loading

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;

    const cropWidth = vw * 0.6;
    const cropHeight = 100;
    const cropX = (vw - cropWidth) / 2;
    const cropY = (vh - cropHeight) / 2;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    ctx.drawImage(videoRef.current, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);

    let imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      let avg = (data[i] + data[i + 1] + data[i + 2]) / 3;
      let value = avg > 150 ? 255 : 0;
      data[i] = data[i + 1] = data[i + 2] = value;
    }

    ctx.putImageData(imageData, 0, 0);
    const processedImage = canvas.toDataURL("image/png");

    try {
      const result = await Tesseract.recognize(processedImage, "eng", {
        tessedit_char_whitelist: "0123456789",
      });

      const text = result.data.text;
      const refNo = text.match(/\d+/g)?.join("") || "";

      if (refNo.length === 14) {
        setBillNumbers((prev) => [...prev, refNo]);
        toast.success("Successfully Scanned");
      } else {
        toast.error(`failed to get complete number ${refNo}`);
      }
    } catch (err) {
      console.error("OCR error:", err);
    } finally {
      setLoading(false); // ⬅️ End loading
    }
  };
  const handleSubmit = () => {
    let content = "UTILITY,COMPANY,CONSUMER NO,MOBILE NUMBER\n";

    const entries = [];
    for (let i = 0; i < billNumbers.length; i++) {
      let entry = `Electricity,IESCO,${billNumbers[i]},03211041960`;
      entries.push(entry);
    }
    content += entries.join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const name = Math.random().toString(36).slice(2, 8); // cleaner filename
    link.download = `${name}.txt`;
    link.click();
  };

  return (
    <div className="flex flex-col items-center p-4 space-y-4">
      <h2 className="text-2xl font-bold">📷 Bill Scanner</h2>

      <div className="relative w-full max-w-md border-2 border-gray-500 rounded-xl overflow-hidden">
        <video ref={videoRef} autoPlay playsInline className="w-full" />
        <div className="absolute top-1/2 left-1/2 w-36 h-8 border-2 border-red-500 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      </div>

      <canvas ref={canvasRef} className="hidden" />

      {/* Capture Button */}
      <button
        onClick={handleExtractNumber}
        disabled={loading} // 🔹 disable while loading
        className={`px-6 py-2 rounded-lg shadow transition ${
          loading ? "bg-gray-400 cursor-not-allowed" : "bg-teal-600 hover:bg-teal-700 text-white"
        }`}
      >
        {loading ? (
          <div className="flex items-center gap-2">
            <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"></path>
            </svg>
            Processing...
          </div>
        ) : (
          "Capture & Extract"
        )}
      </button>

      {billNumbers.map((billNumber, i) => (
        <div key={i} className="flex rounded-lg gap-2">
          <span className="border-r text-2xl h-fit px-2 mr-2 text-black">{i}</span>
          <h1 className="text-xl border rounded-lg p-2 font-semibold text-center text-gray-800">{billNumber}</h1>
        </div>
      ))}

      <button
        onClick={() => handleSubmit()}
        className="flex m-5 p-2 py-1.5 hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-600 rounded-lg "
      >
        Download File
      </button>
    </div>
  );
}
