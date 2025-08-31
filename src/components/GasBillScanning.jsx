import { useRef, useState, useEffect } from "react";
import { toast } from "react-toastify";

export default function GasBillScanner() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [billNumbers, setBillNumbers] = useState([]);
  const [previewImage, setPreviewImage] = useState(null); // 👈 add state

  const [loading, setLoading] = useState(false);

  // ✅ Start camera
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

  // ✅ Extract number
  const handleExtractNumber = async () => {
    if (!videoRef.current || !canvasRef.current || loading) return;
    setLoading(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    const displayW = videoRef.current.clientWidth;
    const displayH = videoRef.current.clientHeight;
    const boxW = 112;
    const boxH = 28;
    const scaleX = vw / displayW;
    const scaleY = vh / displayH;
    const cropWidth = boxW * scaleX;
    const cropHeight = boxH * scaleY;
    const cropX = (vw - cropWidth) / 2;
    const cropY = (vh - cropHeight) / 2;
    canvas.width = cropWidth;
    canvas.height = cropHeight;
    ctx.drawImage(videoRef.current, cropX, cropY, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
    const processedImage = canvas.toDataURL("image/png");
    setPreviewImage(processedImage);
    try {
      const text = await detectText(processedImage);
      const refNo = text.match(/\d+/g)?.join("") || "";

      if (refNo.length === 11) {
        const length = billNumbers.length - 1;
        if (billNumbers[length] === "") {
          const prevArr = [...billNumbers];
          prevArr[length] = refNo;
          setBillNumbers(prevArr);
        } else {
          setBillNumbers((prev) => [...prev, refNo]);
        }
        toast.success("Successfully Scanned");
      } else {
        toast.error(`Failed to get complete number: ${refNo}`);
      }
    } catch (err) {
      console.error("OCR error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = () => {
    setBillNumbers((prev) => [...prev, ""]);
  };
  const handleSubmit = () => {
    let content = "UTILITY,COMPANY,CONSUMER NO,MOBILE NUMBER\n";
    const entries = billNumbers
      .map((num) => {
        if (num !== "") {
          return `Gas,SNGPL,${num},03211041960`;
        }
      })
      .filter(Boolean);
    content += entries.join("\n");

    const blob = new Blob([content], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    const name = billNumbers[0];
    link.download = `${name}.txt`;
    link.click();

    setBillNumbers([]);
  };

  const API_KEY = "K81404182788957";

  const detectText = async (base64Image) => {
    try {
      const formData = new FormData();
      formData.append("apikey", API_KEY);
      formData.append("base64Image", base64Image);
      formData.append("language", "eng");

      const response = await fetch("https://api.ocr.space/parse/image", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();
      console.log("OCR.space result:", result);

      return result.ParsedResults?.[0]?.ParsedText || "";
    } catch (error) {
      console.error("OCR.space error:", error);
      return "";
    }
  };

  return (
    <div className="flex flex-col items-center p-4 space-y-4">
      <h2 className="text-xl font-bold">SNGPL </h2>{" "}
      <div
        className={`${
          billNumbers.length === 0 ? "hidden" : ""
        } border h-[30vh] gap-2 flex flex-col  overflow-y-scroll scroll-auto border-gray-400 p-3 rounded-lg`}
      >
        {billNumbers.map((billNumber, i) => (
          <div key={i} className="grid grid-cols-[20px_1fr] items-center rounded-lg gap-5">
            <span className="border-r shadow-inner rounded-lg text-xxl h-fit px-3 flex justify-center  text-black">{i + 1}</span>
            <input
              type="number"
              value={billNumber}
              onChange={(e) => {
                const updated = [...billNumbers];
                updated[i] = e.target.value;
                setBillNumbers(updated);
              }}
              className="text-xl border rounded-lg p-2 font-semibold text-center text-gray-800"
            />
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2 *:shadow-lg  items-center">
        <div className="relative border border-gray-500 rounded-xl overflow-hidden w-[200px] h-[60px]">
          <video ref={videoRef} autoPlay playsInline className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          <div
            id="redbox"
            className="absolute top-1/2 left-1/2 w-28 h-7 border-2 border-red-500 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
          ></div>{" "}
        </div>

        {previewImage && (
          <div className=" w-[190px] ">
            <p className="text-sm text-gray-600">Extracted Region:</p>
            <img src={previewImage} alt="Extracted region" className="shadow-lg border border-gray-400 rounded-lg" />
          </div>
        )}
      </div>
      <canvas ref={canvasRef} className="hidden" />
      {/* Capture Button */}
      <div className="flex gap-2">
        <button
          onClick={handleExtractNumber}
          disabled={loading}
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
        <button
          onClick={handleInput}
          className={` flexp-2 py-1.5 px-2 hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-600 rounded-lg `}
        >
          Enter Manually
        </button>
      </div>
      <button
        onClick={handleSubmit}
        className={`${
          billNumbers.length === 0 ? "hidden" : ""
        } flex m-5 p-2 py-1.5 hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-600 rounded-lg `}
      >
        Download File
      </button>
    </div>
  );
}
