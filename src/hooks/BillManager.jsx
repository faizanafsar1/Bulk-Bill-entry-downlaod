import React, { useState } from "react";
import { detectText } from "./TextDetector";
import { toast } from "react-toastify";

export default function useBillManager() {
  const [billNumbers, setBillNumbers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState(null);

  const handleExtractNumber = async (videoRef, canvasRef, width) => {
    if (!videoRef.current || !canvasRef.current || loading) return;
    setLoading(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const vw = videoRef.current.videoWidth;
    const vh = videoRef.current.videoHeight;
    const displayW = videoRef.current.clientWidth;
    const displayH = videoRef.current.clientHeight;
    const boxW = Number(width);
    const boxH = 16;
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
    let companyDetails;
    if (billNumbers[0].length === 14) {
      companyDetails = "Electricity,IESCO,";
    } else if (billNumbers[0].length === 11) {
      companyDetails = "Gas,SNGPL,";
    }
    const entries = billNumbers
      .map((num) => {
        if (num !== "") {
          return `${companyDetails}${num},03211041960`;
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

  return { loading, previewImage, billNumbers, setBillNumbers, handleSubmit, handleInput, handleExtractNumber };
}
