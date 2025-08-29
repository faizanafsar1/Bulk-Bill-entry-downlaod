import React, { useRef, useState, useEffect } from "react";
import Tesseract from "tesseract.js";

export default function BillScanner() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [billNumbers, setBillNumbers] = useState([]);
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
    if (!videoRef.current || !canvasRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");

    // Full video size
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;

    // Define crop area (center rectangle)
    const cropWidth = vw * 0.6; // 60% of video width
    const cropHeight = 100; // fixed height (like a scan strip)
    const cropX = (vw - cropWidth) / 2;
    const cropY = (vh - cropHeight) / 2;

    canvas.width = cropWidth;
    canvas.height = cropHeight;

    // Draw only cropped area
    ctx.drawImage(
      videoRef.current,
      cropX,
      cropY,
      cropWidth,
      cropHeight, // source area
      0,
      0,
      cropWidth,
      cropHeight // target area
    );

    const imageData = canvas.toDataURL("image/png");

    // OCR with Tesseract
    const result = await Tesseract.recognize(imageData, "eng");
    const text = result.data.text;
    console.log(text, "cropped text extracted");

    const refNo = text.match(/\d+/g).join("");

    if (refNo.length == 14) {
      setBillNumbers([...billNumbers, refNo]); // take the first match
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

    const blob = new Blob([content], { type: "plain/text" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const name = Math.random();
    link.download = `${name}.txt`;
    link.click();
  };
  return (
    <div className="flex flex-col items-center p-4 space-y-4">
      <h2 className="text-2xl font-bold">📷 Bill Scanner</h2>

      {/* Camera container with overlay */}
      <div className="relative w-full max-w-md border-2 border-gray-500 rounded-xl overflow-hidden">
        <video ref={videoRef} autoPlay playsInline className="w-full" />

        {/* Overlay rectangle */}
        <div className="absolute top-1/2 left-1/2 w-64 h-8 border-2 border-red-500 -translate-x-1/2 -translate-y-1/2 pointer-events-none"></div>
      </div>

      {/* Hidden canvas */}
      <canvas ref={canvasRef} className="hidden" />

      <button
        onClick={handleExtractNumber}
        className="px-6 py-2 bg-teal-600 text-white rounded-lg shadow hover:bg-teal-700 transition"
      >
        Capture & Extract
      </button>
      {billNumbers.map((billNumber, i) => (
        <div className="flex rounded-lg gap-2">
          <span className="border-r text-2xl h-fit px-2 mr-2 text-black"> {i}</span>
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
