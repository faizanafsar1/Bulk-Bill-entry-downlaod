import { Routes, Route, Link } from "react-router-dom";
import BulkEntryPage from "./components/BulkEntryPage";
import "react-toastify/dist/ReactToastify.css";
import { ToastContainer } from "react-toastify";
import GasBillScanner from "./components/GasBillScanning";
import IescoBillScanner from "./components/IescoBillScanning";

export default function App() {
  return (
    <div>
      {/* Navigation */}
      <nav className="*:border mt-2 justify-center select-none text-xs tracking-tight justify-items-center max-md:gap-2 gap-5 flex *:p-2 *:rounded-lg *:bg-gray-100">
        <Link to="/">Bulk Entry </Link> <Link to="/gas">Gas Bill Scanner </Link>
        <Link to="/iesco">IESCO Bill Scanner </Link>
      </nav>
      <ToastContainer
        position="top-right"
        autoClose={1000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light"
      />

      <Routes>
        <Route path="/" element={<BulkEntryPage />} />
        <Route path="/gas" element={<GasBillScanner />} />
        <Route path="/iesco" element={<IescoBillScanner />} />
      </Routes>
    </div>
  );
}
