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
      <nav className="*:border mt-2 justify-center justify-items-center gap-10 flex *:p-2 *:rounded-lg *:bg-gray-100">
        <Link to="/">Bulk Entry Page</Link> <Link to="/gas">Gas Bill Scanner Page</Link>
        <Link to="/iesco">IESCO Bill Scanner Page</Link>
      </nav>
      <ToastContainer
        position="top-right" // where toast shows
        autoClose={1000} // auto hide after 3s
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="light" // dark, colored, or light
      />
      {/* Routes */}
      <Routes>
        <Route path="/" element={<BulkEntryPage />} />
        <Route path="/gas" element={<GasBillScanner />} />
        <Route path="/iesco" element={<IescoBillScanner />} />
      </Routes>
    </div>
  );
}
