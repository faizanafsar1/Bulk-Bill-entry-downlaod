import { useEffect, useRef } from "react";
import useStartCamera from "../hooks/StartCamera";
import useBillManager from "../hooks/BillManager";

export default function ScanningPage({ title }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const listRef = useRef(null);
  const { loading, previewImage, billNumbers, setBillNumbers, handleSubmit, handleInput, handleExtractNumber } = useBillManager(
    videoRef,
    canvasRef
  );
  useEffect(() => {
    if (listRef.current) {
      listRef.current.scrollTop = listRef.current.scrollHeight;
    }
  }, [billNumbers]);
  useStartCamera(videoRef);

  return (
    <div className="flex flex-col items-center p-4 space-y-4">
      <h2 className="text-xl font-bold">{title} </h2>{" "}
      <div
        ref={listRef}
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
              className="text-sm border rounded-lg px-0.5 py-0.5 font-semibold text-center text-gray-800"
            />
          </div>
        ))}
      </div>
      <div className="select-none flex flex-col gap-2 *:shadow-lg  items-center">
        <div className="relative border border-gray-500 rounded-xl overflow-hidden w-[200px] h-[60px]">
          <video ref={videoRef} autoPlay playsInline className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
          <div
            id="redbox"
            className={`absolute top-1/2 left-1/2 ${
              title === "SNGPL" ? "w-[64px]" : "w-[80px]"
            } h-4  border-2 border-red-500 -translate-x-1/2 -translate-y-1/2 pointer-events-none`}
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
      <div className="flex flex-row-reverse gap-2">
        <button
          onClick={() => handleExtractNumber(videoRef, canvasRef, title === "SNGPL" ? 64 : 80, title === "SNGPL" ? 11 : 14)}
          disabled={loading}
          className={` select-none px-6 py-2 rounded-lg shadow transition ${
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
          className={` select-none flex p-2 py-1.5 px-2 hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-600 rounded-lg `}
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
