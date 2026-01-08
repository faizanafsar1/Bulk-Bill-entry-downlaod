"use client";

import { useEffect } from "react";

export default function useStartCamera(videoRef: React.RefObject<HTMLVideoElement | null>): void {
  useEffect(() => {
    async function startCamera(): Promise<void> {
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
  }, [videoRef]);
}
