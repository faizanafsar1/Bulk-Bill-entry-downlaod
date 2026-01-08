"use client";

import { useState } from "react";
import { detectText } from "./TextDetector";
import { toast } from "react-toastify";

interface UseBillManagerReturn {
  loading: boolean;
  previewImage: string | null;
  billNumbers: string[];
  setBillNumbers: React.Dispatch<React.SetStateAction<string[]>>;
  handleSubmit: () => void;
  handleInput: () => void;
  handleExtractNumber: (
    videoRef: React.RefObject<HTMLVideoElement | null>,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    width: number,
    length: number
  ) => Promise<void>;
}

export default function useBillManager(): UseBillManagerReturn {
  const [billNumbers, setBillNumbers] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [previewImage, setPreviewImage] = useState<string | null>(null);

  const handleExtractNumber = async (
    videoRef: React.RefObject<HTMLVideoElement | null>,
    canvasRef: React.RefObject<HTMLCanvasElement | null>,
    width: number,
    length: number
  ): Promise<void> => {
    if (!videoRef.current || !canvasRef.current || loading) return;
    setLoading(true);

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      setLoading(false);
      return;
    }

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

      if (refNo.length === length) {
        if (billNumbers.includes(refNo)) {
          toast.error("Bill already added");
        } else {
          const lastIndex = billNumbers.length - 1;
          if (billNumbers[lastIndex] === "") {
            const prevArr = [...billNumbers];
            prevArr[lastIndex] = refNo;
            setBillNumbers(prevArr);
          } else {
            setBillNumbers((prev) => [...prev, refNo]);
          }
          toast.success("Successfully Scanned");
        }
      } else {
        toast.error(`Failed to get complete number: ${refNo}`);
      }
    } catch (err) {
      console.error("OCR error:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleInput = (): void => {
    const lastIndex = billNumbers.length - 1;

    if (billNumbers[lastIndex] === "") {
      toast.error("Fill the blank input first");
    } else {
      setBillNumbers((prev) => [...prev, ""]);
    }
  };

  const handleSubmit = (): void => {
    if (billNumbers[0] && (billNumbers[0].length === 11 || billNumbers[0].length === 14)) {
      let content = "UTILITY,COMPANY,CONSUMER NO,MOBILE NUMBER\n";
      let companyDetails: string;
      if (billNumbers[0].length === 14) {
        companyDetails = "Electricity,IESCO,";
      } else if (billNumbers[0].length === 11) {
        companyDetails = "Gas,SNGPL,";
      } else {
        companyDetails = "";
      }
      const entries = billNumbers
        .map((num) => {
          if (num !== "") {
            return `${companyDetails}${num},03211041960`;
          }
          return null;
        })
        .filter((entry): entry is string => entry !== null);
      content += entries.join("\n");

      const blob = new Blob([content], { type: "text/plain" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      const name = billNumbers[0];
      link.download = `${name}.txt`;
      link.click();

      setBillNumbers([]);
    } else {
      toast.error("first bill number is incorrect");
    }
  };

  return { loading, previewImage, billNumbers, setBillNumbers, handleSubmit, handleInput, handleExtractNumber };
}
