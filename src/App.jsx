import React, { useEffect, useState } from "react";

function App() {
  const rows = 30;

  const [data, setData] = useState({
    utility: "",
    company: "",
    consumerNo: Array(rows).fill(""), // 30 empty strings
    mobileNo: Array(rows).fill(""),
  });

  // handle consumer number change
  const handleConsumerChange = (value, i) => {
    setData((prev) => {
      const newConsumer = [...prev.consumerNo];
      newConsumer[i] = value;
      return { ...prev, consumerNo: newConsumer };
    });
  };
  // handle mobile number change
  const handleMobNoChange = (value, i) => {
    setData((prev) => {
      const newMobNo = [...prev.mobileNo];
      newMobNo[i] = value;
      return { ...prev, mobileNo: newMobNo };
    });
  };

  const handleSubmit = () => {
    let content = "UTILITY,COMPANY,CONSUMER NO,MOBILE NUMBER\n";

    const entries = [];
    for (let i = 0; i < 30; i++) {
      let entry = `${data.utility},${data.company},${data.consumerNo[i]},${data.mobileNo[i]}`;
      entries.splice(i, 0, entry);
    }
    content += entries.join("\n");

    const blob = new Blob([content], { type: "plain/text" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${Math.random()}.txt`;
    link.click();
  };

  return (
    <section className=" pt-10 justify-items-center">
      <h1 className=" text-2xl mb-5 text-center">Download Bulk Entry File For EasyPaisa</h1>

      <form className="flex *:capitalize flex-col gap-2 border rounded-lg w-3xl p-2 ">
        <div className=" bg-gray-200 flex p-2 rounded-lg ">
          <label className="">Utility</label>
          <label className="ml-36 mr-32">Company</label>
          <label className="mr-24">Consumer No</label>
          <label>Mobile No</label>
        </div>

        <div className="grid grid-cols-4 gap-x-5 gap-y-3 *:capitalize justify-between">
          {/* Utility */}
          <select
            onChange={(e) => setData((prev) => ({ ...prev, utility: e.target.value }))}
            className="border rounded-md px-2 py-1 "
          >
            <option>select one</option>
            <option value="Electricity">electricity</option>
            <option value="Gas">gas</option>
          </select>

          {/* Company */}
          <select
            onChange={(e) => setData((prev) => ({ ...prev, company: e.target.value }))}
            className="border rounded-md px-2 py-1 "
          >
            <option>select company</option>
            {data.utility === "Electricity" && (
              <>
                <option value="Iesco">IESCO</option>
                <option value="Fesco">FESCO</option>
              </>
            )}
            {data.utility === "Gas" && <option value="SNGPL">SNGPL</option>}
          </select>

          {/* First Row Inputs (index 0) */}
          <input
            className="border rounded-md px-2 py-1"
            onChange={(e) => handleConsumerChange(e.target.value, 0)}
            type="number"
            value={data.consumerNo[0]}
          />
          <input
            className="border rounded-md px-2 py-1 "
            placeholder="03xxxxxxxxx"
            type="number"
            value={data.mobileNo[0]}
            onChange={(e) => handleMobNoChange(e.target.value, 0)}
          />

          {/* Other Rows */}
          {Array.from({ length: rows }).map((_, i) => (
            <React.Fragment key={i + 1}>
              <span className="border rounded-md px-2 py-1 ">{data.utility}</span>
              <span className="border rounded-md px-2 py-1 ">{data.company}</span>
              <input
                className="border rounded-md px-2 py-1 "
                type="number"
                value={data.consumerNo[i + 1]}
                onChange={(e) => handleConsumerChange(e.target.value, i + 1)}
              />
              <input
                className="border rounded-md px-2 py-1 "
                placeholder="03xxxxxxxxx"
                type="number"
                value={data.mobileNo[i + 1]}
                onChange={(e) => handleMobNoChange(e.target.value, i + 1)}
              />
            </React.Fragment>
          ))}
        </div>
      </form>
      <button
        onClick={() => handleSubmit()}
        className="flex m-5 p-2 py-1.5 hover:bg-gray-100 cursor-pointer focus:shadow-inner shadow-black/50 mx-auto justify-self-center border border-gray-600 rounded-lg "
      >
        Download File
      </button>
      {/* Debug: Show array values */}
    </section>
  );
}

export default App;
