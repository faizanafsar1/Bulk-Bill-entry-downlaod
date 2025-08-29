import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import BulkEntryPage from "./components/BulkEntryPage";
import BillScanner from "./components/BIllScanner";

export default function App() {
  return (
    <div>
      {/* Navigation */}
      <nav className="*:border mt-2 justify-center justify-items-center gap-10 flex *:p-2 *:rounded-lg *:bg-gray-100">
        <Link to="/">Bulk Entry Page</Link> <Link to="/about">Bill Scanner Page</Link>
      </nav>

      {/* Routes */}
      <Routes>
        <Route path="/" element={<BulkEntryPage />} />
        <Route path="/about" element={<BillScanner />} />
      </Routes>
    </div>
  );
}
